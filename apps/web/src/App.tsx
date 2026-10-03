import { TICK_RATE } from '@curvey/sim';
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Client, type Room } from '@colyseus/sdk';
import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  Copy,
  Crown,
  ExternalLink,
  Link,
  LogOut,
  MessageSquare,
  Plus,
  Settings2,
  Shield,
  VolumeX,
  X,
} from 'lucide-react';
import {
  COLORS,
  PROTOCOL_VERSION,
  type Baseline,
  type GameView,
  type GeometryBatch,
  type RoomView,
} from '@curvey/protocol';
import { ArenaPresentation } from './presentation';
import type { Steering } from '@curvey/sim';
import { ArenaPreview } from './ArenaPreview';
import './diagnostics';

const Arena = lazy(() => import('./Arena').then((module) => ({ default: module.Arena })));

const endpoint =
  import.meta.env.VITE_SERVER_URL ||
  `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.hostname}${import.meta.env.DEV ? ':2567' : location.port ? `:${location.port}` : ''}`;
const client = new Client(endpoint);
const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preferences are optional */
  }
};
const inviteId = (input: string) => {
  try {
    return new URL(input).searchParams.get('room') ?? '';
  } catch {
    return input.trim();
  }
};
const initialInvite = new URLSearchParams(location.search).get('room') ?? '';

