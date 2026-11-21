import type { ReactNode } from 'react';

/**
 * Player avatars: our own little characters. An avatar is stored as a short code
 * `species.color.accessory` (e.g. "frog.2.shades") so it can travel with the player online.
 */

export const SPECIES = ['frog', 'cat', 'fox', 'bear', 'panda', 'bunny', 'alien', 'axolotl', 'capy', 'ghost'] as const;
export type Species = (typeof SPECIES)[number];
export const SPECIES_LABEL: Record<Species, string> = {
  frog: 'Frog',
  cat: 'Cat',
  fox: 'Fox',
  bear: 'Bear',
  panda: 'Panda',
  bunny: 'Bunny',
  alien: 'Alien',
  axolotl: 'Axolotl',
  capy: 'Capybara',
  ghost: 'Ghost',
};

export const BG_COLORS = ['#ffcc33', '#ff7a59', '#ff8fc7', '#b18cff', '#6ec6ff', '#5ee6a0', '#f4ead5', '#2b2d42'];

export const ACCESSORIES = ['none', 'cap', 'beanie', 'crown', 'flower', 'shades', 'headphones'] as const;
export type Accessory = (typeof ACCESSORIES)[number];
export const ACCESSORY_LABEL: Record<Accessory, string> = {
  none: 'Nothing',
  cap: 'Cap',
  beanie: 'Beanie',
  crown: 'Crown',
  flower: 'Flower',
  shades: 'Shades',
  headphones: 'Headphones',
};

export interface AvatarParts {
  species: Species;
  color: number;
  acc: Accessory;
}

export const AVATAR_RE = /^[a-z]{2,10}\.\d\.[a-z]{2,12}$/;

export function parseAvatar(code: string | undefined | null): AvatarParts | null {
  if (!code || !AVATAR_RE.test(code)) return null;
  const [species, color, acc] = code.split('.');
  if (!SPECIES.includes(species as Species) || !ACCESSORIES.includes(acc as Accessory)) return null;
  return { species: species as Species, color: Number(color) % BG_COLORS.length, acc: acc as Accessory };
}

export const avatarCode = (p: AvatarParts) => `${p.species}.${p.color}.${p.acc}`;

