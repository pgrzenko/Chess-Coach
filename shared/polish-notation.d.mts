export type PieceMark = { letter: string; name: string; role: string; promo: string };

export type SanRead = {
  polish: string;
  spoken: string;
  piece: PieceMark | null;
  promotion: PieceMark | null;
  coords: string;
  suffix: string;
  castle: 'O-O' | 'O-O-O' | null;
};

export function readSan(san: string): SanRead | null;
export function polishSan(san: string): string;
export function variationTokens(sans: string[], turn: 'w' | 'b', moveNumber: number): Array<{
  san: string;
  color: 'w' | 'b';
  prefix: string;
}>;
export function scoreColumns<T>(rows: T[], perColumn: number, maxColumns: number): T[][];
export function scorePairs<T extends { ply: number }>(moves: T[]): Array<{
  number: number;
  white: T | undefined;
  black: T | undefined;
}>;
