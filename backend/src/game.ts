import { randomUUID } from 'node:crypto';
import { Chess, type Color } from 'chess.js';
export type Player = { id: string; username: string };
export type Snapshot = {
  id: string;
  white: Player;
  black: Player | null;
  minutes: number;
  increment: number;
  status: 'waiting' | 'active' | 'finished';
  pgn: string;
  fen: string;
  moves: string[];
  clocks: { w: number; b: number };
  updatedAt: number;
  result: string | null;
  reason: string | null;
  drawOffer: string | null;
  room: string | null;
};
export class Game {
  board = new Chess();
  state: Snapshot;
  constructor(
    white: Player,
    black: Player | null,
    minutes: number,
    increment: number,
    now = Date.now(),
  ) {
    this.state = {
      id: randomUUID(),
      white,
      black,
      minutes,
      increment,
      status: black ? 'active' : 'waiting',
      pgn: '',
      fen: this.board.fen(),
      moves: [],
      clocks: { w: minutes * 60000, b: minutes * 60000 },
      updatedAt: now,
      result: null,
      reason: null,
      drawOffer: null,
      room: null,
    };
  }
  static restore(state: Snapshot) {
    const game = new Game(state.white, state.black, state.minutes, state.increment);
    game.state = state;
    if (state.pgn) game.board.loadPgn(state.pgn);
    return game;
  }
  color(userId: string): Color | null {
    return this.state.white.id === userId ? 'w' : this.state.black?.id === userId ? 'b' : null;
  }
  tick(now = Date.now()) {
    if (this.state.status !== 'active') return false;
    const color = this.board.turn();
    this.state.clocks[color] = Math.max(
      0,
      this.state.clocks[color] - Math.max(0, now - this.state.updatedAt),
    );
    this.state.updatedAt = now;
    if (this.state.clocks[color] === 0) {
      const opponentHasMaterial = this.board
        .board()
        .flat()
        .some((piece) => piece && piece.color !== color && piece.type !== 'k');
      this.finish(
        this.board.isInsufficientMaterial() || !opponentHasMaterial
          ? '1/2-1/2'
          : color === 'w'
            ? '0-1'
            : '1-0',
        'Time expired',
      );
      return true;
    }
    return false;
  }
  move(userId: string, from: string, to: string, promotion = 'q', now = Date.now()) {
    if (this.state.status !== 'active') throw new Error('This game is not active.');
    if (this.tick(now)) return;
    const color = this.color(userId);
    if (color !== this.board.turn()) throw new Error('Wait for your turn.');
    try {
      this.board.move({ from, to, promotion });
    } catch {
      throw new Error('That move is not legal.');
    }
    this.state.clocks[color] += this.state.increment * 1000;
    this.state.drawOffer = null;
    this.sync();
    if (this.board.isCheckmate()) this.finish(color === 'w' ? '1-0' : '0-1', 'Checkmate');
    else if (this.board.isGameOver())
      this.finish(
        '1/2-1/2',
        this.board.isStalemate()
          ? 'Stalemate'
          : this.board.isThreefoldRepetition()
            ? 'Threefold repetition'
            : this.board.isInsufficientMaterial()
              ? 'Insufficient material'
              : 'Fifty-move rule',
      );
  }
  sync() {
    this.state.pgn = this.board.pgn();
    this.state.fen = this.board.fen();
    this.state.moves = this.board.history();
  }
  finish(result: string, reason: string) {
    this.state.status = 'finished';
    this.state.result = result;
    this.state.reason = reason;
    this.state.drawOffer = null;
    this.board.header(
      'White',
      this.state.white.username,
      'Black',
      this.state.black?.username ?? 'Waiting',
      'Result',
      result,
    );
    this.sync();
  }
}
