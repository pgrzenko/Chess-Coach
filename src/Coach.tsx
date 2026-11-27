import type { ReactNode } from 'react';

export const coaches = {
  lion: { name: 'Lew', image: 'lion-coach.png' },
  owl: { name: 'Sowa', image: 'owl-coach.png' },
} as const;

export type Coach = keyof typeof coaches;

export function CoachPicker({ coach, onChange, label = 'Wybierz trenera' }: {
  coach: Coach;
  onChange: (coach: Coach) => void;
  label?: string;
}) {
  return (
    <div className="coach-picker" role="group" aria-label={label}>
      <button type="button" aria-pressed={coach === 'lion'} onClick={() => onChange('lion')}>{coaches.lion.name}</button>
      <button type="button" aria-pressed={coach === 'owl'} onClick={() => onChange('owl')}>{coaches.owl.name}</button>
    </div>
  );
}

export function LessonTeacher({ coach, text, audible = false, children }: {
  coach: Coach;
  text: string;
  audible?: boolean;
  children?: ReactNode;
}) {
  const { name, image } = coaches[coach];
  return (
    <aside className="lion-teacher" aria-label={name}>
      <div className="lion-portrait" data-audible={audible}>
        <img src={import.meta.env.BASE_URL + image} alt="" />
      </div>
      <h2>{name}</h2>
      <div className="lion-bubble" role="status">{text}</div>
      {children}
    </aside>
  );
}
