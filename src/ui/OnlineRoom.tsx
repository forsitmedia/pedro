import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Difficulty } from '../bots/bot';
import { MAX_SEATS, QUICK_SEATS, type RoomInfo, type RoomSettings, type Visibility } from '../online/protocol';
import { hasSeatAt, OnlineGame } from '../online/onlineGame';
import { GameTable } from './GameTable';
import { Rules } from './Rules';
import { getProfile, useProfile } from './profile';
import { Avatar, avatarFor } from './art/Avatar';
import { Icon } from './art/Icon';
import { VisibilityPicker } from './VisibilityPicker';

interface Props {
  code: string;
  defaultName: string;
  /** Came from "Create room": join straight away with the saved name. */
  autoJoin: boolean;
  /** How to open the table if it's new. */
  mode?: Visibility;
  /** From a private invite link. */
  inviteKey?: string;
  onName: (name: string) => void;
  onExit: () => void;
}

export function OnlineRoom({ code, defaultName, autoJoin, mode, inviteKey, onName, onExit }: Props) {
  const [name, setName] = useState(defaultName);
  // The name can arrive a moment later (made in the avatar maker on first visit).
  useEffect(() => {
    if (!name && defaultName) setName(defaultName);
  }, [defaultName]); // eslint-disable-line react-hooks/exhaustive-deps
  const profile = useProfile();
  const [game, setGame] = useState<OnlineGame | null>(null);
  const joined = useRef(false);

  const join = (n: string) => {
    const clean = n.trim().slice(0, 16);
    if (!clean || joined.current) return;
    joined.current = true;
    onName(clean);
    setGame(new OnlineGame(code, clean, getProfile().avatar, mode, inviteKey));
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
            PEDRO <Icon name="flag" size={34} className="flag" />
          </h1>
          <p className="tagline">
            You're invited to table <b className="code">{code}</b>
          </p>
          <div className="join-avatar">
            <Avatar code={profile.avatar} size={84} />
          </div>
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
  const [info, setInfo] = useState<string | null>(null);
  useEffect(
    () =>
      game.onInfo((m) => {
        setInfo(m);
        setTimeout(() => setInfo(null), 3500);
      }),
    [game],
  );
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

  if (game.knocking) {
    return (
      <div className="menu">
        <div className="menu-card knock-card">
          <div className="join-avatar knock-avatar">
            <Avatar code={getProfile().avatar} size={96} />
          </div>
          <h2>Knock knock…</h2>
          <p className="tagline">This table is friends only. We asked the host to let you in.</p>
          <div className="dots" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <button className="link" onClick={onExit}>
            ← Never mind, back to the lobby
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

  const link = game.inviteLink;
  const quick = room?.visibility === 'quick';
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
  const requests = room?.requests ?? [];

  return (
    <div className="menu">
      <ConnectionBanner status={game.status} />
      <div className="menu-card lobby">
        <h1>
          PEDRO <Icon name="flag" size={34} className="flag" />
        </h1>
        {quick ? (
          <QuickWait room={room} />
        ) : (
          <>
            <div className="share">
              <span className="muted">Table</span>
              <b className="code">{game.code}</b>
              <button className="btn btn--primary" onClick={share}>
                {copied ? 'Link copied ✓' : 'Invite friends'}
              </button>
            </div>
            <p className="muted small">Send the link: {link}</p>
            {room && room.visibility !== 'quick' && (
              <div className="field">
                <span>Who can join</span>
                <VisibilityPicker
                  value={room.visibility}
                  disabled={!isHost}
                  onChange={(v) => settings && game.updateSettings(settings, v)}
                />
              </div>
            )}
          </>
        )}

        {info && <p className="notice small">{info}</p>}
        {isHost && requests.length > 0 && (
          <div className="requests">
            {requests.map((r) => (
              <div key={r.id} className="request">
                <Avatar code={avatarFor(r)} size={40} />
                <span>
                  <b>{r.name}</b> wants to join
                </span>
                <button className="btn btn--small btn--primary" onClick={() => game.admit(r.id, true)}>
                  Let in
                </button>
                <button className="btn btn--small" onClick={() => game.admit(r.id, false)}>
                  No
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <span>
            At the table ({quick ? `${humans.length}/${QUICK_SEATS}` : `${total}/${MAX_SEATS}`})
          </span>
          <ul className="seats">
            {humans.map((s) => (
              <li key={s.id}>
                <span className={`dot ${s.connected ? 'on' : ''}`} title={s.connected ? 'connected' : 'disconnected'} />
                <Avatar code={avatarFor(s)} size={30} />
                {s.name}
                {s.id === game.meId && <span className="muted"> (you)</span>}
                {s.id === room?.hostId && <span className="badge">host</span>}
                {game.canBefriend(s.id) && (
                  <button className="btn btn--small seat-befriend" onClick={() => game.befriend(s.id)}>
                    <Icon name="plus" size={14} /> Add friend
                  </button>
                )}
              </li>
            ))}
            {Array.from({ length: settings?.bots ?? 0 }, (_, i) => (
              <li key={`b${i}`} className="muted">
                <Icon name="robot" size={22} /> Computer player
              </li>
            ))}
            {quick &&
              Array.from({ length: Math.max(0, QUICK_SEATS - humans.length) }, (_, i) => (
                <li key={`w${i}`} className="muted seat-waiting">
                  <span className="seat-empty" /> Waiting for a player…
                </li>
              ))}
            {!room && <li className="muted">Connecting…</li>}
          </ul>
        </div>

        {settings && !quick && (
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

        {quick ? (
          isHost && (
            <button className="btn btn--primary btn--big" onClick={() => game.start()}>
              {humans.length >= 2 ? `Start now (${humans.length} players)` : 'Play against the computer now'}
            </button>
          )
        ) : isHost ? (
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

/** Quick match: counts down to the start. */
function QuickWait({ room }: { room: RoomInfo | null }) {
  const autoStartIn = room?.autoStartIn ?? null;
  const alone = (room?.seats.filter((s) => !s.isBot).length ?? 0) < 2;
  const [end, setEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setEnd(autoStartIn === null ? null : Date.now() + autoStartIn);
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = end === null ? null : Math.max(0, Math.ceil((end - now) / 1000));
  return (
    <div className="quick-wait">
      <h2>Finding players…</h2>
      <p className="tagline">
        {left === null
          ? 'Getting the table ready'
          : left <= 0
            ? 'Dealing the cards…'
            : alone
              ? `Nobody yet… in ${left}s you'll play against the computer.`
              : `Starting in ${left}s — more people can still join.`}
      </p>
    </div>
  );
}

function Seg<T extends string | number | boolean | null>(props: {
  label: string;
  disabled?: boolean;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span>{props.label}</span>
      <div className="seg">
        {props.options.map(([v, text]) => (
          <button key={String(v)} className={props.value === v ? 'on' : ''} disabled={props.disabled} onClick={() => props.onChange(v)}>
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
