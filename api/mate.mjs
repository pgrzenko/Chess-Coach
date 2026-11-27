import { timingSafeEqual } from 'node:crypto';
import { findMateLessonMove, mateAttempt } from '../shared/mate-lesson.mjs';
import { requestLionLine } from '../server/lion-comment.mjs';

const invitePattern = /^[A-Za-z0-9_-]{32,128}$/;
const headers = { 'Cache-Control': 'no-store' };
const requestLength = 256;

async function readMove(request) {
  if (!request.body || !request.headers.get('content-type')?.startsWith('application/json')) return null;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(requestLength);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)));
      if (length + value.byteLength > requestLength) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } });
    const invite = process.env.CHESS_COACH_INVITE ?? '';
    const apiKey = process.env.OPENAI_API_KEY;
    if (!invitePattern.test(invite) || !apiKey) return new Response(null, { status: 503, headers });

    const supplied = request.headers.get('authorization')?.slice(7) ?? '';
    if (!request.headers.get('authorization')?.startsWith('Bearer ') ||
        !invitePattern.test(supplied) || supplied.length !== invite.length ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(invite))) {
      return new Response(null, { status: 401, headers });
    }
    const input = await readMove(request);
    const move = findMateLessonMove(input);
    if (!move) return new Response(null, { status: 400, headers });

    const { outcome, facts } = mateAttempt(move, input.suggestion);
    const sentence = await requestLionLine(outcome, facts, apiKey, request.signal, reason => {
      console.warn('chess-coach-openai', reason);
    });
    return sentence
      ? Response.json({ sentence }, { headers })
      : new Response(null, { status: 503, headers });
  },
};
