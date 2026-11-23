import { useEffect, useState } from 'react';
import { addFriend, answerFriend, friendLink, removeFriend, searchPlayers, useLobby } from '../online/lobby';
import type { MeInfo } from '../online/protocol';
import { POINTS, type BoardRow, type FriendInfo, type PlayerCard, type Visibility } from '../online/protocol';
import { Avatar, avatarFor } from './art/Avatar';
import { Icon } from './art/Icon';
import { LevelChip, PlayerSheet } from './PlayerSheet';

interface Props {
  /** Sit at a friend's table (private tables come with their key). */
  onJoin: (code: string, mode: Visibility, key?: string) => void;
  /** Open a new table and ask this player (friend or not) to come and play. */
  onInvite: (id: string) => void;
  ready: boolean;
  onNeedName: () => void;
}

/** Left column: your friends (who's online, join them) and this week's ranking. */
export function SocialPanel({ onJoin, onInvite, ready, onNeedName }: Props) {
  const { me, board, notice } = useLobby();
  const [tab, setTab] = useState<'friends' | 'ranking'>('friends');
  const requests = me?.requests.length ?? 0;
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="panel social-panel">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'friends'} className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>
          <Icon name="users" size={18} /> Friends
          {requests > 0 && <span className="tab-badge">{requests}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'ranking'} className={tab === 'ranking' ? 'on' : ''} onClick={() => setTab('ranking')}>
          <Icon name="trophy" size={18} /> This week
        </button>
      </div>
      {!ready ? (
        <p className="muted small social-empty">
          <button className="link" onClick={onNeedName}>
            Pick a name
          </button>{' '}
          to add friends and enter the ranking.
        </p>
      ) : tab === 'friends' ? (
        <Friends onJoin={onJoin} onInvite={onInvite} notice={notice} onOpenPlayer={setOpenId} />
      ) : (
        <Ranking board={board} myId={me?.id} myWeek={me?.week} onOpenPlayer={setOpenId} />
      )}
      {openId && (
        <PlayerSheet
          id={openId}
          friend={me?.friends.find((f) => f.id === openId)}
          onClose={() => setOpenId(null)}
          onInvite={(id) => {
            setOpenId(null);
            onInvite(id);
          }}
          onJoin={(code, mode, key) => {
            setOpenId(null);
            onJoin(code, mode, key);
          }}
        />
      )}
    </section>
  );
}

/* ───────────── friends ───────────── */

