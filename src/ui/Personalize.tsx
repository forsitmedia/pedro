import { useEffect, useState, type CSSProperties } from 'react';
import type { Card } from '../engine/types';
import {
  ACCESSORIES,
  ACCESSORY_LABEL,
  Avatar,
  avatarCode,
  BG_COLORS,
  parseAvatar,
  randomAvatar,
  SPECIES,
  SPECIES_LABEL,
  type AvatarParts,
} from './art/Avatar';
import { Icon, type IconName } from './art/Icon';
import { CardView } from './CardView';
import { DECKS, MUSIC_STYLES, setPrefs, TABLES, usePrefs } from './prefs';
import { setAvatar, useProfile } from './profile';

/** Applies the chosen table to the page and adds its scenery (aliens on the moon base…). */
export function TableBackdrop() {
  const { table } = usePrefs();
  useEffect(() => {
    document.documentElement.dataset.table = table;
  }, [table]);
  if (table !== 'space') return null;
  return (
    <div className="space-decor" aria-hidden>
      <div className="stars stars--1" />
      <div className="stars stars--2" />
      <div className="moon" />
      <svg className="ufo" viewBox="0 0 80 50">
        <ellipse cx="40" cy="40" rx="20" ry="4" fill="#9fffb0" opacity="0.35" />
        <path d="M28 22 Q40 4 52 22 Z" fill="#9fd8ff" stroke="#1a1206" strokeWidth="2" />
        <circle cx="40" cy="16" r="4.5" fill="#8be08b" stroke="#1a1206" strokeWidth="1.6" />
        <circle cx="38.6" cy="15.4" r="1.2" fill="#1a1206" />
        <circle cx="41.6" cy="15.4" r="1.2" fill="#1a1206" />
        <ellipse cx="40" cy="25" rx="26" ry="7" fill="#c0c4d6" stroke="#1a1206" strokeWidth="2" />
        {[22, 32, 40, 48, 58].map((x) => (
          <circle key={x} cx={x} cy="25.5" r="1.8" fill="#ffcc33" />
        ))}
      </svg>
      <svg className="astro" viewBox="0 0 60 60">
        <g stroke="#1a1206" strokeWidth="2" strokeLinejoin="round">
          <rect x="18" y="28" width="24" height="20" rx="8" fill="#f4f4f8" />
          <rect x="11" y="30" width="9" height="6" rx="3" fill="#f4f4f8" transform="rotate(-25 15 33)" />
          <rect x="40" y="30" width="9" height="6" rx="3" fill="#f4f4f8" transform="rotate(25 45 33)" />
          <circle cx="30" cy="20" r="13" fill="#f4f4f8" />
          <ellipse cx="30" cy="20" rx="9" ry="7.5" fill="#8be08b" />
          <ellipse cx="26.5" cy="19.5" rx="2.4" ry="3.2" fill="#1a1206" />
          <ellipse cx="33.5" cy="19.5" rx="2.4" ry="3.2" fill="#1a1206" />
          <rect x="24" y="36" width="12" height="6" rx="2" fill="#ff5a6e" />
        </g>
      </svg>
      <svg className="alien-peek" viewBox="0 0 60 40">
        <g stroke="#1a1206" strokeWidth="2">
          <path d="M14 40 Q14 10 30 10 Q46 10 46 40 Z" fill="#8be08b" />
          <ellipse cx="24" cy="24" rx="4" ry="5.5" fill="#1a1206" />
          <ellipse cx="36" cy="24" rx="4" ry="5.5" fill="#1a1206" />
          <path d="M22 10 L18 2 M38 10 L42 2" />
          <circle cx="18" cy="2" r="2.2" fill="#ff8fc7" />
          <circle cx="42" cy="2" r="2.2" fill="#ff8fc7" />
        </g>
      </svg>
    </div>
  );
}

const PREVIEW: Card = { id: 'preview-k', rank: 13, suit: 'H' };
const PREVIEW_BACK: Card = { id: 'preview-b', rank: 5, suit: 'S' };

