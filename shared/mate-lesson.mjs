import { Chess } from 'chess.js';

export const lessonFen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
export const fallback = { passed: 'Brawo, udało Ci się dać mata!', retry: 'Dobra próba, poszukajmy mata!' };
export const allowed = {
  passed: [fallback.passed, 'Świetnie, król nie ma jak uciec!'],
  retry: [fallback.retry, 'Jeszcze nie ma mata.'],
};

export function findMateLessonMove(input) {
  return legalMoves.find(candidate => candidate.from === input?.from && candidate.to === input?.to &&
    candidate.promotion === input?.promotion);
}

export function mateAttempt(move, suggestedMate) {
  const passed = move.san.endsWith('#');
  const hint = passed ? undefined : mates.find(candidate => candidate.lan === suggestedMate) ?? mates[0];
  const outcome = passed ? 'passed' : 'retry';
  return { passed, hint, outcome, facts: { result: outcome, playedSan: move.san, suggestedMateSan: hint?.san } };
}

export function mateReply(attempt, sentence) {
  const { passed, hint, outcome } = attempt;
  const verified = allowed[outcome].includes(sentence) ? sentence : fallback[outcome];
  const text = hint ? verified + ' Hetman\u00a0na\u00a0' + hint.to + '\u00a0—\u00a0mat!' : verified;
  return { status: 'ok', passed, text, sentence: verified, hint: hint ? { from: hint.from, to: hint.to } : null };
}

const legalMoves = new Chess(lessonFen).moves({ verbose: true });
const mates = legalMoves.filter(move => move.san.endsWith('#'));
