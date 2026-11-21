import { describe, expect, it } from 'vitest';
import { apply, createGame } from './engine';
import { viewFor } from './view';

describe('what each online player may see', () => {
  it('hides every face-down card, the deck and other players’ drawn card', () => {
    let s = createGame(
      [
        { id: 'a', name: 'A', isBot: false },
        { id: 'b', name: 'B', isBot: false },
      ],
      { limit: 30 },
      { rng: Math.random, now: 0 },
    );
    const ctx = { rng: Math.random, now: 0 };
    for (const id of ['a', 'b']) {
      s = (apply(s, { type: 'PEEK', playerId: id, slots: [0, 1] }, ctx) as { state: typeof s }).state;
      s = (apply(s, { type: 'READY', playerId: id }, ctx) as { state: typeof s }).state;
    }
    const cur = s.players[s.current].id;
    const other = cur === 'a' ? 'b' : 'a';
    s = (apply(s, { type: 'DRAW', playerId: cur }, ctx) as { state: typeof s }).state;

    const mine = viewFor(s, cur);
    const theirs = viewFor(s, other);
    for (const v of [mine, theirs]) {
      for (const p of v.players) for (const c of p.hand) expect(c!.rank).toBe(-1);
      expect(v.deck.every((c) => c.rank === -1)).toBe(true);
    }
    expect(mine.drawn!.rank).toBeGreaterThanOrEqual(0);
    expect(theirs.drawn!.rank).toBe(-1);
    // The peek is only revealed to the player who peeked.
    const peekOf = (v: typeof s, id: string) => v.events.find((e) => e.kind === 'peek' && e.actorId === id);
    expect(peekOf(theirs, cur)?.reveal).toBeUndefined();
    expect(peekOf(mine, cur)?.reveal?.cards.length).toBe(2);
    expect(Object.keys(theirs.known)).toEqual([other]);
  });
});
