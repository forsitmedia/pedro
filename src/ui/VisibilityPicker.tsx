import { Icon } from './art/Icon';

const OPTIONS = [
  { id: 'open', icon: 'unlock', title: 'Open', text: 'Anyone can sit down' },
  { id: 'private', icon: 'lock', title: 'Friends only', text: 'Others ask to join' },
] as const;

/** Open or friends-only: two big tiles with an open and a closed lock. */
export function VisibilityPicker({
  value,
  onChange,
  disabled,
}: {
  value: 'open' | 'private';
  onChange: (v: 'open' | 'private') => void;
  disabled?: boolean;
}) {
  return (
    <div className="vis-picker" role="radiogroup" aria-label="Who can join">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          className={`vis-option ${value === o.id ? 'on' : ''}`}
          onClick={() => onChange(o.id)}
        >
          <span className="vis-icon">
            <Icon name={o.icon} size={22} />
          </span>
          <span className="vis-text">
            <b>{o.title}</b>
            <small>{o.text}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
