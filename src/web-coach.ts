import { createStockfishEngine } from '../shared/stockfish.mjs';
import { clipFile, matchRecordedLine, sparringClipNames } from '../shared/recorded-clips.mjs';
import { findMateLessonMove, lessonFen, mateAttempt, mateReply } from '../shared/mate-lesson.mjs';
import type { ChessCoach } from './chess-coach';

const base = import.meta.env.BASE_URL;
const inviteKey = 'chess-coach:invite';

function readInvite() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (!fragment.has('invite')) {
    try {
      return sessionStorage.getItem(inviteKey);
    } catch {
      return null;
    }
  }

  const value = fragment.get('invite') ?? '';
  const invite = /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null;
  history.replaceState(history.state, '', location.pathname + location.search);
  try {
    sessionStorage.removeItem(inviteKey);
    if (invite) sessionStorage.setItem(inviteKey, invite);
  } catch {
    // The current tab can use the invitation without storage.
  }
  return invite;
}

async function readClip(directory: string, name: string) {
  if (!clipFile.test(name)) return null;
  try {
    const response = await fetch(base + 'recordings/' + directory + '/' + name);
    if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) return null;
    const clip = new Uint8Array(await response.arrayBuffer());
    return clip.length ? clip : null;
  } catch {
    return null;
  }
}

type CatalogLine = { id: string; file: string };

export function createWebCoach(): ChessCoach {
  const invite = readInvite();
  const engine = createStockfishEngine(({ onLine, onError }) => {
    const worker = new Worker(base + 'stockfish/stockfish-19-lite-single.js');
    worker.onmessage = event => {
      if (typeof event.data === 'string') event.data.split(/\r?\n/).forEach(onLine);
    };
    worker.onerror = event => onError(new Error(event.message || 'Stockfish worker failed'));
    return {
      write: commands => commands.split('\n').forEach(command => worker.postMessage(command)),
      close: () => worker.terminate(),
    };
  }, { threads: 1, hash: 16 });

  let catalog: Promise<CatalogLine[]> | undefined;
  let lesson: AbortController | undefined;

  return {
    analyze: engine.analyze,
    async recordedClip(request) {
      catalog ??= fetch(base + 'recordings/lessons/manifest.json')
        .then(async response => {
          const data = response.ok ? await response.json() : null;
          if (!Array.isArray(data?.lines)) throw new Error('Recording manifest unavailable');
          return data.lines;
        }).catch(() => {
          catalog = undefined;
          return [];
        });
      const match = matchRecordedLine(await catalog, request);
      return match && match.file === match.id + '.mp3' ? readClip('lessons', match.file) : null;
    },
    async recordedHint(request) {
      const names = sparringClipNames(request);
      if (!names) return null;
      const full = await readClip('sparring', names.full);
      if (full) return [full];

      const fragments = await Promise.all(names.fragments.map(name => readClip('sparring', name)));
      return fragments.every(clip => clip !== null) ? fragments : null;
    },
    async coachLion(input) {
      const move = findMateLessonMove(input);
      if (!move) return { status: 'unavailable' };

      lesson?.abort();
      const operation = new AbortController();
      lesson = operation;
      const { signal } = operation;
      try {
        let suggestion: string | undefined;
        if (!move.san.endsWith('#')) {
          const hint = await engine.analyze({ initialFen: lessonFen, moves: [], purpose: 'hint' });
          suggestion = hint.status === 'ok' ? hint.lines[0]?.moves[0] : undefined;
        }
        if (signal.aborted) return { status: 'cancelled' };
        const attempt = mateAttempt(move, suggestion);
        let sentence: unknown;
        if (invite) {
          try {
            const response = await fetch(base + 'api/mate', {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + invite, 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...input, suggestion: attempt.hint?.lan }),
              signal: AbortSignal.any([signal, AbortSignal.timeout(5500)]),
            });
            if (response.ok) sentence = (await response.json()).sentence;
          } catch {
            // The lesson can use a recorded local response.
          }
        }
        return signal.aborted ? { status: 'cancelled' } : { ...mateReply(attempt, sentence), audio: null };
      } finally {
        if (lesson === operation) lesson = undefined;
      }
    },
    async stopLion() {
      lesson?.abort();
    },
  };
}
