import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createApp, getUser } from './app.js';
import { connectDatabase, schema } from './db.js';
import { Manager } from './manager.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. See .env.example.');
const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
const db = connectDatabase();
await db.query(schema);
await db.query('DELETE FROM club_sessions WHERE expires_at<now()');
const manager = new Manager(db);
await manager.restore();
const app = createApp(db, origin, process.env.COOKIE_SECURE === 'true');
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', async (req, socket, head) => {
  try {
    if (req.url !== '/ws' || req.headers.origin !== origin) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const token = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('session='))
      ?.slice(8);
    const player = await getUser(db, token);
    if (!player) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      manager.connect(player, ws, async () => Boolean(await getUser(db, token)));
      let alive = true;
      ws.on('pong', () => {
        alive = true;
      });
      const heartbeat = setInterval(() => {
        if (!alive) {
          ws.terminate();
          return;
        }
        alive = false;
        ws.ping();
      }, 30000);
      ws.on('close', () => clearInterval(heartbeat));
    });
  } catch {
    socket.destroy();
  }
});
const tick = setInterval(() => void manager.serial(() => manager.tick()), 1000);
server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () =>
  console.log('Chess API listening on port', process.env.PORT ?? 3000),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    clearInterval(tick);
    for (const ws of wss.clients) ws.close(1001, 'Server shutting down');
    server.close(
      () =>
        void manager.serial(async () => {
          await manager.tick();
          await db.end();
          process.exit(0);
        }),
    );
    setTimeout(() => process.exit(1), 10000).unref();
  });
