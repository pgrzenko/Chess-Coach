import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { polishSan, readSan, scoreColumns, scorePairs, variationTokens } from '../shared/polish-notation.mjs';

test('translates SAN into Polish display text', () => {
  const cases = [
    ['e4', 'e4', 'pion e4'],
    ['Nf3', 'Sf3', 'skoczek f3'],
    ['Qd4', 'Hd4', 'hetman d4'],
    ['Bb5', 'Gb5', 'goniec b5'],
    ['Re1', 'We1', 'wieża e1'],
    ['Ke2', 'Ke2', 'król e2'],
    ['Nxe5', 'Sxe5', 'skoczek bije e5'],
    ['exd5', 'exd5', 'pion z e bije d5'],
    ['Nbd2', 'Sbd2', 'skoczek z b na d2'],
    ['R1e2', 'W1e2', 'wieża z 1 na e2'],
    ['Qh4e1', 'Hh4e1', 'hetman z h4 na e1'],
    ['O-O', 'O-O', 'krótka roszada'],
    ['O-O-O', 'O-O-O', 'długa roszada'],
    ['O-O+', 'O-O+', 'krótka roszada, szach'],
    ['O-O-O+', 'O-O-O+', 'długa roszada, szach'],
    ['e8=Q', 'e8H', 'pion e8, promocja na hetmana'],
    ['exd8=Q+', 'exd8H+', 'pion z e bije d8, promocja na hetmana, szach'],
    ['a8=N', 'a8S', 'pion a8, promocja na skoczka'],
    ['a8=R', 'a8W', 'pion a8, promocja na wieżę'],
    ['a8=B', 'a8G', 'pion a8, promocja na gońca'],
    ['Qh7#', 'Hh7#', 'hetman h7, mat'],
    ['e8=Q#', 'e8H#', 'pion e8, promocja na hetmana, mat'],
  ];
  for (const [san, polish, spoken] of cases) {
    const read = readSan(san);
    assert.ok(read, san);
    assert.equal(read.polish, polish, san);
    assert.equal(read.spoken, spoken, san);
    assert.equal(polishSan(san), polish, san);
  }
});

test('reads SAN produced by chess.js, including captures, castling, promotion and mate', () => {
  const chess = new Chess();
  for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O']) {
    const move = chess.move(san);
    assert.equal(polishSan(move.san), {
      e4: 'e4',
      e5: 'e5',
      Nf3: 'Sf3',
      Nc6: 'Sc6',
      Bb5: 'Gb5',
      a6: 'a6',
      Bxc6: 'Gxc6',
      dxc6: 'dxc6',
      'O-O': 'O-O',
    }[san]);
  }

  const knights = new Chess('4k3/8/8/8/3N4/8/8/N3K3 w - - 0 1');
  assert.equal(polishSan(knights.move('Nac2').san), 'Sac2');

  const promo = new Chess('8/P7/8/8/8/8/8/4K2k w - - 0 1');
  assert.equal(polishSan(promo.move('a8=Q+').san), 'a8H+');

  const mate = new Chess();
  for (const san of ['f3', 'e5', 'g4']) mate.move(san);
  assert.equal(polishSan(mate.move('Qh4').san), 'Hh4#');

  const castle = new Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.equal(polishSan(castle.move('O-O-O').san), 'O-O-O');
});

test('pairs an active line into move rows and keeps a trailing white move', () => {
  const rows = scorePairs([
    { ply: 1, san: 'e4' },
    { ply: 2, san: 'e5' },
    { ply: 3, san: 'Nf3' },
  ]);
  assert.deepEqual(rows.map(row => [row.number, row.white?.san, row.black?.san]), [
    [1, 'e4', 'e5'],
    [2, 'Nf3', undefined],
  ]);
  const blackFirst = scorePairs([{ ply: 2, san: 'e5' }]);
  assert.equal(blackFirst[0].number, 1);
  assert.equal(blackFirst[0].white, undefined);
  assert.equal(blackFirst[0].black.san, 'e5');
});

test('fills the first score column before opening the next', () => {
  const rows = Array.from({ length: 25 }, (_, index) => index + 1);
  assert.deepEqual(scoreColumns(rows, 10, 3).map(column => column.length), [10, 10, 5]);
  assert.deepEqual(scoreColumns(rows.slice(0, 3), 10, 3).map(column => column.length), [3]);
  assert.equal(scoreColumns(rows, 10, 1).length, 1);
});

test('keeps a move number with the move that can be truncated', () => {
  assert.deepEqual(variationTokens(['e4', 'e5', 'Nf3'], 'w', 1).map(token => token.prefix), ['1.', '', '2.']);
  assert.deepEqual(variationTokens(['e5', 'Nf3', 'Nc6'], 'b', 8).map(token => [token.prefix, token.color]), [
    ['8…', 'b'],
    ['9.', 'w'],
    ['', 'b'],
  ]);
});
