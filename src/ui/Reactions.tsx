import { useEffect, useState } from 'react';
import { REACTIONS, type Reaction } from '../online/protocol';
import { Avatar, ReactionFace } from './art/Avatar';

export const REACTION_LABEL: Record<Reaction, string> = {
  laugh: 'HAHAHA',
  cry: 'nooo…',
  angry: 'GRRR',
  aura: '+1000 AURA',
};

const NAMES: Record<Reaction, string> = { laugh: 'Laugh', cry: 'Cry', angry: 'Angry', aura: 'Aura' };

/** How long a reaction stays on someone's face. */
export const REACTION_MS = 2600;
const COOLDOWN_MS = 1600;

/** The four reaction buttons on the left side of the table. */
export function ReactionBar({ onReact }: { onReact: (r: Reaction) => void }) {
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    if (!cooling) return;
    const t = setTimeout(() => setCooling(false), COOLDOWN_MS);
    return () => clearTimeout(t);
  }, [cooling]);
  return (
    <div className={`reaction-bar ${cooling ? 'is-cooling' : ''}`} role="group" aria-label="Reactions">
      {REACTIONS.map((r) => (
        <button
          key={r}
          className={`reaction-btn reaction-btn--${r}`}
          disabled={cooling}
          title={NAMES[r]}
          aria-label={NAMES[r]}
          onClick={() => {
            onReact(r);
            setCooling(true);
          }}
        >
          <ReactionFace mood={r} size="100%" />
        </button>
      ))}
    </div>
  );
}

/** Big version of someone's avatar making the face, popping up over their seat. */
export function ReactionPop({ code, mood, bot }: { code: string; mood: Reaction; bot?: boolean }) {
  return (
    <div className={`reaction-pop reaction-pop--${mood}`} aria-hidden>
      <span className="reaction-pop-glow" />
      <Avatar code={code} size="100%" mood={mood} bot={bot} />
      <span className="reaction-pop-label">{REACTION_LABEL[mood]}</span>
    </div>
  );
}
