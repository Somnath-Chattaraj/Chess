// Run against an isolated test deployment: this creates three accounts and one game.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
const base = process.env.SMOKE_ORIGIN ?? 'http://localhost:8080';
const suffix = randomBytes(4).toString('hex');
const accounts = [];
const connections = [];
async function api(path, body, cookie = '') {
  const response = await fetch(base + '/api' + path, {
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie },
  });
  const data = await response.json();
  assert.equal(response.ok, true, JSON.stringify(data));
  return { response, data };
}
function connect(account) {
  const socket = new WebSocket(base.replace(/^http/, 'ws') + '/ws', {
    headers: { Origin: base, Cookie: account.cookie },
  });
  const messages = [];
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  socket.on('error', () => {});
  connections.push(socket);
  return {
    socket,
    async wait(predicate) {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const index = messages.findIndex(predicate);
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error('Timed out waiting for expected WebSocket state');
    },
    send(data) {
      socket.send(JSON.stringify(data));
    },
  };
}
try {
  assert.equal((await api('/health')).data.status, 'ok');
  for (const player of ['white', 'black', 'observer']) {
    const result = await api('/auth/signup', {
      username: `smoke_${player}_${suffix}`,
      email: `smoke_${player}_${suffix}@example.com`,
      password: randomBytes(20).toString('hex'),
    });
    accounts.push({
      ...result.data.user,
      cookie: result.response.headers.get('set-cookie').split(';')[0],
    });
  }
  let white = connect(accounts[0]);
  let black = connect(accounts[1]);
  await white.wait((m) => m.type === 'ready');
  await black.wait((m) => m.type === 'ready');
  white.socket.send('{invalid');
  await white.wait((m) => m.type === 'error');
  white.send({ type: 'create', minutes: 10, increment: 0 });
  const room = (await white.wait((m) => m.type === 'state')).game.room;
  black.send({ type: 'join', room });
  await white.wait((m) => m.game?.status === 'active');
  await black.wait((m) => m.game?.status === 'active');
  black.send({ type: 'move', from: 'e7', to: 'e5' });
  await black.wait((m) => m.type === 'error');
  white.send({ type: 'move', from: 'f2', to: 'f3' });
  await black.wait((m) => m.game?.moves.length === 1);
  // A replaced connection must receive the persisted position.
  white.socket.close();
  if (process.env.SMOKE_RESTART === 'true') {
    black.socket.close();
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await promisify(execFile)('docker', ['compose', 'restart', 'api']);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        await api('/health');
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    assert.equal(ready, true, 'API did not recover after restart');
    black = connect(accounts[1]);
    await black.wait((m) => m.game?.moves.length === 1);
  }
  white = connect(accounts[0]);
  await white.wait((m) => m.game?.moves.length === 1);
  for (const [client, from, to, length] of [
    [black, 'e7', 'e5', 2],
    [white, 'g2', 'g4', 3],
    [black, 'd8', 'h4', 4],
  ]) {
    client.send({ type: 'move', from, to });
    await white.wait((m) => m.game?.moves.length === length);
  }
  const history = (await api('/games', undefined, accounts[0].cookie)).data.games;
  assert.equal(history[0].result, '0-1');
  assert.equal(history[0].reason, 'Checkmate');
  assert.match(history[0].pgn, /Qh4#/);
  assert.equal((await api('/games', undefined, accounts[2].cookie)).data.games.length, 0);
  await api('/auth/logout', {}, accounts[0].cookie);
  white.send({ type: 'sync' });
  const closeCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Revoked socket stayed open')), 8000);
    white.socket.once('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  assert.equal(closeCode, 4003);
  console.log(
    'PASS: health, signup, cookies, WebSocket validation, private room, turns, reconnect, checkmate, PGN, private history, and session revocation',
  );
} finally {
  for (const connection of connections) connection.close();
}
