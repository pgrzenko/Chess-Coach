import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import { write } from '@lichess-org/chessground/fen';
import type { Key } from '@lichess-org/chessground/types';
import { allKeys } from '@lichess-org/chessground/util';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { LessonTeacher, type Coach } from './Coach';
import { fetchRecordedClip, unlockLessonAudio, useLessonAudio } from './lesson-audio';

const start = 'd4';
const target = 'g4';

const lines = {
  lion: {
    start: `Kliknij wieżę. Zawieź ją na ${target}!`,
    selected: 'Wybierz jedno z podświetlonych pól.',
    diagonal: 'Dobra próba! Wieża jedzie prosto, wzdłuż rzędu albo kolumny.',
    moved: `Dobry ruch! Z tego pola poszukaj drogi na ${target}.`,
    finished: `Brawo! Twoja wieża dojechała na ${target}.`,
  },
  owl: {
    start: `Huu! Kliknij wieżę i znajdź drogę na ${target}.`,
    selected: 'Widzisz kropki? Tam może polecieć wieża.',
    diagonal: 'Ładna próba! Wieża lubi proste drogi. Wybierz rząd albo kolumnę.',
    moved: `Tak się rusza wieża! A którędy teraz na ${target}?`,
    finished: `Brawo! Wieża trafiła prosto na ${target}.`,
  },
};

type Position = { square: Key; previous?: Key };
type Prompt = 'selected' | 'diagonal';

function canSlide(from: Key, to: Key) {
  return from !== to && (from[0] === to[0] || from[1] === to[1]);
}

export function RookLesson({ coach }: { coach: Coach }) {
  const [position, setPosition] = useState<Position>({ square: start });
  const [prompt, setPrompt] = useState<Prompt>();
  const [round, setRound] = useState(0);
  const board = useRef<HTMLDivElement>(null);
  const ground = useRef<Api>(null);
  const dragStart = useRef<number>(null);
  const { audible, failed, ready, begin, owns, play, replay } = useLessonAudio();
  const { square } = position;
  const finished = square === target;

  useLayoutEffect(() => {
    if (!board.current) return;
    const instance = Chessground(board.current, {
      fen: write(new Map([[start, { role: 'rook', color: 'white' }]])),
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

  useLayoutEffect(() => {
    let active = true;
    const { square, previous } = position;
    const finished = square === target;
    ground.current?.cancelMove();
    ground.current?.set({
      fen: write(new Map([[square, { role: 'rook', color: 'white' }]])),
      turnColor: 'white',
      lastMove: previous ? [previous, square] : undefined,
      movable: {
        free: false,
        color: finished ? undefined : 'white',
        dests: finished ? new Map() : new Map([[square, allKeys.filter(key => canSlide(square, key))]]),
        events: {
          after: (from, to) => {
            if (!active) return;
            setPrompt(undefined);
            setPosition({ square: to, previous: from });
          },
        },
      },
    });
    ground.current?.setAutoShapes([{ orig: target, brush: finished ? 'green' : 'yellow' }]);
    return () => {
      active = false;
    };
  }, [position]);

  function onBoardPress(event: PointerEvent<HTMLDivElement>) {
    unlockLessonAudio();
    const instance = ground.current;
    if (!instance || event.button !== 0 || event.shiftKey || !event.isPrimary || finished) return;
    dragStart.current = null;
    const pressed = instance.getKeyAtDomPos([event.clientX, event.clientY]);
    if (pressed === square) {
      dragStart.current = event.pointerId;
      setPrompt('selected');
    } else if (pressed && instance.state.selected === square && !canSlide(square, pressed)) {
      setPrompt('diagonal');
    }
  }

  function onBoardRelease(event: PointerEvent<HTMLDivElement>) {
    if (dragStart.current !== event.pointerId) return;
    dragStart.current = null;
    const released = ground.current?.getKeyAtDomPos([event.clientX, event.clientY]);
    if (released && released !== square && !canSlide(square, released)) setPrompt('diagonal');
  }

  function restart() {
    unlockLessonAudio();
    dragStart.current = null;
    setPrompt(undefined);
    setPosition({ square: start });
    setRound(value => value + 1);
  }

  const message = prompt ?? (finished ? 'finished' : position.previous ? 'moved' : 'start');

  useEffect(() => {
    const mine = begin();
    let cancelled = false;
    void fetchRecordedClip({ lesson: 'poznaj-wieze', coach, event: message }).then(bytes => {
      if (cancelled || !owns(mine) || !bytes) return;
      void play(mine, bytes, 'recorded', true);
    });
    return () => {
      cancelled = true;
    };
  }, [begin, coach, message, owns, play, round]);

  return (
    <section className="lion-lesson rook-lesson" aria-label="Poznaj wieżę">
      <div className="lion-board-area">
        <header className="lion-heading">
          <h2>Poznaj wieżę</h2>
          <p>Cel to pole {target}.</p>
        </header>
        <div className="board-frame" onPointerDownCapture={onBoardPress} onPointerUpCapture={onBoardRelease}>
          <div className="chessboard" ref={board} role="group" aria-label={`Szachownica. Cel wieży to ${target}.`} />
        </div>
        <button type="button" className="secondary lion-restart" onClick={restart}>Spróbuj od nowa</button>
      </div>
      <LessonTeacher coach={coach} audible={audible} text={lines[coach][message]}>
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
