import { Chess, type Square } from 'chess.js';
import type { Coach } from './Coach';

const files = 'abcdefgh';
const squares = [...files].flatMap(file => [1, 2, 3, 4, 5, 6, 7, 8].map(rank => file + rank));
const knightJumps = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const bishopRays = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const queenRays = [[1, 0], [-1, 0], [0, 1], [0, -1], ...bishopRays];

export const kingEnemy = 'c4';
export const knightFence = ['c3', 'd3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5'];
const fence = new Set(knightFence);

export const pieceLessons = {
  king: {
    slug: 'poznaj-krola',
    title: 'Poznaj króla',
    piece: 'króla',
    start: 'b2',
    target: 'e3',
    events: ['start', 'selected', 'too-far', 'too-close', 'enemy', 'moved', 'finished'],
  },
  queen: {
    slug: 'poznaj-hetmana',
    title: 'Poznaj hetmana',
    piece: 'hetmana',
    start: 'd4',
    target: 'g7',
    events: ['start', 'selected', 'bent', 'moved', 'finished'],
  },
  knight: {
    slug: 'poznaj-skoczka',
    title: 'Poznaj skoczka',
    piece: 'skoczka',
    start: 'd4',
    target: 'e7',
    events: ['start', 'selected', 'not-l', 'own-piece', 'blocker', 'jumped', 'moved', 'finished'],
  },
  bishop: {
    slug: 'poznaj-gonca',
    title: 'Poznaj gońca',
    piece: 'gońca',
    start: 'd4',
    target: 'g5',
    events: ['start', 'selected', 'not-diagonal', 'moved', 'finished'],
  },
  pawn: {
    slug: 'poznaj-piona',
    title: 'Poznaj piona',
    piece: 'piona',
    start: 'e2',
    target: 'e8',
    events: ['start', 'selected', 'pawn-forward', 'moved', 'promoted'],
  },
  'pawn-capture': {
    slug: 'poznaj-piona',
    title: 'Poznaj piona',
    piece: 'piona',
    start: 'e4',
    target: 'd5',
    events: ['capture-start', 'capture-selected', 'pawn-blocked', 'capture-only', 'finished'],
  },
} as const;

export type PieceBoardId = keyof typeof pieceLessons;
export type PieceLessonId = Exclude<PieceBoardId, 'pawn-capture'>;
type PawnBoardId = 'pawn' | 'pawn-capture';
export type PieceEvent = (typeof pieceLessons)[PieceBoardId]['events'][number];
export type ArrivalEvent = 'finished' | 'jumped' | 'moved' | 'promoted';
export type ClickClass = PieceEvent | 'move';

type Placement = { square: string; role: 'king' | 'queen' | 'knight' | 'bishop' | 'pawn'; color: 'white' | 'black' };