/** A stable avatar for players who don't have one (computer players): derived from their name. */
export function avatarFor(p: { name: string; avatar?: string }): string {
  if (parseAvatar(p.avatar)) return p.avatar!;
  let h = 0;
  for (const ch of p.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const species = SPECIES[h % SPECIES.length];
  const color = (h >>> 4) % BG_COLORS.length;
  const acc = ACCESSORIES[(h >>> 8) % ACCESSORIES.length];
  return `${species}.${color}.${acc}`;
}

export function randomAvatar(): string {
  const r = (n: number) => Math.floor(Math.random() * n);
  return avatarCode({ species: SPECIES[r(SPECIES.length)], color: r(BG_COLORS.length), acc: ACCESSORIES[r(ACCESSORIES.length)] });
}

const INK = '#1a1206';

/** Two cartoon eyes with a highlight. */
const Eyes = ({ x1, x2, y, r = 4.6, white = true }: { x1: number; x2: number; y: number; r?: number; white?: boolean }) => (
  <g>
    {[x1, x2].map((x) => (
      <g key={x}>
        {white && <circle cx={x} cy={y} r={r} fill="#fff" stroke={INK} strokeWidth={1.6} />}
        <circle cx={x + 0.6} cy={y + 0.4} r={r * 0.52} fill={INK} />
        <circle cx={x + 1.6} cy={y - 0.8} r={r * 0.2} fill="#fff" />
      </g>
    ))}
  </g>
);

const Blush = ({ x1, x2, y }: { x1: number; x2: number; y: number }) => (
  <g fill="#ff6b8a" opacity={0.45}>
    <ellipse cx={x1} cy={y} rx={3.4} ry={2} />
    <ellipse cx={x2} cy={y} rx={3.4} ry={2} />
  </g>
);

const Smile = ({ y, w = 5 }: { y: number; w?: number }) => (
  <path d={`M${32 - w} ${y} Q32 ${y + w * 0.9} ${32 + w} ${y}`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
);

interface SpeciesArt {
  body: ReactNode;
  /** Eye centres, for sunglasses. */
  eyes: [number, number, number];
  /** Top of the head, for hats. */
  top: number;
  /** For drawing emotions: colour around the eyes, mouth height, dark eye patches (draw lines in white). */
  face: { skin: string; mouth: number; dark?: boolean };
}

const line = { stroke: INK, strokeWidth: 2, strokeLinejoin: 'round' as const };

const ART: Record<Species, SpeciesArt> = {
  frog: {
    top: 18,
    eyes: [22, 42, 24],
    face: { skin: '#6cc644', mouth: 46 },
    body: (
      <>
        <ellipse cx="32" cy="41" rx="22" ry="15" fill="#6cc644" {...line} />
        <circle cx="22" cy="25" r="8.5" fill="#6cc644" {...line} />
        <circle cx="42" cy="25" r="8.5" fill="#6cc644" {...line} />
        <ellipse cx="32" cy="45" rx="15" ry="7" fill="#9be36b" />
        <Eyes x1={22} x2={42} y={24} r={5} />
        <Blush x1={17} x2={47} y={41} />
        <path d="M22 42 Q32 50 42 42" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      </>
    ),
  },
  cat: {
    top: 18,
    eyes: [25, 39, 35],
    face: { skin: '#f4a259', mouth: 46 },
    body: (
      <>
        <path d="M14 30 L16 10 L28 20 Z" fill="#f4a259" {...line} />
        <path d="M50 30 L48 10 L36 20 Z" fill="#f4a259" {...line} />
        <path d="M17.5 24 L18 15 L24 20 Z" fill="#ffb3c1" />
        <path d="M46.5 24 L46 15 L40 20 Z" fill="#ffb3c1" />
        <circle cx="32" cy="37" r="19" fill="#f4a259" {...line} />
        <path d="M26 20 q6 4 12 0" fill="none" stroke="#d9772f" strokeWidth={2.4} strokeLinecap="round" />
        <Eyes x1={25} x2={39} y={35} />
        <path d="M30 41.5 h4 l-2 2.4 z" fill="#ff6b8a" stroke={INK} strokeWidth={1} />
        <path d="M28.5 46 q1.8 1.8 3.5 0 q1.7 1.8 3.5 0" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
        <path d="M14 40 h8 M14 44 l8 -1.5 M50 40 h-8 M50 44 l-8 -1.5" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />
      </>
    ),
  },
  fox: {
    top: 17,
    eyes: [25, 39, 34],
    face: { skin: '#e8743b', mouth: 47 },
    body: (
      <>
        <path d="M12 30 L14 8 L28 19 Z" fill="#e8743b" {...line} />
        <path d="M52 30 L50 8 L36 19 Z" fill="#e8743b" {...line} />
        <path d="M14.6 14 L15 9 L19.5 12.5 Z M49.4 14 L49 9 L44.5 12.5 Z" fill={INK} />
        <path d="M12 32 Q14 18 32 18 Q50 18 52 32 Q50 46 32 54 Q14 46 12 32 Z" fill="#e8743b" {...line} />
        <path d="M14 34 Q24 36 32 54 Q40 36 50 34 Q46 46 32 54 Q18 46 14 34 Z" fill="#fff6ea" />
        <Eyes x1={25} x2={39} y={34} r={4.2} />
        <ellipse cx="32" cy="46" rx="3" ry="2.2" fill={INK} />
      </>
    ),
  },
  bear: {
    top: 18,
    eyes: [25, 39, 34],
    face: { skin: '#a0704a', mouth: 46 },
    body: (
      <>
        <circle cx="16" cy="21" r="7.5" fill="#a0704a" {...line} />
        <circle cx="48" cy="21" r="7.5" fill="#a0704a" {...line} />
        <circle cx="16" cy="21" r="3.6" fill="#d9a57a" />
        <circle cx="48" cy="21" r="3.6" fill="#d9a57a" />
        <circle cx="32" cy="37" r="19" fill="#a0704a" {...line} />
        <ellipse cx="32" cy="44" rx="9" ry="7" fill="#e3bf98" />
        <Eyes x1={25} x2={39} y={34} r={4} />
        <ellipse cx="32" cy="41" rx="3.4" ry="2.4" fill={INK} />
        <path d="M32 43.5 v2.5 M29 47 q3 2 6 0" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      </>
    ),
  },
  panda: {
    top: 18,
    eyes: [25, 39, 35],
    face: { skin: INK, mouth: 46, dark: true },
    body: (
      <>
        <circle cx="16" cy="21" r="7.5" fill={INK} />
        <circle cx="48" cy="21" r="7.5" fill={INK} />
        <circle cx="32" cy="37" r="19" fill="#fff" {...line} />
        <ellipse cx="24.5" cy="35.5" rx="5.6" ry="7" fill={INK} transform="rotate(25 24.5 35.5)" />
        <ellipse cx="39.5" cy="35.5" rx="5.6" ry="7" fill={INK} transform="rotate(-25 39.5 35.5)" />
        <circle cx="25" cy="35" r="2.6" fill="#fff" />
        <circle cx="39" cy="35" r="2.6" fill="#fff" />
        <circle cx="25.4" cy="35.3" r="1.3" fill={INK} />
        <circle cx="39.4" cy="35.3" r="1.3" fill={INK} />
        <ellipse cx="32" cy="43" rx="2.8" ry="2" fill={INK} />
        <Smile y={46} w={3.5} />
        <Blush x1={19} x2={45} y={44} />
      </>
    ),
  },
  bunny: {
    top: 20,
    eyes: [25, 39, 37],
    face: { skin: '#f7f1ec', mouth: 48 },
    body: (
      <>
        <ellipse cx="23" cy="15" rx="6" ry="14" fill="#f7f1ec" {...line} />
        <ellipse cx="41" cy="15" rx="6" ry="14" fill="#f7f1ec" {...line} />
        <ellipse cx="23" cy="16" rx="2.8" ry="9.5" fill="#ffb3c1" />
        <ellipse cx="41" cy="16" rx="2.8" ry="9.5" fill="#ffb3c1" />
        <circle cx="32" cy="39" r="18" fill="#f7f1ec" {...line} />
        <Eyes x1={25} x2={39} y={37} r={4} />
        <path d="M30 43 h4 l-2 2.2 z" fill="#ff6b8a" />
        <rect x="30" y="47" width="4" height="4" rx="1" fill="#fff" stroke={INK} strokeWidth={1.2} />
        <Blush x1={19} x2={45} y={45} />
      </>
    ),
  },
  alien: {
    top: 15,
    eyes: [24, 40, 34],
    face: { skin: INK, mouth: 48, dark: true },
    body: (
      <>
        <path d="M24 16 L20 6 M40 16 L44 6" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        <circle cx="20" cy="6" r="3" fill="#ff8fc7" stroke={INK} strokeWidth={1.6} />
        <circle cx="44" cy="6" r="3" fill="#ff8fc7" stroke={INK} strokeWidth={1.6} />
        <path d="M32 14 C48 14 52 26 50 36 C48 48 38 56 32 56 C26 56 16 48 14 36 C12 26 16 14 32 14 Z" fill="#8be08b" {...line} />
        <ellipse cx="24" cy="35" rx="6" ry="8.5" fill={INK} transform="rotate(-28 24 35)" />
        <ellipse cx="40" cy="35" rx="6" ry="8.5" fill={INK} transform="rotate(28 40 35)" />
        <circle cx="22.5" cy="32" r="2" fill="#fff" />
        <circle cx="38.5" cy="32" r="2" fill="#fff" />
        <path d="M29 48 q3 2 6 0" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
      </>
    ),
  },
  axolotl: {
    top: 20,
    eyes: [23, 41, 36],
    face: { skin: '#ffaad4', mouth: 45 },
    body: (
      <>
        {[-1, 1].map((side) => (
          <g key={side} stroke="#e0508f" strokeWidth={3.4} strokeLinecap="round">
            <path d={`M${32 + side * 18} 32 l${side * 10} -7`} />
            <path d={`M${32 + side * 19} 37 l${side * 11} -1`} />
            <path d={`M${32 + side * 18} 42 l${side * 10} 5`} />
          </g>
        ))}
        <ellipse cx="32" cy="39" rx="21" ry="16" fill="#ffaad4" {...line} />
        <Eyes x1={23} x2={41} y={36} r={3.4} white={false} />
        <path d="M24 44 Q32 50 40 44" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        <Blush x1={18} x2={46} y={43} />
      </>
    ),
  },
  capy: {
    top: 17,
    eyes: [23, 41, 31],
    face: { skin: '#b07d4f', mouth: 49 },
    body: (
      <>
        <circle cx="17" cy="20" r="4.5" fill="#8a5a33" {...line} />
        <circle cx="47" cy="20" r="4.5" fill="#8a5a33" {...line} />
        <rect x="11" y="18" width="42" height="38" rx="17" fill="#b07d4f" {...line} />
        <rect x="20" y="38" width="24" height="16" rx="8" fill="#9a6a40" />
        <ellipse cx="27" cy="42" rx="2" ry="1.4" fill={INK} />
        <ellipse cx="37" cy="42" rx="2" ry="1.4" fill={INK} />
        <path d="M21 31 q2.5 -2 5 0 M38 31 q2.5 -2 5 0" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
        <path d="M28 49 q4 2.5 8 0" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
      </>
    ),
  },
  ghost: {
    top: 13,
    eyes: [25, 39, 31],
    face: { skin: INK, mouth: 41, dark: true },
    body: (
      <>
        <path d="M14 34 C14 18 22 12 32 12 C42 12 50 18 50 34 V54 l-6 -4 l-6 4 l-6 -4 l-6 4 l-6 -4 l-6 4 Z" fill="#f7f7fb" {...line} />
        <ellipse cx="25" cy="31" rx="3.6" ry="5" fill={INK} />
        <ellipse cx="39" cy="31" rx="3.6" ry="5" fill={INK} />
        <circle cx="26" cy="29" r="1.3" fill="#fff" />
        <circle cx="40" cy="29" r="1.3" fill="#fff" />
        <ellipse cx="32" cy="41" rx="3" ry="3.6" fill={INK} />
        <Blush x1={20} x2={44} y={38} />
      </>
    ),
  },
};

function AccessoryArt({ acc, art }: { acc: Accessory; art: SpeciesArt }) {
  const t = art.top;
  const [x1, x2, y] = art.eyes;
  switch (acc) {
    case 'cap':
      return (
        <g {...line}>
          <path d={`M17 ${t + 4} Q17 ${t - 10} 32 ${t - 10} Q47 ${t - 10} 47 ${t + 4} Z`} fill="#ff5a6e" />
          <path d={`M30 ${t + 4} Q44 ${t + 1} 56 ${t + 6} Q46 ${t + 8} 30 ${t + 4} Z`} fill="#d93a52" />
          <circle cx="32" cy={t - 10} r="1.8" fill="#ffcc33" />
        </g>
      );
    case 'beanie':
      return (
        <g {...line}>
          <path d={`M16 ${t + 5} Q16 ${t - 12} 32 ${t - 12} Q48 ${t - 12} 48 ${t + 5} Z`} fill="#6ec6ff" />
          <rect x="14" y={t + 1} width="36" height="7" rx="3.5" fill="#3d8fd1" />
          <circle cx="32" cy={t - 13} r="4" fill="#fff" />
        </g>
      );
    case 'crown':
      return (
        <g {...line}>
          <path d={`M20 ${t + 4} L19 ${t - 9} L25.5 ${t - 3} L32 ${t - 12} L38.5 ${t - 3} L45 ${t - 9} L44 ${t + 4} Z`} fill="#ffcc33" />
          <circle cx="32" cy={t - 1} r="2" fill="#ff5a6e" />
        </g>
      );
    case 'flower':
      return (
        <g transform={`translate(45 ${t})`} stroke={INK} strokeWidth={1.4}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-4.6" rx="3.4" ry="4.6" fill="#ff8fc7" transform={`rotate(${a})`} />
          ))}
          <circle r="3" fill="#ffcc33" />
        </g>
      );
    case 'shades':
      return (
        <g stroke={INK} strokeWidth={1.8}>
          <path d={`M${x1 - 9} ${y - 3} H${x2 + 9}`} />
          <rect x={x1 - 7.5} y={y - 5} width="15" height="9.5" rx="4" fill={INK} />
          <rect x={x2 - 7.5} y={y - 5} width="15" height="9.5" rx="4" fill={INK} />
          <path d={`M${x1 - 4} ${y - 2} l3 0 M${x2 - 4} ${y - 2} l3 0`} stroke="#fff" strokeWidth={1.4} strokeLinecap="round" />
        </g>
      );
    case 'headphones':
      return (
        <g stroke={INK} strokeWidth={2}>
          <path d={`M11 ${y + 2} Q11 ${t - 10} 32 ${t - 10} Q53 ${t - 10} 53 ${y + 2}`} fill="none" strokeWidth={4} />
          <path d={`M11 ${y + 2} Q11 ${t - 10} 32 ${t - 10} Q53 ${t - 10} 53 ${y + 2}`} fill="none" stroke="#b18cff" strokeWidth={2} />
          <rect x="5" y={y - 4} width="10" height="15" rx="4" fill="#b18cff" />
          <rect x="49" y={y - 4} width="10" height="15" rx="4" fill="#b18cff" />
        </g>
      );
    default:
      return null;
  }
}

