import { useState } from 'react';
import { findQuickMatch, useLobby } from '../online/lobby';
import { MAX_SEATS, QUICK_SEATS, type TableListing, type Visibility } from '../online/protocol';
import { Avatar, avatarFor } from './art/Avatar';
import { Icon } from './art/Icon';
import { VisibilityPicker } from './VisibilityPicker';

interface Props {
  /** Open a table: `create` = sit down straight away. */
  onOpen: (code: string, mode: Visibility) => void;
  onCreate: (mode: 'open' | 'private') => void;
  /** False until the player has a name (then the avatar maker opens instead). */
  ready: boolean;
  onNeedName: () => void;
}

/** "Play online": who's around, quick match, open and private tables. */
export function LobbyPanel({ onOpen, onCreate, ready, onNeedName }: Props) {
  const { lobby } = useLobby();
  const [mode, setMode] = useState<'open' | 'private'>('open');
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState('');

  const guard = (fn: () => void) => () => (ready ? fn() : onNeedName());

  const quick = guard(async () => {
    setFinding(true);
    setError('');
    try {
      onOpen(await findQuickMatch(), 'quick');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — try again.');
    } finally {
      setFinding(false);
    }
  });

  const tables = lobby?.tables ?? [];

  return (
    <section className="panel online-panel">
      <div className="online-head">
        <h2>Play online</h2>
        <span className={`live ${lobby ? 'is-on' : ''}`}>
          <span className="live-dot" />
          {lobby ? `${lobby.online} online` : 'connecting…'}
          {lobby && lobby.playing > 0 && <span className="muted"> · {lobby.playing} at tables</span>}
        </span>
      </div>

      <div className="online-actions">
        <div className="action-card action-card--quick">
          <div className="action-card-head">
            <span className="action-icon">
              <Icon name="fire" size={26} />
            </span>
            <div>
              <h3>Quick match</h3>
              <p className="muted small">Play with whoever is waiting. Nobody there in 20 seconds? You play the computer.</p>
            </div>
          </div>
          <button className="btn btn--primary btn--big" disabled={finding} onClick={quick}>
            {finding ? 'Finding a table…' : 'Find a game'}
          </button>
        </div>
        <div className="action-card">
          <div className="action-card-head">
            <span className="action-icon action-icon--blue">
              <Icon name="users" size={26} />
            </span>
            <div>
              <h3>Your own table</h3>
              <p className="muted small">Pick the rules and who can join.</p>
            </div>
          </div>
          <VisibilityPicker value={mode} onChange={setMode} />
          <button className="btn btn--online btn--big" onClick={guard(() => onCreate(mode))}>
            Create the table
          </button>
        </div>
      </div>
      {error && <p className="error small">{error}</p>}

      <h3 className="tables-title">Tables right now</h3>
      {tables.length === 0 ? (
        <p className="muted small tables-empty">
          {lobby ? 'Nobody is playing right now. Open a table — people who come by will see it here.' : 'Looking for tables…'}
        </p>
      ) : (
        <ul className="table-list">
          {tables.map((t) => (
            <TableRow key={t.code} t={t} onJoin={guard(() => onOpen(t.code, t.visibility))} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TableRow({ t, onJoin }: { t: TableListing; onJoin: () => void }) {
  const max = t.visibility === 'quick' ? QUICK_SEATS : MAX_SEATS;
  const seated = t.players.length + t.bots;
  const full = seated >= max;
  const names = t.players.map((p) => p.name);
  const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(' & ');

  let status: string;
  if (t.started) status = t.round ? `Playing · round ${t.round}` : 'Playing';
  else if (t.visibility === 'quick') status = 'Quick match · starting soon';
  else status = `Waiting · ${seated}/${max}`;

  let action: JSX.Element;
  if (t.started) action = <span className="table-tag">In game</span>;
  else if (full) action = <span className="table-tag">Full</span>;
  else if (t.visibility === 'private')
    action = (
      <button className="btn btn--small" onClick={onJoin}>
        Ask to join
      </button>
    );
  else
    action = (
      <button className="btn btn--small btn--primary" onClick={onJoin}>
        Join
      </button>
    );

  return (
    <li className={`table-row ${t.started ? 'is-playing' : ''}`}>
      <div className="table-avatars">
        {t.players.slice(0, 4).map((p, i) => (
          <Avatar key={i} code={avatarFor(p)} size={34} />
        ))}
        {t.bots > 0 && (
          <span className="table-bots" title={`${t.bots} computer player${t.bots > 1 ? 's' : ''}`}>
            <Icon name="robot" size={18} />
            {t.bots > 1 && t.bots}
          </span>
        )}
      </div>
      <div className="table-info">
        <b>{who}</b>
        <span className="muted small">
          {t.visibility === 'private' && (
            <>
              <Icon name="lock" size={13} /> Friends only ·{' '}
            </>
          )}
          {status}
        </span>
      </div>
      {action}
    </li>
  );
}
