import type { Move } from 'chess.js';
import type { LionMove } from '../src/chess-coach';

export const lessonFen: string;

export function findMateLessonMove(input: LionMove): Move | undefined;
export function mateAttempt(move: Move, suggestedMate?: string): {
  passed: boolean;
  hint: Move | undefined;
  outcome: 'passed' | 'retry';
};
export function mateReply(attempt: ReturnType<typeof mateAttempt>, sentence: unknown): {
  status: 'ok';
  passed: boolean;
  text: string;
  sentence: string;
  hint: { from: string; to: string } | null;
};
