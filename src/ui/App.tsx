import { useEffect, useState } from 'react';
import { newRoomCode, ROOM_CODE_RE, type Visibility } from '../online/protocol';
import { LobbyPanel } from './LobbyPanel';
import { SocialPanel } from './SocialPanel';
import { InviteModal } from './InviteModal';
import { MyLevel } from './PlayerSheet';
import { setLobbyPlayer } from '../online/lobby';
import { OnlineRoom } from './OnlineRoom';
import type { Difficulty } from '../bots/bot';
import { LocalGame, type LocalSetup } from '../game/localGame';
import { GameTable } from './GameTable';
import { Rules } from './Rules';
import { Avatar, avatarFor } from './art/Avatar';
import { Icon, IconButton } from './art/Icon';
import { AvatarMaker, SettingsPanel, TableBackdrop } from './Personalize';
import { getProfile, useProfile } from './profile';
import { BOT_NAMES } from '../game/runner';

const SETUP_KEY = 'pedro.setup';

function loadSetup(): LocalSetup {
  const fallback: LocalSetup = { playerName: '', bots: 2, difficulty: 'normal', limit: 30, showLog: true };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(SETUP_KEY) ?? '{}') };
  } catch {
    return fallback;
  }
}

interface RoomRoute {
  code: string;
  /** Sit down straight away (created it, or picked it in the lobby). */
  create: boolean;
  mode?: Visibility;
  /** Private invite links carry a key: `/r/ABCDE?k=…`. */
  key?: string;
}

/** `/r/ABCDE` → room code ABCDE. */
function roomFromUrl(): RoomRoute | null {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]+)\/?$/);
  const code = m?.[1].toUpperCase() ?? null;
  if (!code || !ROOM_CODE_RE.test(code)) return null;
  const key = new URLSearchParams(location.search).get('k')?.slice(0, 32) || undefined;
  return { code, create: false, key };
}

const shuffledBots = () => [...BOT_NAMES].sort(() => Math.random() - 0.5);

