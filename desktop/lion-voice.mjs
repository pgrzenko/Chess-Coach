import WebSocket from 'ws';
import { normalizeSpeech } from './speech-normalizer.mjs';
import { pcmToWav, synthesizeSpeech } from './speech.mjs';

const model = 'gpt-realtime-2.1-mini';
const lionVoice = 'cedar';
const maxBytes = 1_048_576;

// Both providers return the same buffered format. Playback and replay live in the renderer.
/** @typedef {{synthesize(text: string, context: {apiKey?: string, signal: AbortSignal}): Promise<{source: 'openai'|'windows', wav: Buffer}|null>}} IVoiceProvider */

export function connect(apiKey) {
  return new WebSocket('wss://api.openai.com/v1/realtime?model=' + model, {
    headers: { Authorization: 'Bearer ' + apiKey },
    maxPayload: maxBytes,
  });
}

function logUsage(usage) {
  console.info('[lion-voice] ' + JSON.stringify(usage));
}

/** @returns {IVoiceProvider} */
export function createRealtimeVoiceProvider({ open = connect, onUsage = logUsage, voice = lionVoice } = {}) {
  return {
    async synthesize(text, { apiKey, signal }) {
      const expected = normalizeSpeech(text);
      if (!apiKey || !expected || signal.aborted) return null;
      const stop = AbortSignal.any([signal, AbortSignal.timeout(8500)]);
      const started = performance.now();
      const socket = open(apiKey);
      const instructions = 'Przeczytaj podany tekst po polsku dokładnie tak, jak jest napisany. ' +
        'Zachowaj wszystkie słowa i kolejność. Bez powitania, dopisków ani efektów. ' +
        'Mów ciepłym, spokojnym głosem przyjaznego lwa, powoli i wyraźnie jak do małego dziecka.';

      return new Promise(resolve => {
        let stage = 'connecting';
        let settled = false;
        let responseId;
        let audioItem;
        let transcript;
        let bytes = 0;
        const chunks = [];
        const abort = () => finish(null);

        function finish(value) {
          if (settled) return;
          settled = true;
          stop.removeEventListener('abort', abort);
          socket.terminate();
          resolve(value);
        }

        function send(event) {
          socket.send(JSON.stringify(event), error => {
            if (error) finish(null);
          });
        }

        socket.on('error', () => finish(null));
        socket.on('close', () => finish(null));
        stop.addEventListener('abort', abort, { once: true });

        socket.on('message', message => {
          if (settled) return;
          try {
            const event = JSON.parse(message.toString());
            if (event.type === 'error') return finish(null);

            if (event.type === 'session.created' && stage === 'connecting') {
              stage = 'configuring';
              return send({
                type: 'session.update',
                session: {
                  type: 'realtime',
                  output_modalities: ['audio'],
                  instructions,
                  audio: {
                    input: { turn_detection: null },
                    output: { voice, format: { type: 'audio/pcm', rate: 24000 } },
                  },
                },
              });
            }
            if (event.type === 'session.updated' && stage === 'configuring') {
              stage = 'rendering';
              return send({
                type: 'response.create',
                response: {
                  conversation: 'none',
                  output_modalities: ['audio'],
                  max_output_tokens: 400,
                  input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text }] }],
                },
              });
            }
            if (stage !== 'rendering') return;

            if (event.type === 'response.created') {
              if (!responseId && typeof event.response?.id === 'string') responseId = event.response.id;
              return;
            }
            if (event.type === 'response.done' && responseId && event.response?.id === responseId) {
              const complete = event.response.status === 'completed';
              const match = complete && normalizeSpeech(transcript) === expected;
              const accepted = match && bytes > 0 && bytes % 2 === 0;
              const usage = event.response.usage;
              if (usage) {
                onUsage({
                  model, voice, status: event.response.status, transcriptMatch: match, accepted,
                  msToAudio: Math.round(performance.now() - started),
                  audioInputTokens: usage.input_token_details?.audio_tokens ?? null,
                  audioOutputTokens: usage.output_token_details?.audio_tokens ?? null,
                  textInputTokens: usage.input_token_details?.text_tokens ?? null,
                  textOutputTokens: usage.output_token_details?.text_tokens ?? null,
                  totalTokens: usage.total_tokens ?? null,
                });
              }
              if (!accepted) return finish(null);
              return finish({ source: 'openai', wav: pcmToWav(Buffer.concat(chunks, bytes)) });
            }
            if (!responseId || event.response_id !== responseId ||
                (event.type !== 'response.output_audio.delta' &&
                 event.type !== 'response.output_audio_transcript.done')) return;

            const item = event.item_id + ':' + event.content_index;
            if (audioItem && audioItem !== item) return finish(null);
            audioItem = item;
            if (event.type === 'response.output_audio_transcript.done') {
              transcript = event.transcript;
            } else {
              const chunk = Buffer.from(event.delta, 'base64');
              bytes += chunk.length;
              if (bytes > maxBytes) return finish(null);
              chunks.push(chunk);
            }
          } catch {
            finish(null);
          }
        });
        if (stop.aborted) abort();
      });
    },
  };
}

/** @type {IVoiceProvider} */
const windows = {
  async synthesize(text, { signal }) {
    const wav = await synthesizeSpeech(text, signal);
    return wav ? { source: 'windows', wav } : null;
  },
};

const realtime = createRealtimeVoiceProvider();

export async function lionAudio(text, context, { openai = realtime, local = windows } = {}) {
  if (context.signal.aborted) return null;
  if (context.apiKey) {
    try {
      const result = await openai.synthesize(text, context);
      if (result && !context.signal.aborted) return result;
    } catch {
      // An unavailable or rejected cloud voice uses the same approved local text.
    }
  }
  return context.signal.aborted ? null : local.synthesize(text, context);
}
