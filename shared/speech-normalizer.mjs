const files = { a: 'a', b: 'be', c: 'ce', d: 'de', e: 'e', f: 'ef', g: 'gie', h: 'ha' };
const ranks = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem'];
const fileNames = new Set(Object.values(files));
const rankNames = new Set(ranks.slice(1));
const pieces = { K: 'Król', Q: 'Hetman', R: 'Wieża', B: 'Goniec', N: 'Skoczek', P: 'Pion' };
const promotions = { Q: 'hetmana', R: 'wieżę', B: 'gońca', N: 'skoczka' };

export function squareToSpeech(square) {
  if (typeof square !== 'string' || !/^[a-h][1-8]$/.test(square)) return null;
  return files[square[0]] + ' ' + ranks[square[1]];
}

export function sparringHintSpeech(move) {
  const from = squareToSpeech(move?.from);
  const to = squareToSpeech(move?.to);
  if (!from || !to || move.from === move.to) return null;

  const promotion = move.promotion;
  if (promotion !== undefined && (typeof promotion !== 'string' || !/^[qrbn]$/.test(promotion))) return null;
  return `Z ${from} na ${to}.` + (promotion ? ` Promocja na ${promotions[promotion.toUpperCase()]}.` : '');
}

export function sanToSpeech(san, { oneSentence = false } = {}) {
  if (typeof san !== 'string') return null;

  const castle = /^([O0]-[O0](?:-[O0])?)([+#])?$/.exec(san);
  let phrase;
  let check;
  if (castle) {
    phrase = castle[1].length === 3 ? 'Krótka roszada' : 'Długa roszada';
    check = castle[2];
  } else {
    const move = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h])([1-8])(?:=([QRBN]))?([+#])?$/.exec(san);
    if (!move) return null;
    const [, piece = 'P', fromFile, fromRank, capture, toFile, toRank, promotion, suffix] = move;
    const origin = fromFile && fromRank ? ' z pola ' + files[fromFile] + ' ' + ranks[fromRank]
      : fromFile ? ' z linii ' + files[fromFile]
      : fromRank ? ' z rzędu ' + ranks[fromRank] : '';
    phrase = pieces[piece] + origin + (capture ? ' bije na ' : ' na ') + files[toFile] + ' ' + ranks[toRank];
    if (promotion) phrase += ' z promocją na ' + promotions[promotion];
    check = suffix;
  }
  if (check) {
    return phrase + (oneSentence ? ' — ' : '. ') +
      (check === '#' ? (oneSentence ? 'mat!' : 'Mat!') : (oneSentence ? 'szach!' : 'Szach!'));
  }
  return phrase + '.';
}

export function normalizeSpeech(text) {
  if (typeof text !== 'string') return '';
  const tokens = text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const normalized = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const packed = /^([a-h])([1-8])$/.exec(token);
    if (packed) {
      normalized.push(files[packed[1]], ranks[packed[2]]);
      continue;
    }

    const next = tokens[index + 1];
    const file = /^[a-h]$/.test(token) ? files[token] : fileNames.has(token) ? token : '';
    const rank = /^[1-8]$/.test(next ?? '') ? ranks[next] : rankNames.has(next) ? next : '';
    if (file && rank) {
      normalized.push(file, rank);
      index++;
    } else {
      normalized.push(token);
    }
  }

  return normalized.join(' ');
}
