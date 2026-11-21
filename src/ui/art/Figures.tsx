/**
 * Our own court-card characters (J, Q, K, Joker), drawn as simple bold busts.
 * Colours come from CSS variables set by each deck (`--fig-*`), so one drawing serves every deck.
 * `skull` swaps the face for a skull (the "Deadly" deck).
 */

const L = { stroke: 'var(--fig-line)', strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

function Head({ skull }: { skull: boolean }) {
  if (skull) {
    return (
      <g {...L}>
        <path d="M15 27 C15 18.5 20 15 25 15 C30 15 35 18.5 35 27 C35 31 33 32.5 32 34 V38 H18 V34 C17 32.5 15 31 15 27 Z" fill="var(--fig-bone)" />
        <ellipse cx="21" cy="27" rx="3" ry="3.4" fill="var(--fig-line)" />
        <ellipse cx="29" cy="27" rx="3" ry="3.4" fill="var(--fig-line)" />
        <circle cx="21.6" cy="26.6" r="0.9" fill="var(--fig-glow)" stroke="none" />
        <circle cx="29.6" cy="26.6" r="0.9" fill="var(--fig-glow)" stroke="none" />
        <path d="M25 30 l-1.6 3 h3.2 Z" fill="var(--fig-line)" />
        <path d="M20 35.5 h10 M22.5 34 v4 M25 34 v4 M27.5 34 v4" strokeWidth={1.1} />
      </g>
    );
  }
  return (
    <g {...L}>
      <circle cx="25" cy="27" r="10" fill="var(--fig-skin)" />
      <circle cx="21.4" cy="26.5" r="1.25" fill="var(--fig-line)" stroke="none" />
      <circle cx="28.6" cy="26.5" r="1.25" fill="var(--fig-line)" stroke="none" />
      <ellipse cx="19.5" cy="30" rx="2" ry="1.2" fill="var(--fig-cheek)" stroke="none" />
      <ellipse cx="30.5" cy="30" rx="2" ry="1.2" fill="var(--fig-cheek)" stroke="none" />
    </g>
  );
}

/** Shoulders in the suit colour, with the suit on the chest. */
function Body({ suit, stripes }: { suit: string; stripes?: boolean }) {
  return (
    <g {...L}>
      <path d="M5 64 Q7 44 25 41.5 Q43 44 45 64 Z" fill="var(--fig-cloth)" />
      {stripes && <path d="M13 50 L25 64 M37 50 L25 64 M19 45 L31 60 M31 45 L19 60" stroke="var(--fig-trim)" strokeWidth={2} opacity={0.7} />}
      <path d="M18 42.6 L25 51 L32 42.6" fill="var(--fig-trim)" />
      <text x="25" y="61" textAnchor="middle" fontSize="8" fontWeight="900" fill="var(--fig-trim)" stroke="none">
        {suit}
      </text>
    </g>
  );
}

export function Figure({ rank, suit, skull }: { rank: 11 | 12 | 13 | 0; suit: string; skull: boolean }) {
  return (
    <svg viewBox="0 0 50 64" className="figure" aria-hidden preserveAspectRatio="xMidYMax meet">
      {rank === 12 && !skull && (
        <path {...L} d="M13 31 Q11 13 25 13 Q39 13 37 31 L38.5 45 Q32 41 25 41 Q18 41 11.5 45 Z" fill="var(--fig-hair)" />
      )}
      {rank === 12 && skull && <path {...L} d="M12 30 Q11 12 25 11 Q39 12 38 30 L40 46 L25 40 L10 46 Z" fill="var(--fig-hood)" />}
      <Body suit={suit} stripes={rank === 0} />
      <Head skull={skull} />

      {rank === 13 && (
        <g {...L}>
          {!skull && (
            <>
              <path d="M15.5 29 Q16 41 25 42 Q34 41 34.5 29 Q30 35 25 35 Q20 35 15.5 29 Z" fill="var(--fig-hair)" />
              {/* Pedro's moustache */}
              <path d="M18.5 32.6 Q22 30.2 25 32.4 Q28 30.2 31.5 32.6 Q28.2 35.4 25 33.8 Q21.8 35.4 18.5 32.6 Z" fill="var(--fig-line)" />
            </>
          )}
          <path d="M14.5 19.5 L15 8.5 L20 13.5 L25 6 L30 13.5 L35 8.5 L35.5 19.5 Z" fill="var(--fig-gold)" />
          <circle cx="25" cy="15" r="1.7" fill="var(--fig-jewel)" />
        </g>
      )}

      {rank === 12 && (
        <g {...L}>
          {!skull && <ellipse cx="25" cy="32.4" rx="2.2" ry="1.3" fill="var(--fig-lips)" />}
          <path d="M17 18.5 L19.5 12.5 L22.3 16 L25 10.5 L27.7 16 L30.5 12.5 L33 18.5 Z" fill="var(--fig-gold)" />
          <circle cx="25" cy="15.6" r="1.3" fill="var(--fig-jewel)" />
        </g>
      )}

      {rank === 11 && (
        <g {...L}>
          {!skull && <path d="M21.5 32.4 Q25 34.4 28.6 31.8" fill="none" />}
          <path d="M13.5 22 Q14 10.5 26 10.5 Q37 11 37 19.5 Q31 18 25 19.5 Q19 21 13.5 22 Z" fill="var(--fig-cloth)" />
          <path d="M31 13 Q40 4 44 6 Q39 9 35 16" fill="var(--fig-gold)" />
        </g>
      )}

      {rank === 0 && (
        <g {...L}>
          {!skull && <path d="M19 31 Q25 37.5 31 31 Q25 34 19 31 Z" fill="var(--fig-line)" />}
          <path d="M14 22 L5 9 L19 15.5 Z" fill="var(--fig-jester-a)" />
          <path d="M19 15.5 L25 3 L31 15.5 Z" fill="var(--fig-jester-b)" />
          <path d="M31 15.5 L45 9 L36 22 Z" fill="var(--fig-jester-a)" />
          <path d="M14 22 Q14 15 19 15.5 L31 15.5 Q36 15 36 22 Q25 19 14 22 Z" fill="var(--fig-jester-b)" />
          <circle cx="5" cy="9" r="2" fill="var(--fig-gold)" />
          <circle cx="25" cy="3" r="2" fill="var(--fig-gold)" />
          <circle cx="45" cy="9" r="2" fill="var(--fig-gold)" />
        </g>
      )}
    </svg>
  );
}

/** Skull emblem for the back of the Deadly deck. */
export function SkullMark() {
  return (
    <svg viewBox="0 0 50 50" className="back-mark" aria-hidden>
      <g stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" fill="none">
        <path d="M8 40 L42 10 M8 10 L42 40" strokeWidth={4} />
      </g>
      <path d="M13 22 C13 12 19 8 25 8 C31 8 37 12 37 22 C37 27 35 28.5 34 30 V35 H16 V30 C15 28.5 13 27 13 22 Z" fill="currentColor" />
      <ellipse cx="20" cy="22" rx="3.6" ry="4" fill="var(--back-bg)" />
      <ellipse cx="30" cy="22" rx="3.6" ry="4" fill="var(--back-bg)" />
      <path d="M25 26 l-2 3.6 h4 Z" fill="var(--back-bg)" />
    </svg>
  );
}
