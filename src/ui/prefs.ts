import { useSyncExternalStore } from 'react';

export type MusicStyle = 'off' | 'chill' | 'lounge' | 'upbeat';

export const MUSIC_STYLES: { id: MusicStyle; label: string }[] = [
  { id: 'chill', label: 'Relaxing' },
  { id: 'lounge', label: 'Lounge' },
  { id: 'upbeat', label: 'Upbeat' },
  { id: 'off', label: 'Off' },
];

export type TableTheme = 'felt' | 'wood' | 'space' | 'midnight';
export const TABLES: { id: TableTheme; label: string }[] = [
  { id: 'felt', label: 'Casino felt' },
  { id: 'wood', label: 'Wood' },
  { id: 'space', label: 'Moon base' },
  { id: 'midnight', label: 'Midnight' },
];

export type DeckStyle = 'classic' | 'clean' | 'deadly' | 'vintage';
export const DECKS: { id: DeckStyle; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'clean', label: 'Clean' },
  { id: 'deadly', label: 'Deadly' },
  { id: 'vintage', label: 'Vintage' },
];

/** Player preferences kept in this browser. */
export interface Prefs {
  sound: boolean;
  animations: boolean;
  musicStyle: MusicStyle;
  table: TableTheme;
  deck: DeckStyle;
}

const KEY = 'pedro.prefs';
const listeners = new Set<() => void>();

function load(): Prefs {
  const def: Prefs = { sound: true, animations: true, musicStyle: 'lounge', table: 'felt', deck: 'classic' };
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
