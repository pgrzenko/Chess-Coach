import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { createStockfish, defaultEnginePath } from './stockfish.mjs';

const engine = createStockfish(defaultEnginePath);
const position = moves => ({ initialFen: DEFAULT_POSITION, moves });
after(() => engine.close());

function assertLegalLines(result, history, ranks = [1, 2]) {
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.lines.map(line => line.rank), ranks);
  assert.equal(new Set(result.lines.map(line => line.depth)).size, 1);
  for (const line of result.lines) {
    const chess = new Chess();
    for (const move of [...history, ...line.moves]) {
      assert.ok(chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }));
    }
  }
}

test('returns two legal lines from the same depth', async () => {
  assertLegalLines(await engine.analyze(position([])), []);
});

test('replaces an active search and skips a superseded queued position', async () => {
  const first = engine.analyze(position(['d2d4']));
  await setTimeout(100);
  const skipped = engine.analyze(position(['d2d4', 'd7d5']));
  const moves = ['e2e4'];
  const last = engine.analyze(position(moves));

  assert.deepEqual(await first, { status: 'cancelled' });
  assert.deepEqual(await skipped, { status: 'cancelled' });
  assertLegalLines(await last, moves);
});

test('uses one legal line for sparring and hints, then restores two for analysis', async () => {
  const moves = ['e2e4'];
  assertLegalLines(await engine.analyze({ ...position(moves), purpose: 'play' }), moves, [1]);
  assertLegalLines(await engine.analyze({ ...position([]), purpose: 'hint' }), [], [1]);
  assertLegalLines(await engine.analyze(position([])), []);
});

test('returns the only legal move from a restricted position', async () => {
  const fen = '4k3/8/8/8/8/8/4q3/4K3 w - - 0 1';
  const result = await engine.analyze({ initialFen: fen, moves: [] });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.lines.map(line => line.rank), [1]);
  const chess = new Chess(fen);
  assert.equal(chess.moves().length, 1);
  const uci = result.lines[0].moves[0];
  assert.ok(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }));
});

test('rejects illegal input and recognizes a finished game', async () => {
  assert.deepEqual(await engine.analyze(position(['e2e5'])), { status: 'unavailable' });
  assert.deepEqual(await engine.analyze(position(['f2f3', 'e7e5', 'g2g4', 'd8h4'])), {
    status: 'ok', lines: [],
  });
});
