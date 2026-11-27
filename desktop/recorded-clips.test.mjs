import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  loadCatalog,
  matchRecordedLine,
  normalizeBubble,
  packDirectory,
  readRecordedClip,
  readSparringClips,
} from './recorded-clips.mjs';

const rookEvents = ['start', 'selected', 'diagonal', 'moved', 'finished'];

test('sparring uses a full match before fragments and falls back when any part is missing', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'chess-coach-sparring-'));
  const files = [];
  t.after(() => {
    for (const file of files) rmSync(file, { force: true });
    rmdirSync(directory);
  });
  const put = (id, value) => {
    const file = path.join(directory, 'pl.' + id + '.mp3');
    files.push(file);
    writeFileSync(file, Buffer.from([value]));
  };
  const decoded = request => readSparringClips(request, directory)?.map(clip => clip[0]) ?? null;
  const lion = { coach: 'lion', from: 'e2', to: 'e4' };
  const owl = { ...lion, coach: 'owl' };
  put('lion.sparing.from.e2', 1);
  assert.equal(decoded(lion), null);
  put('lion.sparing.to.e4', 2);
  assert.deepEqual(decoded(lion), [1, 2]);
  put('lion.sparing.move.e2-e4', 3);
  assert.deepEqual(decoded(lion), [3]);
  assert.equal(decoded(owl), null);
  put('owl.sparing.move.e2-e4', 4);
  assert.deepEqual(decoded(owl), [4]);

  const promotion = { coach: 'lion', from: 'a7', to: 'a8', promotion: 'q' };
  put('lion.sparing.from.a7', 5);
  put('lion.sparing.to.a8', 6);
  put('lion.sparing.move.a7-a8-n', 7);
  assert.equal(decoded(promotion), null);
  assert.deepEqual(decoded({ ...promotion, promotion: 'n' }), [7]);
  put('lion.sparing.promotion.q', 8);
  assert.deepEqual(decoded(promotion), [5, 6, 8]);
  assert.equal(decoded({ ...lion, coach: '../lion' }), null);
  assert.equal(decoded({ ...lion, from: '..' }), null);
});

function line(partial) {
  return { voiceId: 'voice', model: 'Eleven v4', spoken: partial.bubble, file: `${partial.id}.mp3`, ...partial };
}

const fixture = [
  ...rookEvents.flatMap(event => [
    line({ id: `pl.lion.rook.${event}`, lesson: 'poznaj-wieze', event, coach: 'lion', bubble: `Lew ${event}` }),
    line({ id: `pl.owl.rook.${event}`, lesson: 'poznaj-wieze', event, coach: 'owl', bubble: `Sowa ${event}` }),
  ]),
  line({
    id: 'pl.lion.mate.greeting', lesson: 'mat-w-jednym', event: 'greeting', coach: 'lion',
    bubble: 'Który ruch daje mata? Pokaż mi!',
  }),
  line({
    id: 'pl.lion.mate.local.f7e8', lesson: 'mat-w-jednym', event: 'local-hint', coach: 'lion',
    bubble: 'Dobra próba! Zagraj hetmanem na e8.', hint: { from: 'f7', to: 'e8' },
  }),
  line({
    id: 'pl.lion.passed.bravo', lesson: 'mat-w-jednym', event: 'passed', coach: 'lion',
    bubble: 'Brawo, udało Ci się dać mata!',
  }),
  line({
    id: 'pl.lion.passed.escape', lesson: 'mat-w-jednym', event: 'passed', coach: 'lion',
    bubble: 'Świetnie, król nie ma jak uciec!',
  }),
  line({
    id: 'pl.lion.retry.notyet.f7e8', lesson: 'mat-w-jednym', event: 'retry', coach: 'lion',
    bubble: 'Jeszcze nie ma mata. Hetman na e8 — mat!', hint: { from: 'f7', to: 'e8' },
  }),
  line({
    id: 'pl.lion.retry.search.f7g7', lesson: 'mat-w-jednym', event: 'retry', coach: 'lion',
    bubble: 'Dobra próba, poszukajmy mata! Hetman na g7 — mat!', hint: { from: 'f7', to: 'g7' },
  }),
  line({
    id: 'pl.owl.mate.greeting', lesson: 'mat-w-jednym', event: 'greeting', coach: 'owl',
    bubble: 'Gdzie poleci hetman? Poszukaj mata!',
  }),
  line({
    id: 'pl.owl.mate.local.f7e8', lesson: 'mat-w-jednym', event: 'local-hint', coach: 'owl',
    bubble: 'Dobra próba! Co zrobi hetman na e8?', hint: { from: 'f7', to: 'e8' },
  }),
  line({
    id: 'pl.owl.mate.passed', lesson: 'mat-w-jednym', event: 'passed', coach: 'owl',
    bubble: 'Brawo! Król nie ma jak uciec. To mat!',
  }),
];

