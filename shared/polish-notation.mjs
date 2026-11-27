const pieces = {
  K: { letter: 'K', name: 'król', role: 'king', promo: 'króla' },
  Q: { letter: 'H', name: 'hetman', role: 'queen', promo: 'hetmana' },
  R: { letter: 'W', name: 'wieża', role: 'rook', promo: 'wieżę' },
  B: { letter: 'G', name: 'goniec', role: 'bishop', promo: 'gońca' },
  N: { letter: 'S', name: 'skoczek', role: 'knight', promo: 'skoczka' },
};

function spokenMove(piece, head, capture, dest, promotion, suffix) {
  const name = piece ? piece.name : 'pion';
  let spoken = name;
  if (head && capture) spoken += ` z ${head} bije ${dest}`;
  else if (head) spoken += ` z ${head} na ${dest}`;
  else if (capture) spoken += ` bije ${dest}`;
  else spoken += ` ${dest}`;
  if (promotion) spoken += `, promocja na ${promotion.promo}`;
  if (suffix === '+') spoken += ', szach';
  if (suffix === '#') spoken += ', mat';
  return spoken;
}

export function readSan(san) {
  if (typeof san !== 'string' || san.length < 2 || san.length > 12) return null;
  let body = san;
  let suffix = '';
  if (body.endsWith('#')) {
    suffix = '#';
    body = body.slice(0, -1);
  } else if (body.endsWith('+')) {
    suffix = '+';
    body = body.slice(0, -1);
  }

  if (body === 'O-O' || body === 'O-O-O') {
    const name = body === 'O-O' ? 'krótka roszada' : 'długa roszada';
    const spoken = suffix === '#' ? `${name}, mat` : suffix === '+' ? `${name}, szach` : name;
    return {
      polish: body + suffix,
      spoken,
      piece: null,
      promotion: null,
      coords: body,
      suffix,
      castle: body,
    };
  }

  let promotion = null;
  const promoMatch = body.match(/=([KQRBN])$/);
  if (promoMatch) {
    promotion = pieces[promoMatch[1]];
    body = body.slice(0, -2);
  }

  let piece = null;
  if (pieces[body[0]]) {
    piece = pieces[body[0]];
    body = body.slice(1);
  }

  if (!/^[a-h1-8x]+$/.test(body) || body.length < 2) return null;
  const dest = body.slice(-2);
  if (!/^[a-h][1-8]$/.test(dest)) return null;
  let head = body.slice(0, -2);
  let capture = false;
  if (head.endsWith('x')) {
    capture = true;
    head = head.slice(0, -1);
  }
  if (head.length > 2 || (head !== '' && !/^[a-h1-8]+$/.test(head))) return null;
  if (!piece && (head.length > 1 || (!capture && head !== ''))) return null;

  const coords = `${head}${capture ? 'x' : ''}${dest}`;
  return {
    polish: `${piece ? piece.letter : ''}${coords}${promotion ? promotion.letter : ''}${suffix}`,
    spoken: spokenMove(piece, head, capture, dest, promotion, suffix),
    piece,
    promotion,
    coords,
    suffix,
    castle: null,
  };
}

export function polishSan(san) {
  return readSan(san)?.polish ?? san;
}

export function variationTokens(sans, turn, moveNumber) {
  if (!Array.isArray(sans) || (turn !== 'w' && turn !== 'b') || !Number.isInteger(moveNumber)) return [];
  const tokens = [];
  let color = turn;
  let number = moveNumber;
  let markBlack = color === 'b';
  for (const san of sans) {
    if (typeof san !== 'string') return [];
    let prefix = '';
    if (color === 'w') prefix = `${number}.`;
    else if (markBlack) {
      prefix = `${number}…`;
      markBlack = false;
    }
    tokens.push({ san, color, prefix });
    if (color === 'b') number += 1;
    color = color === 'w' ? 'b' : 'w';
  }
  return tokens;
}

export function scoreColumns(rows, perColumn, maxColumns) {
  if (!rows.length) return [];
  const per = Math.max(1, Math.floor(perColumn));
  const max = Math.max(1, Math.floor(maxColumns));
  const count = Math.min(max, Math.ceil(rows.length / per));
  const columns = [];
  for (let index = 0; index < count; index += 1) {
    const start = index * per;
    const end = index === count - 1 ? rows.length : Math.min(rows.length, start + per);
    columns.push(rows.slice(start, end));
  }
  return columns;
}

export function scorePairs(moves) {
  const rows = [];
  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    const number = Math.ceil(move.ply / 2);
    if (move.ply % 2 === 0) {
      rows.push({ number, white: undefined, black: move });
      continue;
    }
    const next = moves[index + 1];
    const black = next && next.ply === move.ply + 1 ? next : undefined;
    rows.push({ number, white: move, black });
    if (black) index += 1;
  }
  return rows;
}
