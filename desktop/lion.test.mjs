import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createLionLesson, lessonFen } from './lion-lesson.mjs';
import { createRealtimeVoiceProvider, lionAudio } from './lion-voice.mjs';
import { readOpenAIKey } from './openai-env.mjs';
import { normalizeSpeech, sanToSpeech, sparringHintSpeech, squareToSpeech } from './speech-normalizer.mjs';
import { synthesizeSpeech } from './speech.mjs';

const samples = [
  ['Nxf7+', 'Skoczek bije na ef siedem. Szach!'],
  ['Qh5#', 'Hetman na ha pięć. Mat!'],
  ['e4', 'Pion na e cztery.'],
  ['O-O', 'Krótka roszada.'],
  ['O-O-O+', 'Długa roszada. Szach!'],
  ['exd8=Q+', 'Pion z linii e bije na de osiem z promocją na hetmana. Szach!'],
  ['Nbd2', 'Skoczek z linii be na de dwa.'],
];

test('reads only the configured OpenAI key from the local environment file', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'chess-coach-env-'));
  const filename = path.join(directory, '.env');
  t.after(() => {
    rmSync(filename, { force: true });
    rmdirSync(directory);
  });
  assert.equal(readOpenAIKey(filename), undefined);
  writeFileSync(filename, 'OPENAI_API_KEY=\r\nOTHER_KEY=ignored\r\n');
  assert.equal(readOpenAIKey(filename), undefined);
  writeFileSync(filename, '\uFEFF# Windows UTF-8 file\r\nOPENAI_API_KEY="test-fixture"\r\nOTHER_KEY=ignored\r\n');
  assert.equal(readOpenAIKey(filename), 'test-fixture');
});

test('pronounces Polish SAN for captures, mate, castling, promotion and disambiguation', () => {
  for (const [san, speech] of samples) assert.equal(sanToSpeech(san), speech);
  assert.equal(sanToSpeech('Nxf7+', { oneSentence: true }), 'Skoczek bije na ef siedem — szach!');
  assert.equal(sanToSpeech('Zg9'), null);
});

test('sparring hints spell both squares and name all four promotion choices', () => {
  assert.equal(sparringHintSpeech({ from: 'e2', to: 'e4' }), 'Z e dwa na e cztery.');
  assert.equal(sparringHintSpeech({ from: 'f3', to: 'f4' }), 'Z ef trzy na ef cztery.');
  assert.equal(sparringHintSpeech({ from: 'e1', to: 'g1' }), 'Z e jeden na gie jeden.');
  assert.equal(sparringHintSpeech({ from: 'e8', to: 'c8' }), 'Z e osiem na ce osiem.');
  assert.equal(sparringHintSpeech({ from: 'e5', to: 'd6' }), 'Z e pięć na de sześć.');
  for (const [promotion, role] of Object.entries({ q: 'hetmana', r: 'wieżę', b: 'gońca', n: 'skoczka' })) {
    assert.equal(sparringHintSpeech({ from: 'b7', to: 'a8', promotion }), `Z be siedem na a osiem. Promocja na ${role}.`);
  }
  for (const [file, name] of Object.entries({ a: 'a', b: 'be', c: 'ce', d: 'de', e: 'e', f: 'ef', g: 'gie', h: 'ha' })) {
    for (const [index, number] of ['jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem'].entries()) {
      assert.equal(squareToSpeech(file + (index + 1)), name + ' ' + number);
    }
  }
  for (const move of [null, { from: ['e2'], to: 'e4' }, { from: 'e9', to: 'e4' }, { from: 'e4', to: 'e4' }, { from: 'a7', to: 'a8', promotion: 'k' }]) {
    assert.equal(sparringHintSpeech(move), null);
  }
});

test('transcript guard accepts only normalization of case, punctuation and squares', () => {
  const expected = normalizeSpeech('Skoczek bije na ef siedem. Szach!');
  assert.equal(normalizeSpeech('SKOCZEK bije na F7, szach.'), expected);
  assert.equal(normalizeSpeech('Skoczek bije na F-7 — szach'), expected);
  assert.notEqual(normalizeSpeech('Skoczek bije na f6. Szach.'), expected);
  assert.notEqual(normalizeSpeech('Skoczek bije na f7. Mat.'), expected);
  assert.notEqual(normalizeSpeech('Hej, skoczek bije na f7. Szach.'), expected);
});

