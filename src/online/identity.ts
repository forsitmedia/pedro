import { newPlayerId, PLAYER_ID_RE } from './protocol';

/**
 * Who you are online: an id (also your friend code) and a secret that proves it.
 * No account or email — it lives in this browser.
 */
export interface Identity {
  id: string;
  secret: string;
}

const KEY = 'pedro.identity';
let cached: Identity | null = null;

export function getIdentity(): Identity {
  if (cached) return cached;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && PLAYER_ID_RE.test(saved.id) && typeof saved.secret === 'string') return (cached = saved);
  } catch {
    /* ignore */
  }
  return resetIdentity();
}

/** A fresh id (the old one was taken by someone else). */
export function resetIdentity(): Identity {
  cached = { id: newPlayerId(), secret: crypto.randomUUID() + crypto.randomUUID().slice(0, 8) };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* private mode: this visit only */
  }
  return cached;
}
