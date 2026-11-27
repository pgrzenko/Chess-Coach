import { spawn } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createStockfishEngine } from '../shared/stockfish.mjs';

export const defaultEnginePath = path.resolve(process.env.STOCKFISH_PATH ||
  path.join(import.meta.dirname, '..', 'personal', 'stockfish', 'stockfish.exe'));

export function createStockfish(executable) {
  return createStockfishEngine(({ onLine, onError }) => {
    const child = spawn(executable, [], { cwd: path.dirname(executable), windowsHide: true });
    const stdout = createInterface({ input: child.stdout });
    child.on('error', onError);
    child.on('close', () => onError(new Error('Stockfish exited')));
    child.stdin.on('error', onError);
    child.stderr.resume();
    stdout.on('line', onLine);

    return {
      write: text => child.stdin.write(text + '\n'),
      close() {
        child.kill();
        stdout.close();
      },
    };
  }, { threads: 2, hash: 64 });
}
