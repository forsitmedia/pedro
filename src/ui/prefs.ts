import { useSyncExternalStore } from 'react';

export type MusicStyle = 'off' | 'chill' | 'lounge' | 'upbeat';

export const MUSIC_STYLES: { id: MusicStyle; label: string }[] = [
  { id: 'chill', label: 'Relaxing' },
  { id: 'lounge', label: 'Lounge' },
  { id: 'upbeat', label: 'Upbeat' },
  { id: 'off', label: 'Off' },
];

/** Player preferences kept in this browser. */
export interface Prefs {
  sound: boolean;
  animations: boolean;
  musicStyle: MusicStyle;
}

const KEY = 'pedro.prefs';
const listeners = new Set<() => void>();

function load(): Prefs {
  const def: Prefs = { sound: true, animations: true, musicStyle: 'lounge' };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    // Older versions stored music as on/off.
    if (saved.music === false && !saved.musicStyle) saved.musicStyle = 'off';
    delete saved.music;
    return { ...def, ...saved };
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
