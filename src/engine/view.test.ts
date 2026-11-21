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
    // Others know a peek happened (so a 7/8 isn't mistaken for a 10), but see no faces.
    expect(peekOf(theirs, cur)?.reveal?.cards.every((r) => r.card.rank === -1)).toBe(true);
    expect(peekOf(mine, cur)?.reveal?.cards.length).toBe(2);
    expect(Object.keys(theirs.known)).toEqual([other]);
  });

  it('card ids say nothing about the card (hidden cards keep their id online)', () => {
    const s = createGame(
      [
        { id: 'a', name: 'A', isBot: false },
        { id: 'b', name: 'B', isBot: false },
      ],
      { limit: 30 },
      { rng: Math.random, now: 0 },
    );
    const all = [...s.deck, ...s.players.flatMap((p) => p.hand.filter((c) => c !== null))];
    const sorted = [...all].sort((x, y) => Number(x.id.slice(1)) - Number(y.id.slice(1)));
    // If ids followed the unshuffled deck order, ranks would run 1,2,3… in id order.
    const inOrder = sorted.filter((c, i) => i > 0 && c.rank === sorted[i - 1].rank + 1).length;
    expect(inOrder).toBeLessThan(20);
  });
});
