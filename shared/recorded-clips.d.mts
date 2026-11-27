import type { SparringHint } from '../src/chess-coach';
import type { RecordedRequest } from '../src/lesson-audio';

export const clipFile: RegExp;
export function matchRecordedLine<T extends { id: string; file: string }>(
  lines: readonly T[], request: RecordedRequest,
): T | null;
export function sparringClipNames(request: SparringHint): { full: string; fragments: string[] } | null;
