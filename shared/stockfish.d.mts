import type { AnalysisResult, EnginePosition } from '../src/chess-coach';

type OpenTransport = (events: {
  onLine(line: string): void;
  onError(error: Error): void;
}) => {
  write(commands: string): void;
  close(): void;
};

export function createStockfishEngine(open: OpenTransport, options: { threads: number; hash: number }): {
  analyze(position: EnginePosition): Promise<AnalysisResult>;
  close(): void;
};
