import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Dests, Key } from '@lichess-org/chessground/types';
import { Chess, DEFAULT_POSITION, type Move } from 'chess.js';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './styles.css';
import { coachHint, formatWhiteScore } from '../shared/coach-hint.mjs';
import { polishSan, scoreColumns, scorePairs, variationTokens } from '../shared/polish-notation.mjs';
import { ChildrenLessons } from './ChildrenLessons';
import { CoachSelect, coaches, type Coach } from './Coach';
import { CodeAndLicenses } from './CodeAndLicenses';
import { unlockLessonAudio, useLessonAudio } from './lesson-audio';
import { MoveText, moveLabel } from './MoveText';
import type { AnalysisResult, EngineLine, EnginePurpose } from './chess-coach';

type Mode = 'analysis' | 'sparring';
type PlayerColor = 'w' | 'b';
type MoveNode = {
  id: number;
  parent: MoveNode | null;
  move: Move | null;
  ply: number;
};
type Study = { active: MoveNode; lineTip: MoveNode; nodes: MoveNode[]; promotion: Move[] };
type Analysis = { revision: number; result: AnalysisResult };
type Workspace = Record<Mode, Study> & {
  mode: Mode;
  player: PlayerColor;
  hints: boolean;
  revision: number;
};

const coachPreference = 'chess-coach:coach';
const webBuild = import.meta.env.MODE === 'web';

function readCoach(): Coach {
  try {
    return localStorage.getItem(coachPreference) === 'owl' ? 'owl' : 'lion';
  } catch {
    return 'lion';
  }
}
const promotionNames: Record<string, string> = {
  q: 'Hetman',
  r: 'Wieża',
  b: 'Goniec',
  n: 'Skoczek',
};
const lineControls = [
  { target: 'first', label: 'Początek linii', icon: '|‹' },
  { target: 'previous', label: 'Poprzedni ruch', icon: '‹' },
  { target: 'next', label: 'Następny ruch', icon: '›' },
  { target: 'last', label: 'Koniec linii', icon: '›|' },
] as const;
type LineControl = (typeof lineControls)[number]['target'];

function freshStudy(): Study {
  const start: MoveNode = { id: 0, parent: null, move: null, ply: 0 };
  return { active: start, lineTip: start, nodes: [start], promotion: [] };
}

function updateStudy(workspace: Workspace, study: Study): Workspace {
  const current = workspace[workspace.mode];
  if (current === study) return workspace;
  return {
    ...workspace,
    [workspace.mode]: study,
    revision: workspace.revision + (current.active === study.active ? 0 : 1),
  };
}

function previousDecision(workspace: Workspace) {
  const { active } = workspace[workspace.mode];
  if (workspace.mode === 'analysis' || active.move?.color === workspace.player) return active.parent;
  const previous = active.parent;
  return previous?.move?.color === workspace.player ? previous.parent : null;
}

function undo(workspace: Workspace) {
  const study = workspace[workspace.mode];
  const previous = previousDecision(workspace);
  if (!previous) return workspace;

  if (workspace.mode === 'sparring') {
    return updateStudy(workspace, {
      active: previous, lineTip: previous, nodes: study.nodes.slice(0, previous.id + 1), promotion: [],
    });
  }
  return updateStudy(workspace, { ...study, active: previous, promotion: [] });
}

function pathTo(node: MoveNode) {
  const path: Move[] = [];
  for (let step: MoveNode | null = node; step?.move; step = step.parent) {
    path.push(step.move);
  }
  return path.reverse();
}

function selectLine(study: Study, active: MoveNode): Study {
  for (let node: MoveNode | null = study.lineTip; node; node = node.parent) {
    if (node === active) return { ...study, active, promotion: [] };
  }

  let lineTip = active;
  const firstChild = new Map<MoveNode, MoveNode>();
  for (const node of study.nodes) {
    if (node.parent && !firstChild.has(node.parent)) firstChild.set(node.parent, node);
  }
  for (let child = firstChild.get(lineTip); child; child = firstChild.get(lineTip)) {
    lineTip = child;
  }
  return { ...study, active, lineTip, promotion: [] };
}

function lineTarget(study: Study, target: LineControl): MoveNode | null {
  if (target === 'first') return study.nodes[0];
  if (target === 'previous') return study.active.parent;
  if (target === 'last') return study.lineTip;

  for (let node: MoveNode | null = study.lineTip; node?.parent; node = node.parent) {
    if (node.parent === study.active) return node;
  }
  return null;
}

