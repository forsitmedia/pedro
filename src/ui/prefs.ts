import { useSyncExternalStore } from 'react';

/** Player preferences kept in this browser: sound effects and animations on/off. */
export interface Prefs {
  sound: boolean;
  animations: boolean;
  music: boolean;
}

const KEY = 'pedro.prefs';
const listeners = new Set<() => void>();

function load(): Prefs {
  const def: Prefs = { sound: true, animations: true, music: true };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return def;
  }
}

let prefs = load();

export const getPrefs = () => prefs;

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode: keep it for this visit only */
  }
  for (const fn of listeners) fn();
}

export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const usePrefs = () => useSyncExternalStore(subscribe, getPrefs);
