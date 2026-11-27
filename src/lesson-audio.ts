import { useCallback, useEffect, useRef, useState } from 'react';

export type RecordedCoach = 'lion' | 'owl';
export type RookEvent = 'start' | 'selected' | 'diagonal' | 'moved' | 'finished';
export type RecordedRequest =
  | { lesson: 'poznaj-wieze'; coach: RecordedCoach; event: RookEvent }
  | { lesson: 'poznaj-krola' | 'poznaj-hetmana' | 'poznaj-skoczka' | 'poznaj-gonca' | 'poznaj-piona'; coach: RecordedCoach; event: string }
  | { lesson: 'mat-w-jednym'; coach: RecordedCoach; text: string; hint: { from: string; to: string } | null };

export type ClipSource = 'recorded' | 'openai' | 'windows';

type AudioBytes = Uint8Array | readonly Uint8Array[];
type Saved = { bytes: AudioBytes; buffer?: AudioBuffer };
type Playback = { source: AudioBufferSourceNode; analyser: AnalyserNode; frame: number };
type PlaybackEvents = { onStart?: () => void; onEnd?: () => void };

let shared: AudioContext | null = null;

export function unlockLessonAudio() {
  try {
    const audio = shared ?? (shared = new AudioContext());
    if (audio.state !== 'running') void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

export async function fetchRecordedClip(request: RecordedRequest) {
  try {
    const value = await window.chessCoach?.recordedClip?.(request);
    return value instanceof Uint8Array && value.byteLength > 0 ? value : null;
  } catch {
    return null;
  }
}

async function decodeClips(audio: AudioContext, bytes: AudioBytes): Promise<AudioBuffer | null> {
  const decode = (clip: Uint8Array) => audio.decodeAudioData(new Uint8Array(clip).buffer);
  try {
    if (bytes instanceof Uint8Array) return await decode(bytes);
    const clips = await Promise.all(bytes.map(decode));
    if (clips.length === 1) return clips[0];

    const frames = clips.reduce((length, clip) => length + clip.length, 0);
    const channels = Math.max(...clips.map(clip => clip.numberOfChannels));
    const joined = audio.createBuffer(channels, frames, audio.sampleRate);
    let offset = 0;
    for (const clip of clips) {
      for (let channel = 0; channel < channels; channel++) {
        joined.copyToChannel(clip.getChannelData(Math.min(channel, clip.numberOfChannels - 1)), channel, offset);
      }
      offset += clip.length;
    }
    return joined;
  } catch {
    return null;
  }
}

export function useLessonAudio(events?: PlaybackEvents) {
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const token = useRef(0);
  const saved = useRef<Saved | null>(null);
  const playback = useRef<Playback | null>(null);
  const [audible, setAudible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState<ClipSource>();
  const [played, setPlayed] = useState(false);

  const halt = useCallback(() => {
    const active = playback.current;
    playback.current = null;
    if (!active) return;
    cancelAnimationFrame(active.frame);
    active.source.onended = null;
    try {
      active.source.stop();
    } catch {
      // The buffer source throws if it was already stopped.
    }
    active.source.disconnect();
    active.analyser.disconnect();
  }, []);

  const begin = useCallback(() => {
    token.current += 1;
    halt();
    saved.current = null;
    setAudible(false);
    setReady(false);
    setFailed(false);
    setPlayed(false);
    setSource(undefined);
    return token.current;
  }, [halt]);

  const owns = useCallback((mine: number) => token.current === mine, []);

  const startBuffer = useCallback((mine: number, buffer: AudioBuffer) => {
    const audio = shared;
    if (!audio || token.current !== mine || audio.state !== 'running') return false;
    halt();
    const node = audio.createBufferSource();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    node.buffer = buffer;
    node.connect(analyser);
    analyser.connect(audio.destination);
    const active: Playback = { source: node, analyser, frame: 0 };
    playback.current = active;
    const samples = new Float32Array(analyser.fftSize);
    let signalActive = false;
    function measure() {
      if (playback.current !== active) return;
      analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      const next = energy / samples.length > (signalActive ? 0.00006 : 0.00016);
      if (next !== signalActive) {
        signalActive = next;
        setAudible(next);
      }
      active.frame = requestAnimationFrame(measure);
    }
    node.onended = () => {
      if (playback.current !== active) return;
      playback.current = null;
      cancelAnimationFrame(active.frame);
      node.disconnect();
      analyser.disconnect();
      setAudible(false);
      eventsRef.current?.onEnd?.();
    };
    node.start();
    setPlayed(true);
    eventsRef.current?.onStart?.();
    measure();
    return true;
  }, [halt]);

  const play = useCallback(async (mine: number, bytes: AudioBytes, kind: ClipSource, autoplay: boolean) => {
    if (token.current !== mine) return false;
    const audio = unlockLessonAudio();
    if (!audio) {
      if (token.current !== mine) return false;
      setFailed(true);
      setSource(kind);
      eventsRef.current?.onEnd?.();
      return false;
    }
    if (audio.state !== 'running') {
      try {
        await audio.resume();
      } catch {
        // A suspended context can still be started from the repeat button.
      }
    }
    if (token.current !== mine) return false;
    const buffer = await decodeClips(audio, bytes);
    if (token.current !== mine) return false;
    if (!buffer) {
      setFailed(true);
      setSource(kind);
      eventsRef.current?.onEnd?.();
      return false;
    }
    saved.current = { bytes, buffer };
    setFailed(false);
    setReady(true);
    setSource(kind);
    setPlayed(false);
    return !autoplay || startBuffer(mine, buffer);
  }, [startBuffer]);

  const hold = useCallback((mine: number, bytes: Uint8Array, kind: ClipSource) => {
    if (token.current !== mine) return;
    saved.current = { bytes };
    setSource(kind);
    setReady(true);
    setPlayed(false);
    setFailed(false);
  }, []);

  const replay = useCallback(() => {
    const current = saved.current;
    if (!current) return;
    const mine = ++token.current;
    halt();
    setAudible(false);
    setFailed(false);
    const audio = unlockLessonAudio();
    if (!audio) {
      setFailed(true);
      return;
    }
    void (async () => {
      if (audio.state !== 'running') {
        try {
          await audio.resume();
        } catch {
          // The click that called replay is the gesture that resumes playback.
        }
      }
      if (token.current !== mine) return;
      const buffer = current.buffer ?? await decodeClips(audio, current.bytes);
      if (token.current !== mine || !buffer) {
        if (token.current === mine) setFailed(true);
        return;
      }
      current.buffer = buffer;
      startBuffer(mine, buffer);
    })();
  }, [halt, startBuffer]);

  const stop = useCallback(() => {
    token.current += 1;
    halt();
    setAudible(false);
  }, [halt]);

  useEffect(() => () => {
    token.current += 1;
    halt();
  }, [halt]);

  return { audible, failed, ready, source, played, begin, owns, play, hold, replay, stop };
}
