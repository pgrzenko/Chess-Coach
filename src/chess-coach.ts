import type { Move } from 'chess.js';
import type { Coach } from './Coach';
import type { RecordedRequest } from './lesson-audio';

export type EnginePurpose = 'analysis' | 'play' | 'hint';
export type EnginePosition = { initialFen: string; moves: string[]; purpose?: EnginePurpose };

export type EngineLine = {
  rank: number;
  depth: number;
  score: { type: 'cp' | 'mate'; value: number };
  moves: string[];
};

export type AnalysisResult =
  | { status: 'ok'; lines: EngineLine[] }
  | { status: 'cancelled' | 'unavailable' };

export type LionMove = { from: string; to: string; promotion?: string };
export type SparringHint = Pick<Move, 'from' | 'to' | 'promotion'> & { coach: Coach };
export type LionAudio = { source: 'openai' | 'windows'; wav: Uint8Array };
export type LionAnswer =
  | { status: 'ok'; passed: boolean; text: string; hint: { from: string; to: string } | null; audio: LionAudio | null }
  | { status: 'cancelled' | 'unavailable' };
export type VoiceSettings = { envConfigured: boolean };

export type ChessCoach = {
  analyze(position: EnginePosition): Promise<AnalysisResult>;
  recordedClip?(request: RecordedRequest): Promise<Uint8Array | null>;
  recordedHint?(move: SparringHint): Promise<Uint8Array[] | null>;
  speakHint?(move: SparringHint): Promise<boolean>;
  stopSpeech?(): Promise<void>;
  coachLion?(move: LionMove): Promise<LionAnswer>;
  stopLion?(): Promise<void>;
  lionVoiceSettings?(): Promise<VoiceSettings>;
};

declare global {
  interface Window {
    chessCoach?: ChessCoach;
  }
}