const lines: Record<PieceBoardId, Record<Coach, Record<string, string>>> = {
  king: {
    lion: {
      start: 'Kliknij króla. Zaprowadź go na e3!',
      selected: 'Król robi jeden krok. Wybierz podświetlone pole.',
      'too-far': 'Dobra próba! Król chodzi tylko o jedno pole.',
      'too-close': 'Tu nie wolno. Królowie nigdy nie stają obok siebie.',
      enemy: 'To czarny król. Pilnuje wszystkich pól wokół siebie.',
      moved: 'Dobry krok! Idź dalej na e3.',
      finished: 'Brawo! Król doszedł na e3.',
    },
    owl: {
      start: 'Huu! Kliknij króla i zaprowadź go na e3.',
      selected: 'Widzisz kropki? Król idzie tylko o jedno pole.',
      'too-far': 'Ojej, za daleko! Król robi małe kroki, po jednym polu.',
      'too-close': 'Huu, za blisko! Czarny król pilnuje pól wokół siebie.',
      enemy: 'To czarny król. Twój król nie stanie tuż obok niego.',
      moved: 'Tak chodzi król! Którędy teraz na e3?',
      finished: 'Brawo! Król jest już na e3.',
    },
  },
  queen: {
    lion: {
      start: 'Kliknij hetmana. Dojedziesz na g7 jednym ruchem?',
      selected: 'Hetman jeździ jak wieża, a do tego po skosie.',
      bent: 'Dobra próba! Hetman jedzie prosto albo po skosie, bez skręcania.',
      moved: 'Dobry ruch! Z tego pola poszukaj drogi na g7.',
      finished: 'Brawo! Hetman dojechał na g7.',
    },
    owl: {
      start: 'Huu! Kliknij hetmana. Dojedzie na g7 jednym ruchem?',
      selected: 'Huu, ile kropek! Hetman jedzie prosto albo po skosie.',
      bent: 'Ładna próba! Hetman nie skręca. Jedzie prosto albo po skosie.',
      moved: 'Tak jeździ hetman! A którędy teraz na g7?',
      finished: 'Brawo! Hetman jest już na g7.',
    },
  },
  knight: {
    lion: {
      start: 'Skoczek stoi za płotem z pionów. Skocz nim na e7!',
      selected: 'Skoczek skacze literą L. Wybierz kropkę.',
      'not-l': 'Dobra próba! Skoczek skacze literą L: dwa pola prosto i jedno w bok.',
      'own-piece': 'Tu stoi Twój pion. Skoczek tu nie wyląduje.',
      blocker: 'Piony dziś tylko pilnują płotu. Kliknij skoczka.',
      jumped: 'Hop! Skoczek przeskakuje inne figury. Teraz na e7.',
      moved: 'Dobry skok! Z tego pola poszukaj drogi na e7.',
      finished: 'Brawo! Skoczek doskoczył na e7.',
    },
    owl: {
      start: 'Huu! Skoczek siedzi w zagrodzie. Pomożesz mu dostać się na e7?',
      selected: 'Widzisz kropki? Tam skoczek może wylądować.',
      'not-l': 'Ładna próba! Skoczek nie chodzi prosto ani po skosie. Skacze literą L.',
      'own-piece': 'Ups, tu już stoi Twój pion. Wybierz wolne pole.',
      blocker: 'Piony dziś odpoczywają. Skacze tylko skoczek.',
      jumped: 'Hop, przez płot! A którędy teraz na e7?',
      moved: 'Tak skacze skoczek! Którędy teraz na e7?',
      finished: 'Brawo! Skoczek jest już na e7.',
    },
  },
  bishop: {
    lion: {
      start: 'Kliknij gońca na d4. Znajdź drogę na g5!',
      selected: 'Goniec chodzi po skosie. Zobacz, jaki kolor mają pola z kropkami.',
      'not-diagonal': 'Spróbuj po skosie. Goniec zawsze zostaje na polach tego samego koloru.',
      moved: 'Dobry ruch! Poszukaj teraz skosu w stronę g5.',
      finished: 'Brawo! Goniec dotarł na g5.',
    },
    owl: {
      start: 'Huu! Pomożesz gońcowi z d4 dotrzeć na g5?',
      selected: 'Wybierz kropkę na skosie. Wszystkie są na polach w tym samym kolorze!',
      'not-diagonal': 'Ojej, tędy nie ma skosu! Wybierz pole z kropką.',
      moved: 'Tak chodzi goniec! Którędy teraz na g5?',
      finished: 'Udało się! Goniec jest na g5.',
    },
  },
  pawn: {
    lion: {
      start: 'Zaprowadź piona z e2 na e8. Zobacz, w co się zmieni!',
      selected: 'Pion idzie do przodu o jedno pole. Z e2 może ruszyć o dwa pola, jeśli oba są wolne.',
      'pawn-forward': 'Wybierz kropkę przed pionem. W tej części pion idzie prosto do przodu.',
      moved: 'Idź dalej w stronę e8.',
      promoted: 'Pion dotarł na e8 i zmienił się w hetmana. To promocja!',
    },
    owl: {
      start: 'Huu! Rusz pionem z e2 i doprowadź go aż na e8.',
      selected: 'Pion robi krok do przodu. Z e2 może zrobić dwa kroki, jeśli oba pola są wolne.',
      'pawn-forward': 'Spójrz na kropki przed pionem. Która prowadzi naprzód?',
      moved: 'Jeszcze kawałek do e8. Które pole jest teraz przed pionem?',
      promoted: 'Huu! Na e8 pion stał się hetmanem. Taka zamiana to promocja.',
    },
  },
  'pawn-capture': {
    lion: {
      'capture-start': 'Pion na e4 ma przed sobą czarnego piona. Zbij czarnego piona na d5.',
      'capture-selected': 'Pion bije jedno pole po skosie do przodu. Cel to d5.',
      'pawn-blocked': 'Na e5 stoi czarny pion. Pion nie bije prosto przed siebie.',
      'capture-only': 'Pion idzie po skosie tylko wtedy, gdy bije figurę przeciwnika. Spróbuj na d5.',
      finished: 'Brawo! Pion zbił po skosie na d5.',
    },
    owl: {
      'capture-start': 'Huu! Drogę na wprost zastawia czarny pion. Zbij drugiego, na d5.',
      'capture-selected': 'Poszukaj czarnego piona jedno pole po skosie do przodu. To d5.',
      'pawn-blocked': 'Czarny pion na e5 blokuje drogę. Pion może zbić tylko po skosie.',
      'capture-only': 'Po skosie pion rusza, gdy może coś zbić. Sprawdź d5.',
      finished: 'Udało się! Pion zbił po skosie i jest na d5.',
    },
  },
};

function xy(square: string): [number, number] {
  return [files.indexOf(square[0]), Number(square[1]) - 1];
}

function at(x: number, y: number) {
  return x >= 0 && x < 8 && y >= 0 && y < 8 ? files[x] + (y + 1) : '';
}