function addMove(study: Study, move: Move): Study {
  const existing = study.nodes.find(node => node.parent === study.active && node.move?.lan === move.lan);
  if (existing) return selectLine(study, existing);

  const node: MoveNode = {
    id: study.nodes.length,
    parent: study.active,
    move,
    ply: study.active.ply + 1,
  };
  return { active: node, lineTip: node, nodes: [...study.nodes, node], promotion: [] };
}

function activeLine(lineTip: MoveNode) {
  const line: MoveNode[] = [];
  for (let node: MoveNode | null = lineTip; node; node = node.parent) line.push(node);
  return line.reverse();
}

function verifyLine(line: EngineLine, fen: string) {
  if (!Number.isFinite(line.score.value) || line.moves.length === 0) return null;

  const chess = new Chess(fen);
  const san: string[] = [];
  try {
    for (const uci of line.moves) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
      san.push(chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      }).san);
    }
  } catch {
    return null;
  }

  return { ...line, san };
}

function whiteScore(score: EngineLine['score'], turn: PlayerColor) {
  return turn === 'w' ? score.value : -score.value;
}

function formatScore(score: EngineLine['score'], turn: PlayerColor) {
  return formatWhiteScore(score, turn);
}

function EvaluationBar({
  score, turn, flipped, outcome,
}: { score?: EngineLine['score']; turn: PlayerColor; flipped: boolean; outcome?: PlayerColor | 'draw' }) {
  const value = score ? whiteScore(score, turn) : 0;
  let whiteShare = 50;
  if (score?.type === 'cp') whiteShare += 50 * Math.tanh(value / 400);
  if (score?.type === 'mate' && value !== 0) whiteShare = value > 0 ? 100 : 0;
  let label = score ? `Ocena białych ${formatScore(score, turn)}` : 'Ocena neutralna, brak danych';
  if (outcome) {
    whiteShare = outcome === 'draw' ? 50 : outcome === 'w' ? 100 : 0;
    label = outcome === 'draw' ? 'Remis' : outcome === 'w' ? 'Mat. Wygrywają białe' : 'Mat. Wygrywają czarne';
  }

  return (
    <div className="evaluation-bar" data-flipped={flipped} data-neutral={!score && !outcome} role="img" aria-label={label} title={label}>
      <span style={{ height: whiteShare + '%' }} />
    </div>
  );
}