function Friends({
  onJoin,
  onInvite,
  notice,
  onOpenPlayer,
}: {
  onJoin: Props['onJoin'];
  onInvite: Props['onInvite'];
  notice: { text: string; n: number } | null;
  onOpenPlayer: (id: string) => void;
}) {
  const { me, search } = useLobby();
  const [q, setQ] = useState('');
  const [shownNotice, setShownNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    setShownNotice(notice.text);
    const t = setTimeout(() => setShownNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search as you type (a moment after the last key).
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => searchPlayers(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  if (!me) return <p className="muted small social-empty">Connecting…</p>;

  const friendIds = new Set(me.friends.map((f) => f.id));
  const sentIds = new Set(me.sent.map((f) => f.id));
  const askedMe = new Set(me.requests.map((f) => f.id));
  const searching = q.trim().length >= 2;
  const results = searching && search?.q === q.trim() ? search.results : null;
  const onlineById = new Map(me.online.map((p) => [p.id, p]));
  const recentIds = new Set(me.recent.map((p) => p.id));
  const onlineStrangers = me.online.filter((p) => !recentIds.has(p.id));

  return (
    <div className="friends">
      <div className="find-player">
        <Icon name="users" size={18} />
        <input
          value={q}
          maxLength={16}
          placeholder="Find players by name"
          onChange={(e) => setQ(e.target.value)}
          aria-label="Find players by name"
        />
        {q && (
          <button className="mini-btn mini-btn--ghost" onClick={() => setQ('')} aria-label="Clear">
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      {!searching && <InviteLink me={me} />}
      {shownNotice && <p className="notice small">{shownNotice}</p>}

      {searching && (
        <>
          <h4 className="social-title">Players called “{q.trim()}”</h4>
          {!results ? (
            <p className="muted small social-empty">Searching…</p>
          ) : results.length === 0 ? (
            <p className="muted small social-empty">Nobody with that name yet. They need to open Pedro once with their name.</p>
          ) : (
            <ul className="people">
              {results.map((p) => (
                <Person key={p.id} p={p}>
                  {friendIds.has(p.id) ? (
                    <span className="table-tag">Friends</span>
                  ) : sentIds.has(p.id) ? (
                    <span className="table-tag">Asked</span>
                  ) : (
                    <button className="btn btn--small btn--primary" onClick={() => addFriend(p.id)}>
                      <Icon name="plus" size={14} /> {askedMe.has(p.id) ? 'Accept' : 'Add'}
                    </button>
                  )}
                </Person>
              ))}
            </ul>
          )}
        </>
      )}

      {!searching && (
        <>
          {me.requests.length > 0 && (
            <>
              <h4 className="social-title">Want to be your friend</h4>
              <ul className="people">
                {me.requests.map((p) => (
                  <Person key={p.id} p={p}>
                    <button className="mini-btn mini-btn--yes" onClick={() => answerFriend(p.id, true)} aria-label={`Accept ${p.name}`}>
                      <Icon name="check" size={16} />
                    </button>
                    <button className="mini-btn" onClick={() => answerFriend(p.id, false)} aria-label={`Decline ${p.name}`}>
                      <Icon name="close" size={16} />
                    </button>
                  </Person>
                ))}
              </ul>
            </>
          )}

          <h4 className="social-title">
            Friends {me.friends.length > 0 && <span className="muted">· {me.friends.filter((f) => f.status !== 'offline').length} online</span>}
          </h4>
          {me.friends.length === 0 ? (
            <p className="muted small social-empty">Search your friends by name above, or add people you played with.</p>
          ) : (
            <ul className="people">
              {me.friends.map((f) => (
                <FriendRow key={f.id} f={f} onJoin={onJoin} onInvite={onInvite} onOpen={() => onOpenPlayer(f.id)} />
              ))}
            </ul>
          )}

          {me.sent.length > 0 && (
            <>
              <h4 className="social-title">Waiting for an answer</h4>
              <ul className="people">
                {me.sent.map((p) => (
                  <Person key={p.id} p={p} sub="Request sent">
                    <button className="mini-btn mini-btn--ghost" onClick={() => removeFriend(p.id)} title="Cancel request" aria-label={`Cancel request to ${p.name}`}>
                      <Icon name="close" size={14} />
                    </button>
                  </Person>
                ))}
              </ul>
            </>
          )}

          {me.recent.length > 0 && (
            <>
              <h4 className="social-title">Played with recently</h4>
              <ul className="people">
                {me.recent.map((p) => {
                  const live = onlineById.get(p.id);
                  return (
                    <Person key={p.id} p={p} status={live?.status} sub={live ? statusText(live.status) : undefined} onOpen={() => onOpenPlayer(p.id)}>
                      {live && live.status !== 'playing' && <InviteButton name={p.name} onClick={() => onInvite(p.id)} />}
                      <button className="mini-btn mini-btn--yes" onClick={() => addFriend(p.id)} aria-label={`Add ${p.name} as a friend`}>
                        <Icon name="plus" size={16} />
                      </button>
                    </Person>
                  );
                })}
              </ul>
            </>
          )}

          {onlineStrangers.length > 0 && (
            <>
              <h4 className="social-title">
                Online now <span className="muted">· real players</span>
              </h4>
              <ul className="people">
                {onlineStrangers.map((p) => (
                  <Person key={p.id} p={p} status={p.status} sub={statusText(p.status)} onOpen={() => onOpenPlayer(p.id)}>
                    {p.status !== 'playing' && <InviteButton name={p.name} onClick={() => onInvite(p.id)} />}
                    <button className="mini-btn mini-btn--yes" onClick={() => addFriend(p.id)} aria-label={`Add ${p.name} as a friend`}>
                      <Icon name="plus" size={16} />
                    </button>
                  </Person>
                ))}
              </ul>
            </>
          )}

        </>
      )}
    </div>
  );
}

/** Your friend link: whoever opens it and accepts becomes your friend. */
function InviteLink({ me }: { me: MeInfo }) {
  const [copied, setCopied] = useState(false);
  const link = friendLink(me);
  const share = async () => {
    // Phones: the usual share sheet (WhatsApp, Messages…). Computers: copy it.
    const touch = matchMedia('(hover: none)').matches;
    if (touch && navigator.share) {
      try {
        await navigator.share({ title: 'Pedro', text: "Let's be friends on Pedro 🃏", url: link });
        return;
      } catch {
        /* cancelled: fall back to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(`Let's be friends on Pedro 🃏 ${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt('Copy your friendship link:', link);
    }
  };
  return (
    <button className={`btn btn--share ${copied ? 'is-copied' : ''}`} onClick={share}>
      <Icon name={copied ? 'check' : 'link'} size={18} /> {copied ? 'Link copied — paste it in a chat' : 'Share friendship link'}
    </button>
  );
}

function Person({
  p,
  status,
  sub,
  children,
  onOpen,
}: {
  p: PlayerCard;
  status?: FriendInfo['status'];
  sub?: string;
  children?: React.ReactNode;
  /** Tap the row to see their card. */
  onOpen?: () => void;
}) {
  const body = (
    <>
      <span className="person-avatar">
        <Avatar code={avatarFor(p)} size={36} />
        {status && <span className={`presence presence--${status}`} />}
      </span>
      <span className="person-info">
        <b>
          {p.name} <LevelChip level={p.level} />
        </b>
        {sub && <small className="muted">{sub}</small>}
      </span>
    </>
  );
  return (
    <li className={`person ${onOpen ? 'is-tappable' : ''}`}>
      {onOpen ? (
        <button className="person-open" onClick={onOpen} aria-label={`See ${p.name}'s profile`}>
          {body}
        </button>
      ) : (
        body
      )}
      {children}
    </li>
  );
}

function statusText(status: FriendInfo['status'], round?: number) {
  return status === 'playing'
    ? `Playing${round ? ` · round ${round}` : ''}`
    : status === 'waiting'
      ? 'At a table, waiting'
      : status === 'online'
        ? 'Online'
        : 'Offline';
}

/** Ask someone online to come and play (opens a table for you both). */
function InviteButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button className="btn btn--small btn--invite" onClick={onClick} title={`Invite ${name} to play`} aria-label={`Invite ${name} to play`}>
      Invite
    </button>
  );
}

function FriendRow({ f, onJoin, onInvite, onOpen }: { f: FriendInfo; onJoin: Props['onJoin']; onInvite: Props['onInvite']; onOpen: () => void }) {
  const sub = statusText(f.status, f.table?.round);
  const canJoin = f.status === 'waiting' && f.table && f.table.visibility !== 'quick';
  return (
    <Person p={f} status={f.status} sub={sub} onOpen={onOpen}>
      {canJoin ? (
        <button className="btn btn--small btn--primary" onClick={() => onJoin(f.table!.code, f.table!.visibility, f.table!.key)}>
          Join
        </button>
      ) : f.status === 'online' ? (
        <InviteButton name={f.name} onClick={() => onInvite(f.id)} />
      ) : (
        <Icon name="chevron" size={16} className="person-chevron" />
      )}
    </Person>
  );
}

/* ───────────── weekly ranking ───────────── */

function timeLeft(ends: number): string {
  const ms = Math.max(0, ends - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

function Ranking({
  board,
  myId,
  myWeek,
  onOpenPlayer,
}: {
  onOpenPlayer: (id: string) => void;
  board: ReturnType<typeof useLobby>['board'];
  myId?: string;
  myWeek?: { rank: number | null; points: number; wins: number; games: number };
}) {
  const [help, setHelp] = useState(false);
  if (!board) return <p className="muted small social-empty">Loading the ranking…</p>;
  const inTop = board.top.some((r) => r.id === myId);
  const toGo = Math.max(0, POINTS.minGames - (myWeek?.games ?? 0));
  return (
    <div className="ranking">
      <div className="ranking-head">
        <span className="muted small">Resets in {timeLeft(board.ends)}</span>
        <button className="link small" onClick={() => setHelp(!help)}>
          {help ? 'Close' : 'How points work'}
        </button>
      </div>
      {help && (
        <ul className="points-help small">
          <li>
            <b>+{POINTS.play}</b> every online game you finish
          </li>
          <li>
            <b>+{POINTS.beat}</b> for each player who ends above you
          </li>
          <li>
            <b>+{POINTS.win}</b> for winning (lowest total)
          </li>
          <li>
            <b>up to +{POINTS.marginMax}</b> for ending far below the table's average
          </li>
          <li>
            Points add up all week. You enter the chart after {POINTS.minGames} games. Only games between people count, never against the computer.
          </li>
        </ul>
      )}
      {board.lastChampion && (
        <p className="last-champ small">
          <Icon name="crown" size={16} /> Last week: <b>{board.lastChampion.name}</b> · {board.lastChampion.points} pts
        </p>
      )}
      {board.top.length === 0 ? (
        <p className="muted small social-empty">Nobody is ranked yet this week. Play {POINTS.minGames} online games with people to be first!</p>
      ) : (
        <ol className="board">
          {board.top.map((r, i) => (
            <BoardLine key={r.id} r={r} rank={i + 1} me={r.id === myId} onOpen={() => onOpenPlayer(r.id)} />
          ))}
        </ol>
      )}
      {myWeek && !inTop && (
        <div className="board-me">
          {myWeek.rank ? (
            <span>
              You're <b>#{myWeek.rank}</b> with <b>{myWeek.points}</b> pts
            </span>
          ) : (
            <span>
              {myWeek.games} game{myWeek.games === 1 ? '' : 's'} this week · play <b>{toGo}</b> more to enter the chart
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BoardLine({ r, rank, me, onOpen }: { r: BoardRow; rank: number; me: boolean; onOpen: () => void }) {
  const medal = rank <= 3 ? ['gold', 'silver', 'bronze'][rank - 1] : null;
  return (
    <li className={`board-row ${me ? 'is-me' : ''}`} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <span className={`board-rank ${medal ? `medal medal--${medal}` : ''}`}>{rank}</span>
      <Avatar code={avatarFor(r)} size={30} />
      <span className="board-name">
        <b>
          {r.name} <LevelChip level={r.level} />
        </b>
        <small className="muted">
          {r.wins}W · {r.games} games
        </small>
      </span>
      <span className="board-pts">{r.points}</span>
    </li>
  );
}
