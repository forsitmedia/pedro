import { useSyncExternalStore } from 'react';
import { randomAvatar } from './art/Avatar';

/**
 * Your player profile, kept in this browser: avatar + lifetime stats.
 * (No accounts: it lives on this device only.)
 */
export interface Stats {
  games: number;
  wins: number;
  rounds: number;
  roundWins: number;
  pedroCalls: number;
  pedroWins: number;
  /** Lowest round score ever (can be negative). */
  bestRound: number | null;
}

export interface Profile {
  avatar: string;
  /** Has the player made their avatar yet? (First visit opens the avatar maker.) */
  created: boolean;
  stats: Stats;
}

const KEY = 'pedro.profile';
const EMPTY: Stats = { games: 0, wins: 0, rounds: 0, roundWins: 0, pedroCalls: 0, pedroWins: 0, bestRound: null };
const listeners = new Set<() => void>();

function load(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (p && typeof p.avatar === 'string') return { created: true, ...p, stats: { ...EMPTY, ...p.stats } };
  } catch {
    /* ignore */
  }
  return { avatar: randomAvatar(), created: false, stats: { ...EMPTY } };
}

let profile = load();

function save(next: Profile) {
  profile = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* private mode */
  }
  for (const fn of listeners) fn();
}

export const getProfile = () => profile;
export const setAvatar = (avatar: string) => save({ ...profile, avatar, created: true });

const recorded = new Set<string>();

/** Count one finished round (and the game, if it's over). Safe to call twice for the same round. */
export function recordRound(key: string, r: { score: number; wonRound: boolean; calledPedro: boolean; pedroOk: boolean; gameOver: boolean; wonGame: boolean }) {
  if (recorded.has(key)) return;
  recorded.add(key);
  const s = { ...profile.stats };
  s.rounds++;
  if (r.wonRound) s.roundWins++;
  if (r.calledPedro) s.pedroCalls++;
  if (r.calledPedro && r.pedroOk) s.pedroWins++;
  s.bestRound = s.bestRound === null ? r.score : Math.min(s.bestRound, r.score);
  if (r.gameOver) {
    s.games++;
    if (r.wonGame) s.wins++;
  }
  save({ ...profile, stats: s });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const useProfile = () => useSyncExternalStore(subscribe, getProfile);
