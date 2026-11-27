import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { coachHint, formatWhiteScore } from '../shared/coach-hint.mjs';
import { polishSan } from '../shared/polish-notation.mjs';

const quiet = { status: 'idle' };

test('states checkmate, stalemate, check and the only legal move from the position', () => {
  assert.equal(
    coachHint(new Chess('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')),
    'Czarne dają mata.',
  );
  assert.equal(
    coachHint(new Chess('k7/P7/1K6/8/8/8/8/8 b - - 0 1')),
    'Pat. Partia kończy się remisem.',
  );
  assert.equal(
    coachHint(new Chess('4k3/8/8/8/8/8/4q3/4K3 w - - 0 1')),
    'Król białych jest w szachu. Jedyny ruch to Kxe2.',
  );
  assert.equal(coachHint(new Chess('8/8/8/8/8/k7/P7/K7 w - - 0 1')), 'Jedyny legalny ruch to Kb1.');
});

test('mentions a legal capture of an undefended piece and skips a defended one', () => {
  assert.equal(
    coachHint(new Chess('4k3/8/8/8/8/q7/8/1N2K3 w - - 0 1'), { status: 'pending' }),
    'Białe mogą zbić niebronionego hetmana na a3 (Sxa3). Stockfish jeszcze nie ocenił tej pozycji.',
  );
  assert.equal(
    coachHint(new Chess('4k3/8/8/8/8/r7/8/2B1K3 w - - 0 1'), quiet),
    'Białe mogą zbić niebronioną wieżę na a3 (Gxa3). Nie mam teraz oceny Stockfisha.',
  );
  const defended = new Chess('4k3/8/8/1p6/q7/8/1N6/4K3 w - - 0 1');
  assert.equal(defended.moves().includes('Nxa4'), true);
  assert.equal(coachHint(defended, quiet), 'Nie mam teraz oceny Stockfisha.');
});

test('uses a verified engine move or evaluation and reports a missing engine', () => {
  const queen = new Chess('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
  const checking = new Chess(queen.fen()).move({ from: 'd1', to: 'd8' });
  assert.equal(
    coachHint(queen, { status: 'ok', lines: [{ rank: 1, score: { type: 'cp', value: 400 }, moves: ['d1d8'] }] }),
    `Stockfish zaczyna od ${polishSan(checking.san)}, a ten ruch daje szacha. Białe mają przewagę. Ocena białych: +4,00.`,
  );
  const hanging = new Chess('4k3/8/8/8/8/q7/8/1N2K3 w - - 0 1');
  assert.match(coachHint(hanging, {
    status: 'ok',
    lines: [
      { rank: 1, score: { type: 'cp', value: 30 }, moves: ['e1e2', 'e8d8'] },
      { rank: 2, score: { type: 'cp', value: 10 }, moves: ['b1c3'] },
    ],
  }), /^Białe mogą zbić niebronionego hetmana na a3 \(Sxa3\)\. Silnik jednak woli Ke2\. Linia: 1\. Ke2 Kd8\. Druga kandydatura to Sc3\. Pozycja jest prawie równa\./);

  const start = new Chess();
  const fen = start.fen();
  assert.equal(
    coachHint(start, { status: 'ok', lines: [{ rank: 1, score: { type: 'cp', value: 20 }, moves: ['e2e5'] }] }),
    `Pozycja jest prawie równa. Ocena białych: ${formatWhiteScore({ type: 'cp', value: 20 }, 'w')}.`,
  );
  assert.equal(start.fen(), fen);
  assert.equal(
    coachHint(new Chess(), { status: 'ok', lines: [{ rank: 1, score: { type: 'mate', value: 3 }, moves: ['e2e4'] }] }),
    'Stockfish zaczyna od e4. Stockfish: Mat białych w 3.',
  );
  assert.equal(coachHint(new Chess(), { status: 'pending' }), 'Stockfish jeszcze nie ocenił tej pozycji.');
  assert.equal(coachHint(new Chess(), { status: 'unavailable' }), 'Stockfish jest niedostępny.');
  assert.equal(coachHint(new Chess(), quiet), 'Nie mam teraz oceny Stockfisha.');
  assert.equal(coachHint(new Chess(), { status: 'ok', lines: [] }), 'Nie mam poprawnej oceny Stockfisha.');
});
