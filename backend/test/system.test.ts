import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { schema, type Database } from '../src/db.js';
import { createApp } from '../src/app.js';
import { Manager } from '../src/manager.js';
const origin = 'http://localhost:5173';
test('accounts, session cookies, CSRF boundary and private history', async () => {
  const pg = new PGlite();
  const db = pg as unknown as Database;
  await pg.exec(schema);
  const server = createServer(createApp(db, origin, false));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  async function post(path: string, data: unknown, cookie = '', allowedOrigin = origin) {
    return fetch(base + path, {
      method: 'POST',
      headers: { origin: allowedOrigin, 'content-type': 'application/json', cookie },
      body: JSON.stringify(data),
    });
  }
  try {
    let res = await post('/api/auth/signup', {
      username: 'alice',
      email: 'alice@example.com',
      password: 'correct horse battery',
    });
    assert.equal(res.status, 201);
    const cookie = res.headers.get('set-cookie')!.split(';')[0];
    const body = await res.json();
    assert.equal(body.user.username, 'alice');
    assert.equal(body.user.password, undefined);
    res = await post('/api/auth/login', { username: 'alice', password: 'wrongpassword' });
    assert.equal(res.status, 401);
    res = await post('/api/auth/login', { username: 'Alice', password: 'correct horse battery' });
    assert.equal(res.status, 200);
    res = await post('/api/auth/signup', {
      username: 'alice',
      email: 'other@example.com',
      password: 'correct horse battery',
    });
    assert.equal(res.status, 409);
    res = await post('/api/auth/logout', {}, cookie, 'https://evil.example');
    assert.equal(res.status, 403);
    res = await fetch(base + '/api/auth/me', { headers: { cookie } });
    assert.equal((await res.json()).user.id, body.user.id);
    res = await fetch(base + '/api/games');
    assert.equal(res.status, 401);
    res = await post('/api/auth/logout', {}, cookie);
    assert.equal(res.status, 200);
    res = await fetch(base + '/api/auth/me', { headers: { cookie } });
    assert.equal((await res.json()).user, null);
  } finally {
    await new Promise<void>((r, e) => server.close((error) => (error ? e(error) : r())));
    await pg.close();
  }
});
test('matchmaking deduplicates users, isolates time controls, persists games, restores, draws and cancels rooms', async () => {
  const pg = new PGlite();
  const db = pg as unknown as Database;
  await pg.exec(schema);
  const users = Array.from({ length: 3 }, (_, i) => ({ id: randomUUID(), username: 'player' + i }));
  for (const u of users)
    await db.query('INSERT INTO club_users(id,username,email,password) VALUES($1,$2,$3,$4)', [
      u.id,
      u.username,
      u.username + '@example.com',
      'hash',
    ]);
  const messages = new Map<string, any[]>();
  const manager = new Manager(db);
  for (const u of users) {
    messages.set(u.id, []);
    manager.connect(u, {
      readyState: WebSocket.OPEN,
      send: (raw: string) => messages.get(u.id)!.push(JSON.parse(raw)),
      on: () => {},
      close: () => {},
    } as unknown as WebSocket);
  }
  try {
    await manager.handle(users[0], { type: 'queue', minutes: 3, increment: 2 });
    await manager.handle(users[0], { type: 'queue', minutes: 3, increment: 2 });
    assert.equal(manager.games.size, 0);
    await manager.handle(users[1], { type: 'queue', minutes: 10, increment: 0 });
    assert.equal(manager.games.size, 0);
    await manager.handle(users[2], { type: 'queue', minutes: 3, increment: 2 });
    assert.equal(manager.games.size, 1);
    const g = manager.active(users[0].id)!;
    assert.ok(g.state.black);
    await assert.rejects(manager.handle(users[1], { type: 'move', from: 'e2', to: 'e4' }));
    await manager.handle(g.state.white, { type: 'move', from: 'e2', to: 'e4' });
    assert.equal(g.state.moves[0], 'e4');
    const restored = new Manager(db);
    await restored.restore();
    assert.equal(restored.active(users[0].id)?.board.fen(), g.board.fen());
    await manager.handle(g.state.white, { type: 'offer_draw' });
    await assert.rejects(manager.handle(g.state.white, { type: 'accept_draw' }));
    await manager.handle(g.state.black!, { type: 'accept_draw' });
    assert.equal(g.state.result, '1/2-1/2');
    assert.equal(manager.games.size, 0);
    await manager.handle(users[0], { type: 'create', minutes: 5, increment: 0 });
    const room = manager.active(users[0].id)!;
    await assert.rejects(manager.handle(users[0], { type: 'join', room: room.state.room }));
    await manager.handle(users[1], { type: 'join', room: room.state.room });
    assert.equal(room.state.status, 'active');
    assert.equal(manager.queue.has(users[1].id), false);
    await manager.handle(users[1], { type: 'resign' });
    assert.equal(room.state.result, '1-0');
    await manager.handle(users[0], { type: 'create', minutes: 5, increment: 0 });
    await manager.handle(users[0], { type: 'cancel' });
    assert.equal(manager.active(users[0].id), undefined);
  } finally {
    await pg.close();
  }
});
