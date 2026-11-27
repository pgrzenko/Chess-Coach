import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clipFile, matchRecordedLine, sparringClipNames } from '../shared/recorded-clips.mjs';

export { matchRecordedLine, normalizeBubble } from '../shared/recorded-clips.mjs';

export const packDirectory = path.resolve(import.meta.dirname, '..', 'recordings', 'lessons');
export const sparringPackDirectory = path.resolve(import.meta.dirname, '..', 'recordings', 'sparring');

export function loadCatalog(directory = packDirectory) {
  try {
    const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    return Array.isArray(manifest?.lines) ? manifest.lines : [];
  } catch {
    return [];
  }
}

function readNamedFile(directory, fileName) {
  if (!clipFile.test(fileName)) return null;
  const root = path.resolve(directory);
  const full = path.resolve(root, fileName);
  const relative = path.relative(root, full);
  if (relative !== fileName || path.isAbsolute(relative)) return null;
  try {
    const bytes = readFileSync(full);
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

export function readRecordedClip(request, directory = packDirectory) {
  const line = matchRecordedLine(loadCatalog(directory), request);
  if (!line || typeof line.id !== 'string' || line.file !== `${line.id}.mp3`) return null;
  return readNamedFile(directory, line.file);
}

export function readSparringClips(request, directory = sparringPackDirectory) {
  const names = sparringClipNames(request);
  if (!names) return null;
  const full = readNamedFile(directory, names.full);
  if (full) return [full];

  const clips = names.fragments.map(name => readNamedFile(directory, name));
  return clips.every(Boolean) ? clips : null;
}
