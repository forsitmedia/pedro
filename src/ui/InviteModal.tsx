import { useEffect, useState } from 'react';
import { acceptInvite, checkInvite, useLobby, whenConnected } from '../online/lobby';
import { Avatar, avatarFor } from './art/Avatar';
import { Icon } from './art/Icon';

/** Opened a friend link (/f/<id>-<token>): "Fil wants to be your friend". */
export function InviteModal({ id, token, ready, onNeedName, onClose }: { id: string; token: string; ready: boolean; onNeedName: () => void; onClose: () => void }) {
  const { invite, me, notice } = useLobby();
  const [accepted, setAccepted] = useState(false);
  useEffect(() => whenConnected(() => checkInvite(id, token)), [id, token]);
  const from = invite?.id === id ? invite.from : undefined;
  const already = !!me?.friends.some((f) => f.id === id);
  const mine = me?.id === id;
  // Accepted: close once the lobby confirms.
  useEffect(() => {
    if (accepted && (already || notice)) {
      const t = setTimeout(onClose, 1600);
      return () => clearTimeout(t);
    }
  }, [accepted, already, notice]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sheet invite-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Friend invite">
        {from === undefined ? (
          <p className="muted">Opening the invite…</p>
        ) : from === null ? (
          <>
            <h2>This link doesn't work</h2>
            <p className="muted">Ask your friend to send their friend link again.</p>
            <button className="btn btn--primary btn--big" onClick={onClose}>
              OK
            </button>
          </>
        ) : (
          <>
            <div className="invite-avatar">
              <Avatar code={avatarFor(from)} size={110} />
            </div>
            <h2>{mine ? "That's your own link 🙂" : already || accepted ? `You and ${from.name} are friends!` : `${from.name} wants to be your friend`}</h2>
            {!mine && !already && !accepted && (
              <>
                <p className="muted">You'll see when {from.name} is online and can join their table in one tap.</p>
                {ready ? (
                  <button
                    className="btn btn--primary btn--big"
                    onClick={() => {
                      acceptInvite(id, token);
                      setAccepted(true);
                    }}
                  >
                    <Icon name="check" size={20} /> Accept
                  </button>
                ) : (
                  <button className="btn btn--primary btn--big" onClick={onNeedName}>
                    Create your player first
                  </button>
                )}
              </>
            )}
            <button className="link" onClick={onClose}>
              {already || accepted || mine ? 'Close' : 'Not now'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
