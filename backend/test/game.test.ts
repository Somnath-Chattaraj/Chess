import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
const white = { id: 'white', username: 'white' },
  black = { id: 'black', username: 'black' };
test('rejects illegal moves and wrong turns; accepts castling and restores PGN', () => {
  const g = new Game(white, black, 10, 0, 1000);
  assert.throws(() => g.move('black', 'e7', 'e5', 'q', 1000));
  assert.throws(() => g.move('white', 'e2', 'e5', 'q', 1000));
  for (const [from, to] of [
    ['e2', 'e4'],
    ['e7', 'e5'],
    ['g1', 'f3'],
    ['b8', 'c6'],
    ['f1', 'c4'],
    ['g8', 'f6'],
    ['e1', 'g1'],
  ])
    g.move(g.board.turn() === 'w' ? 'white' : 'black', from, to, 'q', 1000);
  assert.equal(g.board.get('f1')?.type, 'r');
  assert.equal(Game.restore(g.state).board.fen(), g.board.fen());
});
test('checkmate includes final move and produces the correct result', () => {
  const g = new Game(white, black, 3, 2, 0);
  for (const [from, to] of [
    ['f2', 'f3'],
    ['e7', 'e5'],
    ['g2', 'g4'],
    ['d8', 'h4'],
  ])
    g.move(g.board.turn() === 'w' ? 'white' : 'black', from, to, 'q', 0);
  assert.equal(g.state.status, 'finished');
  assert.equal(g.state.result, '0-1');
  assert.equal(g.state.moves.at(-1), 'Qh4#');
  assert.match(g.state.pgn, /0-1/);
});
test('server clock subtracts elapsed time, adds increment and stops after flag', () => {
  const g = new Game(white, black, 3, 2, 1000);
  g.move('white', 'e2', 'e4', 'q', 4000);
  assert.equal(g.state.clocks.w, 179000);
  g.tick(184001);
  assert.equal(g.state.result, '1-0');
  assert.equal(g.state.reason, 'Time expired');
  assert.throws(() => g.move('black', 'e7', 'e5', 'q', 184002));
});
test('threefold repetition survives persistence', () => {
  let g = new Game(white, black, 10, 0, 0);
  for (let round = 0; round < 2; round++) {
    for (const [from, to] of [
      ['g1', 'f3'],
      ['g8', 'f6'],
      ['f3', 'g1'],
      ['f6', 'g8'],
    ])
      g.move(g.board.turn() === 'w' ? 'white' : 'black', from, to, 'q', 0);
    g = Game.restore(g.state);
  }
  assert.equal(g.state.result, '1/2-1/2');
  assert.equal(g.state.reason, 'Threefold repetition');
});
test('en passant and underpromotion are legal', () => {
  const g = new Game(white, black, 10, 0, 0);
  for (const san of ['e4', 'a6', 'e5', 'd5', 'exd6']) g.board.move(san);
  assert.equal(g.board.get('d5'), undefined);
  g.board.load('7k/P7/8/8/8/8/8/7K w - - 0 1');
  g.move('white', 'a7', 'a8', 'n', 0);
  assert.equal(g.board.get('a8')?.type, 'n');
  assert.equal(g.state.result, '1/2-1/2');
});

test('a bare king cannot win on time', () => {
  const g = new Game(white, black, 3, 0, 0);
  g.board.load('7k/8/8/8/8/8/8/Q6K w - - 0 1');
  g.tick(180001);
  assert.equal(g.state.result, '1/2-1/2');
});
