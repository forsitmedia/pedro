import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Difficulty } from '../bots/bot';
import { MAX_SEATS, type RoomSettings } from '../online/protocol';
import { hasSeatAt, OnlineGame } from '../online/onlineGame';
import { GameTable } from './GameTable';
import { Rules } from './Rules';

interface Props {
  code: string;
  defaultName: string;
  /** Came from "Create room": join straight away with the saved name. */
  autoJoin: boolean;
  onName: (name: string) => void;
  onExit: () => void;
}

export function OnlineRoom({ code, defaultName, autoJoin, onName, onExit }: Props) {
  const [name, setName] = useState(defaultName);
  const [game, setGame] = useState<OnlineGame | null>(null);
  const joined = useRef(false);

  const join = (n: string) => {
    const clean = n.trim().slice(0, 16);
    if (!clean || joined.current) return;
    joined.current = true;
    onName(clean);
    setGame(new OnlineGame(code, clean));
  };

  useEffect(() => {
    // Creating a room, or coming back to a table you were already sitting at (page refresh).
    if ((autoJoin || hasSeatAt(code)) && defaultName.trim()) join(defaultName);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => game?.close(), [game]);

  if (!game) {
    return (
      <div className="menu">
        <div className="menu-card">
          <h1>
            PEDRO <span className="flag">🇦🇷</span>
          </h1>
          <p className="tagline">
            You're invited to table <b className="code">{code}</b>
          </p>
          <label>
            Your name
            <input
              autoFocus
              value={name}
              maxLength={16}
              placeholder="Your name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join(name)}
            />
          </label>
          <button className="btn btn--primary btn--big" disabled={!name.trim()} onClick={() => join(name)}>
            Sit at the table
          </button>
          <button className="link" onClick={onExit}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return <Room game={game} onExit={onExit} />;
}

function Room({ game, onExit }: { game: OnlineGame; onExit: () => void }) {
  useSyncExternalStore(game.subscribe, () => game.version);
  const [showRules, setShowRules] = useState(false);
  const [copied, setCopied] = useState(false);
  const room = game.room;
  const isHost = !!room && room.hostId === game.meId;

  if (game.fatal) {
    return (
      <div className="menu">
        <div className="menu-card">
          <h2>Can't join this table</h2>
          <p className="tagline">{game.fatal}</p>
          <button className="btn btn--primary btn--big" onClick={onExit}>
            Back to the menu
          </button>
        </div>
      </div>
    );
  }

  if (room?.started && game.hasState()) {
    return (
      <>
        <ConnectionBanner status={game.status} />
        <GameTable
          game={game}
          onExit={onExit}
          onRestart={() => game.backToLobby()}
          restartLabel={isHost ? 'New game' : 'Waiting for the host…'}
        />
      </>
    );
  }

  const link = `${location.origin}/r/${game.code}`;
  const share = async () => {
    const text = `Come play Pedro with me! 🃏`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Pedro', text, url: link });
        return;
      }
    } catch {
      /* cancelled */
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this link:', link);
    }
  };

  const humans = room?.seats.filter((s) => !s.isBot) ?? [];
  const settings = room?.settings;
  const set = (patch: Partial<RoomSettings>) => settings && game.updateSettings({ ...settings, ...patch });
  const total = humans.length + (settings?.bots ?? 0);

  return (
    <div className="menu">
      <ConnectionBanner status={game.status} />
      <div className="menu-card lobby">
        <h1>
          PEDRO <span className="flag">🇦🇷</span>
        </h1>
        <div className="share">
          <span className="muted">Table</span>
          <b className="code">{game.code}</b>
          <button className="btn btn--primary" onClick={share}>
            {copied ? 'Link copied ✓' : 'Invite friends'}
          </button>
        </div>
        <p className="muted small">Send the link: {link}</p>

        <div className="field">
          <span>
            At the table ({total}/{MAX_SEATS})
          </span>
          <ul className="seats">
            {humans.map((s) => (
              <li key={s.id}>
                <span className={`dot ${s.connected ? 'on' : ''}`} title={s.connected ? 'connected' : 'disconnected'} />
                {s.name}
                {s.id === game.meId && <span className="muted"> (you)</span>}
                {s.id === room?.hostId && <span className="badge">host</span>}
              </li>
            ))}
            {Array.from({ length: settings?.bots ?? 0 }, (_, i) => (
              <li key={`b${i}`} className="muted">
                🤖 Computer player
              </li>
            ))}
            {!room && <li className="muted">Connecting…</li>}
          </ul>
        </div>

        {settings && (
          <fieldset className="settings" disabled={!isHost}>
            {!isHost && <p className="muted small">Only the host can change the settings.</p>}
            <Seg
              label="Computer players"
              value={settings.bots}
              options={Array.from({ length: MAX_SEATS - humans.length + 1 }, (_, n) => [n, String(n)] as const)}
              onChange={(bots) => set({ bots })}
            />
            {settings.bots > 0 && (
              <Seg
                label="Computer difficulty"
                value={settings.difficulty}
                options={(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => [d, d] as const)}
                onChange={(difficulty) => set({ difficulty })}
              />
            )}
            <Seg
              label="Game length"
              value={settings.limit}
              options={[[30, 'to 30'], [50, 'to 50'], [80, 'to 80'], [null, 'One round']] as const}
              onChange={(limit) => set({ limit })}
            />
            <Seg
              label="Time per turn"
              value={settings.turnSeconds}
              options={[[30, '30s'], [60, '60s'], [90, '90s'], [null, 'No timer']] as const}
              onChange={(turnSeconds) => set({ turnSeconds })}
            />
            <Seg
              label="Move history"
              value={settings.showLog}
              options={[[true, 'Show'], [false, 'Hide']] as const}
              onChange={(showLog) => set({ showLog })}
            />
          </fieldset>
        )}

        {isHost ? (
          <button className="btn btn--primary btn--big" disabled={total < 2} onClick={() => game.start()}>
            {total < 2 ? 'Waiting for players…' : `Start game (${total} players)`}
          </button>
        ) : (
          <p className="tagline">Waiting for the host to start…</p>
        )}
        <button className="link" onClick={() => setShowRules(true)}>
          How to play
        </button>
        <button className="link" onClick={onExit}>
          Leave the table
        </button>
      </div>
      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </div>
  );
}

function Seg<T extends string | number | boolean | null>(props: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span>{props.label}</span>
      <div className="seg">
        {props.options.map(([v, text]) => (
          <button key={String(v)} className={props.value === v ? 'on' : ''} onClick={() => props.onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConnectionBanner({ status }: { status: string }) {
  if (status === 'open') return null;
  const text = status === 'connecting' ? 'Connecting…' : status === 'reconnecting' ? 'Connection lost — reconnecting…' : 'Disconnected';
  return <div className="conn-banner">{text}</div>;
}
