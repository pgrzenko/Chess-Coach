import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function readOpenAIKey(filename) {
  try {
    const text = readFileSync(filename, 'utf8').replace(/^\uFEFF/, '');
    return parseEnv(text).OPENAI_API_KEY?.trim() || undefined;
  } catch {
    return undefined;
  }
}
