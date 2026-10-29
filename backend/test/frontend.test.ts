import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { resolveOrigin } from '../src/config.js';

test('Render origin is automatic, custom origins take precedence, and malformed origins fail closed', () => {
  assert.equal(
    resolveOrigin({ RENDER_EXTERNAL_URL: 'https://chess-example.onrender.com' }),
    'https://chess-example.onrender.com',
  );
  assert.equal(
    resolveOrigin({
      APP_ORIGIN: 'https://chess.example.com/',
      RENDER_EXTERNAL_URL: 'https://chess-example.onrender.com',
    }),
    'https://chess.example.com',
  );
  assert.equal(resolveOrigin({}), 'http://localhost:5173');
  for (const value of [
    'https://example.com/path',
    'https://example.com?query=1',
    'file:///tmp',
    'https://user:password@example.com',
  ])
    assert.throws(() => resolveOrigin({ APP_ORIGIN: value }));
});

test('single-container frontend serves UI and assets while preserving API boundaries and security headers', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'chess-frontend-'));
  await mkdir(path.join(directory, 'assets'));
  await writeFile(
    path.join(directory, 'index.html'),
    '<!doctype html><title>Chess Club test</title>',
  );
  await writeFile(path.join(directory, 'assets', 'app-123.js'), 'console.log("fixture");');
  const db = { query: async () => ({ rows: [] }) };
  const server = createServer(createApp(db, 'https://chess-example.onrender.com', true, directory));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const route of ['/', '/game', '/history']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Chess Club test/);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.match(response.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    }
    const asset = await fetch(base + '/assets/app-123.js');
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('cache-control')!, /immutable/);
    for (const route of ['/api/unknown', '/ws', '/assets/missing.js', '/missing.png'])
      assert.equal((await fetch(base + route)).status, 404);
    assert.equal((await fetch(base + '/api/health')).status, 200);
    const forbidden = await fetch(base + '/api/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(forbidden.status, 403);
    const allowed = await fetch(base + '/api/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://chess-example.onrender.com', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(allowed.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true });
  }
});
