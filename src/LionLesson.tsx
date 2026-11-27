import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Dests, Key } from '@lichess-org/chessground/types';
import { Chess, type Move } from 'chess.js';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { coaches, LessonTeacher, type Coach } from './Coach';
import { fetchRecordedClip, unlockLessonAudio, useLessonAudio, type RecordedRequest } from './lesson-audio';

import { lessonFen } from '../shared/mate-lesson.mjs';
import type { LionAudio, VoiceSettings } from './chess-coach';

type Phase = 'idle' | 'thinking' | 'speaking';
type Feedback = { text: string; hint?: Move };
type Cue =
  | { kind: 'greeting'; round: number }
  | { kind: 'quiet' }
  | { kind: 'line'; round: number; text: string; hint: { from: string; to: string } | null; audio: LionAudio | null };

const initialFen = lessonFen;
const legalMoves = new Chess(initialFen).moves({ verbose: true });
const mates = legalMoves.filter(move => new Chess(move.after).isCheckmate());
const legalDestinations: Dests = new Map();
for (const move of legalMoves) {
  const destinations = legalDestinations.get(move.from) ?? [];
  destinations.push(move.to);
  legalDestinations.set(move.from, destinations);
}

const voiceLabels: Record<LionAudio['source'], string> = {
  openai: 'Głos syntetyczny OpenAI',
  windows: 'Głos lokalny Windows',
};

function squareHint(move?: { from: string; to: string }) {
  return move ? { from: move.from, to: move.to } : null;
}

