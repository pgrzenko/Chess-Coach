import { Chess } from 'chess.js';
import { polishSan, variationTokens } from './polish-notation.mjs';

const evaluationFormat = new Intl.NumberFormat('pl-PL', {
  signDisplay: 'exceptZero',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const capturedPieces = {
  p: { value: 1, name: 'piona', article: 'niebronionego' },
  n: { value: 3, name: 'skoczka', article: 'niebronionego' },
  b: { value: 3, name: 'gońca', article: 'niebronionego' },
  r: { value: 5, name: 'wieżę', article: 'niebronioną' },
  q: { value: 9, name: 'hetmana', article: 'niebronionego' },
};

const uciMove = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export function formatWhiteScore(score, turn) {
  if (!score || (score.type !== 'cp' && score.type !== 'mate') || !Number.isFinite(score.value)) return '';
  const value = turn === 'w' ? score.value : -score.value;
  if (score.type === 'mate') {
    if (value === 0) return 'Mat';
    return `Mat ${value > 0 ? 'białych' : 'czarnych'} w ${Math.abs(value)}`;
  }
  return evaluationFormat.format(value / 100);
}

function capturedSquare(move) {
  return move.flags.includes('e') ? move.to[0] + move.from[1] : move.to;
}

function freeCapture(chess) {
  const opponent = chess.turn() === 'w' ? 'b' : 'w';
  const found = [];
  for (const move of chess.moves({ verbose: true })) {
    const piece = capturedPieces[move.captured];
    if (!piece) continue;
    const square = capturedSquare(move);
    if (chess.isAttacked(square, opponent)) continue;
    const next = new Chess(chess.fen());
    let played;
    try {
      played = next.move({ from: move.from, to: move.to, promotion: move.promotion });
    } catch {
      continue;
    }
    if (!played) continue;
    const recaptured = next.moves({ verbose: true }).some(reply => reply.captured && reply.to === move.to);
    if (recaptured) continue;
    found.push({ move, square, piece });
  }
  found.sort((left, right) => right.piece.value - left.piece.value
    || left.square.localeCompare(right.square)
    || left.move.san.localeCompare(right.move.san));
  return found[0] ?? null;
}

function bestLine(engine) {
  if (engine?.status !== 'ok' || !Array.isArray(engine.lines) || engine.lines.length === 0) return null;
  return engine.lines.slice().sort((left, right) => left.rank - right.rank)[0];
}

function givesCheck(chess, uci) {
  if (typeof uci !== 'string' || !uciMove.test(uci)) return null;
  const next = new Chess(chess.fen());
  let move;
  try {
    move = next.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
  return move && next.isCheck() ? move : null;
}

function joinSentences(parts) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function verifiedSans(chess, uciMoves, limit) {
  const next = new Chess(chess.fen());
  const sans = [];
  for (const uci of (uciMoves ?? []).slice(0, limit)) {
    if (typeof uci !== 'string' || !uciMove.test(uci)) break;
    let move;
    try {
      move = next.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    if (!move) break;
    sans.push(move.san);
  }
  return sans;
}

function polishPlan(sans, turn, moveNumber) {
  return variationTokens(sans, turn, moveNumber)
    .map(token => `${token.prefix ? token.prefix + ' ' : ''}${polishSan(token.san)}`.trim())
    .join(' ');
}

function describeEngine(chess, engine) {
  const line = bestLine(engine);
  if (!line) return null;
  const sans = verifiedSans(chess, line.moves, 5);
  const others = (engine.lines ?? [])
    .filter(item => item.rank !== line.rank)
    .sort((left, right) => left.rank - right.rank);
  const secondSan = verifiedSans(chess, others[0]?.moves, 1)[0];
  const first = sans[0] ? polishSan(sans[0]) : null;
  const second = secondSan ? polishSan(secondSan) : null;
  return {
    first,
    second: second && second !== first ? second : null,
    plan: sans.length > 1 ? polishPlan(sans, chess.turn(), chess.moveNumber()) : null,
    checking: Boolean(givesCheck(chess, line.moves?.[0])),
    evaluation: evaluationSentence(line.score, chess.turn()),
  };
}

function engineSentences(info) {
  if (!info) return '';
  const opening = !info.first ? ''
    : info.checking ? `Stockfish zaczyna od ${info.first}, a ten ruch daje szacha.`
    : `Stockfish zaczyna od ${info.first}.`;
  return joinSentences([
    opening,
    info.plan ? `Linia: ${info.plan}.` : '',
    info.second ? `Druga kandydatura to ${info.second}.` : '',
    info.evaluation,
  ]);
}

function evaluationSentence(score, turn) {
  const formatted = formatWhiteScore(score, turn);
  if (!formatted) return 'Nie mam poprawnej oceny Stockfisha.';
  if (score.type === 'mate') return `Stockfish: ${formatted}.`;
  const white = turn === 'w' ? score.value : -score.value;
  if (Math.abs(white) < 50) return `Pozycja jest prawie równa. Ocena białych: ${formatted}.`;
  if (white > 0) return `Białe mają przewagę. Ocena białych: ${formatted}.`;
  return `Czarne mają przewagę. Ocena białych: ${formatted}.`;
}

function missingEngine(engine) {
  if (!engine || engine.status === 'pending' || engine.status === 'cancelled') {
    return 'Stockfish jeszcze nie ocenił tej pozycji.';
  }
  if (engine.status === 'idle') return 'Nie mam teraz oceny Stockfisha.';
  if (engine.status === 'unavailable') return 'Stockfish jest niedostępny.';
  return 'Nie mam poprawnej oceny Stockfisha.';
}

export function coachHint(chess, engine = { status: 'pending' }) {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? 'Czarne dają mata.' : 'Białe dają mata.';
  if (chess.isStalemate()) return 'Pat. Partia kończy się remisem.';
  if (chess.isThreefoldRepetition()) return 'Trzykrotne powtórzenie pozycji. Remis.';
  if (chess.isInsufficientMaterial()) return 'Za mało materiału, żeby dać mata. Remis.';
  if (chess.isDraw() || chess.isGameOver()) return 'Partia kończy się remisem.';

  const legal = chess.moves({ verbose: true });
  const only = legal.length === 1 ? polishSan(legal[0].san) : null;
  const info = describeEngine(chess, engine);
  if (chess.isCheck()) {
    const king = chess.turn() === 'w' ? 'białych' : 'czarnych';
    return joinSentences([
      `Król ${king} jest w szachu.`,
      only ? `Jedyny ruch to ${only}.` : info?.first ? `Stockfish zaczyna obronę od ${info.first}.` : '',
      !only && info?.plan ? `Linia: ${info.plan}.` : '',
      !only && info?.evaluation ? info.evaluation : '',
    ]);
  }
  if (only) return joinSentences([`Jedyny legalny ruch to ${only}.`, info?.evaluation]);

  const capture = freeCapture(chess);
  if (capture) {
    const side = chess.turn() === 'w' ? 'Białe' : 'Czarne';
    const san = polishSan(capture.move.san);
    const fact = `${side} mogą zbić ${capture.piece.article} ${capture.piece.name} na ${capture.square} (${san}).`;
    if (!info?.first) return joinSentences([fact, missingEngine(engine)]);
    if (info.first === san) {
      return joinSentences([
        fact,
        'Stockfish też stawia to bicie na pierwszym miejscu.',
        info.plan ? `Linia: ${info.plan}.` : '',
        info.second ? `Druga kandydatura to ${info.second}.` : '',
        info.evaluation,
      ]);
    }
    return joinSentences([
      fact,
      `Silnik jednak woli ${info.first}.`,
      info.plan ? `Linia: ${info.plan}.` : '',
      info.second ? `Druga kandydatura to ${info.second}.` : '',
      info.evaluation,
    ]);
  }

  if (!info) return missingEngine(engine);
  return engineSentences(info) || missingEngine(engine);
}