function fakeRealtime(transcript, usageLines, { status = 'completed', wait = false } = {}) {
  const requests = [];
  const socket = new EventEmitter();
  const send = event => queueMicrotask(() => socket.emit('message', JSON.stringify(event)));
  socket.terminate = () => {};
  socket.send = (raw, callback) => {
    const event = JSON.parse(raw);
    requests.push(event);
    callback();
    if (event.type === 'session.update') send({ type: 'session.updated' });
    if (event.type === 'response.create' && !wait) {
      const scope = { response_id: 'r1', content_index: 0, item_id: 'i1' };
      send({ type: 'response.created', response: { id: 'r1' } });
      send({ type: 'response.output_audio.delta', ...scope, delta: Buffer.from([10, 0, 20, 0]).toString('base64') });
      if (transcript !== undefined) send({ type: 'response.output_audio_transcript.done', ...scope, transcript });
      send({
        type: 'response.done',
        response: {
          id: 'r1', status, usage: {
            total_tokens: 149,
            input_token_details: { audio_tokens: 0, text_tokens: 76 },
            output_token_details: { audio_tokens: 65, text_tokens: 8 },
          },
        },
      });
    }
  };
  const provider = createRealtimeVoiceProvider({
    open: () => {
      send({ type: 'session.created' });
      return socket;
    },
    onUsage: line => usageLines.push(line),
  });
  return { provider, requests };
}

const statement = 'Skoczek bije na ef siedem. Szach!';
const request = () => ({ apiKey: 'test-key', signal: new AbortController().signal });

