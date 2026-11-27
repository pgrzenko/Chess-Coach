import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sparringHintSpeech } from './speech-normalizer.mjs';

export const packDirectory = path.resolve(import.meta.dirname, '..', 'recordings', 'lessons');
export const sparringPackDirectory = path.resolve(import.meta.dirname, '..', 'recordings', 'sparring');

const rookEvents = new Set(['start', 'selected', 'diagonal', 'moved', 'finished']);
const pieceEvents = {
  'poznaj-krola': new Set(['start', 'selected', 'too-far', 'too-close', 'enemy', 'moved', 'finished']),
  'poznaj-hetmana': new Set(['start', 'selected', 'bent', 'moved', 'finished']),
  'poznaj-skoczka': new Set(['start', 'selected', 'not-l', 'own-piece', 'blocker', 'jumped', 'moved', 'finished']),
  'poznaj-gonca': new Set(['start', 'selected', 'not-diagonal', 'moved', 'finished']),
  'poznaj-piona': new Set(['start', 'selected', 'pawn-forward', 'moved', 'promoted', 'capture-start', 'capture-selected', 'pawn-blocked', 'capture-only', 'finished']),
};
const coaches = new Set(['lion', 'owl']);
const square = /^[a-h][1-8]$/;
const clipFile = /^pl\.(?:lion|owl)\.[a-z0-9]+(?:[.-][a-z0-9]+)*\.mp3$/;

export function normalizeBubble(text) {
  if (typeof text !== 'string') return '';
  return text.replaceAll('\u00a0', ' ').replace(/[ \t\f\v]+/g, ' ').trim();
}

function hintOf(value) {
  if (!value || typeof value !== 'object') return null;
  if (!square.test(value.from) || !square.test(value.to)) return null;
  return { from: value.from, to: value.to };
}

function sameHint(line, hint) {
  const recorded = hintOf(line?.hint);
  if (!hint) return !recorded;
  return recorded?.from === hint.from && recorded?.to === hint.to;
}

export function matchRecordedLine(lines, request) {
  if (!Array.isArray(lines) || !request || !coaches.has(request.coach)) return null;

  if (request.lesson === 'poznaj-wieze') {
    if (!rookEvents.has(request.event)) return null;
    return lines.find(line => line?.lesson === 'poznaj-wieze' && line.coach === request.coach &&
      line.event === request.event) ?? null;
  }

  const events = pieceEvents[request.lesson];
  if (events) {
    if (typeof request.event !== 'string' || !events.has(request.event)) return null;
    return lines.find(line => line?.lesson === request.lesson && line.coach === request.coach &&
      line.event === request.event) ?? null;
  }

  if (request.lesson === 'mat-w-jednym') {
    if (typeof request.text !== 'string' || request.text.length > 400) return null;
    const text = normalizeBubble(request.text);
    if (!text) return null;
    const hint = hintOf(request.hint);
    if (request.hint != null && !hint) return null;
    return lines.find(line => line?.lesson === 'mat-w-jednym' && line.coach === request.coach &&
      normalizeBubble(line.bubble) === text && sameHint(line, hint)) ?? null;
  }

  return null;
}

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
  if (!sparringHintSpeech(request) || !coaches.has(request.coach)) return null;
  const { coach, from, to, promotion } = request;
  const prefix = `pl.${coach}.sparing.`;
  const full = readNamedFile(directory, `${prefix}move.${from}-${to}${promotion ? '-' + promotion : ''}.mp3`);
  if (full) return [full];

  const clips = [
    readNamedFile(directory, `${prefix}from.${from}.mp3`),
    readNamedFile(directory, `${prefix}to.${to}.mp3`),
  ];
  if (promotion) clips.push(readNamedFile(directory, `${prefix}promotion.${promotion}.mp3`));
  return clips.every(Boolean) ? clips : null;
}
