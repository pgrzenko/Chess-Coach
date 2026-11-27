import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Chess } from 'chess.js';
import {
  arrivalEvent,
  classifyClick,
  kingFen,
  legalDestinations,
  lessonLine,
  passedFence,
  pawnFen,
  pieceLessons,
} from '../src/piece-lessons.ts';

const files = 'abcdefgh';
const squares = [...files].flatMap(file => [1, 2, 3, 4, 5, 6, 7, 8].map(rank => file + rank));
const pack = path.resolve(import.meta.dirname, '../personal/ai-outputs/Autopilot/odsluch/elevenlabs/paczka-pl/manifest.json');

test('king clicks match the checked board and a longer path still finishes', () => {
  assert.equal(kingFen('b2'), '8/8/8/8/2k5/8/1K6/8 w - - 0 1');
  assert.deepEqual(legalDestinations('king', 'b2').sort(), ['a1', 'a2', 'a3', 'b1', 'c1', 'c2']);
  assert.equal(classifyClick('king', 'b2', 'c3', true), 'too-close');
  assert.equal(classifyClick('king', 'b2', 'b3', true), 'too-close');
  assert.equal(classifyClick('king', 'b2', 'b4', true), 'too-far');
  assert.equal(classifyClick('king', 'b2', 'c4', false), 'enemy');
  assert.equal(classifyClick('king', 'b2', 'c2', true), 'move');

  const counts = { selected: 0, move: 0, enemy: 0, 'too-close': 0, 'too-far': 0 };
  for (const square of squares) counts[classifyClick('king', 'b2', square, true)] += 1;
  assert.deepEqual(counts, { selected: 1, move: 6, enemy: 1, 'too-close': 2, 'too-far': 54 });

  const chess = new Chess(kingFen('b2'));
  assert.equal(chess.isAttacked('b3', 'b'), true);
  assert.equal(chess.isAttacked('c3', 'b'), true);
  assert.equal(arrivalEvent('king', 'e2', 'e3'), 'finished');
  assert.equal(arrivalEvent('king', 'd2', 'e2'), 'moved');
  assert.equal(pieceLessons.king.events.includes('finished-long'), false);
});

test('queen reaches g7 in one diagonal and treats a knight-shaped step as bent', () => {
  const dests = legalDestinations('queen', 'd4');
  assert.equal(dests.length, 27);
  assert.equal(dests.includes('g7'), true);
  assert.equal(classifyClick('queen', 'd4', 'g7', true), 'move');
  assert.equal(classifyClick('queen', 'd4', 'e6', true), 'bent');
  assert.equal(squares.filter(square => square !== 'd4' && !dests.includes(square)).length, 36);
  assert.equal(arrivalEvent('queen', 'd4', 'g7'), 'finished');
  assert.equal(arrivalEvent('queen', 'd4', 'g4'), 'moved');
  assert.equal(arrivalEvent('queen', 'g4', 'g7'), 'finished');
});