export function Avatar({
  code,
  size = 40,
  className,
  ring,
  bot,
  mood,
}: {
  code?: string | null;
  size?: number | string;
  className?: string;
  ring?: boolean;
  /** A computer player: little robot badge in the corner. */
  bot?: boolean;
  /** A reaction showing on the face right now. */
  mood?: Mood | null;
}) {
  const p = parseAvatar(code) ?? { species: 'frog' as Species, color: 0, acc: 'none' as Accessory };
  const art = ART[p.species];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`avatar ${ring ? 'avatar--ring' : ''} ${className ?? ''}`} aria-hidden>
      <circle cx="32" cy="32" r="31" fill={BG_COLORS[p.color]} />
      <g>{art.body}</g>
      <AccessoryArt acc={p.acc} art={art} />
      {mood && <MoodLayer mood={mood} art={art} />}
      <circle cx="32" cy="32" r="30.5" fill="none" stroke={INK} strokeWidth={2.5} />
      {bot && <BotBadge />}
    </svg>
  );
}

/** "This is a computer player" sticker. */
function BotBadge() {
  return (
    <g stroke={INK} strokeWidth={2} strokeLinejoin="round">
      <title>Computer player</title>
      <circle cx="50" cy="50" r="13" fill="#9fd8ff" />
      <path d="M50 38.5v3.5" strokeLinecap="round" />
      <circle cx="50" cy="38" r="1.8" fill="#ff5a6e" />
      <rect x="42" y="42.5" width="16" height="12.5" rx="3.5" fill="#f4f4f8" />
      <circle cx="46.5" cy="48.2" r="1.7" fill={INK} stroke="none" />
      <circle cx="53.5" cy="48.2" r="1.7" fill={INK} stroke="none" />
      <path d="M46.5 52h7" strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
}

/* ───────────── emotions (reactions) ───────────── */

export type Mood = 'laugh' | 'cry' | 'angry' | 'aura';

const Star = ({ x, y, r, className }: { x: number; y: number; r: number; className?: string }) => (
  <path
    className={className}
    d={`M${x} ${y - r} Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r} Z`}
    fill="#ffe14d"
    stroke={INK}
    strokeWidth={1.2}
  />
);

/** Draws the emotion on top of any character's face. */
function MoodLayer({ mood, art }: { mood: Mood; art: SpeciesArt }) {
  const [x1, x2, y] = art.eyes;
  const { skin, mouth: m, dark } = art.face;
  const ink = dark ? '#fff' : INK;
  const cover = (
    <g fill={skin}>
      <circle cx={x1} cy={y} r={6} />
      <circle cx={x2} cy={y} r={6} />
    </g>
  );
  const stroke = { fill: 'none', stroke: ink, strokeWidth: 2.4, strokeLinecap: 'round' as const };
  switch (mood) {
    case 'laugh':
      return (
        <g className="mood mood--laugh">
          {cover}
          {/* ^ ^ eyes squeezed shut from laughing */}
          <path d={`M${x1 - 4} ${y + 1.5} Q${x1} ${y - 4} ${x1 + 4} ${y + 1.5} M${x2 - 4} ${y + 1.5} Q${x2} ${y - 4} ${x2 + 4} ${y + 1.5}`} {...stroke} />
          <path d={`M24.5 ${m - 2} Q32 ${m + 11} 39.5 ${m - 2} Z`} fill={INK} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
          <ellipse cx="32" cy={m + 4.2} rx="3.6" ry="2" fill="#ff6b8a" />
          <path className="joy-tear" d={`M${x1 - 7} ${y + 1} q-2.4 3.6 0 5 q2.4 -1.4 0 -5 Z`} fill="#7cc8ff" stroke={INK} strokeWidth={0.8} />
          <path className="joy-tear joy-tear--2" d={`M${x2 + 7} ${y + 1} q-2.4 3.6 0 5 q2.4 -1.4 0 -5 Z`} fill="#7cc8ff" stroke={INK} strokeWidth={0.8} />
        </g>
      );
    case 'cry':
      return (
        <g className="mood mood--cry">
          {cover}
          <path d={`M${x1 - 4} ${y - 1} Q${x1} ${y + 3} ${x1 + 4} ${y - 1} M${x2 - 4} ${y - 1} Q${x2} ${y + 3} ${x2 + 4} ${y - 1}`} {...stroke} />
          {/* sad brows */}
          <path d={`M${x1 - 4} ${y - 6} L${x1 + 3} ${y - 8} M${x2 + 4} ${y - 6} L${x2 - 3} ${y - 8}`} {...stroke} strokeWidth={1.8} />
          <rect className="tear-stream" x={x1 - 1.6} y={y + 2} width="3.2" height="16" rx="1.6" fill="#7cc8ff" />
          <rect className="tear-stream tear-stream--2" x={x2 - 1.6} y={y + 2} width="3.2" height="16" rx="1.6" fill="#7cc8ff" />
          <path d={`M26 ${m + 3} Q29 ${m - 1} 32 ${m + 1.5} Q35 ${m - 1} 38 ${m + 3}`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    case 'angry':
      return (
        <g className="mood mood--angry">
          <circle cx="32" cy="32" r="31" fill="#ff2d2d" opacity={0.22} />
          <path d={`M${x1 - 6} ${y - 9} L${x1 + 4} ${y - 4.5} M${x2 + 6} ${y - 9} L${x2 - 4} ${y - 4.5}`} fill="none" stroke={INK} strokeWidth={3.2} strokeLinecap="round" />
          <path d={`M26 ${m + 2.5} Q32 ${m - 3.5} 38 ${m + 2.5}`} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          <g className="steam" fill="#fff" stroke={INK} strokeWidth={1}>
            <circle cx="8" cy="14" r="3.2" />
            <circle cx="5" cy="9" r="2.2" />
            <circle cx="56" cy="14" r="3.2" />
            <circle cx="59" cy="9" r="2.2" />
          </g>
        </g>
      );
    case 'aura':
      return (
        <g className="mood mood--aura">
          {/* cool shades */}
          <g stroke={INK} strokeWidth={1.6} strokeLinejoin="round">
            <rect x={x1 - 6.5} y={y - 4.5} width="13" height="8.5" rx="3" fill={INK} />
            <rect x={x2 - 6.5} y={y - 4.5} width="13" height="8.5" rx="3" fill={INK} />
            <path d={`M${x1 + 6.5} ${y - 2} H${x2 - 6.5}`} fill="none" />
          </g>
          <path d={`M${x1 - 4} ${y - 2.5} l3 -0 M${x2 - 4} ${y - 2.5} l3 0`} stroke="#fff" strokeWidth={1.4} strokeLinecap="round" />
          <path d={`M27 ${m + 0.5} Q33 ${m + 3.5} 38.5 ${m - 2}`} fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
          <Star x={9} y={13} r={4.5} className="sparkle" />
          <Star x={55} y={16} r={3.5} className="sparkle sparkle--2" />
          <Star x={54} y={50} r={4} className="sparkle sparkle--3" />
        </g>
      );
  }
}

/** A plain yellow face showing a reaction (for the reaction buttons). */
export function ReactionFace({ mood, size = 28 }: { mood: Mood; size?: number | string }) {
  const art: SpeciesArt = { top: 14, eyes: [24, 40, 28], face: { skin: '#ffcc33', mouth: 42 }, body: null };
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="reaction-face">
      <circle cx="32" cy="32" r="29" fill="#ffcc33" stroke={INK} strokeWidth={3} />
      {mood === 'angry' && <circle cx="32" cy="32" r="29" fill="#ff4d2d" />}
      {mood === 'aura' && <circle cx="32" cy="32" r="29" fill="#b48bff" />}
      {/* The angry face keeps its eyes (only brows are added). */}
      {mood === 'angry' && (
        <g fill={INK}>
          <circle cx="24" cy="30" r="3" />
          <circle cx="40" cy="30" r="3" />
        </g>
      )}
      <MoodLayer mood={mood} art={{ ...art, face: { ...art.face, skin: mood === 'angry' ? '#ff4d2d' : mood === 'aura' ? '#b48bff' : '#ffcc33' } }} />
      <circle cx="32" cy="32" r="29" fill="none" stroke={INK} strokeWidth={3} />
    </svg>
  );
}
