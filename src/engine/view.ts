import type { Card, GameState } from './types';

/** How many recent events are sent to players (enough for the move list and animations). */
const EVENTS_SENT = 60;

const hide = (c: Card): Card => ({ id: c.id, rank: -1, suit: 'S' });

/**
 * What one player is allowed to see. Face-down cards are replaced by blank placeholders,
 * so nobody can cheat by looking at the data in their browser.
 */
export function viewFor(state: GameState, viewerId: string): GameState {
  const s: GameState = structuredClone(state);
  const roundOver = s.phase === 'roundEnd' || s.phase === 'gameOver';
  if (!roundOver) {
    for (const p of s.players) p.hand = p.hand.map((c) => (c ? hide(c) : null));
  }
  s.deck = s.deck.map(hide);
  if (s.drawn && s.players[s.current].id !== viewerId) s.drawn = hide(s.drawn);
  s.known = { [viewerId]: s.known[viewerId] ?? [] };
  s.events = s.events.slice(-EVENTS_SENT).map((e) => {
    if (!e.reveal || e.reveal.to === 'all' || e.reveal.to.includes(viewerId)) return e;
    return { ...e, reveal: undefined };
  });
  return s;
}

export const isHidden = (c: Card) => c.rank < 0;