function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => ({
    mode: 'analysis',
    analysis: freshStudy(),
    sparring: freshStudy(),
    player: 'w',
    hints: false,
    revision: 0,
  }));
  const [childrenOpen, setChildrenOpen] = useState(false);
  const analysisSettled = useRef(Promise.resolve());
  const lionStopped = useRef(Promise.resolve());
  const waitForAnalysis = useCallback(
    () => Promise.all([analysisSettled.current, lionStopped.current]).then(() => {}),
    [],
  );
  const registerLionCancellation = useCallback((cancellation: Promise<void>) => {
    lionStopped.current = cancellation;
  }, []);

  const [nextPlayer, setNextPlayer] = useState<PlayerColor>('w');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsToggle = useRef<HTMLButtonElement>(null);
  const [analysisFlipped, setAnalysisFlipped] = useState(false);
  const [evaluationVisible, setEvaluationVisible] = useState(true);
  const [enginePanelOpen, setEnginePanelOpen] = useState(true);
  const [analysis, setAnalysis] = useState<Analysis>();
  const [coach, setCoach] = useState<Coach>(readCoach);
  const [adviceKey, setAdviceKey] = useState<string | null>(null);
  const [missingAvatar, setMissingAvatar] = useState<Coach>();
  const { name: coachName, image: coachImage } = coaches[coach];
  const [speechFailure, setSpeechFailure] = useState<number>();
  const { begin: beginHint, owns: ownsHint, play: playHint, stop: stopHint } = useLessonAudio();
  const board = useRef<HTMLDivElement>(null);
  const scoreFrame = useRef<HTMLDivElement>(null);
  const [scoreRoom, setScoreRoom] = useState({ rows: 12, columns: 1 });
  const ground = useRef<Api | null>(null);
  const { mode, player, hints, revision } = workspace;
  const study = workspace[mode];
  const { active, nodes, promotion } = study;
  const isSparring = mode === 'sparring';
  const boardFlipped = isSparring ? player === 'b' : analysisFlipped;
  const showEvaluation = !isSparring && evaluationVisible;

  const { chess, path } = useMemo(() => {
    const path = pathTo(active);
    const chess = new Chess();
    for (const move of path) chess.move(move);
    return { chess, path };
  }, [active]);
  const line = useMemo(() => activeLine(study.lineTip), [study.lineTip]);
  const pairs = useMemo(() => scorePairs(line.slice(1)), [line]);
  const branches = useMemo(() => {
    const onLine = new Set(line);
    return nodes.filter(node => node.move && node.parent && onLine.has(node.parent) && !onLine.has(node))
      .sort((left, right) => left.ply - right.ply || left.id - right.id);
  }, [line, nodes]);
  useLayoutEffect(() => {
    const node = scoreFrame.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      const start = node.querySelector('.history-start');
      const branchList = node.querySelector('.branches');
      const reserved = (start instanceof HTMLElement ? start.offsetHeight : 0)
        + (branchList instanceof HTMLElement ? branchList.offsetHeight : 0) + 16;
      const height = Math.max(180, node.clientHeight - reserved);
      const columns = Math.max(1, Math.min(3, Math.floor((width + 18) / (184 + 18))));
      const rows = Math.max(6, Math.floor(height / 36));
      setScoreRoom(current => current.rows === rows && current.columns === columns ? current : { rows, columns });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [childrenOpen, branches.length]);
  const moveColumns = scoreColumns(pairs, scoreRoom.rows, scoreRoom.columns);
  const gameOver = chess.isGameOver();
  const turn = chess.turn();
  const playerTurn = turn === player;
  const engine = window.chessCoach;
  const result = analysis?.revision === revision ? analysis.result : undefined;
  const fen = chess.fen();
  const legal = useMemo(() => chess.moves({ verbose: true }), [chess]);

  let purpose: EnginePurpose | undefined;
  if (!childrenOpen) {
    if (!isSparring) purpose = 'analysis';
    else if (!gameOver && !playerTurn) purpose = 'play';
    else if (!gameOver && hints) purpose = 'hint';
  }

  const lines = useMemo(() => {
    if (isSparring || result?.status !== 'ok') return [];
    return result.lines.slice().sort((left, right) => left.rank - right.rank)
      .flatMap(line => verifyLine(line, fen) ?? []).slice(0, 2);
  }, [isSparring, result, fen]);
  const suggestion = purpose === 'hint' && result?.status === 'ok'
    ? legal.find(move => move.lan === result.lines[0]?.moves[0])
    : undefined;
  const hint = promotion.length === 0 ? suggestion : undefined;
  const hintMove = hint?.lan;
  const requestFailed = Boolean(purpose) && (
    !engine || result?.status === 'unavailable' || result?.status === 'cancelled'
    || (result?.status === 'ok' && (
      purpose === 'play' || (purpose === 'hint' && !suggestion) || (purpose === 'analysis' && !gameOver && lines.length === 0)
    ))
  );

  useLayoutEffect(() => {
    if (childrenOpen || !board.current) return;
    const instance = Chessground(board.current, {
      ranksPosition: 'left',
      premovable: { enabled: false },
      drawable: { enabled: false },
      animation: { enabled: true, duration: 110 },
    });
    ground.current = instance;
    return () => {
      instance.destroy();
      ground.current = null;
    };
  }, [childrenOpen]);

  useLayoutEffect(() => {
    if (childrenOpen) return;
    const playable = !gameOver && promotion.length === 0 && (!isSparring || playerTurn) ? legal : [];
    const dests: Dests = new Map();
    for (const { from, to } of playable) {
      const destinations = dests.get(from) ?? [];
      if (!destinations.includes(to)) destinations.push(to);
      dests.set(from, destinations);
    }
    const turnColor = chess.turn() === 'w' ? 'white' : 'black';
    ground.current?.cancelMove();
    ground.current?.set({
      fen,
      orientation: boardFlipped ? 'black' : 'white',
      turnColor,
      check: chess.isCheck(),
      lastMove: active.move ? [active.move.from, active.move.to] : undefined,
      movable: {
        free: false,
        color: playable.length ? turnColor : undefined,
        dests,
        rookCastle: false,
        events: {
          after: (from: Key, to: Key) => {
            const choices = playable.filter(move => move.from === from && move.to === to);
            setWorkspace(current => {
              const study = current[current.mode];
              if (current.revision !== revision || study.promotion.length > 0 || choices.length === 0) {
                return current;
              }
              return updateStudy(current, choices.length > 1
                ? { ...study, promotion: choices }
                : addMove(study, choices[0]));
            });
          },
        },
      },
    });
  }, [active, boardFlipped, chess, childrenOpen, fen, gameOver, isSparring, legal, playerTurn, promotion, revision]);

  useLayoutEffect(() => {
    ground.current?.setAutoShapes(hint ? [{ orig: hint.from, dest: hint.to, brush: 'green' }] : []);
  }, [childrenOpen, hint, revision]);

  useEffect(() => {
    if (!engine || !purpose) return;
    let obsolete = false;
    const request = lionStopped.current.then(() => obsolete ? undefined : engine.analyze({
      initialFen: DEFAULT_POSITION, moves: path.map(move => move.lan), purpose,
    }))
      .then(result => {
        if (obsolete || !result) return;

        if (purpose === 'play' && result.status === 'ok') {
          const move = legal.find(move => move.lan === result.lines[0]?.moves[0]);
          if (move) {
            setWorkspace(current => current.revision === revision
              ? updateStudy(current, addMove(current.sparring, move))
              : current);
            return;
          }
        }
        setAnalysis({ revision, result });
      })
      .catch(() => {
        if (!obsolete) setAnalysis({ revision, result: { status: 'unavailable' } });
      });
    analysisSettled.current = Promise.all([analysisSettled.current, request]).then(() => {});
    return () => {
      obsolete = true;
    };
  }, [engine, legal, path, purpose, revision]);

  useLayoutEffect(() => {
    return () => {
      stopHint();
      void engine?.stopSpeech?.().catch(() => {});
    };
  }, [coach, engine, hintMove, revision, stopHint]);

  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (settingsOpen) settingsToggle.current?.focus();
        setSettingsOpen(false);
        if (childrenOpen) return;
        setWorkspace(current => {
          const study = current[current.mode];
          return study.promotion.length ? updateStudy(current, { ...study, promotion: [] }) : current;
        });
      }
      if (childrenOpen) return;
      const editing = event.target instanceof HTMLElement && event.target.matches('input, select, textarea, [contenteditable]');
      if (event.key === 'ArrowLeft' && !editing && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setWorkspace(undo);
      }
    }
    window.addEventListener('keydown', navigate);
    return () => window.removeEventListener('keydown', navigate);
  }, [childrenOpen, settingsOpen]);

  function openChildren() {
    if (childrenOpen) return;
    setSettingsOpen(false);
    setChildrenOpen(true);
    setWorkspace(current => ({
      ...updateStudy(current, { ...current[current.mode], promotion: [] }),
      revision: current.revision + 1,
    }));
  }

  function changeMode(mode: Mode) {
    setSettingsOpen(false);
    setChildrenOpen(false);
    setWorkspace(current => {
      if (current.mode === mode) return current;
      const study = current[current.mode];
      return {
        ...updateStudy(current, { ...study, promotion: [] }),
        mode,
        revision: current.revision + 1,
      };
    });
  }

  function changeCoach(choice: Coach) {
    setCoach(choice);
    setSpeechFailure(undefined);
    try {
      localStorage.setItem(coachPreference, choice);
    } catch {
      // The selected coach still works for the current session.
    }
  }

  async function readHint() {
    if (!hint || !engine) return;
    unlockLessonAudio();
    const mine = beginHint();
    setSpeechFailure(undefined);
    void engine.stopSpeech?.().catch(() => {});
    const request = { coach, from: hint.from, to: hint.to, promotion: hint.promotion };
    const clips = await engine.recordedHint?.(request).catch(() => null);
    if (!ownsHint(mine)) return;
    if (clips?.length && await playHint(mine, clips, 'recorded', true)) return;
    if (!ownsHint(mine)) return;
    const spoken = await engine.speakHint?.(request).catch(() => false);
    if (ownsHint(mine) && !spoken) setSpeechFailure(revision);
  }

  const positionKey = `${mode}:${active.id}`;
  const adviceVisible = adviceKey === positionKey;
  const hintEngine = !engine ? { status: 'unavailable' as const }
    : !purpose ? { status: 'idle' as const }
    : !result || result.status === 'cancelled' ? { status: 'pending' as const }
    : result;
  const advice = adviceVisible ? coachHint(chess, hintEngine) : null;

  const positionStatus = chess.isCheckmate() ? 'Mat'
    : chess.isStalemate() ? 'Pat'
    : gameOver ? 'Remis'
    : turn === 'w' ? 'Ruch białych' : 'Ruch czarnych';
  let coachStatus = 'Analiza trwa…';
  if (gameOver) coachStatus = 'Pozycja końcowa';
  else if (requestFailed && (!engine || result?.status === 'unavailable')) coachStatus = 'Stockfish niedostępny';
  else if (requestFailed) coachStatus = 'Stockfish nie zwrócił poprawnej odpowiedzi';
  else if (isSparring && !playerTurn) coachStatus = 'Arcymistrz myśli…';
  else if (isSparring && !hints) coachStatus = 'Podpowiedzi wyłączone';
  else if (isSparring) coachStatus = hint ? 'Proponowany ruch' : 'Szukam podpowiedzi…';
  else if (result?.status === 'ok') coachStatus = lines.length ? 'Analiza gotowa' : 'Brak wariantów';

  function selectNode(node: MoveNode) {
    setWorkspace(current => current.mode === 'analysis'
      ? updateStudy(current, selectLine(current.analysis, node))
      : current);
  }

  function halfMove(node: MoveNode | undefined, marker: string) {
    if (!node?.move) return <span className="move-gap" />;
    const label = `${marker} ${moveLabel(node.move.san)}`;
    const selected = active === node ? 'step' as const : undefined;
    const body = <MoveText san={node.move.san} />;
    if (isSparring) return <span className="recorded-move" aria-label={label} aria-current={selected}>{body}</span>;
    return (
      <button type="button" aria-label={label} aria-current={selected} onClick={() => selectNode(node)}>
        {body}
      </button>
    );
  }

  function navigateAnalysis(target: LineControl) {
    setWorkspace(current => {
      if (current.mode !== 'analysis') return current;
      const study = current.analysis;
      const node = lineTarget(study, target);
      if (!node || node === study.active) return current;
      return updateStudy(current, { ...study, active: node, promotion: [] });
    });
  }

  return (
    <main className="workspace">
      <header className="masthead">
        <h1>AI Chess Coach</h1>
        <div className="header-controls">
          <nav className="mode-switch" aria-label="Tryb i trener">
            <button type="button" aria-pressed={!childrenOpen && !isSparring} onClick={() => changeMode('analysis')}>Analiza</button>
            <button type="button" aria-pressed={!childrenOpen && isSparring} onClick={() => changeMode('sparring')}>Sparing</button>
            <button type="button" aria-pressed={childrenOpen} onClick={openChildren}>Dla dzieci</button>
            <CoachSelect coach={coach} onChange={changeCoach} />
          </nav>
          {(!childrenOpen || webBuild) && (
            <button
              ref={settingsToggle}
              className="secondary settings-toggle"
              data-lessons={childrenOpen}
              type="button"
              aria-controls="game-settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(open => !open)}
            >
              Ustawienia
            </button>
          )}
        </div>
      </header>

      {childrenOpen ? (
        <div className="lesson-workspace">
          {webBuild && (
            <aside className="panel settings-panel" id="game-settings" aria-labelledby="settings-title"
              data-open={settingsOpen} data-lessons="true">
              <div className="panel-heading"><h2 id="settings-title">Ustawienia</h2></div>
              <CodeAndLicenses />
            </aside>
          )}
          <ChildrenLessons coach={coach}
            waitForAnalysis={waitForAnalysis} registerCancellation={registerLionCancellation} />
        </div>
      ) : <div className="study">
        <aside className="panel settings-panel" id="game-settings" aria-labelledby="settings-title" data-open={settingsOpen}>
          <div className="panel-heading"><h2 id="settings-title">Ustawienia</h2></div>
          <div className="settings-body">
            {isSparring ? (
              <fieldset className="setting-group">
                <legend>Partia</legend>
                <p className="player-color">Grasz {player === 'w' ? 'białymi' : 'czarnymi'}.</p>
                <div className="setting-grid">
                  <label>
                    Kolor nowej partii
                    <select value={nextPlayer} onChange={event => setNextPlayer(event.target.value === 'b' ? 'b' : 'w')}>
                      <option value="w">Białe</option>
                      <option value="b">Czarne</option>
                    </select>
                  </label>
                  <button type="button" onClick={() => {
                    setSettingsOpen(false);
                    setWorkspace(current => ({
                      ...current, sparring: freshStudy(), player: nextPlayer, revision: current.revision + 1,
                    }));
                  }}>
                    Nowa partia
                  </button>
                </div>
                <label className="checkbox-setting">
                  <input type="checkbox" checked={hints} onChange={event => {
                    const hints = event.target.checked;
                    setWorkspace(current => ({ ...current, hints, revision: current.revision + 1 }));
                  }} />
                  Podpowiedzi
                </label>
              </fieldset>
            ) : (
              <fieldset className="setting-group">
                <legend>Plansza</legend>
                <div className="setting-grid">
                  <label className="checkbox-setting">
                    <input
                      type="checkbox"
                      checked={evaluationVisible}
                      onChange={event => setEvaluationVisible(event.target.checked)}
                    />
                    Pasek oceny
                  </label>
                  <button type="button" className="secondary rotate-board" onClick={() => setAnalysisFlipped(flipped => !flipped)}>
                    Obróć planszę
                  </button>
                </div>
              </fieldset>
            )}
          </div>
          {webBuild && <CodeAndLicenses />}
        </aside>

        <section className="playing-area" aria-label="Szachownica" data-evaluation={showEvaluation}>
          <div className="board-heading">
            <div className="turn" data-turn={turn}>
              <span aria-hidden="true" />
              {positionStatus}
            </div>
            {isSparring ? (
              <button
                type="button"
                className="secondary"
                title="Strzałka w lewo"
                disabled={!previousDecision(workspace)}
                onClick={() => setWorkspace(undo)}
              >
                <span aria-hidden="true">←</span> Cofnij
              </button>
            ) : (
              <div className="line-controls" role="group" aria-label="Nawigacja po linii">
                {lineControls.map(({ target, icon, label }) => {
                  const node = lineTarget(study, target);
                  return (
                    <button
                      type="button"
                      className="secondary"
                      key={target}
                      aria-label={label}
                      title={label}
                      disabled={!node || node === active}
                      onClick={() => navigateAnalysis(target)}
                    >
                      <span aria-hidden="true">{icon}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="board-and-evaluation">
            {showEvaluation && (
              <EvaluationBar
                score={lines.find(line => line.rank === 1)?.score}
                turn={turn}
                flipped={boardFlipped}
                outcome={chess.isCheckmate() ? (turn === 'w' ? 'b' : 'w') : gameOver ? 'draw' : undefined}
              />
            )}
            <div className="board-frame">
              <div className="chessboard" ref={board} />
              {promotion.length > 0 && (
                <div className="promotion" role="group" aria-label="Wybierz figurę do promocji">
                  <strong>Promocja pionka</strong>
                  <div>
                    {promotion.map((move, index) => (
                      <button
                        type="button"
                        key={move.lan}
                        autoFocus={index === 0}
                        onClick={() => setWorkspace(current => {
                          const study = current[current.mode];
                          return study.promotion.includes(move) ? updateStudy(current, addMove(study, move)) : current;
                        })}
                      >
                        {promotionNames[move.promotion ?? '']}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setWorkspace(current => updateStudy(current, { ...current[current.mode], promotion: [] }))}
                  >
                    Anuluj
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="sidebar">
          <section className="panel coach-panel" aria-label="Trener">
            <div className="coach-heading">
              <span className="coach-avatar" aria-hidden="true">
                {missingAvatar === coach ? coachName[0] : (
                  <img key={coach} src={import.meta.env.BASE_URL + coachImage} alt="" onError={() => setMissingAvatar(coach)} />
                )}
              </span>
              <div className="coach-identity">
                <p className="coach-kicker">Trener</p>
                <h2>{coachName}</h2>
                {isSparring && <p>Gra z arcymistrzem · Stockfish</p>}
                <button
                  type="button"
                  className="secondary ask-hint"
                  aria-expanded={adviceVisible}
                  onClick={() => setAdviceKey(positionKey)}
                >
                  Poproś o wskazówki
                </button>
              </div>
            </div>
            {adviceVisible && advice && <p className="coach-bubble" role="status">{advice}</p>}
            <div className="coach-body">
              <div className="coach-message">
                <span className="engine-status" role="status">
                  {coachStatus}
                  {hint && <> <strong aria-label={moveLabel(hint.san)}><MoveText san={hint.san} /></strong></>}
                </span>
                {hint && (
                  <button className="secondary" type="button" onClick={() => { void readHint(); }} disabled={!engine?.recordedHint && !engine?.speakHint}>
                    Odczytaj
                  </button>
                )}
                {!gameOver && requestFailed && (
                  <button className="secondary" type="button" onClick={() => setWorkspace(current => ({
                    ...current,
                    revision: current.revision + 1,
                  }))}>
                    Ponów
                  </button>
                )}
              </div>
              {hint && speechFailure === revision && <p className="engine-status" role="status">Odczyt jest niedostępny.</p>}
            </div>
          </section>

          {!isSparring && (
            <details
              className="panel engine-panel"
              open={enginePanelOpen}
              onToggle={event => setEnginePanelOpen(event.currentTarget.open)}
            >
              <summary>
                <strong>Stockfish</strong>
                <span>{!gameOver && lines.length ? `Głębokość ${lines[0].depth}` : 'Warianty'}</span>
              </summary>
              {!gameOver && lines.length > 0 ? (
                <ol className="variations" aria-label="Warianty silnika">
                  {lines.map(engineLine => {
                    const tokens = variationTokens(engineLine.san, turn, chess.moveNumber());
                    const readable = tokens.map(token => `${token.prefix ? `${token.prefix} ` : ''}${polishSan(token.san)}`).join(' ');
                    const spoken = tokens.map(token => `${token.prefix ? `${token.prefix} ` : ''}${moveLabel(token.san)}`).join(' ');
                    const score = formatScore(engineLine.score, turn);
                    return (
                      <li key={engineLine.rank} aria-label={`${score}. ${spoken}`} title={readable}>
                        <span className="pv-line" aria-hidden="true">
                          <span className="score">{score}</span>
                          <span className="pv-moves">
                            {tokens.map((token, index) => (
                              <span className="pv-move" key={`${engineLine.rank}-${index}`}>
                                {token.prefix && <span className="pv-prefix">{token.prefix}</span>}
                                <MoveText san={token.san} />
                              </span>
                            ))}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="engine-empty">Brak wariantów dla tej pozycji.</p>
              )}
            </details>
          )}

          <section className="panel move-panel" aria-labelledby="moves-title">
            <div className="panel-heading">
              <h2 id="moves-title">Zapis partii</h2>
            </div>
            <div className="history" ref={scoreFrame}>
              {isSparring ? (
                <span className="recorded-move history-start" aria-current={active.ply === 0 ? 'step' : undefined}>Początek partii</span>
              ) : (
                <button
                  type="button"
                  className="history-start"
                  aria-current={active.ply === 0 ? 'step' : undefined}
                  onClick={() => selectNode(nodes[0])}
                >
                  Początek partii
                </button>
              )}
              <div className="score-sheet">
                {moveColumns.map(column => (
                  <ol className="score-column" key={column[0]?.white?.id ?? column[0]?.black?.id ?? 'empty'}>
                    {column.map(row => (
                      <li key={`${row.white?.id ?? 'w'}-${row.black?.id ?? 'b'}`}>
                        <span className="move-number" aria-hidden="true">{row.number}.</span>
                        {halfMove(row.white, `${row.number}.`)}
                        {halfMove(row.black, `${row.number}…`)}
                      </li>
                    ))}
                  </ol>
                ))}
              </div>
              {!isSparring && branches.length > 0 && (
                <div className="branches">
                  <h3>Odnogi</h3>
                  <ul>
                    {branches.map(node => {
                      if (!node.move) return null;
                      const marker = `${Math.ceil(node.ply / 2)}${node.ply % 2 === 1 ? '.' : '…'}`;
                      return (
                        <li key={node.id}>
                          <button type="button" aria-label={`${marker} ${moveLabel(node.move.san)}`} onClick={() => selectNode(node)}>
                            <span className="move-number" aria-hidden="true">{marker}</span>
                            <MoveText san={node.move.san} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>}
    </main>
  );
}

async function renderApp() {
  if (import.meta.env.MODE === 'web') {
    const { createWebCoach } = await import('./web-coach');
    window.chessCoach = createWebCoach();
  }
  createRoot(document.getElementById('root')!).render(<App />);
}

void renderApp();
