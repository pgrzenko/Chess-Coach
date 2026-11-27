import { allowed, fallback } from '../shared/mate-lesson.mjs';

export async function requestLionLine(outcome, facts, apiKey, signal, reportFailure) {
  if (!apiKey || signal.aborted) return null;

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

    if (!response.ok) {
      reportFailure?.('http-' + response.status);
      return null;
    }

    const completion = await response.json();
    const text = completion.output?.flatMap(item => item.content ?? [])
      .find(part => part.type === 'output_text')?.text;
    const sentence = text && JSON.parse(text).sentence;
    if (completion.status === 'completed' && allowed[outcome].includes(sentence)) return sentence;
    reportFailure?.('invalid-response');
  } catch (error) {
    if (!signal.aborted) reportFailure?.(error?.name === 'TimeoutError' ? 'timeout' : 'request-failed');
  }
  return null;
}

export async function chooseLine(outcome, facts, apiKey, signal) {
  return (await requestLionLine(outcome, facts, apiKey, signal)) ?? fallback[outcome];
}
