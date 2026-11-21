import type { CSSProperties } from 'react';

/**
 * Pedro's own icon set: chunky, rounded, sticker-like (no system emoji).
 * Plain icons use `currentColor`; "sticker" icons (fire, crown, trophy…) carry their own colours
 * with a dark outline so they read on any table.
 */

export type IconName =
  | 'home'
  | 'sound'
  | 'mute'
  | 'music'
  | 'sparkle'
  | 'gear'
  | 'help'
  | 'close'
  | 'edit'
  | 'check'
  | 'link'
  | 'robot'
  | 'eye'
  | 'lock'
  | 'unlock'
  | 'plus'
  | 'chevron'
  | 'copy'
  | 'users'
  | 'shuffle'
  | 'away'
  | 'fire'
  | 'crown'
  | 'trophy'
  | 'flag';

const INK = '#1a1206';

export function Icon({ name, size = 24, className, style, title }: { name: IconName; size?: number | string; className?: string; style?: CSSProperties; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`icon icon--${name} ${className ?? ''}`}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}

const PATHS: Record<IconName, JSX.Element> = {
  home: (
    <path d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19Z" fill="currentColor" stroke="none" />
  ),
  sound: (
    <>
      <path d="M3.5 9.5H7l5-4v13l-5-4H3.5Z" fill="currentColor" stroke="none" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
      <path d="M18.3 6.3a8 8 0 0 1 0 11.4" />
    </>
  ),
  mute: (
    <>
      <path d="M3.5 9.5H7l5-4v13l-5-4H3.5Z" fill="currentColor" stroke="none" />
      <path d="m16 9.5 5 5m0-5-5 5" />
    </>
  ),
  music: (
    <>
      <path d="M9.5 17.5V5.8l10-2.3v11.7" />
      <circle cx="6.8" cy="17.6" r="3" fill="currentColor" stroke="none" />
      <circle cx="16.8" cy="15.3" r="3" fill="currentColor" stroke="none" />
      <path d="M9.5 9.2l10-2.3" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11 2.5c.9 5 3 7.2 8 8.2-5 1-7.1 3.2-8 8.2-.9-5-3-7.2-8-8.2 5-1 7.1-3.2 8-8.2Z" fill="currentColor" stroke="none" />
      <path d="M19 15.5c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3Z" fill="currentColor" stroke="none" />
    </>
  ),
  gear: (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="10.3" y="1.6" width="3.4" height="5" rx="1.2" fill="currentColor" stroke="none" transform={`rotate(${i * 45} 12 12)`} />
      ))}
      <path d="M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 1 0 0-14.8Zm0 4.4a3 3 0 1 1 0 6 3 3 0 1 1 0-6Z" fill="currentColor" stroke="none" fillRule="evenodd" />
    </>
  ),
  help: (
    <>
      <path d="M8.6 8.8a3.5 3.5 0 1 1 5.3 3c-1.2.7-1.9 1.4-1.9 2.9" strokeWidth={3} />
      <circle cx="12" cy="19.2" r="1.9" fill="currentColor" stroke="none" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" strokeWidth={3} />,
  edit: (
    <>
      <path d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8Z" fill="currentColor" stroke="none" />
      <path d="M4 20h16" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" strokeWidth={3.2} />,
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />
    </>
  ),
  robot: (
    <>
      <rect x="4" y="7.5" width="16" height="12" rx="4" fill="currentColor" stroke="none" />
      <path d="M12 7.5V4" />
      <circle cx="12" cy="3.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13" r="1.7" fill="#fff" stroke="none" />
      <circle cx="15" cy="13" r="1.7" fill="#fff" stroke="none" />
    </>
  ),
  lock: (
    <>
      <path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" strokeWidth={2.4} />
      <rect x="5" y="10" width="14" height="10.5" rx="2.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15" r="1.7" fill="#fff" stroke="none" />
    </>
  ),
  unlock: (
    <>
      <path d="M7.5 10.5V8a4.5 4.5 0 0 1 8.6-1.9" fill="none" strokeWidth={2.4} />
      <rect x="5" y="10" width="14" height="10.5" rx="2.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15" r="1.7" fill="#fff" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" strokeWidth={3} />,
  chevron: <path d="M9 5l7 7-7 7" strokeWidth={2.8} />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="12" rx="2.4" fill="currentColor" stroke="none" />
      <path d="M15.5 5.5v-.3A1.7 1.7 0 0 0 13.8 3.5H6.2A1.7 1.7 0 0 0 4.5 5.2v9.6a1.7 1.7 0 0 0 1.7 1.7h.3" fill="none" strokeWidth={2.2} />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.4" fill="currentColor" stroke="none" />
      <path d="M2.5 19.5c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6Z" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="9" r="2.8" fill="currentColor" stroke="none" opacity="0.6" />
      <path d="M15.5 13.6c3.3-.3 6 1.9 6 5.4h-4.3" fill="currentColor" stroke="none" opacity="0.6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="3.6" fill="#fff" stroke="none" />
      <circle cx="12.6" cy="11.6" r="1.8" fill={INK} stroke="none" />
    </>
  ),
  shuffle: (
    <>
      <path d="M3 7h3.5c4.5 0 6.5 10 11 10H21" />
      <path d="M3 17h3.5c1.8 0 3.1-1.6 4.3-3.5M13.2 9.5C14.4 8.1 15.7 7 17.5 7H21" />
      <path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5" />
    </>
  ),
  away: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.8" fill="currentColor" stroke="none" />
      <path d="m3 3 18 18" stroke="#fff" strokeWidth={4.4} />
      <path d="m3 3 18 18" />
    </>
  ),
  fire: (
    <g stroke={INK} strokeWidth={1.4}>
      <path
        d="M12.2 1.8c1.2 3.6 5.6 5.6 6.4 10.1.9 5-2.6 9.6-6.7 9.6-4.4 0-7.6-3.4-7-8 .4-3 2.4-4.4 2.8-7.2 1.6 1.4 2.1 3.2 2.1 4.6 1.5-2.3 2.6-5.2 2.4-9.1Z"
        fill="#ff5a1f"
      />
      <path d="M12.4 10.4c.6 2 3.4 3 3.4 6 0 2.3-1.7 3.8-3.8 3.8-2.2 0-3.9-1.6-3.6-4 .2-1.5 1.2-2.3 1.6-3.6.8.8 1.1 1.6 1.1 2.4.8-1.1 1.5-2.7 1.3-4.6Z" fill="#ffc531" />
      <path d="M12 15.6c.3 1 1.4 1.4 1.4 2.6a1.4 1.4 0 0 1-2.8 0c0-.8.6-1.2.9-2 .2.3.4.5.5-.6Z" fill="#fff6d6" strokeWidth={0} />
    </g>
  ),
  crown: (
    <g stroke={INK} strokeWidth={1.5}>
      <path d="M3 8.5 7.4 12 12 4.5l4.6 7.5L21 8.5 19.2 18.5H4.8Z" fill="#ffcc33" />
      <path d="M4.8 18.5h14.4v2.2H4.8Z" fill="#f29f05" />
      <circle cx="12" cy="13.6" r="1.6" fill="#ff5a6e" />
      <circle cx="3" cy="8.5" r="1.3" fill="#fff6d6" />
      <circle cx="12" cy="4.4" r="1.3" fill="#fff6d6" />
      <circle cx="21" cy="8.5" r="1.3" fill="#fff6d6" />
    </g>
  ),
  trophy: (
    <g stroke={INK} strokeWidth={1.4}>
      <path d="M7.2 5.5H3.6v1.8a4 4 0 0 0 4 4M16.8 5.5h3.6v1.8a4 4 0 0 1-4 4" fill="none" strokeWidth={1.9} />
      <path d="M6.6 2.8h10.8V9a5.4 5.4 0 0 1-10.8 0Z" fill="#ffcc33" />
      <path d="M9 4.6v4.2" stroke="#fff6d6" strokeWidth={1.6} />
      <path d="M10.4 14.2h3.2l.6 3.3H9.8Z" fill="#f29f05" />
      <rect x="7" y="17.5" width="10" height="3.6" rx="1" fill="#7a4a26" />
      <path d="M9.5 19.3h5" stroke="#ffcc33" strokeWidth={1.2} />
    </g>
  ),
  flag: (
    <g stroke={INK} strokeWidth={1.2}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" fill="#fff" />
      <path d="M2.5 9.7h19M2.5 14.3h19" stroke="none" />
      <path d="M3.6 5h16.8a1.1 1.1 0 0 1 1.1 1.1v3.6h-19V6.1A1.1 1.1 0 0 1 3.6 5Z" fill="#74acdf" strokeWidth={0} />
      <path d="M2.5 14.3h19v3.6a1.1 1.1 0 0 1-1.1 1.1H3.6a1.1 1.1 0 0 1-1.1-1.1Z" fill="#74acdf" strokeWidth={0} />
      <circle cx="12" cy="12" r="1.7" fill="#f6b40e" strokeWidth={0.8} />
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" fill="none" />
    </g>
  ),
};

/** Round yellow button with an icon (top bar, menus). */
export function IconButton({
  icon,
  label,
  onClick,
  off,
  pressed,
  className,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  off?: boolean;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <button className={`icon-btn ${off ? 'is-off' : ''} ${className ?? ''}`} onClick={onClick} title={label} aria-label={label} aria-pressed={pressed}>
      <Icon name={icon} size="58%" />
    </button>
  );
}
