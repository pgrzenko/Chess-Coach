import type { Chess } from 'chess.js';

export type HintScore = { type: 'cp' | 'mate'; value: number };

export type HintEngine =
  | { status: 'ok'; lines: Array<{ rank: number; score: HintScore; moves: string[] }> }
  | { status: 'pending' | 'cancelled' | 'unavailable' | 'idle' };

export function formatWhiteScore(score: HintScore, turn: 'w' | 'b'): string;
export function coachHint(chess: Chess, engine?: HintEngine): string;
