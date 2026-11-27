import { readSan } from '../shared/polish-notation.mjs';

export function moveLabel(san: string) {
  return readSan(san)?.spoken ?? san;
}

export function MoveText({ san }: { san: string }) {
  const read = readSan(san);
  if (!read) return <>{san}</>;
  return <span className="move-text">{read.polish}</span>;
}
