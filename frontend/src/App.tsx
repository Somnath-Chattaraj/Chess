import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Flag,
  FlipVertical2,
  Globe2,
  Handshake,
  History,
  Link2,
  Loader2,
  LogOut,
  Play,
  Plus,
  ShieldCheck,
  Swords,
  Undo2,
  Users,
  X,
} from 'lucide-react';

type User = { id: string; username: string };
type Game = {
  id: string;
  white: User;
  black: User | null;
  minutes: number;
  increment: number;
  status: 'waiting' | 'active' | 'finished';
  fen: string;
  pgn: string;
  moves: string[];
  clocks: { w: number; b: number };
  updatedAt: number;
  result: string | null;
  reason: string | null;
  drawOffer: string | null;
  room: string | null;
};
type Mode = 'online' | 'local';
const controls = [
  { minutes: 3, increment: 2, name: 'Blitz', detail: '3 + 2' },
  { minutes: 5, increment: 0, name: 'Blitz', detail: '5 + 0' },
  { minutes: 10, increment: 0, name: 'Rapid', detail: '10 + 0' },
];
const initial = new Chess();
async function request(path: string, body?: unknown) {
  const res = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...(body !== undefined
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Request failed.');
  return data;
}
const clock = (ms: number) => {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
function download(pgn: string) {
  const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chess-club.pgn';
  a.click();
  URL.revokeObjectURL(url);
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [mode, setMode] = useState<Mode>('online'),
    [game, setGame] = useState<Game | null>(null);
  const [local, setLocal] = useState(initial.pgn()),
    [localStarted, setLocalStarted] = useState(false),
    [selection, setSelection] = useState<Square | null>(null),
    [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [control, setControl] = useState(2),
    [queued, setQueued] = useState(false),
    [connection, setConnection] = useState('offline'),
    [flipped, setFlipped] = useState(false),
    [room, setRoom] = useState(new URLSearchParams(location.search).get('room') ?? '');
  const [auth, setAuth] = useState<'login' | 'signup' | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [page, setPage] = useState<'play' | 'history'>('play'),
    [games, setGames] = useState<Game[]>([]),
    [historyBusy, setHistoryBusy] = useState(false);
  const [review, setReview] = useState<number | null>(null),
    [guide, setGuide] = useState(false),
    [confirm, setConfirm] = useState(false),
    [copied, setCopied] = useState(false),
    [now, setNow] = useState(Date.now());
  const ws = useRef<WebSocket | null>(null);
  const moveEnd = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    request('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setNotice('Online service unavailable. You can still play locally.'));
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!user) {
      setConnection('offline');
      return;
    }
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    let socket: WebSocket;
    function connect() {
      setConnection('connecting');
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
      );
      ws.current = socket;
      socket.onopen = () => setConnection('connected');
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'state') {
          setGame(data.game);
          setMode('online');
          setQueued(false);
        }
        if (data.type === 'ready') {
          setQueued(false);
          setGame(null);
        }
        if (data.type === 'queued') setQueued(true);
        if (data.type === 'error') setNotice(data.message);
      };
      socket.onclose = (event) => {
        setConnection('offline');
        setQueued(false);
        if (event.code === 4003) {
          setUser(null);
          setGame(null);
          setNotice('Your session expired. Sign in again to resume.');
        } else if (!stopped && event.code !== 4001) retry = setTimeout(connect, 2000);
        else if (event.code === 4001)
          setNotice('This account connected in another tab. Reload here to continue.');
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
      ws.current = null;
    };
  }, [user?.id]);
  useEffect(() => {
    if (page === 'history' && user) {
      setHistoryBusy(true);
      request('/games')
        .then((data) => setGames(data.games))
        .catch((error) => setNotice(error.message))
        .finally(() => setHistoryBusy(false));
    }
  }, [page, user?.id]);
  useEffect(() => {
    setSelection(null);
    setReview(null);
  }, [game?.fen, game?.id]);
  const chess = useMemo(() => {
    const c = new Chess();
    const pgn = mode === 'online' ? game?.pgn : local;
    if (pgn) c.loadPgn(pgn);
    return c;
  }, [mode, game?.pgn, local]);
  const moves = chess.history();
  const displayed = useMemo(() => {
    if (review === null) return chess;
    const c = new Chess();
    for (const move of moves.slice(0, review)) c.move(move);
    return c;
  }, [chess, review]);
  useEffect(() => {
    const list = moveEnd.current?.parentElement;
    if (list) list.scrollTop = list.scrollHeight;
  }, [moves.length]);
  const color = game?.white.id === user?.id ? 'w' : 'b';
  const orientation = flipped
    ? mode === 'online' && game
      ? color === 'w'
        ? 'b'
        : 'w'
      : 'b'
    : mode === 'online' && game
      ? color
      : 'w';
  const onlineActive = mode === 'online' && game?.status === 'active';
  const canMove =
    review === null &&
    (mode === 'local'
      ? localStarted && !chess.isGameOver()
      : onlineActive && chess.turn() === color && connection === 'connected');
  const legal = selection && canMove ? chess.moves({ square: selection, verbose: true }) : [];
  const lastMove = displayed.history({ verbose: true }).at(-1);
  const localResult = chess.isCheckmate()
    ? `${chess.turn() === 'w' ? 'Black' : 'White'} wins by checkmate`
    : chess.isGameOver()
      ? 'Game drawn'
      : null;
  const status =
    mode === 'local'
      ? (localResult ??
        (localStarted
          ? `${chess.turn() === 'w' ? 'White' : 'Black'} to move${chess.isCheck() ? ' · Check' : ''}`
          : 'Ready when you are'))
      : game?.status === 'finished'
        ? `${game.result} · ${game.reason}`
        : game?.status === 'waiting'
          ? 'Waiting for your friend'
          : onlineActive
            ? `${chess.turn() === color ? 'Your turn' : 'Opponent’s turn'}${chess.isCheck() ? ' · Check' : ''}`
            : queued
              ? 'Finding your opponent…'
              : 'A good game starts here';
  function send(data: unknown) {
    if (!user) {
      setAuth('login');
      return;
    }
    if (ws.current?.readyState !== WebSocket.OPEN) {
      setNotice('Waiting for the game server. Please try again shortly.');
      return;
    }
    ws.current.send(JSON.stringify(data));
  }
  function changeMode(next: Mode) {
    if (onlineActive || queued || game?.status === 'waiting') {
      setNotice('Finish or cancel your online game before switching modes.');
      return;
    }
    setMode(next);
    setSelection(null);
    setReview(null);
  }
  function makeMove(from: Square, to: Square, piece = 'q') {
    if (mode === 'online') send({ type: 'move', from, to, promotion: piece });
    else {
      const c = new Chess();
      if (local) c.loadPgn(local);
      c.move({ from, to, promotion: piece });
      setLocal(c.pgn());
    }
    setSelection(null);
    setPromotion(null);
  }
  function select(square: Square) {
    if (!canMove) return;
    const piece = chess.get(square);
    if (selection) {
      const target = legal.find((m) => m.to === square);
      if (target) {
        if (target.isPromotion()) {
          setPromotion({ from: selection, to: square });
          return;
        }
        makeMove(selection, square);
        return;
      }
    }
    setSelection(piece?.color === chess.turn() ? square : null);
  }
  function resetLocal() {
    setLocal('');
    setLocalStarted(true);
    setReview(null);
    setSelection(null);
  }
  async function copyRoom() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/?room=${game?.room}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice(`Room code: ${game?.room}. Copy it from the panel.`);
    }
  }
  function openSaved(saved: Game) {
    if (game?.status === 'active') {
      setNotice('Finish your active game before reviewing another game.');
      return;
    }
    setGame(saved);
    setMode('online');
    setReview(saved.moves.length);
    setPage('play');
  }
  const topPlayer =
    mode === 'local'
      ? orientation === 'w'
        ? 'Black pieces'
        : 'White pieces'
      : game
        ? orientation === 'w'
          ? (game.black?.username ?? 'Waiting for a friend')
          : game.white.username
        : 'Your next opponent';
  const bottomPlayer =
    mode === 'local'
      ? orientation === 'w'
        ? 'White pieces'
        : 'Black pieces'
      : game
        ? orientation === 'w'
          ? game.white.username
          : (game.black?.username ?? 'You')
        : (user?.username ?? 'You');
  function displayClock(side: 'w' | 'b') {
    if (mode === 'local') return '∞';
    if (!game) return clock(controls[control].minutes * 60000);
    let value = game.clocks[side];
    if (game.status === 'active' && chess.turn() === side)
      value -= Math.max(0, now - game.updatedAt);
    return clock(value);
  }
  return (
    <div className="app-shell">
      <aside className="rail">
        <a href="/" className="mark" aria-label="Chess Club home">
          ♞
        </a>
        <div className="rail-links">
          <button
            className={page === 'play' ? 'active' : ''}
            aria-label="Play"
            title="Play"
            onClick={() => setPage('play')}
          >
            <Swords />
          </button>
          <button
            className={page === 'history' ? 'active' : ''}
            aria-label="Game history"
            title="Game history"
            onClick={() => setPage('history')}
          >
            <History />
          </button>
          <button aria-label="How to play" title="How to play" onClick={() => setGuide(true)}>
            <ShieldCheck />
          </button>
        </div>
        <span className="rail-bottom">CC / 01</span>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a className="wordmark" href="/">
            chess<span>club</span>
            <small>MAKE YOUR MOVE.</small>
          </a>
          <div className="top-actions">
            <span className="connection">
              <i className={connection === 'connected' ? 'live' : ''} />
              {connection === 'connected'
                ? 'Connected'
                : user
                  ? 'Reconnecting'
                  : 'Play at your pace'}
            </span>
            {user ? (
              <>
                <span className="account-avatar">{user.username[0].toUpperCase()}</span>
                <span className="username">{user.username}</span>
                <button
                  className="icon-button"
                  title="Sign out"
                  aria-label="Sign out"
                  onClick={() => {
                    if (onlineActive) {
                      setNotice('Finish your active game before signing out.');
                      return;
                    }
                    void request('/auth/logout', {})
                      .then(() => {
                        setUser(null);
                        setGame(null);
                        setQueued(false);
                      })
                      .catch((error) => setNotice(error.message));
                  }}
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <button className="outline small" onClick={() => setAuth('login')}>
                Sign in <ArrowRight size={15} />
              </button>
            )}
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> THE CLUB IS OPEN
              </div>
              <h1>{page === 'play' ? 'Your next move.' : 'Every game, a lesson.'}</h1>
              <p>
                {page === 'play'
                  ? 'Find your focus. Meet your match. Enjoy the game.'
                  : 'Revisit your positions and take something into the next game.'}
              </p>
            </div>
            <div className="heading-note">
              <span>64 squares.</span>
              <br />
              Endless possibilities.
            </div>
          </div>
          {page === 'history' ? (
            <section className="history-panel panel">
              <div className="panel-heading">
                <h2>Your game archive</h2>
                <span>Latest 50 games</span>
              </div>
              {!user ? (
                <div className="empty">
                  <History />
                  <h3>Your story starts with a game.</h3>
                  <p>Sign in to save and revisit your online games.</p>
                  <button className="primary" onClick={() => setAuth('login')}>
                    Sign in
                  </button>
                </div>
              ) : historyBusy ? (
                <div className="empty">
                  <Loader2 className="spin" />
                  Loading games…
                </div>
              ) : games.length === 0 ? (
                <div className="empty">
                  <Swords />
                  <h3>A clean scoresheet.</h3>
                  <p>Completed online games will appear here.</p>
                  <button className="primary" onClick={() => setPage('play')}>
                    Play your first game
                  </button>
                </div>
              ) : (
                <div className="archive">
                  {games.map((g) => (
                    <button key={g.id} onClick={() => openSaved(g)}>
                      <span className="archive-icon">♞</span>
                      <span>
                        <strong>
                          {g.white.username} <em>vs</em> {g.black?.username}
                        </strong>
                        <small>
                          {g.minutes} + {g.increment} · {g.moves.length} half-moves · {g.reason}
                        </small>
                      </span>
                      <b>{g.result}</b>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <div className="play-layout">
              <section className="board-section" aria-label="Chess game">
                <div className="player-strip">
                  <div className="player">
                    <span className="player-avatar dark-avatar">♟</span>
                    <div>
                      <strong>{topPlayer}</strong>
                      <small>
                        {onlineActive
                          ? 'Live game'
                          : mode === 'local'
                            ? 'Pass & play'
                            : 'The other side of the board'}
                      </small>
                    </div>
                  </div>
                  <div
                    className={`clock ${onlineActive && chess.turn() !== orientation ? 'ticking' : ''}`}
                  >
                    <Clock3 size={17} />
                    {displayClock(orientation === 'w' ? 'b' : 'w')}
                  </div>
                </div>
                <div className="board-frame">
                  <div
                    className="chessboard"
                    role="group"
                    aria-label="Chessboard. Select a piece, then a highlighted destination."
                  >
                    {Array.from({ length: 64 }, (_, i) => {
                      const row = Math.floor(i / 8),
                        col = i % 8;
                      const file = orientation === 'w' ? col : 7 - col;
                      const rank = orientation === 'w' ? 8 - row : row + 1;
                      const square = `${String.fromCharCode(97 + file)}${rank}` as Square;
                      const piece = displayed.get(square);
                      const target = legal.some((m) => m.to === square);
                      return (
                        <button
                          key={square}
                          className={`square ${(file + rank) % 2 === 0 ? 'dark' : 'light'} ${selection === square ? 'selected' : ''} ${lastMove && (lastMove.from === square || lastMove.to === square) ? 'last-move' : ''} ${piece?.type === 'k' && piece.color === displayed.turn() && displayed.isCheck() ? 'in-check' : ''}`}
                          aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${{ p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king' }[piece.type]}` : ''}${target ? ' legal destination' : ''}`}
                          aria-pressed={selection === square}
                          onClick={() => select(square)}
                        >
                          {col === 0 && <span className="rank-label">{rank}</span>}
                          {row === 7 && (
                            <span className="file-label">{String.fromCharCode(97 + file)}</span>
                          )}
                          {piece && (
                            <img
                              draggable={false}
                              className={`piece-${piece.color}`}
                              src={`/${piece.color === 'b' ? piece.type : piece.type.toUpperCase() + ' copy'}.png`}
                              alt=""
                            />
                          )}
                          {target && <span className={piece ? 'capture-hint' : 'move-hint'} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="player-strip bottom-player">
                  <div className="player">
                    <span className="player-avatar light-avatar">♙</span>
                    <div>
                      <strong>
                        {bottomPlayer}{' '}
                        {user && mode === 'online' && <span className="you-label">YOU</span>}
                      </strong>
                      <small>
                        {mode === 'local'
                          ? 'Local game · no clock'
                          : onlineActive
                            ? `${game.minutes} + ${game.increment} ${game.minutes === 10 ? 'Rapid' : 'Blitz'}`
                            : 'A fresh perspective'}
                      </small>
                    </div>
                  </div>
                  <div
                    className={`clock ${onlineActive && chess.turn() === orientation ? 'ticking' : ''}`}
                  >
                    <Clock3 size={17} />
                    {displayClock(orientation)}
                  </div>
                </div>
                <div className="board-toolbar">
                  <span>
                    <i
                      className={
                        onlineActive || localStarted ? 'status-dot active-dot' : 'status-dot'
                      }
                    />
                    {review !== null ? `Reviewing move ${Math.ceil(review / 2)}` : status}
                  </span>
                  <div>
                    <button
                      className="icon-button"
                      title="Flip board"
                      aria-label="Flip board"
                      onClick={() => setFlipped(!flipped)}
                    >
                      <FlipVertical2 size={17} />
                    </button>
                    <button
                      className="icon-button"
                      title="Download PGN"
                      aria-label="Download PGN"
                      disabled={!moves.length}
                      onClick={() => download(chess.pgn())}
                    >
                      <ArrowDownToLine size={18} />
                    </button>
                  </div>
                </div>
              </section>
              <aside className="game-sidebar">
                <section className="panel setup-panel">
                  <div className="panel-heading">
                    <div className="eyebrow muted">A SEAT AT THE BOARD</div>
                    <span className="tiny-knight">♞</span>
                  </div>
                  <h2>Let’s play.</h2>
                  <div className="mode-tabs">
                    <button
                      className={mode === 'online' ? 'selected-tab' : ''}
                      onClick={() => changeMode('online')}
                    >
                      <Globe2 size={16} />
                      Online
                    </button>
                    <button
                      className={mode === 'local' ? 'selected-tab' : ''}
                      onClick={() => changeMode('local')}
                    >
                      <Users size={16} />
                      Pass & play
                    </button>
                  </div>
                  {mode === 'online' ? (
                    <>
                      {!onlineActive && game?.status !== 'waiting' && !queued ? (
                        <>
                          <label className="section-label">TIME CONTROL</label>
                          <div className="time-controls">
                            {controls.map((c, i) => (
                              <button
                                key={c.detail}
                                className={i === control ? 'chosen' : ''}
                                onClick={() => setControl(i)}
                              >
                                <strong>{c.detail}</strong>
                                <small>{c.name}</small>
                              </button>
                            ))}
                          </div>
                          <button
                            className="primary large"
                            onClick={() => send({ type: 'queue', ...controls[control] })}
                          >
                            <Swords size={19} />
                            Find a match <ArrowRight size={17} />
                          </button>
                          <div className="divider">
                            <span>or bring a friend</span>
                          </div>
                          <button
                            className="outline full"
                            onClick={() => send({ type: 'create', ...controls[control] })}
                          >
                            <Link2 size={16} />
                            Create a private game <Plus size={16} />
                          </button>
                          <form
                            className="join-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              send({ type: 'join', room: room.trim().toLowerCase() });
                            }}
                          >
                            <input
                              aria-label="Private room code"
                              placeholder="Enter room code"
                              value={room}
                              minLength={8}
                              maxLength={8}
                              required
                              pattern="[a-fA-F0-9]{8}"
                              onChange={(e) => setRoom(e.target.value)}
                            />
                            <button
                              title="Join private game"
                              aria-label="Join private game"
                              className="icon-button"
                              type="submit"
                            >
                              <ArrowRight size={19} />
                            </button>
                          </form>
                        </>
                      ) : queued ? (
                        <div className="waiting">
                          <Loader2 className="spin" size={30} />
                          <h3>Finding your match</h3>
                          <p>
                            Waiting for another player with the same time control. Open a second
                            account to try it out.
                          </p>
                          <button className="outline full" onClick={() => send({ type: 'cancel' })}>
                            Cancel search
                          </button>
                        </div>
                      ) : game?.status === 'waiting' ? (
                        <div className="waiting">
                          <Link2 size={30} />
                          <h3>Good games are better shared.</h3>
                          <p>Send this code or invite link to a friend.</p>
                          <code className="room-code">{game.room}</code>
                          <button className="primary full" onClick={() => void copyRoom()}>
                            {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
                            {copied ? 'Link copied' : 'Copy invite link'}
                          </button>
                          <button className="text-button" onClick={() => send({ type: 'cancel' })}>
                            Cancel private game
                          </button>
                        </div>
                      ) : (
                        <div className="active-controls">
                          <div className="live-label">
                            <i /> GAME IN PROGRESS
                          </div>
                          <h3>
                            {chess.turn() === color ? 'Take your time.' : 'Stay one move ahead.'}
                          </h3>
                          <p>
                            {chess.turn() === color
                              ? 'Select a piece to see its legal moves.'
                              : 'Your opponent is considering their move.'}
                          </p>
                          {game?.drawOffer && game.drawOffer !== user?.id ? (
                            <div className="draw-offer">
                              <p>Your opponent offered a draw.</p>
                              <button
                                className="primary full"
                                onClick={() => send({ type: 'accept_draw' })}
                              >
                                Accept draw
                              </button>
                              <button
                                className="text-button"
                                onClick={() => send({ type: 'decline_draw' })}
                              >
                                Keep playing
                              </button>
                            </div>
                          ) : (
                            <button
                              className="outline full"
                              disabled={game?.drawOffer === user?.id}
                              onClick={() => send({ type: 'offer_draw' })}
                            >
                              <Handshake size={17} />
                              {game?.drawOffer ? 'Draw offered' : 'Offer a draw'}
                            </button>
                          )}
                          <button className="text-button danger" onClick={() => setConfirm(true)}>
                            <Flag size={15} />
                            Resign game
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="local-setup">
                      <div className="local-illustration">
                        ♘ <span>×</span> ♞
                      </div>
                      <h3>One board. Two minds.</h3>
                      <p>
                        Share your screen with a friend. Play both sides at your own pace, without a
                        clock.
                      </p>
                      <button
                        className="primary full"
                        onClick={() => {
                          if (localStarted && moves.length && !chess.isGameOver()) setConfirm(true);
                          else resetLocal();
                        }}
                      >
                        <Play size={17} />
                        {localStarted ? 'Start a fresh game' : 'Start local game'}
                      </button>
                      <button
                        className="text-button"
                        disabled={!moves.length || review !== null}
                        onClick={() => {
                          const c = new Chess();
                          c.loadPgn(local);
                          c.undo();
                          setLocal(c.pgn());
                          setSelection(null);
                        }}
                      >
                        <Undo2 size={16} />
                        Take back a move
                      </button>
                    </div>
                  )}
                  <div className="panel-footnote">
                    <ShieldCheck size={14} />
                    {mode === 'local'
                      ? 'No account needed. Just a friend.'
                      : 'Fair turns. Server-validated moves.'}
                  </div>
                </section>
                <section className="panel notation-panel">
                  <div className="panel-heading">
                    <h3>Scoresheet</h3>
                    <span>
                      {moves.length
                        ? `${Math.ceil(moves.length / 2)} ${moves.length <= 2 ? 'move' : 'moves'}`
                        : 'A clean slate'}
                    </span>
                  </div>
                  <div className="notation-columns">
                    <span>#</span>
                    <span>White</span>
                    <span>Black</span>
                  </div>
                  <div className="move-list">
                    {moves.length === 0 ? (
                      <div className="notation-empty">
                        <span>1.</span>
                        <p>The first move is yours to make.</p>
                      </div>
                    ) : (
                      Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
                        <div className="move-row" key={i}>
                          <span>{i + 1}.</span>
                          {[0, 1].map((offset) => (
                            <button
                              key={offset}
                              disabled={!moves[i * 2 + offset]}
                              className={review === i * 2 + offset + 1 ? 'reviewed' : ''}
                              onClick={() => {
                                setReview(i * 2 + offset + 1);
                                setSelection(null);
                              }}
                            >
                              {moves[i * 2 + offset] ?? '—'}
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                    <div ref={moveEnd} />
                  </div>
                  <div className="review-controls">
                    <button
                      aria-label="Previous move"
                      title="Previous move"
                      className="icon-button"
                      disabled={!moves.length || review === 0}
                      onClick={() => setReview(Math.max(0, (review ?? moves.length) - 1))}
                    >
                      <ArrowLeft size={17} />
                    </button>
                    <button
                      className="text-button"
                      disabled={review === null}
                      onClick={() => setReview(null)}
                    >
                      Back to game
                    </button>
                    <button
                      aria-label="Next move"
                      title="Next move"
                      className="icon-button"
                      disabled={review === null || review >= moves.length}
                      onClick={() => setReview(Math.min(moves.length, (review ?? 0) + 1))}
                    >
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </section>
              </aside>
            </div>
          )}
          <footer>
            <span>
              ♞ <strong>A little focus goes a long way.</strong>
            </span>
            <span>Made for the love of the game.</span>
            <button className="text-button" onClick={() => setGuide(true)}>
              The essentials <ArrowRight size={14} />
            </button>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {auth && (
        <Modal
          title={auth === 'login' ? 'Welcome back.' : 'Your seat is waiting.'}
          onClose={() => setAuth(null)}
        >
          <p className="modal-description">
            {auth === 'login'
              ? 'Sign in to play online and revisit your games.'
              : 'Join the club. Find an opponent. Make your move.'}
          </p>
          <form
            className="auth-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const data = new FormData(e.currentTarget);
              try {
                const result = await request(`/auth/${auth}`, Object.fromEntries(data));
                setUser(result.user);
                setAuth(null);
                setNotice('You’re signed in. Choose a match or join a friend.');
              } catch (error) {
                setNotice((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Username
              <input
                name="username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={24}
                pattern="[A-Za-z0-9_]+"
                placeholder="your_next_move"
              />
            </label>
            {auth === 'signup' && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                />
              </label>
            )}
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={auth === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={10}
                maxLength={72}
                placeholder="At least 10 characters"
              />
            </label>
            <button className="primary full" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : auth === 'login' ? (
                'Sign in'
              ) : (
                'Create account'
              )}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="text-button full"
            onClick={() => setAuth(auth === 'login' ? 'signup' : 'login')}
          >
            {auth === 'login' ? 'New to the club? Create an account' : 'Already a member? Sign in'}
          </button>
        </Modal>
      )}
      {promotion && (
        <Modal title="A well-earned promotion." onClose={() => setPromotion(null)}>
          <p className="modal-description">Choose your new piece.</p>
          <div className="promotion-options">
            {(['q', 'r', 'b', 'n'] as const).map((p) => (
              <button
                key={p}
                aria-label={`Promote to ${{ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[p]}`}
                onClick={() => makeMove(promotion.from, promotion.to, p)}
              >
                <img src={`/${chess.turn() === 'b' ? p : p.toUpperCase() + ' copy'}.png`} alt={p} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={mode === 'online' ? 'Resign this game?' : 'Start a fresh game?'}
          onClose={() => setConfirm(false)}
        >
          <p className="modal-description">
            {mode === 'online'
              ? 'Your opponent will win by resignation. The game will be saved in your history.'
              : 'Your current local game will be cleared. Download the PGN first if you want to keep it.'}
          </p>
          <button
            className="primary full"
            onClick={() => {
              if (mode === 'online') send({ type: 'resign' });
              else resetLocal();
              setConfirm(false);
            }}
          >
            {mode === 'online' ? 'Resign game' : 'Start new game'}
          </button>
        </Modal>
      )}
      {guide && (
        <Modal title="The essentials." onClose={() => setGuide(false)}>
          <div className="guide">
            <p>
              <strong>Make a move</strong>Select a piece, then one of its highlighted legal
              destinations. You can also use Tab and Enter. Castling, en passant, check, and
              promotion follow standard chess rules.
            </p>
            <p>
              <strong>Find your match</strong>Sign in, choose a time control, and find a match. Or
              create a private game and share its invite link with a friend.
            </p>
            <p>
              <strong>Time matters</strong>3 + 2 means three minutes per player, with two seconds
              added after each move. Online clocks keep running if you disconnect. Reconnect with
              the same account to resume.
            </p>
            <p>
              <strong>Keep learning</strong>Click the scoresheet to review a position, or download
              your PGN. Local games stay in this tab; completed online games are saved to your
              account.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const focusable = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>('button,input,a,[tabindex="0"]') ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <button className="modal-close icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={21} />
        </button>
        <span className="modal-knight">♞</span>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