export function App() {
  const [botNames, setBotNames] = useState(shuffledBots);
  const [setup, setSetup] = useState<LocalSetup>(loadSetup);
  const [room, setRoom] = useState<RoomRoute | null>(roomFromUrl);
  // A friend link: /f/<id>-<token>
  const [invite, setInvite] = useState<{ id: string; token: string } | null>(() => {
    const m = location.pathname.match(/^\/f\/([A-Z0-9]{8})-([a-z0-9]{6,16})\/?$/i);
    return m ? { id: m[1].toUpperCase(), token: m[2].toLowerCase() } : null;
  });
  const closeInvite = () => {
    setInvite(null);
    history.replaceState(null, '', '/');
  };

  useEffect(() => {
    const onPop = () => setRoom(roomFromUrl());
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

  const openRoom = (code: string, create: boolean, mode?: Visibility, key?: string) => {
    history.pushState(null, '', `/r/${code}`);
    setRoom({ code, create, mode, key });
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
    const g = new LocalGame({ ...setup, avatar: getProfile().avatar, botNames });
    setBotNames(shuffledBots());
    if (import.meta.env.DEV) (window as unknown as { __pedro: LocalGame }).__pedro = g; // for testing in the console
    setGame(g);
    setGameNo((n) => n + 1);
  };

  const profile = useProfile();
  const [maker, setMaker] = useState<'first' | 'edit' | null>(() => (getProfile().created ? null : 'first'));
  const [showSettings, setShowSettings] = useState(false);
  const setName = (playerName: string) => saveSetup({ ...setup, playerName });
  // Friends and the ranking show your name and avatar.
  useEffect(() => setLobbyPlayer(setup.playerName.trim(), profile.avatar), [setup.playerName, profile.avatar]);

  let screen: JSX.Element;
  if (room) {
    screen = (
      <OnlineRoom
        key={room.code}
        code={room.code}
        defaultName={setup.playerName}
        autoJoin={room.create}
        mode={room.mode}
        inviteKey={room.key}
        onName={setName}
        onExit={leaveRoom}
      />
    );
  } else if (game) {
    screen = (
      <GameTable
        key={gameNo}
        game={game}
        onRestart={start}
        onExit={() => {
          game.destroy();
          setGame(null);
        }}
      />
    );
  } else {
    const st = profile.stats;
    const name = setup.playerName.trim();
    screen = (
      <div className="home">
        <header className="home-top">
          <h1 className="logo">
            PEDRO <Icon name="flag" size={40} className="flag" />
          </h1>
          <div className="topbar-right">
            <IconButton icon="gear" label="Settings: table, deck, sound" onClick={() => setShowSettings(true)} />
            <button className="howto-btn" onClick={() => setShowRules(true)}>
              <Icon name="help" size={20} /> How to play
            </button>
          </div>
        </header>

        <main className="home-grid">
          <section className="panel profile-panel">
            <button className="profile-avatar" onClick={() => setMaker('edit')} aria-label="Edit your avatar">
              <Avatar code={profile.avatar} size="100%" />
              <span className="profile-edit">
                <Icon name="edit" size={16} />
              </span>
            </button>
            <h2 className="profile-name">{name || 'Who are you?'}</h2>
            <button className="btn btn--small" onClick={() => setMaker('edit')}>
              Edit player
            </button>
            {name && <MyLevel />}
            <div className="stats">
              <Stat label="Games" value={st.games} />
              <Stat label="Wins" value={st.wins} />
              <Stat label="Rounds won" value={st.roundWins} />
              <Stat label="Pedros ✓" value={`${st.pedroWins}/${st.pedroCalls}`} />
              <Stat label="Best round" value={st.bestRound ?? '—'} />
              <Stat label="Win rate" value={st.games ? `${Math.round((st.wins / st.games) * 100)}%` : '—'} />
            </div>
            <p className="muted small">Your stats are saved on this device.</p>
          </section>

          <section className="panel play-panel">
            <h2>Play vs computer</h2>
            <p className="muted">Lowest total wins — if you remember your cards.</p>
            <div className="setup-grid">
              <div className="field">
                <span>Opponents</span>
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
                <span>Move history</span>
                <div className="seg">
                  {[true, false].map((v) => (
                    <button key={String(v)} className={setup.showLog === v ? 'on' : ''} onClick={() => setSetup({ ...setup, showLog: v })}>
                      {v ? 'Show' : 'Hide (pure memory)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="opponents-preview" aria-hidden>
              <Avatar code={profile.avatar} size={44} ring />
              <span className="vs">vs</span>
              {botNames.slice(0, setup.bots).map((n) => (
                <Avatar key={n} code={avatarFor({ name: n })} size={38} bot />
              ))}
            </div>
            <button className="btn btn--primary btn--big" onClick={start}>
              Play
            </button>
          </section>

          <SocialPanel
            ready={!!name}
            onNeedName={() => setMaker('edit')}
            onJoin={(code, mode, key) => {
              saveSetup(setup);
              openRoom(code, true, mode, key);
            }}
          />
          <LobbyPanel
            ready={!!name}
            onNeedName={() => setMaker('edit')}
            onOpen={(code, mode) => {
              saveSetup(setup);
              openRoom(code, true, mode);
            }}
            onCreate={(mode) => {
              saveSetup(setup);
              openRoom(newRoomCode(), true, mode);
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <>
      <TableBackdrop />
      {screen}
      {maker && <AvatarMaker first={maker === 'first'} name={setup.playerName} onName={setName} onClose={() => setMaker(null)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showRules && <Rules onClose={() => setShowRules(false)} />}
      {invite && !room && !game && !maker && (
        <InviteModal id={invite.id} token={invite.token} ready={!!setup.playerName.trim()} onNeedName={() => setMaker('edit')} onClose={closeInvite} />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
