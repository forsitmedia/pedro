import type { CSSProperties } from 'react';

/** A hand is a 2×2 square: slots 0-1 on top, 2-3 below; extra (penalty) cards grow sideways. */
export function gridPos(i: number): CSSProperties {
  if (i < 4) return { gridRow: i < 2 ? 1 : 2, gridColumn: (i % 2) + 1 };
  const j = i - 4;
  return { gridRow: (j % 2) + 1, gridColumn: 3 + Math.floor(j / 2) };
}
