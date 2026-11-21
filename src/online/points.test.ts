import { describe, expect, it } from 'vitest';
import { gamePoints, POINTS } from './protocol';
import { cleanName } from './names';

describe('weekly ranking points', () => {
  it('rewards winning, beating people and a low total', () => {
    // 2 players, 21 vs 42: winner beats 1, average 31.5 → 2 margin points.
    expect(gamePoints(21, [21, 42])).toEqual({ points: POINTS.play + POINTS.win + POINTS.beat + 2, won: true });
    expect(gamePoints(42, [21, 42])).toEqual({ points: POINTS.play, won: false });
  });

  it('a big win is worth more than a close one', () => {
    expect(gamePoints(5, [5, 40, 45]).points).toBeGreaterThan(gamePoints(29, [29, 30, 31]).points);
  });

  it('ten steady games beat one lucky win', () => {
    const lucky = gamePoints(0, [0, 60, 60, 60, 60, 60]).points; // best possible single game
    const steady = 10 * gamePoints(30, [25, 30, 35]).points; // always second of three
    expect(steady).toBeGreaterThan(lucky);
  });
});

describe('names', () => {
  it('filters rude names, keeps normal ones', () => {
    expect(cleanName('Fildecris')).toBe('Fildecris');
    expect(cleanName('p3l0tud0')).toBe('Player');
    expect(cleanName('  ')).toBe('Player');
  });
});

import { levelFor, xpForLevel } from './protocol';

describe('levels and leagues', () => {
  it('starts at level 1 Bronze and climbs', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, into: 0, need: 40 });
    expect(levelFor(0).league.id).toBe('bronze');
    expect(levelFor(40).level).toBe(2);
    expect(levelFor(xpForLevel(5)).league.id).toBe('silver');
    expect(levelFor(xpForLevel(10)).league.id).toBe('gold');
    expect(levelFor(xpForLevel(16)).league.id).toBe('diamond');
    expect(levelFor(xpForLevel(25)).league.id).toBe('legend');
  });
});