function chebyshev(from: string, to: string) {
  const [ax, ay] = xy(from);
  const [bx, by] = xy(to);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function slide(from: string, directions: number[][], occupied: Set<string>) {
  const [fx, fy] = xy(from);
  const result: string[] = [];
  for (const [dx, dy] of directions) {
    for (let step = 1; ; step += 1) {
      const square = at(fx + dx * step, fy + dy * step);
      if (!square || occupied.has(square)) break;
      result.push(square);
    }
  }
  return result;
}

function jump(from: string, deltas: number[][], occupied: Set<string>) {
  const [fx, fy] = xy(from);
  return deltas.map(([dx, dy]) => at(fx + dx, fy + dy)).filter(square => square && !occupied.has(square));
}

export function kingFen(square: string) {
  const board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ''));
  const [kx, ky] = xy(square);
  const [ex, ey] = xy(kingEnemy);
  board[7 - ky][kx] = 'K';
  board[7 - ey][ex] = 'k';
  const rows = board.map(row => {
    let text = '';
    let empty = 0;
    for (const cell of row) {
      if (!cell) {
        empty += 1;
        continue;
      }
      if (empty) text += empty;
      empty = 0;
      text += cell;
    }
    return text + (empty || '');
  });
  return `${rows.join('/')} w - - 0 1`;
}

function pawnBoard(lesson: PawnBoardId, square: string) {
  if (lesson === 'pawn-capture') {
    return new Chess(square === 'd5' ? '7k/8/8/3Pp3/8/8/8/K7 w - - 0 1' : '7k/8/8/3pp3/4P3/8/8/K7 w - - 0 1');
  }
  const chess = new Chess('8/8/7k/8/8/8/8/K7 w - - 0 1');
  chess.put({ type: square === 'e8' ? 'q' : 'p', color: 'w' }, square as Square);
  return chess;
}

export function pawnFen(lesson: PawnBoardId, square: string) {
  return pawnBoard(lesson, square).fen();
}

export function legalDestinations(lesson: PieceBoardId, square: string): string[] {
  if (lesson === 'king') {
    return new Chess(kingFen(square)).moves({ square: square as Square, verbose: true }).map(move => move.to);
  }
  if (lesson === 'queen') return slide(square, queenRays, new Set());
  if (lesson === 'bishop') return slide(square, bishopRays, new Set());
  if (lesson === 'pawn' || lesson === 'pawn-capture') {
    if (square === pieceLessons[lesson].target) return [];
    return pawnBoard(lesson, square).moves({ square: square as Square, verbose: true })
      .filter(move => !move.promotion || move.promotion === 'q').map(move => move.to);
  }
  return jump(square, knightJumps, fence);
}

export function passedFence(from: string, to: string) {
  return squares.some(square => square !== from && square !== to &&
    chebyshev(square, from) === 1 && chebyshev(square, to) === 1 && fence.has(square));
}

export function classifyClick(lesson: PieceBoardId, square: string, pressed: string, selected: boolean): ClickClass {
  if (pressed === square) return 'selected';
  if (lesson === 'king') {
    if (pressed === kingEnemy) return 'enemy';
    if (legalDestinations(lesson, square).includes(pressed)) return 'move';
    return chebyshev(square, pressed) > 1 ? 'too-far' : 'too-close';
  }
  if (lesson === 'queen') {
    return legalDestinations(lesson, square).includes(pressed) ? 'move' : 'bent';
  }
  if (lesson === 'bishop') {
    return legalDestinations(lesson, square).includes(pressed) ? 'move' : 'not-diagonal';
  }
  if (lesson === 'pawn' || lesson === 'pawn-capture') {
    if (legalDestinations(lesson, square).includes(pressed)) return 'move';
    if (lesson === 'pawn') return 'pawn-forward';
    return pressed === 'e5' ? 'pawn-blocked' : 'capture-only';
  }
  if (!selected && fence.has(pressed)) return 'blocker';
  if (legalDestinations(lesson, square).includes(pressed)) return 'move';
  if (jump(square, knightJumps, new Set()).includes(pressed) && fence.has(pressed)) return 'own-piece';
  return 'not-l';
}

export function arrivalEvent(lesson: PieceBoardId, from: string, to: string): ArrivalEvent {
  if (to === pieceLessons[lesson].target) return lesson === 'pawn' ? 'promoted' : 'finished';
  if (lesson === 'knight' && passedFence(from, to)) return 'jumped';
  return 'moved';
}

export function lessonLine(lesson: PieceBoardId, coach: Coach, event: PieceEvent) {
  return lines[lesson][coach][event] ?? '';
}

export function placement(lesson: Exclude<PieceBoardId, PawnBoardId>, square: string): Placement[] {
  if (lesson === 'king') {
    return [
      { square, role: 'king', color: 'white' },
      { square: kingEnemy, role: 'king', color: 'black' },
    ];
  }
  if (lesson === 'queen' || lesson === 'bishop') return [{ square, role: lesson, color: 'white' }];
  return [
    { square, role: 'knight', color: 'white' },
    ...knightFence.map(pawn => ({ square: pawn, role: 'pawn' as const, color: 'white' as const })),
  ];
}
