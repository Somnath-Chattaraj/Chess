import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { Game, type Player, type Snapshot } from './game.js';
import type { Database } from './db.js';
const control = z.object({
  minutes: z.union([z.literal(3), z.literal(5), z.literal(10)]),
  increment: z.union([z.literal(0), z.literal(2), z.literal(5)]),
});
const command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('queue'), ...control.shape }),
  z.object({ type: z.literal('create'), ...control.shape }),
  z.object({ type: z.literal('join'), room: z.string().regex(/^[a-f0-9]{8}$/) }),
  z.object({
    type: z.literal('move'),
    from: z.string().regex(/^[a-h][1-8]$/),
    to: z.string().regex(/^[a-h][1-8]$/),
    promotion: z.enum(['q', 'r', 'b', 'n']).default('q'),
  }),
  z.object({
    type: z.enum(['cancel', 'resign', 'offer_draw', 'accept_draw', 'decline_draw', 'sync']),
  }),
]);
export class Manager {
  games = new Map<string, Game>();
  sockets = new Map<string, WebSocket>();
  queue = new Map<string, { player: Player; minutes: number; increment: number }>();
  private chain = Promise.resolve();
  constructor(private db: Database) {}
  async restore() {
    const { rows } = await this.db.query("SELECT data FROM club_games WHERE status != 'finished'");
    for (const row of rows) {
      const game = Game.restore(row.data as Snapshot);
      this.games.set(game.state.id, game);
    }
  }
  serial(action: () => Promise<void>) {
    this.chain = this.chain
      .then(action)
      .catch((error) => console.error('Game operation failed', error));
    return this.chain;
  }
  send(id: string, data: unknown) {
    const socket = this.sockets.get(id);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
  }
  active(id: string) {
    return [...this.games.values()].find(
      (game) => game.color(id) !== null && game.state.status !== 'finished',
    );
  }
  async save(game: Game) {
    const s = game.state;
    await this.db.query(
      `INSERT INTO club_games(id,white_id,black_id,status,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET black_id=excluded.black_id,status=excluded.status,data=excluded.data,updated_at=now()`,
      [s.id, s.white.id, s.black?.id ?? null, s.status, JSON.stringify(s)],
    );
  }
  broadcast(game: Game) {
    for (const player of [game.state.white, game.state.black])
      if (player) this.send(player.id, { type: 'state', game: game.state });
    if (game.state.status === 'finished') this.games.delete(game.state.id);
  }
  connect(player: Player, socket: WebSocket, authorize: () => Promise<boolean> = async () => true) {
    this.sockets.get(player.id)?.close(4001, 'Connected in another tab');
    this.sockets.set(player.id, socket);
    const game = this.active(player.id);
    this.send(player.id, game ? { type: 'state', game: game.state } : { type: 'ready' });
    let count = 0;
    let windowStart = Date.now();
    socket.on('message', (raw) => {
      if (this.sockets.get(player.id) !== socket) return;
      if (Date.now() - windowStart > 10000) {
        count = 0;
        windowStart = Date.now();
      }
      if (++count > 50) {
        socket.close(1008, 'Too many messages');
        return;
      }
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        this.send(player.id, { type: 'error', message: 'Invalid JSON message.' });
        return;
      }
      void this.serial(async () => {
        try {
          if (!(await authorize())) {
            socket.close(4003, 'Session expired');
            return;
          }
          await this.handle(player, data);
        } catch (error) {
          this.send(player.id, {
            type: 'error',
            message: error instanceof Error ? error.message : 'Request failed.',
          });
        }
      });
    });
    socket.on('error', () => socket.close());
    socket.on('close', () => {
      if (this.sockets.get(player.id) === socket) {
        this.sockets.delete(player.id);
        this.queue.delete(player.id);
      }
    });
  }
  async handle(player: Player, raw: unknown) {
    const parsed = command.safeParse(raw);
    if (!parsed.success) throw new Error('Invalid game command.');
    const cmd = parsed.data;
    let game = this.active(player.id);
    if (cmd.type === 'sync') {
      this.send(player.id, game ? { type: 'state', game: game.state } : { type: 'ready' });
      return;
    }
    if (cmd.type === 'cancel') {
      if (game?.state.status === 'active')
        throw new Error('An active game must be finished or resigned.');
      this.queue.delete(player.id);
      if (game?.state.status === 'waiting') {
        game.finish('*', 'Room cancelled');
        await this.save(game);
        this.games.delete(game.state.id);
      }
      this.send(player.id, { type: 'ready' });
      return;
    }
    if (cmd.type === 'queue' || cmd.type === 'create') {
      if (game) throw new Error('Finish or cancel your current game first.');
      this.queue.delete(player.id);
      if (cmd.type === 'create') {
        game = new Game(player, null, cmd.minutes, cmd.increment);
        game.state.room = randomBytes(4).toString('hex');
        await this.save(game);
        this.games.set(game.state.id, game);
        this.broadcast(game);
        return;
      }
      const opponent = [...this.queue.values()].find(
        (p) =>
          p.player.id !== player.id &&
          p.minutes === cmd.minutes &&
          p.increment === cmd.increment &&
          this.sockets.get(p.player.id)?.readyState === WebSocket.OPEN,
      );
      if (!opponent) {
        this.queue.set(player.id, { player, minutes: cmd.minutes, increment: cmd.increment });
        this.send(player.id, { type: 'queued' });
        return;
      }
      this.queue.delete(opponent.player.id);
      const [white, black] =
        Math.random() < 0.5 ? [player, opponent.player] : [opponent.player, player];
      game = new Game(white, black, cmd.minutes, cmd.increment);
      await this.save(game);
      this.games.set(game.state.id, game);
      this.broadcast(game);
      return;
    }
    if (cmd.type === 'join') {
      if (game) throw new Error('Finish or cancel your current game first.');
      game = [...this.games.values()].find(
        (g) => g.state.room === cmd.room && g.state.status === 'waiting',
      );
      if (!game) throw new Error('Room not found or already full.');
      this.queue.delete(player.id);
      game.state.black = player;
      game.state.status = 'active';
      game.state.updatedAt = Date.now();
      await this.save(game);
      this.broadcast(game);
      return;
    }
    if (!game || game.state.status !== 'active') throw new Error('No active game.');
    if (game.tick()) {
      await this.save(game);
      this.broadcast(game);
      return;
    }
    if (cmd.type === 'move') game.move(player.id, cmd.from, cmd.to, cmd.promotion);
    if (cmd.type === 'resign')
      game.finish(game.color(player.id) === 'w' ? '0-1' : '1-0', 'Resignation');
    if (cmd.type === 'offer_draw') game.state.drawOffer = player.id;
    if (cmd.type === 'accept_draw') {
      if (!game.state.drawOffer || game.state.drawOffer === player.id)
        throw new Error('No opponent draw offer.');
      game.finish('1/2-1/2', 'Draw by agreement');
    }
    if (cmd.type === 'decline_draw') {
      if (game.state.drawOffer !== player.id) game.state.drawOffer = null;
    }
    await this.save(game);
    this.broadcast(game);
  }
  async tick() {
    for (const game of this.games.values()) {
      if (game.state.status === 'waiting' && Date.now() - game.state.updatedAt > 30 * 60000) {
        game.finish('*', 'Room expired');
        await this.save(game);
        this.broadcast(game);
      } else if (game.state.status === 'active') {
        game.tick();
        await this.save(game);
        this.broadcast(game);
      }
    }
  }
}
