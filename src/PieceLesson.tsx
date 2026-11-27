import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import { write } from '@lichess-org/chessground/fen';
import type { Key } from '@lichess-org/chessground/types';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { LessonTeacher, type Coach } from './Coach';
import { fetchRecordedClip, unlockLessonAudio, useLessonAudio } from './lesson-audio';
import {
  arrivalEvent,
  classifyClick,
  legalDestinations,
  lessonLine,
  pawnFen,
  pieceLessons,
  placement,
  type ArrivalEvent,
  type PieceBoardId,
  type PieceEvent,
  type PieceLessonId,
} from './piece-lessons';

type Position = { square: string; previous?: string; arrival?: ArrivalEvent };

export function PieceLesson({ coach, lesson }: { coach: Coach; lesson: PieceLessonId }) {
  const [capture, setCapture] = useState(false);
  const stage = capture ? 'pawn-capture' : lesson;
  const spec = pieceLessons[stage];
  const [position, setPosition] = useState<Position>({ square: spec.start });
  const [prompt, setPrompt] = useState<PieceEvent>();
  const [round, setRound] = useState(0);
  const board = useRef<HTMLDivElement>(null);
  const ground = useRef<Api>(null);
  const dragStart = useRef<number>(null);
  const { audible, failed, ready, begin, owns, play, replay } = useLessonAudio();
  const { square } = position;
  const finished = square === spec.target;

  useLayoutEffect(() => {
    if (!board.current) return;
    const instance = Chessground(board.current, {
      fen: boardFen(stage, spec.start),
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
  }, [stage, spec.start]);

  useLayoutEffect(() => {
    let active = true;
    const { square: current, previous } = position;
    const done = current === spec.target;
    ground.current?.cancelMove();
    ground.current?.set({
      fen: boardFen(stage, current),
      turnColor: 'white',
      lastMove: previous ? [previous as Key, current as Key] : undefined,
      movable: {
        free: false,
        color: done ? undefined : 'white',
        dests: done ? new Map() : new Map([[current as Key, legalDestinations(stage, current) as Key[]]]),
        events: {
          after: (from, to) => {
            if (!active) return;
            setPrompt(undefined);
            setPosition({ square: to, previous: from, arrival: arrivalEvent(stage, from, to) });
          },
        },
      },
    });
    ground.current?.setAutoShapes([{ orig: spec.target as Key, brush: done ? 'green' : 'yellow' }]);
    return () => {
      active = false;
    };
  }, [stage, position, spec.target]);

  useLayoutEffect(() => {
    if (prompt === 'blocker' || prompt === 'own-piece' || prompt === 'enemy') {
      ground.current?.selectSquare(square as Key, true);
    }
  }, [prompt, square]);

  function onBoardPress(event: PointerEvent<HTMLDivElement>) {
    unlockLessonAudio();
    const instance = ground.current;
    if (!instance || event.button !== 0 || event.shiftKey || !event.isPrimary || finished) return;
    dragStart.current = null;
    const pressed = instance.getKeyAtDomPos([event.clientX, event.clientY]);
    if (!pressed) return;
    if (pressed === square) {
      dragStart.current = event.pointerId;
      setPrompt(capture ? 'capture-selected' : 'selected');
      return;
    }
    const selected = instance.state.selected === square;
    const result = classifyClick(stage, square, pressed, selected);
    if (!selected && result !== 'blocker') return;
    if (result === 'move' || result === 'selected') return;
    // Keep the capture target visible after clicking the blocking pawn.
    if (result === 'pawn-blocked') event.preventDefault();
    setPrompt(result);
  }

  function onBoardRelease(event: PointerEvent<HTMLDivElement>) {
    if (dragStart.current !== event.pointerId) return;
    dragStart.current = null;
    const released = ground.current?.getKeyAtDomPos([event.clientX, event.clientY]);
    if (!released || released === square) return;
    const result = classifyClick(stage, square, released, true);
    if (result === 'move' || result === 'selected') return;
    setPrompt(result);
  }

  function openStage(nextCapture: boolean) {
    unlockLessonAudio();
    dragStart.current = null;
    setPrompt(undefined);
    setCapture(nextCapture);
    setPosition({ square: pieceLessons[nextCapture ? 'pawn-capture' : lesson].start });
    setRound(value => value + 1);
  }

  const message = prompt ?? position.arrival ?? (capture ? 'capture-start' : 'start');

  useEffect(() => {
    const mine = begin();
    let cancelled = false;
    void fetchRecordedClip({ lesson: spec.slug, coach, event: message }).then(bytes => {
      if (cancelled || !owns(mine) || !bytes) return;
      void play(mine, bytes, 'recorded', true);
    });
    return () => {
      cancelled = true;
    };
  }, [begin, coach, message, owns, play, round, spec.slug]);

  return (
    <section className="lion-lesson rook-lesson" aria-label={spec.title}>
      <div className="lion-board-area">
        <header className="lion-heading">
          <h2>{spec.title}</h2>
          <p>Cel to pole {spec.target}.</p>
        </header>
        <div className="board-frame" onPointerDownCapture={onBoardPress} onPointerUpCapture={onBoardRelease}>
          <div className="chessboard" ref={board} role="group" aria-label={`Szachownica. Cel ${spec.piece} to ${spec.target}.`} />
        </div>
        <button type="button" className="secondary lion-restart" onClick={() => openStage(false)}>Spróbuj od nowa</button>
      </div>
      <LessonTeacher coach={coach} audible={audible} text={lessonLine(stage, coach, message)}>
        {stage === 'pawn' && finished && (
          <button type="button" onClick={() => openStage(true)}>Przejdź do bicia</button>
        )}
        {(ready || failed) && (
          <div className="lion-replay">
            <button type="button" onClick={() => { unlockLessonAudio(); replay(); }}>Powtórz</button>
            {failed && <span>Nie udało się odtworzyć głosu.</span>}
          </div>
        )}
      </LessonTeacher>
    </section>
  );
}

function boardFen(stage: PieceBoardId, square: string) {
  if (stage === 'pawn' || stage === 'pawn-capture') return pawnFen(stage, square);
  return write(new Map(placement(stage, square).map(piece => [piece.square as Key, { role: piece.role, color: piece.color }])));
}