export function LionLesson({
  coach, waitForAnalysis, registerCancellation,
}: {
  coach: Coach;
  waitForAnalysis: () => Promise<void>;
  registerCancellation: (cancellation: Promise<void>) => void;
}) {
  const engine = coach === 'lion' ? window.chessCoach : undefined;
  const [phase, setPhase] = useState<Phase>('idle');
  const [boardRevision, setBoardRevision] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>();
  const [completed, setCompleted] = useState<Move>();
  const [round, setRound] = useState(0);
  const [cue, setCue] = useState<Cue>({ kind: 'greeting', round: 0 });
  const [settings, setSettings] = useState<VoiceSettings>();

  const board = useRef<HTMLDivElement>(null);
  const ground = useRef<Api | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const pendingStop = useRef(Promise.resolve());
  const audio = useLessonAudio({
    onStart: () => setPhase('speaking'),
    onEnd: () => setPhase(current => current === 'thinking' ? current : 'idle'),
  });
  const { begin, hold, owns, play, stop } = audio;

  const cancelLesson = useCallback(() => {
    generation.current += 1;
    busy.current = false;
    stop();
    if (engine?.stopLion) {
      const cancellation = engine.stopLion().catch(() => {});
      pendingStop.current = cancellation;
      registerCancellation(cancellation);
    }
  }, [engine, registerCancellation, stop]);

  useLayoutEffect(() => {
    return () => {
      cancelLesson();
    };
  }, [cancelLesson]);

  useEffect(() => {
    let active = true;
    void engine?.lionVoiceSettings?.().then(value => {
      if (active) setSettings(value);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [engine]);

  const tryMove = useCallback(async (from: Key, to: Key) => {
    if (busy.current || completed) return;
    const move = legalMoves.find(candidate => candidate.from === from && candidate.to === to);
    if (!move) return;
    const passed = mates.includes(move);
    const revision = ++generation.current;
    const localHint = passed ? undefined : mates[0];
    const localFeedback: Feedback = {
      hint: localHint,
      text: localHint
        ? coach === 'owl'
          ? `Dobra próba! Co zrobi hetman na ${localHint.to}?`
          : `Dobra próba! Zagraj hetmanem na ${localHint.to}.`
        : coach === 'owl'
          ? 'Brawo! Król nie ma jak uciec. To mat!'
          : 'Brawo, udało Ci się dać mata!',
    };

    setBoardRevision(current => current + 1);
    stop();
    setCompleted(passed ? move : undefined);
    if (!engine?.coachLion) {
      setFeedback(localFeedback);
      setCue({
        kind: 'line',
        round: revision,
        text: localFeedback.text,
        hint: squareHint(localHint),
        audio: null,
      });
      setPhase('idle');
      return;
    }

    busy.current = true;
    setFeedback(undefined);
    setCue({ kind: 'quiet' });
    setPhase('thinking');

    await Promise.all([waitForAnalysis(), pendingStop.current]);
    if (generation.current !== revision) return;
    const answer = await engine.coachLion?.({ from: move.from, to: move.to }).catch(() => undefined);
    if (generation.current !== revision) return;

    busy.current = false;
    const hint = answer?.status === 'ok' && answer.hint
      ? mates.find(candidate => candidate.from === answer.hint?.from && candidate.to === answer.hint?.to)
      : undefined;
    const trusted = answer?.status === 'ok' && answer.passed === passed && Boolean(answer.text.trim())
      && (passed ? !answer.hint : Boolean(hint));
    const shown = trusted ? { text: answer.text, hint } : localFeedback;
    setFeedback(shown);
    setCue({
      kind: 'line',
      round: revision,
      text: shown.text,
      hint: squareHint(shown.hint),
      audio: trusted && answer.audio ? answer.audio : null,
    });
    setPhase('idle');
  }, [coach, completed, engine, stop, waitForAnalysis]);

  useLayoutEffect(() => {
    if (!board.current) return;
    const instance = Chessground(board.current, {
      ranksPosition: 'left',
      premovable: { enabled: false },
      drawable: { enabled: false },
      animation: { enabled: true, duration: 110 },
    });
    ground.current = instance;
    return () => {
      instance.destroy();
      ground.current = null;
    };
  }, []);

  const thinking = phase === 'thinking';
  const suggestion = feedback?.hint;
  useLayoutEffect(() => {
    const revision = generation.current;
    ground.current?.cancelMove();
    ground.current?.set({
      fen: completed?.after ?? initialFen,
      turnColor: completed ? 'black' : 'white',
      check: Boolean(completed),
      lastMove: completed ? [completed.from, completed.to] : undefined,
      movable: {
        free: false,
        color: thinking || completed ? undefined : 'white',
        dests: thinking || completed ? new Map() : legalDestinations,
        events: {
          after: (from, to) => {
            if (generation.current === revision) void tryMove(from, to);
          },
        },
      },
    });
    ground.current?.setAutoShapes(suggestion ? [{ orig: suggestion.from, dest: suggestion.to, brush: 'green' }] : []);
  }, [boardRevision, completed, suggestion, thinking, tryMove]);

  const greeting = coach === 'owl' ? 'Gdzie poleci hetman? Poszukaj mata!' : 'Który ruch daje mata? Pokaż mi!';

  useEffect(() => {
    const mine = begin();
    if (cue.kind === 'quiet') return;
    let cancelled = false;
    const request: RecordedRequest = cue.kind === 'greeting'
      ? { lesson: 'mat-w-jednym', coach, text: greeting, hint: null }
      : { lesson: 'mat-w-jednym', coach, text: cue.text, hint: cue.hint };
    const engineAudio = cue.kind === 'line' ? cue.audio : null;
    void (async () => {
      const recorded = await fetchRecordedClip(request);
      if (cancelled || !owns(mine)) return;
      if (recorded) {
        await play(mine, recorded, 'recorded', true);
        return;
      }
      if (!engineAudio || cancelled || !owns(mine)) return;
      if (engineAudio.source === 'openai') await play(mine, engineAudio.wav, 'openai', true);
      else hold(mine, engineAudio.wav, 'windows');
    })();
    return () => {
      cancelled = true;
    };
  }, [begin, coach, cue, greeting, hold, owns, play]);

  function restart() {
    unlockLessonAudio();
    cancelLesson();
    const next = round + 1;
    setRound(next);
    setCue({ kind: 'greeting', round: next });
    setPhase('idle');
    setFeedback(undefined);
    setCompleted(undefined);
    setBoardRevision(current => current + 1);
  }

  return (
    <section className="lion-lesson" aria-label="Mat w jednym" data-state={phase}>
      <div className="lion-board-area">
        <header className="lion-heading">
          <h2>Mat w jednym ruchu</h2>
          <p>Zagraj białymi i daj mata.</p>
        </header>
        <div className="board-frame" onPointerDownCapture={() => { unlockLessonAudio(); }}>
          <div className="chessboard" ref={board} role="group" aria-label="Szachownica do ćwiczenia mat w jednym" />
        </div>
        <button type="button" className="secondary lion-restart" onClick={restart}>Spróbuj od nowa</button>
      </div>

      <LessonTeacher coach={coach} audible={audio.audible} text={thinking ? `${coaches[coach].name} myśli…` : feedback?.text ?? greeting}>
        {(audio.ready || audio.failed) && (
          <div className="lion-replay">
            <button type="button" onClick={audio.replay}>
              {audio.source === 'windows' && !audio.played ? 'Odsłuchaj głos Windows' : 'Powtórz'}
            </button>
            {audio.failed && <span>Nie udało się odtworzyć głosu.</span>}
            {!audio.failed && audio.source === 'openai' && <span>{voiceLabels.openai}</span>}
            {!audio.failed && audio.source === 'windows' && <span>{voiceLabels.windows}</span>}
          </div>
        )}
        {engine?.lionVoiceSettings && <details className="lion-settings">
          <summary>Ustawienia dla dorosłych</summary>
          <p role="status">{settings ? (
            settings.envConfigured ? 'Klucz OpenAI z .env jest widoczny.' : 'Brak klucza OpenAI w .env.'
          ) : 'Sprawdzanie klucza OpenAI…'}</p>
        </details>}
      </LessonTeacher>
    </section>
  );
}