test('Realtime buffers audio, accepts matching transcript and logs numeric usage from response.done', async () => {
  const usage = [];
  const { provider, requests } = fakeRealtime('Skoczek bije na f7, szach!', usage);
  const sound = await provider.synthesize(statement, request());
  assert.equal(sound.source, 'openai');
  assert.equal(sound.wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(sound.wav.readUInt32LE(24), 24000);
  assert.equal(usage[0].audioOutputTokens, 65);
  assert.equal(usage[0].audioInputTokens, 0);
  assert.equal(usage[0].transcriptMatch, true);
  assert.equal(usage[0].accepted, true);
  assert.ok(Number.isInteger(usage[0].msToAudio) && usage[0].msToAudio >= 0);
  assert.equal(requests[0].session.audio.input.turn_detection, null);
  assert.equal(requests[0].session.audio.output.voice, 'cedar');
  assert.equal(requests[1].response.input[0].content[0].text, statement);
  assert.deepEqual(requests[1].response.output_modalities, ['audio']);
});

test('missing key, changed words, incomplete response and missing transcript fall back to Windows', async () => {
  const fallback = { source: 'windows', wav: Buffer.from([1, 2]) };
  let fallbackCount = 0;
  const local = { synthesize: async () => {
    fallbackCount++;
    return fallback;
  } };
  const noKey = await lionAudio(statement, { signal: new AbortController().signal }, {
    openai: { synthesize: () => assert.fail('Cloud called without BYOK') }, local,
  });
  assert.equal(noKey, fallback);

  for (const [transcript, status] of [
    ['Skoczek bije na f6. Szach!', 'completed'],
    [statement, 'incomplete'],
    [undefined, 'completed'],
  ]) {
    const usage = [];
    const { provider } = fakeRealtime(transcript, usage, { status });
    assert.equal(await lionAudio(statement, request(), { openai: provider, local }), fallback);
    assert.equal(usage[0].audioOutputTokens, 65);
    assert.equal(usage[0].transcriptMatch, false);
    assert.equal(usage[0].accepted, false);
  }
  assert.equal(fallbackCount, 4);
});

test('cancellation drops pending cloud audio without starting local playback', async () => {
  const stop = new AbortController();
  const { provider } = fakeRealtime(undefined, [], { wait: true });
  const pending = lionAudio(statement, { apiKey: 'test-key', signal: stop.signal }, {
    openai: provider, local: { synthesize: () => assert.fail('Fallback started after abort') },
  });
  await delay(0);
  stop.abort();
  assert.equal(await pending, null);
});

test('lesson uses a verified Stockfish mate, rejects invented text and accepts equivalent mates', async () => {
  const spoken = [];
  const service = createLionLesson({
    stockfish: { analyze: async input => {
      assert.equal(input.initialFen, lessonFen);
      assert.equal(input.purpose, 'hint');
      return { status: 'ok', lines: [{ moves: ['f7g7'] }] };
    } },
    readKey: async () => undefined,
    choose: async () => 'invented response',
    speak: async text => { spoken.push(text); return null; },
  });
  assert.deepEqual(await service.attempt({ from: 'a1', to: 'a8' }), { status: 'unavailable' });
  const miss = await service.attempt({ from: 'f7', to: 'f6' });
  assert.equal(miss.status, 'ok');
  assert.equal(miss.passed, false);
  assert.deepEqual(miss.hint, { from: 'f7', to: 'g7' });
  assert.equal(miss.text, 'Dobra próba, poszukajmy mata! Hetman\u00a0na\u00a0g7\u00a0—\u00a0mat!');
  assert.equal(spoken[0], 'Dobra próba, poszukajmy mata! Hetman na gie siedem — mat!');
  for (const to of ['e8', 'f8', 'g7', 'h7']) {
    const success = await service.attempt({ from: 'f7', to });
    assert.equal(success.passed, true);
    assert.equal(success.hint, null);
  }
  assert.equal(spoken.length, 5);
});

test('recorded mate line skips speech synthesis and keeps both success sentences', async () => {
  const requests = [];
  const service = createLionLesson({
    stockfish: { analyze: async () => ({ status: 'ok', lines: [{ moves: ['f7g7'] }] }) },
    readKey: async () => 'test-key',
    choose: async outcome => outcome === 'passed' ? 'Świetnie, król nie ma jak uciec!' : 'Jeszcze nie ma mata.',
    speak: async () => {
      throw new Error('synthesis should not run when a recording matches');
    },
    recordedClip: request => {
      requests.push(request);
      return Buffer.from([1, 2, 3]);
    },
  });
  const miss = await service.attempt({ from: 'f7', to: 'f6' });
  assert.equal(miss.status, 'ok');
  assert.equal(miss.audio, null);
  assert.equal(miss.text, 'Jeszcze nie ma mata. Hetman\u00a0na\u00a0g7\u00a0—\u00a0mat!');
  assert.deepEqual(requests[0], {
    lesson: 'mat-w-jednym',
    coach: 'lion',
    text: miss.text,
    hint: { from: 'f7', to: 'g7' },
  });
  const success = await service.attempt({ from: 'f7', to: 'e8' });
  assert.equal(success.passed, true);
  assert.equal(success.audio, null);
  assert.equal(success.text, 'Świetnie, król nie ma jak uciec!');
  assert.equal(requests[1].hint, null);
  assert.equal(requests[1].text, success.text);
});

test('uses the same OpenAI key for a generated reply and speech when the clip is missing', async () => {
  const apiKey = 'test-key';
  const audio = { source: 'openai', wav: Buffer.from([1, 2, 3]) };
  const service = createLionLesson({
    readKey: () => apiKey,
    choose: async (outcome, facts, key) => {
      assert.equal(outcome, 'passed');
      assert.equal(key, apiKey);
      return 'Świetnie, król nie ma jak uciec!';
    },
    recordedClip: () => null,
    speak: async (text, context) => {
      assert.equal(text, 'Świetnie, król nie ma jak uciec!');
      assert.equal(context.apiKey, apiKey);
      return audio;
    },
  });
  const success = await service.attempt({ from: 'f7', to: 'g7' });
  assert.equal(success.status, 'ok');
  assert.equal(success.audio, audio);
});

test('Windows SAPI produces non-silent PCM WAV for Polish samples', {
  skip: process.platform !== 'win32',
}, async () => {
  for (const [, sample] of [samples[0], samples[1], samples[2], samples[3]]) {
    const wav = await synthesizeSpeech(sample);
    assert.ok(wav && wav.length > 4800);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(24), 24000);
    assert.ok(wav.subarray(44).some(byte => byte !== 0));
  }
});