test('knight jumps the pawn fence, refuses its own pawn, and finishes on e7', () => {
  assert.deepEqual(legalDestinations('knight', 'd4').sort(), ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5']);
  for (const to of legalDestinations('knight', 'd4')) assert.equal(passedFence('d4', to), true);
  assert.equal(classifyClick('knight', 'd4', 'd6', true), 'not-l');
  assert.equal(classifyClick('knight', 'd4', 'f6', true), 'not-l');
  assert.equal(classifyClick('knight', 'd4', 'd5', true), 'not-l');
  assert.equal(classifyClick('knight', 'd4', 'd5', false), 'blocker');
  assert.equal(classifyClick('knight', 'c6', 'e5', true), 'own-piece');
  assert.equal(classifyClick('knight', 'f5', 'e3', true), 'own-piece');
  assert.equal(passedFence('c6', 'e7'), false);
  assert.equal(passedFence('f5', 'e7'), false);
  assert.equal(arrivalEvent('knight', 'd4', 'c6'), 'jumped');
  assert.equal(arrivalEvent('knight', 'c6', 'e7'), 'finished');
  assert.equal(arrivalEvent('knight', 'c6', 'a5'), 'moved');
  assert.equal(pieceLessons.knight.events.includes('finished-long'), false);
});

test('lesson bubbles are the recorded lines, with coordinates in the bubble', () => {
  const manifest = JSON.parse(readFileSync(pack, 'utf8'));
  const slugs = { king: 'poznaj-krola', queen: 'poznaj-hetmana', knight: 'poznaj-skoczka' };
  for (const lesson of ['king', 'queen', 'knight']) {
    for (const coach of ['lion', 'owl']) {
      for (const event of pieceLessons[lesson].events) {
        const id = `pl.${coach}.${lesson}.${event}`;
        const recorded = manifest.lines.find(line => line.id === id);
        assert.ok(recorded, id);
        assert.equal(lessonLine(lesson, coach, event), recorded.bubble);
        assert.equal(recorded.lesson, slugs[lesson]);
        assert.equal(recorded.event, event);
        assert.equal(/e trzy|gie siedem|e siedem|literą el/.test(recorded.bubble), false);
      }
    }
  }
});

function shortestPaths(start, target, destinations) {
  const paths = [[start]];
  const distances = new Map([[start, 0]]);
  for (const route of paths) {
    const from = route.at(-1);
    if (from === target) continue;
    for (const to of destinations(from)) {
      if ((distances.get(to) ?? Infinity) < route.length) continue;
      distances.set(to, route.length);
      paths.push([...route, to]);
    }
  }
  return paths.filter(route => route.at(-1) === target);
}

test('bishop stays on one color and reaches g5 by either shortest path or a detour', () => {
  const dests = from => legalDestinations('bishop', from);
  const chess = new Chess('k7/8/8/8/3B4/8/8/7K w - - 0 1');
  assert.deepEqual(dests('d4').sort(), chess.moves({ square: 'd4', verbose: true }).map(move => move.to).sort());
  assert.deepEqual(shortestPaths('d4', 'g5', dests).sort(), [['d4', 'e3', 'g5'], ['d4', 'f6', 'g5']]);
  const reachable = squares.filter(square => shortestPaths('d4', square, dests).length > 0);
  assert.equal(reachable.length, 32);
  assert.ok(reachable.every(square => shortestPaths(square, 'g5', dests).length > 0));
  assert.equal(classifyClick('bishop', 'd4', 'd5', true), 'not-diagonal');
  assert.equal(classifyClick('bishop', 'd4', 'e3', true), 'move');
  assert.equal(arrivalEvent('bishop', 'd4', 'e3'), 'moved');
  assert.ok(dests('e3').includes('h6'));
  assert.ok(dests('h6').includes('g5'));
  assert.equal(arrivalEvent('bishop', 'h6', 'g5'), 'finished');
});

test('pawn can start with one or two steps and promotes to a queen on e8 in either case', () => {
  const dests = from => legalDestinations('pawn', from);
  assert.deepEqual(dests('e2').sort(), ['e3', 'e4']);
  assert.deepEqual(shortestPaths('e2', 'e8', dests), [['e2', 'e4', 'e5', 'e6', 'e7', 'e8']]);
  assert.deepEqual(shortestPaths('e3', 'e8', dests), [['e3', 'e4', 'e5', 'e6', 'e7', 'e8']]);
  assert.equal(classifyClick('pawn', 'e2', 'd3', true), 'pawn-forward');
  assert.equal(classifyClick('pawn', 'e3', 'e5', true), 'pawn-forward');
  assert.equal(classifyClick('pawn', 'e4', 'e3', true), 'pawn-forward');
  for (const from of ['e2', 'e3', 'e4', 'e5', 'e6', 'e7']) {
    const chess = new Chess(pawnFen('pawn', from));
    assert.equal(chess.isCheck(), false);
    assert.equal(chess.isAttacked('h6', 'w'), false);
    const moves = chess.moves({ square: from, verbose: true }).filter(move => !move.promotion || move.promotion === 'q');
    assert.deepEqual(dests(from).sort(), moves.map(move => move.to).sort());
  }
  const chess = new Chess(pawnFen('pawn', 'e7'));
  assert.equal(chess.move({ from: 'e7', to: 'e8', promotion: 'q' }).san, 'e8=Q');
  assert.deepEqual(new Chess(pawnFen('pawn', 'e8')).get('e8'), chess.get('e8'));
  assert.equal(arrivalEvent('pawn', 'e7', 'e8'), 'promoted');
  assert.deepEqual(dests('e8'), []);
});

test('pawn blocked on e5 can capture on d5 but cannot move diagonally to an empty square', () => {
  const chess = new Chess(pawnFen('pawn-capture', 'e4'));
  assert.deepEqual(chess.moves({ square: 'e4' }), ['exd5']);
  assert.deepEqual(shortestPaths('e4', 'd5', from => legalDestinations('pawn-capture', from)), [['e4', 'd5']]);
  assert.equal(classifyClick('pawn-capture', 'e4', 'e5', true), 'pawn-blocked');
  assert.equal(classifyClick('pawn-capture', 'e4', 'f5', true), 'capture-only');
  assert.equal(classifyClick('pawn-capture', 'e4', 'd5', true), 'move');
  assert.equal(arrivalEvent('pawn-capture', 'e4', 'd5'), 'finished');
  chess.move('exd5');
  const finished = new Chess(pawnFen('pawn-capture', 'd5'));
  assert.equal(finished.board().flat().filter(Boolean).length, 4);
  assert.deepEqual(finished.board(), chess.board());
  assert.deepEqual(legalDestinations('pawn-capture', 'd5'), []);
});

test('both coaches have a line for each event in the new lessons', () => {
  for (const stage of ['bishop', 'pawn', 'pawn-capture']) {
    assert.equal(pieceLessons[stage].events.includes('finished-long'), false);
    for (const event of pieceLessons[stage].events) {
      for (const coach of ['lion', 'owl']) assert.ok(lessonLine(stage, coach, event), `${stage}.${coach}.${event}`);
    }
  }
});
