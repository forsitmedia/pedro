import { useEffect, useRef, useState } from 'react';
import { answerPlayInvite, dropOldInvites, invitePlayer, useLobby } from '../online/lobby';
import type { FriendInfo, PlayerCard, Visibility } from '../online/protocol';
import { Avatar, avatarFor } from './art/Avatar';
import { Icon } from './art/Icon';
import { LevelChip } from './PlayerSheet';
import { play } from './sound';

/**
 * "Marco invites you to play": pops up anywhere in the app (home, a game vs the computer,
 * another table that hasn't started), from friends and strangers alike.
 */
export function PlayInviteToasts({
  currentRoom,
  onJoin,
}: {
  /** The table you're at (invites to it are pointless). */
  currentRoom?: string;
  onJoin: (code: string, mode: Visibility, key?: string) => void;
}) {
  const { playInvites } = useLobby();
  const count = useRef(0);
  const shown = playInvites.filter((i) => i.code !== currentRoom);

  // A little sound when a new one arrives.
  useEffect(() => {
    if (shown.length > count.current) play('turn');
    count.current = shown.length;
  }, [shown.length]);

  // Old invites fade away.
  useEffect(() => {
    if (!playInvites.length) return;
    const t = setInterval(dropOldInvites, 5000);
    return () => clearInterval(t);
  }, [playInvites.length]);

  if (!shown.length) return null;
  return (
    <div className="play-invites" role="status">
      {shown.slice(-3).map((inv) => (
        <div key={`${inv.from.id}-${inv.at}`} className="play-invite">
          <Avatar code={avatarFor(inv.from)} size={44} />
          <span className="play-invite-text">
            <b>
              {inv.from.name} <LevelChip level={inv.from.level} />
            </b>
            <small>invites you to play</small>
          </span>
          <button
            className="btn btn--small btn--primary"
            onClick={() => {
              answerPlayInvite(inv, true);
              onJoin(inv.code, inv.visibility, inv.key);
            }}
          >
            Join
          </button>
          <button className="mini-btn" onClick={() => answerPlayInvite(inv, false)} aria-label={`Say no to ${inv.from.name}`} title="Not now">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Waiting at your table: everyone online you can call over (friends first, then other players). */
export function InviteOnline({ code }: { code: string }) {
  const { me, invited, notice } = useLobby();
  const [shownNotice, setShownNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    setShownNotice(notice.text);
    const t = setTimeout(() => setShownNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return null;
  const ready = me.table === code;
  // Not the ones already sitting here (the server leaves those out of `online`), nor anyone mid-game.
  const list: (PlayerCard & { status: FriendInfo['status']; friend: boolean })[] = [
    ...me.friends.filter((f) => (f.status === 'online' || f.status === 'waiting') && f.table?.code !== code).map((f) => ({ ...f, friend: true })),
    ...me.online.filter((p) => p.status !== 'playing').map((p) => ({ ...p, friend: false })),
  ];

  return (
    <div className="field invite-online">
      <span>Invite people online</span>
      {shownNotice && <p className="notice small">{shownNotice}</p>}
      {list.length === 0 ? (
        <p className="muted small">Nobody else is online right now. Share the link instead!</p>
      ) : (
        <ul className="people">
          {list.map((p) => {
            const done = invited.includes(p.id);
            return (
              <li key={p.id} className="person">
                <span className="person-avatar">
                  <Avatar code={avatarFor(p)} size={34} />
                  <span className={`presence presence--${p.status}`} />
                </span>
                <span className="person-info">
                  <b>
                    {p.name} <LevelChip level={p.level} />
                  </b>
                  <small className="muted">
                    {p.friend ? 'Friend' : 'Player'} · {p.status === 'waiting' ? 'at another table' : 'online'}
                  </small>
                </span>
                <button className="btn btn--small btn--primary" disabled={!ready || done} onClick={() => invitePlayer(p.id)}>
                  {done ? 'Invited ✓' : 'Invite'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
