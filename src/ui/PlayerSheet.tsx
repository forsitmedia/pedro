import { useEffect, useState } from 'react';
import { addFriend, removeFriend, requestProfile, useLobby, whenConnected } from '../online/lobby';
import { LEAGUES, levelFor, type FriendInfo, type Visibility } from '../online/protocol';
import { Avatar, avatarFor } from './art/Avatar';
import { Icon } from './art/Icon';
import { useProfile } from './profile';

/** "Lv 7" in the colour of the league. */
export function LevelChip({ level }: { level?: number }) {
  if (!level) return null;
  const league = [...LEAGUES].reverse().find((l) => level >= l.from)!;
  return (
    <span className={`level-chip level-chip--${league.id}`} title={`${league.name} league`}>
      Lv {level}
    </span>
  );
}

/** Your level and league, with the bar to the next level. */
export function LevelBar({ xp }: { xp: number }) {
  const { level, league, into, need } = levelFor(xp);
  return (
    <div className={`level-bar level-bar--${league.id}`}>
      <div className="level-bar-top">
        <span className="league-badge">{league.name}</span>
        <b>Level {level}</b>
        <span className="muted small">
          {into}/{need} XP
        </span>
      </div>
      <div className="level-track">
        <span style={{ width: `${Math.min(100, (into / need) * 100)}%` }} />
      </div>
    </div>
  );
}

/** Your own level on the home page (once the lobby knows you). */
export function MyLevel() {
  const { me } = useLobby();
  if (!me) return null;
  return <LevelBar xp={me.total.xp} />;
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Tap a player: their level, stats, how you do against them, and (at the bottom) remove friend. */
export function PlayerSheet({
  id,
  friend,
  onClose,
  onJoin,
}: {
  id: string;
  /** Set when they are your friend (status, table). */
  friend?: FriendInfo;
  onClose: () => void;
  onJoin?: (code: string, mode: Visibility, key?: string) => void;
}) {
  const { profile: loaded, me } = useLobby();
  const [confirm, setConfirm] = useState(false);
  const myAvatar = useProfile().avatar;
  useEffect(() => whenConnected(() => requestProfile(id)), [id]);
  const p = loaded?.id === id ? loaded.profile : undefined;
  const isFriend = !!me?.friends.some((f) => f.id === id);
  const asked = !!me?.sent.some((f) => f.id === id);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sheet player-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Player">
        <button className="icon-btn icon-btn--small sheet-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size="55%" />
        </button>
        {p === undefined ? (
          <p className="muted">Loading…</p>
        ) : p === null ? (
          <p className="muted">This player doesn't exist anymore.</p>
        ) : (
          (() => {
            const lv = levelFor(p.xp);
            const t = p.together;
            const winRate = p.games ? Math.round((p.wins / p.games) * 100) : null;
            return (
              <>
                <div className={`player-hero league--${lv.league.id}`}>
                  <span className="player-ring">
                    <Avatar code={avatarFor(p)} size="100%" />
                  </span>
                  <h2>{p.name}</h2>
                  {friend && (
                    <span className={`player-status player-status--${friend.status}`}>
                      {friend.status === 'playing'
                        ? `Playing${friend.table?.round ? ` · round ${friend.table.round}` : ''}`
                        : friend.status === 'waiting'
                          ? 'At a table, waiting'
                          : friend.status === 'online'
                            ? 'Online'
                            : 'Offline'}
                    </span>
                  )}
                </div>
                <LevelBar xp={p.xp} />

                {friend?.status === 'waiting' && friend.table && friend.table.visibility !== 'quick' && onJoin && (
                  <button className="btn btn--primary btn--big" onClick={() => onJoin(friend.table!.code, friend.table!.visibility, friend.table!.key)}>
                    Join {p.name}'s table
                  </button>
                )}

                <div className="stats">
                  <div className="stat">
                    <b>{p.games}</b>
                    <span>Online games</span>
                  </div>
                  <div className="stat">
                    <b>{p.wins}</b>
                    <span>Wins</span>
                  </div>
                  <div className="stat">
                    <b>{winRate === null ? '—' : `${winRate}%`}</b>
                    <span>Win rate</span>
                  </div>
                </div>
                <p className="muted small week-line">
                  This week: <b>{p.week.points} pts</b>
                  {p.week.rank ? ` · #${p.week.rank} in the ranking` : ''}
                </p>

                {me && me.id !== p.id && (
                  <div className="versus">
                    <h3 className="sheet-sub">You vs {p.name}</h3>
                    {t.games === 0 ? (
                      <p className="muted small">You haven't played an online game together yet.</p>
                    ) : (
                      <>
                        <div className="versus-score">
                          <span className="versus-side">
                            <Avatar code={myAvatar} size={40} />
                            <b className={t.myWins >= t.theirWins ? 'lead' : ''}>{t.myWins}</b>
                            <small>you</small>
                          </span>
                          <span className="versus-dash">–</span>
                          <span className="versus-side">
                            <Avatar code={avatarFor(p)} size={40} />
                            <b className={t.theirWins > t.myWins ? 'lead' : ''}>{t.theirWins}</b>
                            <small>{p.name}</small>
                          </span>
                        </div>
                        <p className="muted small">
                          {t.games} game{t.games === 1 ? '' : 's'} together
                          {t.myWins > t.theirWins ? ' — you lead' : t.theirWins > t.myWins ? ` — ${p.name} leads` : ' — all square'}
                        </p>
                      </>
                    )}
                  </div>
                )}

                {p.friendsSince && <p className="muted small">Friends since {fmtDate(p.friendsSince)}</p>}

                {!isFriend && me && me.id !== p.id && (
                  <button className="btn btn--primary" disabled={asked} onClick={() => addFriend(p.id)}>
                    <Icon name="plus" size={16} /> {asked ? 'Request sent' : 'Add friend'}
                  </button>
                )}

                {isFriend && (
                  <div className="remove-friend">
                    {confirm ? (
                      <>
                        <span className="small">Remove {p.name} from your friends?</span>
                        <button
                          className="btn btn--small btn--danger"
                          onClick={() => {
                            removeFriend(p.id);
                            onClose();
                          }}
                        >
                          Remove
                        </button>
                        <button className="btn btn--small" onClick={() => setConfirm(false)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button className="link small" onClick={() => setConfirm(true)}>
                        Remove friend
                      </button>
                    )}
                  </div>
                )}
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}