function Row({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-label">
        <Icon name={icon} size={22} />
        {label}
      </span>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`switch ${on ? 'is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span className="switch-knob" />
    </button>
  );
}

/** Sound, music, table and deck. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const prefs = usePrefs();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <header className="sheet-head">
          <h2>Settings</h2>
          <button className="icon-btn icon-btn--small" onClick={onClose} aria-label="Close">
            <Icon name="close" size="55%" />
          </button>
        </header>

        <Row icon={prefs.sound ? 'sound' : 'mute'} label="Sound effects">
          <Switch on={prefs.sound} onChange={(sound) => setPrefs({ sound })} label="Sound effects" />
        </Row>
        <Row icon="music" label="Music">
          <div className="pills">
            {MUSIC_STYLES.map((m) => (
              <button key={m.id} className={prefs.musicStyle === m.id ? 'on' : ''} onClick={() => setPrefs({ musicStyle: m.id })}>
                {m.label}
              </button>
            ))}
          </div>
        </Row>

        <h3 className="sheet-sub">Table</h3>
        <div className="tiles">
          {TABLES.map((t) => (
            <button key={t.id} className={`tile ${prefs.table === t.id ? 'on' : ''}`} onClick={() => setPrefs({ table: t.id })}>
              <span className={`swatch swatch--${t.id}`} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <h3 className="sheet-sub">Deck</h3>
        <div className="tiles">
          {DECKS.map((d) => (
            <button key={d.id} className={`tile ${prefs.deck === d.id ? 'on' : ''}`} onClick={() => setPrefs({ deck: d.id })}>
              <span className="deck-preview" style={{ '--cw': '44px' } as CSSProperties}>
                <CardView card={PREVIEW_BACK} faceUp={false} deck={d.id} />
                <CardView card={PREVIEW} faceUp deck={d.id} />
              </span>
              <span>{d.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Make your character: animal, colour, accessory and name. */
export function AvatarMaker({
  name,
  onName,
  onClose,
  first,
}: {
  name: string;
  onName: (n: string) => void;
  onClose: () => void;
  first?: boolean;
}) {
  const profile = useProfile();
  const [parts, setParts] = useState<AvatarParts>(() => parseAvatar(profile.avatar) ?? parseAvatar(randomAvatar())!);
  const [n, setN] = useState(name);
  const code = avatarCode(parts);
  const done = () => {
    setAvatar(code);
    onName(n.trim().slice(0, 16));
    onClose();
  };
  return (
    <div className="modal-backdrop">
      <div className="modal sheet maker" role="dialog" aria-label="Create your player">
        <header className="sheet-head">
          <h2>{first ? 'Create your player' : 'Your player'}</h2>
          {!first && (
            <button className="icon-btn icon-btn--small" onClick={onClose} aria-label="Close">
              <Icon name="close" size="55%" />
            </button>
          )}
        </header>
        <div className="maker-top">
          <div className="maker-preview">
            <Avatar code={code} size="100%" />
          </div>
          <div className="maker-name">
            <label>
              Your name
              <input value={n} maxLength={16} placeholder="Your name" onChange={(e) => setN(e.target.value)} />
            </label>
            <button className="btn" onClick={() => setParts(parseAvatar(randomAvatar())!)}>
              <Icon name="shuffle" size={18} /> Surprise me
            </button>
          </div>
        </div>

        <h3 className="sheet-sub">Character</h3>
        <div className="maker-grid">
          {SPECIES.map((sp) => (
            <button
              key={sp}
              className={`maker-opt ${parts.species === sp ? 'on' : ''}`}
              onClick={() => setParts({ ...parts, species: sp })}
              title={SPECIES_LABEL[sp]}
              aria-label={SPECIES_LABEL[sp]}
            >
              <Avatar code={avatarCode({ species: sp, color: parts.color, acc: 'none' })} size="100%" />
            </button>
          ))}
        </div>

        <h3 className="sheet-sub">Colour</h3>
        <div className="maker-colors">
          {BG_COLORS.map((c, i) => (
            <button
              key={c}
              className={`color-dot ${parts.color === i ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setParts({ ...parts, color: i })}
              aria-label={`Colour ${i + 1}`}
            />
          ))}
        </div>

        <h3 className="sheet-sub">Accessory</h3>
        <div className="maker-grid maker-grid--acc">
          {ACCESSORIES.map((a) => (
            <button key={a} className={`maker-opt ${parts.acc === a ? 'on' : ''}`} onClick={() => setParts({ ...parts, acc: a })} title={ACCESSORY_LABEL[a]}>
              <Avatar code={avatarCode({ ...parts, acc: a })} size="100%" />
              <span className="maker-opt-label">{ACCESSORY_LABEL[a]}</span>
            </button>
          ))}
        </div>

        <button className="btn btn--primary btn--big" disabled={!n.trim()} onClick={done}>
          <Icon name="check" size={20} /> {first ? "Let's play" : 'Save'}
        </button>
      </div>
    </div>
  );
}
