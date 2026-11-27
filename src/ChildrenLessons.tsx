import { useState } from 'react';
import { CoachPicker, type Coach } from './Coach';
import { unlockLessonAudio } from './lesson-audio';
import { LionLesson } from './LionLesson';
import { PieceLesson } from './PieceLesson';
import { RookLesson } from './RookLesson';
import { pieceLessons, type PieceLessonId } from './piece-lessons';
import './lion-lesson.css';

type LessonKind = PieceLessonId | 'rook' | 'mate';
type Lesson = { kind: LessonKind; coach: Coach };

const pieceChoices: PieceLessonId[] = ['king', 'queen', 'knight', 'bishop', 'pawn'];
const choices: { kind: LessonKind; title: string }[] = [
  ...pieceChoices.map(kind => ({ kind, title: pieceLessons[kind].title })),
  { kind: 'rook', title: 'Poznaj wieżę' },
  { kind: 'mate', title: 'Mat w jednym' },
];

export function ChildrenLessons({ coach, onCoachChange, waitForAnalysis, registerCancellation }: {
  coach: Coach;
  onCoachChange: (coach: Coach) => void;
  waitForAnalysis: () => Promise<void>;
  registerCancellation: (cancellation: Promise<void>) => void;
}) {
  const [lesson, setLesson] = useState<Lesson>();

  return (
    <section aria-label="Tryb Dziecięcy">
      <header className="children-lesson-menu">
        {lesson ? (
          <button type="button" className="secondary" onClick={() => setLesson(undefined)}>Wybór lekcji</button>
        ) : <h2>Wybierz lekcję</h2>}
        <div className="children-coach-choice">
          <span>{lesson ? 'Trener na następną lekcję' : 'Trener'}</span>
          <CoachPicker coach={coach} onChange={onCoachChange}
            label={lesson ? 'Wybierz trenera na następną lekcję' : 'Wybierz trenera'} />
        </div>
      </header>

      {lesson?.kind === 'rook' ? <RookLesson coach={lesson.coach} /> : lesson?.kind === 'mate' ? (
        <LionLesson coach={lesson.coach} waitForAnalysis={waitForAnalysis} registerCancellation={registerCancellation} />
      ) : lesson ? <PieceLesson key={lesson.kind} lesson={lesson.kind} coach={lesson.coach} /> : (
        <div className="children-lesson-choices">
          {choices.map(choice => (
            <button key={choice.kind} type="button" onClick={() => { unlockLessonAudio(); setLesson({ kind: choice.kind, coach }); }}>
              <strong>{choice.title}</strong>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
