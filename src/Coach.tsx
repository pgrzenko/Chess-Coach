import type { ReactNode } from 'react';

export const coaches = {
  lion: { name: 'Lew', image: 'lion-coach.png' },
  owl: { name: 'Sowa', image: 'owl-coach.png' },
} as const;

export type Coach = keyof typeof coaches;

export function CoachSelect({ coach, onChange }: {
  coach: Coach;
  onChange: (coach: Coach) => void;
}) {
  return (
    <select
      className="coach-select"
      aria-label="Trener"
      value={coach}
      onChange={event => onChange(event.target.value === 'owl' ? 'owl' : 'lion')}
    >
      <option value="lion">{coaches.lion.name}</option>
      <option value="owl">{coaches.owl.name}</option>
    </select>
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
