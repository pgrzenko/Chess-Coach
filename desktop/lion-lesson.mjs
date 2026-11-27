import { Chess } from 'chess.js';
import { sanToSpeech } from './speech-normalizer.mjs';
import { lionAudio } from './lion-voice.mjs';

export const lessonFen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
const fallback = { passed: 'Brawo, udało Ci się dać mata!', retry: 'Dobra próba, poszukajmy mata!' };
const allowed = {
  passed: [fallback.passed, 'Świetnie, król nie ma jak uciec!'],
  retry: [fallback.retry, 'Jeszcze nie ma mata.'],
};

async function chooseLine(outcome, facts, apiKey, signal) {
  if (!apiKey || signal.aborted) return fallback[outcome];

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(3300)]),
      body: JSON.stringify({
        model: 'gpt-6-luna',
        reasoning: { effort: 'none' },
        store: false,
        max_output_tokens: 200,
        instructions: 'Jesteś życzliwym polskim trenerem małego dziecka. Wybierz jedno krótkie zdanie ' +
          'spośród zatwierdzonych możliwości dla podanego wyniku. Używaj tylko podanych faktów.',
        input: JSON.stringify(facts),
        text: {
          format: {
            type: 'json_schema', name: 'lion_lesson_comment', strict: true,
            schema: {
              type: 'object',
              properties: { sentence: { type: 'string', enum: allowed[outcome] } },
              required: ['sentence'],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (response.ok) {
      const completion = await response.json();
      const text = completion.output?.flatMap(item => item.content ?? [])
        .find(part => part.type === 'output_text')?.text;
      const sentence = text && JSON.parse(text).sentence;
      if (completion.status === 'completed' && allowed[outcome].includes(sentence)) return sentence;
    }
  } catch {
    // The same chess facts are available for the local response.
  }
  return fallback[outcome];
}

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
      const start = new Chess(lessonFen);
      const moves = start.moves({ verbose: true });
      const move = moves.find(candidate => candidate.from === input?.from && candidate.to === input?.to &&
        candidate.promotion === input?.promotion);
      if (!move) return { status: 'unavailable' };

      stop();
      const operation = new AbortController();
      active = operation;
      const { signal } = operation;
      try {
        start.move(move);
        const passed = start.isCheckmate();
        let hint;
        if (!passed) {
          const mates = moves.filter(candidate => candidate.san.endsWith('#'));
          const recommendation = await stockfish.analyze({ initialFen: lessonFen, moves: [], purpose: 'hint' });
          const uci = recommendation.status === 'ok' ? recommendation.lines[0]?.moves[0] : undefined;
          hint = mates.find(candidate => candidate.lan === uci) ?? mates[0];
        }
        if (signal.aborted) return { status: 'cancelled' };

        const apiKey = await readKey();
        if (signal.aborted) return { status: 'cancelled' };
        const outcome = passed ? 'passed' : 'retry';
        const sentence = await choose(outcome, {
          result: outcome,
          playedSan: move.san,
          suggestedMateSan: hint?.san,
        }, apiKey, signal);
        const verifiedSentence = allowed[outcome].includes(sentence) ? sentence : fallback[outcome];
        const text = hint ? verifiedSentence + ' Hetman\u00a0na\u00a0' + hint.to + '\u00a0—\u00a0mat!' : verifiedSentence;
        const spoken = hint ? verifiedSentence + ' ' + sanToSpeech(hint.san, { oneSentence: true }) : verifiedSentence;
        let recorded = null;
        try {
          recorded = recordedClip({
            lesson: 'mat-w-jednym',
            coach: 'lion',
            text,
            hint: hint ? { from: hint.from, to: hint.to } : null,
          });
        } catch {
          recorded = null;
        }
        if (signal.aborted) return { status: 'cancelled' };
        const audio = recorded?.length ? null : await speak(spoken, { apiKey, signal });

        if (signal.aborted) return { status: 'cancelled' };
        return {
          status: 'ok',
          passed,
          text,
          hint: hint ? { from: hint.from, to: hint.to } : null,
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