test('rook clips follow the lesson event and coach', () => {
  for (const event of rookEvents) {
    assert.equal(matchRecordedLine(fixture, { lesson: 'poznaj-wieze', coach: 'lion', event }).id, `pl.lion.rook.${event}`);
    assert.equal(matchRecordedLine(fixture, { lesson: 'poznaj-wieze', coach: 'owl', event }).id, `pl.owl.rook.${event}`);
  }
  assert.equal(matchRecordedLine(fixture, { lesson: 'poznaj-wieze', coach: 'lion', event: 'greeting' }), null);
  assert.equal(matchRecordedLine(fixture, { lesson: 'poznaj-wieze', coach: 'pawn', event: 'start' }), null);
});

test('mate clips follow the sentence and hint square, including hard spaces', () => {
  const notyet = 'Jeszcze nie ma mata. Hetman\u00a0na\u00a0e8\u00a0—\u00a0mat!';
  const search = 'Dobra próba, poszukajmy mata! Hetman\u00a0na\u00a0g7\u00a0—\u00a0mat!';
  assert.equal(normalizeBubble(notyet), 'Jeszcze nie ma mata. Hetman na e8 — mat!');
  assert.equal(
    matchRecordedLine(fixture, { lesson: 'mat-w-jednym', coach: 'lion', text: notyet, hint: { from: 'f7', to: 'e8' } }).id,
    'pl.lion.retry.notyet.f7e8',
  );
  assert.equal(
    matchRecordedLine(fixture, { lesson: 'mat-w-jednym', coach: 'lion', text: search, hint: { from: 'f7', to: 'g7' } }).id,
    'pl.lion.retry.search.f7g7',
  );
  assert.equal(
    matchRecordedLine(fixture, { lesson: 'mat-w-jednym', coach: 'lion', text: notyet, hint: { from: 'f7', to: 'f8' } }),
    null,
  );

  const local = 'Dobra próba! Zagraj hetmanem na e8.';
  assert.equal(
    matchRecordedLine(fixture, { lesson: 'mat-w-jednym', coach: 'lion', text: local, hint: { from: 'f7', to: 'e8' } }).id,
    'pl.lion.mate.local.f7e8',
  );
  assert.equal(
    matchRecordedLine(fixture, { lesson: 'mat-w-jednym', coach: 'owl', text: 'Dobra próba! Co zrobi hetman na e8?', hint: { from: 'f7', to: 'e8' } }).id,
    'pl.owl.mate.local.f7e8',
  );

  assert.equal(
    matchRecordedLine(fixture, { lesson: 'mat-w-jednym', coach: 'lion', text: 'Brawo, udało Ci się dać mata!', hint: null }).id,
    'pl.lion.passed.bravo',
  );
  assert.equal(
    matchRecordedLine(fixture, { lesson: 'mat-w-jednym', coach: 'lion', text: 'Świetnie, król nie ma jak uciec!', hint: null }).id,
    'pl.lion.passed.escape',
  );
  assert.equal(
    matchRecordedLine(fixture, { lesson: 'mat-w-jednym', coach: 'lion', text: 'Brawo, udało Ci się dać mata!', hint: { from: 'f7', to: 'e8' } }),
    null,
  );
  assert.equal(
    matchRecordedLine(fixture, { lesson: 'mat-w-jednym', coach: 'owl', text: 'Brawo! Król nie ma jak uciec. To mat!', hint: null }).id,
    'pl.owl.mate.passed',
  );
  assert.equal(
    matchRecordedLine(fixture, { lesson: 'mat-w-jednym', coach: 'lion', text: 'Który ruch daje mata? Pokaż mi!', hint: null }).id,
    'pl.lion.mate.greeting',
  );
  assert.equal(matchRecordedLine(fixture, { lesson: 'mat-w-jednym', coach: 'lion', text: 'Lew myśli…', hint: null }), null);
});

