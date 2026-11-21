import { useEffect, useState } from 'react';
import { newRoomCode, ROOM_CODE_RE } from '../online/protocol';
import { OnlineRoom } from './OnlineRoom';
import type { Difficulty } from '../bots/bot';
import { LocalGame, type LocalSetup } from '../game/localGame';
import { GameTable } from './GameTable';
import { Rules } from './Rules';

const SETUP_KEY = 'pedro.setup';

function loadSetup(): LocalSetup {
  const fallback: LocalSetup = { playerName: '', bots: 2, difficulty: 'normal', limit: 30, showLog: true };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(SETUP_KEY) ?? '{}') };
  } catch {
    return fallback;
  }
}

/** `/r/ABCDE` → room code ABCDE. */
function roomFromUrl(): string | null {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]+)\/?$/);
  const code = m?.[1].toUpperCase() ?? null;
  return code && ROOM_CODE_RE.test(code) ? code : null;
}

export function App() {
  const [setup, setSetup] = useState<LocalSetup>(loadSetup);
  const [room, setRoom] = useState<{ code: string; create: boolean } | null>(() => {
    const code = roomFromUrl();
    return code ? { code, create: false } : null;
  });

  useEffect(() => {
    const onPop = () => {
      const code = roomFromUrl();
      setRoom(code ? { code, create: false } : null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const saveSetup = (next: LocalSetup) => {
    setSetup(next);
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };

  const openRoom = (code: string, create: boolean) => {
    history.pushState(null, '', `/r/${code}`);
    setRoom({ code, create });
  };
  const leaveRoom = () => {
    history.pushState(null, '', '/');
    setRoom(null);
  };
  const [game, setGame] = useState<LocalGame | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [gameNo, setGameNo] = useState(0);

  const start = () => {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
    } catch {
      /* private mode */
    }
    game?.destroy();
    const g = new LocalGame(setup);
    if (import.meta.env.DEV) (window as unknown as { __pedro: LocalGame }).__pedro = g; // for testing in the console
    setGame(g);
    setGameNo((n) => n + 1);
  };

  if (room) {
    return (
      <OnlineRoom
        key={room.code}
        code={room.code}
        defaultName={setup.playerName}
        autoJoin={room.create}
        onName={(playerName) => saveSetup({ ...setup, playerName })}
        onExit={leaveRoom}
      />
    );
  }

  if (game) return <GameTable key={gameNo} game={game} onRestart={start} onExit={() => {
          game.destroy();
          setGame(null);
        }} />;

  return (
    <div className="menu">
      <div className="menu-card">
        <h1>
          PEDRO <span className="flag">🇦🇷</span>
        </h1>
        <p className="tagline">The Argentinian memory card game. Lowest total wins — if you remember your cards.</p>

        <label>
          Your name
          <input
            value={setup.playerName}
            placeholder="You"
            maxLength={16}
            onChange={(e) => setSetup({ ...setup, playerName: e.target.value })}
          />
        </label>

        <div className="field">
          <span>Opponents (computer)</span>
          <div className="seg">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={setup.bots === n ? 'on' : ''} onClick={() => setSetup({ ...setup, bots: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Difficulty</span>
          <div className="seg">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button key={d} className={setup.difficulty === d ? 'on' : ''} onClick={() => setSetup({ ...setup, difficulty: d })}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Game length</span>
          <div className="seg">
            {[30, 50, 80, null].map((l) => (
              <button key={String(l)} className={setup.limit === l ? 'on' : ''} onClick={() => setSetup({ ...setup, limit: l })}>
                {l === null ? 'One round' : `to ${l}`}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Move history on the side</span>
          <div className="seg">
            {[true, false].map((v) => (
              <button key={String(v)} className={setup.showLog === v ? 'on' : ''} onClick={() => setSetup({ ...setup, showLog: v })}>
                {v ? 'Show' : 'Hide (pure memory)'}
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn--primary btn--big" onClick={start}>
          Play vs computer
        </button>
        <button
          className="btn btn--online btn--big"
          disabled={!setup.playerName.trim()}
          title={setup.playerName.trim() ? '' : 'Enter your name first'}
          onClick={() => {
            saveSetup(setup);
            openRoom(newRoomCode(), true);
          }}
        >
          Play online with friends
        </button>
        {!setup.playerName.trim() && <p className="muted small center-text">Enter your name to play online.</p>}
        <button className="link" onClick={() => setShowRules(true)}>
          How to play
        </button>
      </div>
      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </div>
  );
}
