import { spawn } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';

const variationCount = 3;
const searchMs = 700;
const uciMove = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export const defaultEnginePath = path.resolve(process.env.STOCKFISH_PATH ||
  path.join(import.meta.dirname, '..', 'personal', 'stockfish', 'stockfish.exe'));

function readPosition(input) {
  if (typeof input?.initialFen !== 'string' || input.initialFen.length > 128 ||
      !Array.isArray(input.moves) || input.moves.length > 2048) return;

  const purpose = input.purpose ?? 'analysis';
  if (purpose !== 'analysis' && purpose !== 'play' && purpose !== 'hint') return;
  const multiPv = purpose === 'analysis' ? variationCount : 1;

  try {
    const chess = new Chess(input.initialFen);
    const initialFen = chess.fen();
    for (const move of input.moves) {
      if (typeof move !== 'string' || !uciMove.test(move)) return;
      chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
    }
    const count = chess.isGameOver() ? 0 : Math.min(multiPv, chess.moves().length);
    return { initialFen, moves: input.moves, count, multiPv };
  } catch {
    return;
  }
}

function readLine(line) {
  if (/\b(?:lowerbound|upperbound)\b/.test(line)) return;
  const match = /^info depth (\d+).*?\bmultipv (\d+)\s+score (cp|mate) (-?\d+).*?\bpv (.+)$/.exec(line);
  if (!match) return;

  const moves = match[5].trim().split(/\s+/);
  if (moves.every(move => uciMove.test(move))) {
    return {
      rank: Number(match[2]),
      depth: Number(match[1]),
      score: { type: match[3], value: Number(match[4]) },
      moves,
    };
  }
}

function openEngine(executable) {
  const child = spawn(executable, [], { cwd: path.dirname(executable), windowsHide: true });
  const stdout = createInterface({ input: child.stdout });
  let pending;
  let closed = false;
  let searching = false;
  let stopSent = false;
  let multiPv = variationCount;

  function fail(error) {
    closed = true;
    pending?.finish(error);
  }

  child.on('error', fail);
  child.on('close', () => fail(new Error('Stockfish exited')));
  child.stdin.on('error', fail);
  child.stderr.resume();
  stdout.on('line', line => {
    if (!pending) return;
    if (line === pending.end || line.startsWith(pending.end + ' ')) pending.finish();
    else pending.onLine(line);
  });

  function command(text, end, onLine = () => {}) {
    if (closed) return Promise.reject(new Error('Stockfish is closed'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        fail(new Error('Stockfish timed out waiting for ' + end));
        child.kill();
      }, 5000);
      pending = { end, onLine, finish(error) {
        clearTimeout(timer);
        pending = undefined;
        if (error) reject(error);
        else resolve();
      } };
      child.stdin.write(text + '\n');
    });
  }

  return {
    async initialize() {
      await command('uci', 'uciok');
      await command([
        'setoption name Threads value 2',
        'setoption name Hash value 64',
        'setoption name MultiPV value ' + variationCount,
        'isready',
      ].join('\n'), 'readyok');
    },
    async configure(nextMultiPv) {
      if (nextMultiPv === multiPv) return;
      await command('setoption name MultiPV value ' + nextMultiPv + '\nisready', 'readyok');
      multiPv = nextMultiPv;
    },
    async search(position) {
      const history = position.moves.length ? ' moves ' + position.moves.join(' ') : '';
      const positionsByDepth = new Map();
      let complete = [];
      searching = true;
      stopSent = false;
      try {
        await command(
          'position fen ' + position.initialFen + history + '\ngo movetime ' + searchMs,
          'bestmove',
          message => {
            const line = readLine(message);
            if (!line || line.rank < 1 || line.rank > position.count) return;
            const depth = positionsByDepth.get(line.depth) ?? new Map();
            depth.set(line.rank, line);
            positionsByDepth.set(line.depth, depth);
            if (depth.size === position.count) complete = [...depth.values()].sort((a, b) => a.rank - b.rank);
          },
        );
        return complete;
      } finally {
        searching = false;
      }
    },
    stop() {
      if (searching && !stopSent && !closed) {
        stopSent = true;
        child.stdin.write('stop\n');
      }
    },
    close() {
      fail(new Error('Stockfish closed'));
      child.kill();
      stdout.close();
    },
  };
}

export function createStockfish(executable) {
  let engine;
  let queue = Promise.resolve();
  let revision = 0;
  let disposed = false;

  return {
    analyze(input) {
      const position = readPosition(input);
      if (!position) return Promise.resolve({ status: 'unavailable' });

      const request = ++revision;
      engine?.stop();
      const current = () => request === revision && !disposed;
      const task = queue.then(async () => {
        if (!current()) return { status: 'cancelled' };
        if (position.count === 0) return { status: 'ok', lines: [] };

        try {
          if (!engine) {
            engine = openEngine(executable);
            await engine.initialize();
          }
          if (!current()) return { status: 'cancelled' };

          await engine.configure(position.multiPv);
          if (!current()) return { status: 'cancelled' };

          const lines = await engine.search(position);
          return current() ? { status: 'ok', lines } : { status: 'cancelled' };
        } catch {
          engine?.close();
          engine = undefined;
          return { status: current() ? 'unavailable' : 'cancelled' };
        }
      });
      queue = task;
      return task;
    },
    close() {
      disposed = true;
      engine?.close();
    },
  };
}