test('reads only an mp3 named by the catalog inside the pack directory', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'recorded-clips-'));
  const directory = path.join(root, 'pack');
  try {
    mkdirSync(directory);
    writeFileSync(path.join(root, 'secret.mp3'), Buffer.from('secret'));
    writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
      lines: [
        line({ id: 'pl.lion.rook.start', lesson: 'poznaj-wieze', event: 'start', coach: 'lion', bubble: 'Start' }),
        {
          id: 'pl.lion.rook.selected', lesson: 'poznaj-wieze', event: 'selected', coach: 'lion',
          bubble: 'Poza', spoken: 'Poza', file: '../secret.mp3',
        },
      ],
    }));
    writeFileSync(path.join(directory, 'pl.lion.rook.start.mp3'), Buffer.from([0xff, 0xfb, 1, 2, 3]));

    const bytes = readRecordedClip({ lesson: 'poznaj-wieze', coach: 'lion', event: 'start' }, directory);
    assert.deepEqual([...bytes], [0xff, 0xfb, 1, 2, 3]);
    assert.equal(readRecordedClip({ lesson: 'poznaj-wieze', coach: 'lion', event: 'selected' }, directory), null);
    assert.equal(readRecordedClip({ lesson: 'poznaj-wieze', coach: 'lion', event: 'moved' }, directory), null);
    assert.equal(
      readRecordedClip({ lesson: 'poznaj-wieze', coach: 'lion', event: 'start' }, path.join(directory, 'missing')),
      null,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const manifestReady = existsSync(path.join(packDirectory, 'manifest.json'));

test('owner pack matches the installed rook and mate lines', { skip: !manifestReady }, () => {
  const lines = loadCatalog();
  for (const event of rookEvents) {
    const lion = matchRecordedLine(lines, { lesson: 'poznaj-wieze', coach: 'lion', event });
    const owl = matchRecordedLine(lines, { lesson: 'poznaj-wieze', coach: 'owl', event });
    assert.equal(lion.id, `pl.lion.rook.${event}`);
    assert.equal(owl.id, `pl.owl.rook.${event}`);
    assert.equal(lion.bubble.includes('gie'), false);
    assert.match(lion.spoken, /gie|podświetlonych|kolumny|ruchu/);
  }
  const start = lines.find(entry => entry.id === 'pl.lion.rook.start');
  assert.match(start.bubble, /g4/);
  assert.match(start.spoken, /gie cztery/);

  const cases = [
    ['pl.lion.retry.notyet.f7e8', 'Jeszcze nie ma mata. Hetman\u00a0na\u00a0e8\u00a0—\u00a0mat!', { from: 'f7', to: 'e8' }],
    ['pl.lion.retry.search.f7h7', 'Dobra próba, poszukajmy mata! Hetman\u00a0na\u00a0h7\u00a0—\u00a0mat!', { from: 'f7', to: 'h7' }],
    ['pl.lion.mate.local.f7e8', 'Dobra próba! Zagraj hetmanem na e8.', { from: 'f7', to: 'e8' }],
    ['pl.lion.passed.bravo', 'Brawo, udało Ci się dać mata!', null],
    ['pl.lion.passed.escape', 'Świetnie, król nie ma jak uciec!', null],
    ['pl.owl.mate.local.f7e8', 'Dobra próba! Co zrobi hetman na e8?', { from: 'f7', to: 'e8' }],
    ['pl.owl.mate.passed', 'Brawo! Król nie ma jak uciec. To mat!', null],
  ];
  for (const [id, text, hint] of cases) {
    const coach = id.startsWith('pl.owl.') ? 'owl' : 'lion';
    assert.equal(matchRecordedLine(lines, { lesson: 'mat-w-jednym', coach, text, hint }).id, id);
    assert.match(lines.find(entry => entry.id === id).bubble, /e8|h7|mata|uciec/);
  }
  const bytes = readRecordedClip({ lesson: 'poznaj-wieze', coach: 'lion', event: 'start' });
  assert.ok(bytes.length > 1000);
  assert.equal(readRecordedClip({ lesson: 'poznaj-wieze', coach: 'lion', event: 'missing' }), null);
});

const piecePack = {
  'poznaj-krola': ['king', ['start', 'selected', 'too-far', 'too-close', 'enemy', 'moved', 'finished']],
  'poznaj-hetmana': ['queen', ['start', 'selected', 'bent', 'moved', 'finished']],
  'poznaj-skoczka': ['knight', ['start', 'selected', 'not-l', 'own-piece', 'blocker', 'jumped', 'moved', 'finished']],
};

test('owner pack matches the king, queen and knight lines', { skip: !manifestReady }, () => {
  const lines = loadCatalog();
  for (const [lesson, [piece, events]] of Object.entries(piecePack)) {
    for (const event of events) {
      for (const coach of ['lion', 'owl']) {
        const line = matchRecordedLine(lines, { lesson, coach, event });
        assert.equal(line.id, `pl.${coach}.${piece}.${event}`);
        assert.equal(line.event, event);
      }
    }
    assert.equal(matchRecordedLine(lines, { lesson, coach: 'lion', event: 'finished-long' }), null);
  }
  const king = readRecordedClip({ lesson: 'poznaj-krola', coach: 'lion', event: 'start' });
  assert.ok(king.length > 1000);
});
