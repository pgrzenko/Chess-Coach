import { sanToSpeech } from './speech-normalizer.mjs';
import { lionAudio } from './lion-voice.mjs';
import { findMateLessonMove, lessonFen, mateAttempt, mateReply } from '../shared/mate-lesson.mjs';
import { chooseLine } from '../server/lion-comment.mjs';

export { lessonFen } from '../shared/mate-lesson.mjs';

export function createLionLesson({
  stockfish, readKey, speak = lionAudio, choose = chooseLine, recordedClip = () => null,
}) {
  let active;

  function stop() {
    active?.abort();
    active = undefined;
  }

  return {
    stop,
    async attempt(input) {
      const move = findMateLessonMove(input);
      if (!move) return { status: 'unavailable' };

      stop();
      const operation = new AbortController();
      active = operation;
      const { signal } = operation;
      try {
        let suggestedMate;
        if (!move.san.endsWith('#')) {
          const recommendation = await stockfish.analyze({ initialFen: lessonFen, moves: [], purpose: 'hint' });
          suggestedMate = recommendation.status === 'ok' ? recommendation.lines[0]?.moves[0] : undefined;
        }
        if (signal.aborted) return { status: 'cancelled' };

        const apiKey = await readKey();
        if (signal.aborted) return { status: 'cancelled' };
        const attempt = mateAttempt(move, suggestedMate);
        const sentence = await choose(attempt.outcome, attempt.facts, apiKey, signal);
        const { text, hint, sentence: verifiedSentence } = mateReply(attempt, sentence);
        const spoken = attempt.hint
          ? verifiedSentence + ' ' + sanToSpeech(attempt.hint.san, { oneSentence: true })
          : verifiedSentence;
        let recorded = null;
        try {
          recorded = recordedClip({
            lesson: 'mat-w-jednym',
            coach: 'lion',
            text,
            hint,
          });
        } catch {
          recorded = null;
        }
        if (signal.aborted) return { status: 'cancelled' };
        const audio = recorded?.length ? null : await speak(spoken, { apiKey, signal });

        if (signal.aborted) return { status: 'cancelled' };
        return {
          status: 'ok',
          passed: attempt.passed,
          text,
          hint,
          audio,
        };
      } catch {
        return { status: signal.aborted ? 'cancelled' : 'unavailable' };
      } finally {
        if (active === operation) active = undefined;
      }
    },
  };
}