function Mark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M5 25V13a7 7 0 0 1 14 0v7a4 4 0 0 0 8 0V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function App() {
  const [name, setName] = useState(() => read('curvey.name', ''));
  const [color, setColor] = useState(() => read('curvey.color', COLORS[0]));
  const [invite, setInvite] = useState(initialInvite);
  const [joinOpen, setJoinOpen] = useState(Boolean(initialInvite));
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [view, setView] = useState<RoomView | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const data = useRef(new ArenaPresentation());
  const [busy, setBusy] = useState(false),
    [problem, setProblem] = useState('');
  const [connected, setConnected] = useState(true),
    [copied, setCopied] = useState(false);
  const [message, setMessage] = useState(''),
    [muted, setMuted] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leftKey, setLeftKey] = useState(() => read('curvey.left', 'ArrowLeft'));
  const [rightKey, setRightKey] = useState(() => read('curvey.right', 'ArrowRight'));
  const [binding, setBinding] = useState<'left' | 'right' | null>(null);
  const [capacity, setCapacity] = useState(8),
    [target, setTarget] = useState(10);
  const chatEnd = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const seq = useRef(0);
  const hudStamp = useRef(0);
  const hudState = useRef('');

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [view?.chat.length]);
  useEffect(() => {
    if (view) {
      setCapacity(view.capacity);
      setTarget(view.target);
    }
  }, [view?.capacity, view?.target]);
  useEffect(
    () => () => {
      void roomRef.current?.leave();
    },
    [],
  );
  useEffect(() => {
    if (!room) return;
    const ping = () => {
      if (data.current.connected) room.send('ping', performance.now());
    };
    ping();
    const timer = setInterval(ping, 1000);
    return () => clearInterval(timer);
  }, [room]);
  useEffect(() => {
    if (!binding) return;
    const bind = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === 'Escape') {
        setBinding(null);
        return;
      }
      if (['Tab', 'Enter', 'Space'].includes(e.code)) {
        setProblem('Choose a steering key other than Tab, Enter, or Space.');
        return;
      }
      if (e.code === (binding === 'left' ? rightKey : leftKey)) {
        setProblem('Choose a different key for each direction.');
        return;
      }
      if (binding === 'left') {
        setLeftKey(e.code);
        save('curvey.left', e.code);
      } else {
        setRightKey(e.code);
        save('curvey.right', e.code);
      }
      setBinding(null);
      setProblem('');
    };
    window.addEventListener('keydown', bind);
    return () => window.removeEventListener('keydown', bind);
  }, [binding, leftKey, rightKey]);
  useEffect(() => {
    if (!room) return;
    const keys = new Set<string>();
    const send = () => {
      const steer = (Number(keys.has(rightKey)) - Number(keys.has(leftKey))) as Steering;
      const command = data.current.command(seq.current++, steer, performance.now());
      if (command) room.send('input', command);
    };
    const down = (e: KeyboardEvent) => {
      if (
        binding ||
        settingsOpen ||
        viewRef.current?.phase !== 'playing' ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === leftKey || e.code === rightKey) {
        e.preventDefault();
        if (keys.has(e.code)) return;
        keys.add(e.code);
        send();
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.code);
      if (e.code === leftKey || e.code === rightKey) send();
    };
    const clear = () => {
      keys.clear();
      send();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    // Key transitions send immediately. A low-rate heartbeat releases stale steering safely.
    const timer = setInterval(send, 100);
    const visibility = () => {
      if (document.hidden) clear();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', visibility);
      clear();
    };
  }, [room, leftKey, rightKey, binding, settingsOpen]);

  async function enter(create: boolean) {
    if (!name.trim()) {
      setProblem('Choose a player name first.');
      return;
    }
    const id = inviteId(invite);
    if (!create && !/^[\w-]{24}$/.test(id)) {
      setProblem('Paste a Curvey invite link or its room code.');
      return;
    }
    setBusy(true);
    setProblem('');
    try {
      save('curvey.name', name.trim());
      save('curvey.color', color);
      const joined = create
        ? await client.create('curvey', { name: name.trim(), color })
        : await client.joinById(id, { name: name.trim(), color });
      roomRef.current = joined;
      data.current = new ArenaPresentation(joined.sessionId);
      setGame(null);
      setRoom(joined);
      setConnected(true);
      seq.current = 0;
      history.replaceState(null, '', `?room=${joined.roomId}`);
      joined.onMessage('room', (next: RoomView) => {
        if (next.version !== PROTOCOL_VERSION) {
          setProblem('The game was updated. Refresh to use the latest version.');
          void joined.leave();
          return;
        }
        data.current.setPhase(next.phase, performance.now());
        if (data.current.game) setGame(data.current.game);
        setView(next);
      });
      joined.onMessage('baseline', (baseline: Baseline) => {
        data.current.baseline(baseline, performance.now());
        setGame(baseline.game);
      });
      joined.onMessage('geometry', (batch: GeometryBatch) => {
        if (!data.current.append(batch)) joined.send('sync');
      });
      joined.onMessage('game', (next: GameView) => {
        if (next.round !== data.current.game?.round) return;
        const now = performance.now();
        data.current.snapshot(next, now);
        // React owns the HUD, not animation. Update immediately for deaths/scores, otherwise 5Hz.
        const state = next.players.map((p) => `${p.id}:${p.alive}:${p.score}`).join('|');
        if (state !== hudState.current || now - hudStamp.current >= 200) {
          hudState.current = state;
          hudStamp.current = now;
          setGame(next);
        }
      });
      joined.onMessage('pong', (stamp: number) =>
        data.current.updateRtt(performance.now() - stamp),
      );
      joined.onMessage('problem', (text: string) => setProblem(text));
      joined.onDrop(() => {
        data.current.setConnected(false);
        setConnected(false);
        setProblem('Connection lost. You are eliminated this round; attempting to reconnect…');
      });
      joined.onReconnect(() => {
        data.current.setConnected(true);
        setConnected(true);
        setProblem('');
        joined.send('sync');
      });
      joined.onLeave((code) => {
        if (roomRef.current !== joined) return;
        roomRef.current = null;
        setRoom(null);
        setView(null);
        setGame(null);
        if (code === 4011) setProblem('The host removed you from this room.');
        else if (code !== 4000)
          setProblem('The room connection ended. Rejoin with your invite or create a new room.');
      });
      joined.send('sync');
    } catch (e) {
      setProblem(
        e instanceof Error ? e.message : 'Could not connect. Check the invite and try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    const current = roomRef.current;
    roomRef.current = null;
    setRoom(null);
    setView(null);
    setGame(null);
    setProblem('');
    history.replaceState(null, '', location.pathname);
    if (current) await current.leave();
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}${location.pathname}?room=${room!.roomId}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setProblem('Clipboard unavailable. Copy the invite from your address bar.');
    }
  }
  function sendChat(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    room?.send('chat', message);
    setMessage('');
  }

  const me = view?.members.find((p) => p.id === room?.sessionId);
  const isHost = view?.host === room?.sessionId;
  const editable = view?.phase === 'lobby' || view?.phase === 'match-results';
  const active = view?.phase === 'playing' || view?.phase === 'countdown';
  const canStart =
    (view?.members.length ?? 0) >= 2 && view?.members.every((p) => p.ready && p.connected);
  const myCurve = game?.players.find((p) => p.id === room?.sessionId);
  const winningName = game?.players.find((p) => p.id === view?.winner)?.name;
  const displayKey = (key: string) =>
    key.replace('Key', '').replace('ArrowLeft', '←').replace('ArrowRight', '→');

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            if (room) e.preventDefault();
          }}
        >
          <Mark />
          <span>
            curvey<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="top-context">
          <span className="status-dot" /> {room ? 'PRIVATE ROOM' : 'PLAY WITH YOUR PEOPLE'}
        </div>
        <button
          className="icon-button"
          aria-label="Control settings"
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <Settings2 size={18} />
        </button>
      </header>
      {problem && (
        <div className="notice" role="alert">
          <span>{problem}</span>
          <button aria-label="Dismiss message" onClick={() => setProblem('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {settingsOpen && (
        <section className="settings-panel" aria-label="Control settings">
          <div>
            <h2>Your controls</h2>
            <p>Choose two steering keys. Escape cancels rebinding.</p>
          </div>
          <button onClick={() => setBinding('left')}>
            Left <kbd>{binding === 'left' ? 'Press a key…' : displayKey(leftKey)}</kbd>
          </button>
          <button onClick={() => setBinding('right')}>
            Right <kbd>{binding === 'right' ? 'Press a key…' : displayKey(rightKey)}</kbd>
          </button>
          <button
            className="icon-button"
            aria-label="Close settings"
            onClick={() => {
              setSettingsOpen(false);
              setBinding(null);
            }}
          >
            <X size={18} />
          </button>
        </section>
      )}
      <main className="workspace">
        {!room ? (
          <>
            <section className="entry-panel">
              <div className="section-label">
                <span>01</span> GET IN THE GAME
              </div>
              <h1>
                A little room.
                <br />A lot of rivalry.
              </h1>
              <p className="intro">
                Two keys. A trail behind you.
                <br />
                Be the last curve standing.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void enter(!joinOpen);
                }}
              >
                <label htmlFor="player-name">PLAYER NAME</label>
                <input
                  id="player-name"
                  autoComplete="nickname"
                  maxLength={20}
                  value={name}
                  placeholder="What should we call you?"
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <fieldset className="color-field">
                  <legend>YOUR COLOR</legend>
                  <div className="color-options">
                    {COLORS.map((c, i) => (
                      <button
                        key={c}
                        type="button"
                        className={`color-option ${color === c ? 'selected' : ''}`}
                        style={{ '--player': c } as React.CSSProperties}
                        aria-label={`Color ${i + 1}`}
                        aria-pressed={color === c}
                        onClick={() => setColor(c)}
                      >
                        {color === c && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </fieldset>
                {joinOpen && (
                  <div className="join-field">
                    <label htmlFor="invite">INVITE LINK OR ROOM CODE</label>
                    <input
                      id="invite"
                      value={invite}
                      onChange={(e) => setInvite(e.target.value)}
                      placeholder="Paste your invite"
                      required
                      autoFocus={Boolean(initialInvite)}
                    />
                  </div>
                )}
                <button className="primary full" disabled={busy} type="submit">
                  {busy ? 'Connecting…' : joinOpen ? 'Join room' : 'Create a private room'}
                  {!busy && (joinOpen ? <ArrowRight size={18} /> : <Plus size={18} />)}
                </button>
                <button
                  className="secondary full"
                  type="button"
                  disabled={busy}
                  onClick={() => setJoinOpen(!joinOpen)}
                >
                  {joinOpen ? (
                    'Create a room instead'
                  ) : (
                    <>
                      <Link size={16} /> I have an invite
                    </>
                  )}
                </button>
              </form>
              <div className="entry-note">
                <Shield size={16} />
                <span>
                  Just you and your friends.
                  <br />
                  No account. No matchmaking queue.
                </span>
              </div>
            </section>
            <section className="arena-column">
              <div className="arena-heading">
                <span>THE ARENA</span>
                <span className="muted">FFA / 2–8 PLAYERS</span>
              </div>
              <div className="arena-frame preview-frame">
                <ArenaPreview />
                <div className="preview-chip">
                  <span className="status-dot" /> NONE MODE <span>Pure survival</span>
                </div>
              </div>
              <div className="arena-footer">
                <span>
                  <kbd>←</kbd>
                  <kbd>→</kbd> Steer left and right
                </span>
                <span>Keep clear of every trail.</span>
              </div>
            </section>
          </>
        ) : !view ? (
          <div className="loading-state" role="status">
            Opening your room…
          </div>
        ) : (
          <>
            <aside className="room-rail">
              <div className="room-rail-heading">
                <span className="section-label">YOUR ROOM</span>
                <button
                  className="icon-button"
                  title="Leave room"
                  aria-label="Leave room"
                  onClick={() => void leave()}
                >
                  <LogOut size={17} />
                </button>
              </div>
              <div className="room-title">
                <h1>{view.members.find((p) => p.id === view.host)?.name ?? 'Private'}’s room</h1>
                <span className="pill">NONE</span>
              </div>
              <button className="invite-button" onClick={() => void copyInvite()}>
                {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
                {copied ? 'Invite copied' : 'Copy invite link'}
                <ExternalLink size={13} />
              </button>
              <div className="roster-heading">
                <span>{active ? 'STANDINGS' : 'PLAYERS'}</span>
                <span>
                  {view.members.length} / {view.capacity}
                </span>
              </div>
              <ol className="roster">
                {view.members.map((p, i) => {
                  const curve = game?.players.find((q) => q.id === p.id);
                  return (
                    <li
                      key={p.id}
                      className={`${p.id === me?.id ? 'is-me' : ''} ${curve && !curve.alive && active ? 'eliminated' : ''}`}
                    >
                      <span className="player-index">{String(i + 1).padStart(2, '0')}</span>
                      <span className="player-swatch" style={{ backgroundColor: p.color }} />
                      <div className="player-info">
                        <span>
                          {p.name}
                          {p.id === me?.id && <small> YOU</small>}
                          {p.id === view.host && <Crown size={12} />}
                        </span>
                        <small>
                          {!p.connected
                            ? 'Disconnected'
                            : p.waiting
                              ? 'Waiting for next match'
                              : editable
                                ? p.ready
                                  ? 'Ready'
                                  : 'Not ready'
                                : curve?.alive
                                  ? 'In the arena'
                                  : 'Eliminated'}
                        </small>
                      </div>
                      {editable ? (
                        p.ready && <Check className="ready-check" size={16} />
                      ) : (
                        <strong className="score">{curve?.score ?? '–'}</strong>
                      )}
                      {isHost && p.id !== me?.id && (
                        <button
                          className="mini-button kick"
                          aria-label={`Kick ${p.name}`}
                          onClick={() => room.send('kick', p.id)}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
              {editable && (
                <div className="room-settings">
                  <div className="setting-row">
                    <label htmlFor="capacity">Player limit</label>
                    <select
                      id="capacity"
                      disabled={!isHost}
                      value={capacity}
                      onChange={(e) => setCapacity(Number(e.target.value))}
                    >
                      {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div className="setting-row">
                    <label htmlFor="target">First to</label>
                    <input
                      id="target"
                      aria-label="Target score"
                      type="number"
                      min={5}
                      max={300}
                      disabled={!isHost}
                      value={target}
                      onChange={(e) => setTarget(Number(e.target.value))}
                    />
                  </div>
                  {isHost && (capacity !== view.capacity || target !== view.target) && (
                    <button
                      className="secondary full"
                      onClick={() => room.send('settings', { capacity, target })}
                    >
                      Apply settings
                    </button>
                  )}
                </div>
              )}
              {editable && (
                <div className="ready-actions">
                  <button
                    className={`${me?.ready ? 'secondary' : 'primary'} full`}
                    onClick={() => room.send('ready')}
                  >
                    {me?.ready ? (
                      <>
                        <Check size={16} /> Ready. Click to unready.
                      </>
                    ) : (
                      'I’m ready'
                    )}
                  </button>
                  {isHost && (
                    <button
                      className="secondary full"
                      disabled={!canStart}
                      onClick={() => room.send('start')}
                    >
                      Start match <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              )}
              <section className="chat">
                <div className="roster-heading">
                  <span>
                    <MessageSquare size={13} /> ROOM CHAT
                  </span>
                  <span>{active ? 'PAUSED' : ''}</span>
                </div>
                <div
                  className="chat-messages"
                  role="log"
                  aria-label="Room messages"
                  aria-live="polite"
                >
                  {view.chat
                    .filter((m) => !muted.has(m.author))
                    .map((m) => (
                      <div className="chat-message" key={m.id}>
                        <strong>{m.name}</strong> <span>{m.text}</span>
                        {m.author !== me?.id && (
                          <button
                            className="mini-button"
                            title={`Mute ${m.name}`}
                            aria-label={`Mute ${m.name}`}
                            onClick={() => setMuted(new Set([...muted, m.author]))}
                          >
                            <VolumeX size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  {!view.chat.length && (
                    <p className="chat-empty">
                      Your rivalry starts here.
                      <br />
                      Say hello to the room.
                    </p>
                  )}
                  <div ref={chatEnd} />
                </div>
                {muted.size > 0 && (
                  <button className="text-button" onClick={() => setMuted(new Set())}>
                    Unmute all ({muted.size})
                  </button>
                )}
                <form className="chat-form" onSubmit={sendChat}>
                  <input
                    aria-label="Chat message"
                    disabled={active}
                    maxLength={300}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={active ? 'Chat returns between rounds' : 'Message your room…'}
                  />
                  <button aria-label="Send message" disabled={active || !message.trim()}>
                    <ArrowRight size={16} />
                  </button>
                </form>
              </section>
            </aside>
            <section className="arena-column">
              <div className="arena-heading">
                <span>
                  {view.phase === 'lobby'
                    ? 'LOBBY'
                    : `ROUND ${String(view.round).padStart(2, '0')}`}
                </span>
                <span className="arena-meta">
                  FIRST TO <strong>{view.target}</strong>
                  <span className={`status-dot ${!connected ? 'offline' : ''}`} />
                  {connected ? 'CONNECTED' : 'RECONNECTING'}
                </span>
              </div>
              <div className="arena-frame">
                {game && !me?.waiting ? (
                  <Suspense
                    fallback={
                      <div className="arena-error" role="status">
                        Preparing arena…
                      </div>
                    }
                  >
                    <Arena data={data} localId={room.sessionId} />
                  </Suspense>
                ) : (
                  <ArenaPreview />
                )}
                {(view.phase !== 'playing' || me?.waiting) && (
                  <div
                    className={`arena-overlay ${view.phase === 'countdown' ? 'countdown-overlay' : ''}`}
                  >
                    {me?.waiting ? (
                      <>
                        <span className="section-label">MATCH IN PROGRESS</span>
                        <h2>You’re up next.</h2>
                        <p>You’ll join when this match ends.</p>
                      </>
                    ) : view.phase === 'lobby' ? (
                      <>
                        <span className="section-label">PRIVATE / NONE MODE</span>
                        <h2>Room for a rivalry.</h2>
                        <p>
                          {view.members.length < 2
                            ? 'Send your invite. You need one more player.'
                            : 'Everyone ready? Let’s settle this.'}
                        </p>
                        <button className="secondary" onClick={() => void copyInvite()}>
                          <Link size={16} />
                          {copied ? 'Copied!' : 'Invite a friend'}
                        </button>
                      </>
                    ) : view.phase === 'countdown' ? (
                      <>
                        <span className="section-label">FIND YOUR CURVE</span>
                        <h2 className="countdown-number">{view.remaining || 'GO'}</h2>
                        <p style={{ color: me?.color }}>
                          {me?.name} <kbd>{displayKey(leftKey)}</kbd>
                          <kbd>{displayKey(rightKey)}</kbd>
                        </p>
                      </>
                    ) : view.phase === 'round-results' ? (
                      <>
                        <span className="section-label">ROUND COMPLETE</span>
                        <h2>{winningName ? `${winningName} survives.` : 'No survivors.'}</h2>
                        <p>Next round in {view.remaining}s</p>
                      </>
                    ) : (
                      <>
                        <span className="section-label">MATCH COMPLETE</span>
                        <h2>{winningName ? `${winningName} wins.` : 'Match ended.'}</h2>
                        <p>Ready up for another round of rivalry.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="arena-footer">
                <span>
                  <kbd>{displayKey(leftKey)}</kbd>
                  <kbd>{displayKey(rightKey)}</kbd>{' '}
                  {view.phase === 'playing' && myCurve && !myCurve.alive
                    ? 'You’re out. Watch the finish.'
                    : 'Your steering controls'}
                </span>
                <span>
                  {game ? `${(game.tick / TICK_RATE).toFixed(1)}s` : 'All trails are lethal.'}
                </span>
              </div>
            </section>
          </>
        )}
      </main>
      <footer className="page-footer">
        <span>
          <ArrowDownLeft size={13} /> MAKE YOUR OWN WAY.
        </span>
        <span>
          DEVELOPMENT BUILD <span className="footer-divider">/</span> NONE MODE
        </span>
      </footer>
      <div className="mobile-note">
        Curvey plays best on a desktop with a keyboard. You can prepare your room here.
      </div>
    </div>
  );
}
