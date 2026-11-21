import { describe, expect, it } from 'vitest';
import { buildMemory, decideAction, planSnap, PROFILES } from '../bots/bot';
import { cardValue } from './cards';
import { apply, createGame, currentPlayer, findCard, handCount, isPlayPhase } from './engine';
import type { Action, Card, GameState } from './types';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const ctx = (rng = seeded(1)) => ({ rng, now: 1000 });

function act(s: GameState, a: Action): GameState {
  const r = apply(s, a, ctx());
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function started(limit: number | null = 30): GameState {
  let s = createGame(
    [
      { id: 'a', name: 'A', isBot: false },
      { id: 'b', name: 'B', isBot: true },
    ],
    { limit },
    ctx(),
  );
  for (const id of ['a', 'b']) {
    s = act(s, { type: 'PEEK', playerId: id, slots: [0, 1] });
    s = act(s, { type: 'READY', playerId: id });
  }
  s.current = 0;
  return s;
}

const card = (rank: number, suit: Card['suit'] = 'S', id = `x${rank}${suit}`): Card => ({ id, rank, suit });

describe('card values', () => {
  it('joker 0, red king −1, black king 13', () => {
    expect(cardValue(card(0, 'JK'))).toBe(0);
    expect(cardValue(card(13, 'H'))).toBe(-1);
    expect(cardValue(card(13, 'D'))).toBe(-1);
    expect(cardValue(card(13, 'S'))).toBe(13);
    expect(cardValue(card(1, 'C'))).toBe(1);
  });
});

describe('turns', () => {
  it('discarding a drawn 7 offers the power; swapping it in does not', () => {
    let s = started();
    s.deck.push(card(7));
    s = act(s, { type: 'DRAW', playerId: 'a' });
    s = act(s, { type: 'DISCARD', playerId: 'a' });
    expect(s.phase).toBe('power');
    s = act(s, { type: 'POWER', playerId: 'a', target: { playerId: 'a', slot: 2 } });
    expect(s.known.a).toContain(s.players[0].hand[2]!.id);
    expect(currentPlayer(s).id).toBe('b');

    s.deck.push(card(7, 'H'));
    s = act(s, { type: 'DRAW', playerId: 'b' });
    s = act(s, { type: 'SWAP', playerId: 'b', slot: 0 });
    expect(s.phase).toBe('turnStart');
    expect(currentPlayer(s).id).toBe('a');
  });

  it('a burned card cannot be taken from the discard', () => {
    let s = started();
    s.deck.push(card(4, 'H'));
    s.players[1].hand[0] = card(4, 'C');
    s = act(s, { type: 'DRAW', playerId: 'a' });
    s = act(s, { type: 'DISCARD', playerId: 'a' });
    s = act(s, { type: 'SNAP', playerId: 'b', target: { playerId: 'b', slot: 0 } });
    expect(s.topBurned).toBe(true);
    const r = apply(s, { type: 'TAKE_DISCARD', playerId: 'b', slot: 1 }, ctx());
    expect(r.ok).toBe(false);
  });
});

describe('throwing matching cards', () => {
  function withTop(rank: number) {
    const s = started();
    s.deck.push(card(rank, 'H', 'top'));
    return act(act(s, { type: 'DRAW', playerId: 'a' }), { type: 'DISCARD', playerId: 'a' });
  }

  it('own correct throw removes the card', () => {
    let s = withTop(5);
    s.players[1].hand[2] = card(5, 'S');
    s = act(s, { type: 'SNAP', playerId: 'b', target: { playerId: 'b', slot: 2 } });
    expect(handCount(s.players[1])).toBe(3);
    expect(s.players[1].hand[2]).toBeNull();
  });

  it("throwing an opponent's card gives them 2 cards", () => {
    let s = withTop(5);
    s.players[0].hand[3] = card(5, 'S');
    s = act(s, { type: 'SNAP', playerId: 'b', target: { playerId: 'a', slot: 3 } });
    expect(handCount(s.players[0])).toBe(5); // 4 − 1 + 2
    expect(handCount(s.players[1])).toBe(4);
  });

  it('wrong throw: card back (known to all) + 2 cards', () => {
    let s = withTop(5);
    s.players[1].hand[0] = card(9, 'S', 'nine');
    s = act(s, { type: 'SNAP', playerId: 'b', target: { playerId: 'b', slot: 0 } });
    expect(handCount(s.players[1])).toBe(6);
    expect(s.players[1].hand[0]!.id).toBe('nine');
    expect(s.known.a).toContain('nine');
  });

  it('too slow: card back + 1', () => {
    let s = withTop(5);
    s.players[0].hand[0] = card(5, 'S');
    s.players[1].hand[0] = card(5, 'C');
    s = act(s, { type: 'SNAP', playerId: 'a', target: { playerId: 'a', slot: 0 } });
    s = act(s, { type: 'SNAP', playerId: 'b', target: { playerId: 'b', slot: 0 } });
    expect(handCount(s.players[0])).toBe(3);
    expect(handCount(s.players[1])).toBe(5);
  });

  it('throwing a card someone already threw counts as too slow (+1), not as nothing', () => {
    let s = withTop(5);
    s.players[0].hand[0] = card(5, 'S', 'five');
    // a throws their own 5 first; b was dragging the same card and lands a moment later.
    s = act(s, { type: 'SNAP', playerId: 'a', target: { playerId: 'a', slot: 0 } });
    const bBefore = handCount(s.players[1]);
    s = act(s, { type: 'SNAP', playerId: 'b', target: { playerId: 'a', slot: 0 }, cardId: 'five' });
    expect(handCount(s.players[1])).toBe(bBefore + 1);
    expect(handCount(s.players[0])).toBe(3);
    expect(s.events.at(-2)?.kind).toBe('snapSlow');
  });

  it('a throw whose card moved elsewhere is cancelled without penalty', () => {
    const s = withTop(5);
    s.players[0].hand[0] = card(5, 'S', 'five');
    const r = apply(s, { type: 'SNAP', playerId: 'b', target: { playerId: 'a', slot: 0 }, cardId: 'other' }, ctx());
    expect(r.ok).toBe(false);
  });

  it('emptying your hand triggers an automatic Pedro without penalty', () => {
    let s = withTop(5);
    s.players[1].hand = [card(5, 'C'), null, null, null];
    s.players[0].hand = [card(13, 'H', 'rk1'), card(13, 'D', 'rk2'), null, null];
    s = act(s, { type: 'SNAP', playerId: 'b', target: { playerId: 'b', slot: 0 } });
    expect(s.pedro).toMatchObject({ callerId: 'b', auto: true, remaining: ['a'] });
    // b's turn now
    s = act(s, { type: 'DRAW', playerId: 'b' });
    s = act(s, { type: 'DISCARD', playerId: 'b' });
    if (s.phase === 'power') s = act(s, { type: 'SKIP_POWER', playerId: 'b' });
    s = act(s, { type: 'DRAW', playerId: 'a' });
    s = act(s, { type: 'DISCARD', playerId: 'a' });
    if (s.phase === 'power') s = act(s, { type: 'SKIP_POWER', playerId: 'a' });
    expect(s.phase).toBe('roundEnd');
    const rb = s.results!.find((r) => r.playerId === 'b')!;
    expect(rb.sum).toBe(0);
    expect(rb.penalty).toBe(0);
    expect(s.results!.find((r) => r.playerId === 'a')!.sum).toBe(-2);
  });
});

describe('Pedro', () => {
  it('caller plays their turn, everyone else gets one more, +10 if not strictly lowest', () => {
    let s = started();
    s.players[0].hand = [card(5), card(5, 'H'), null, null]; // 10
    s.players[1].hand = [card(4), card(6), null, null]; // 10 (tie)
    s.deck.push(card(12, 'C'), card(12, 'D'));
    s = act(s, { type: 'CALL_PEDRO', playerId: 'a' });
    s = act(s, { type: 'DRAW', playerId: 'a' });
    s = act(s, { type: 'DISCARD', playerId: 'a' });
    expect(currentPlayer(s).id).toBe('b');
    s = act(s, { type: 'DRAW', playerId: 'b' });
    s = act(s, { type: 'DISCARD', playerId: 'b' });
    expect(s.phase).toBe('roundEnd');
    expect(s.results!.find((r) => r.playerId === 'a')).toMatchObject({ sum: 10, penalty: 10, total: 20 });
  });

  it('one-shot game ends after a single round', () => {
    let s = started(null);
    s = act(s, { type: 'CALL_PEDRO', playerId: 'a' });
    s = act(s, { type: 'DRAW', playerId: 'a' });
    s = act(s, { type: 'DISCARD', playerId: 'a' });
    if (s.phase === 'power') s = act(s, { type: 'SKIP_POWER', playerId: 'a' });
    s = act(s, { type: 'DRAW', playerId: 'b' });
    s = act(s, { type: 'DISCARD', playerId: 'b' });
    if (s.phase === 'power') s = act(s, { type: 'SKIP_POWER', playerId: 'b' });
    expect(s.phase).toBe('gameOver');
  });
});

describe('powers', () => {
  it('a power can be used straight from the hand; the card is discarded afterwards', () => {
    let s = started();
    s.deck.push(card(8, 'D', 'eight'));
    s = act(s, { type: 'DRAW', playerId: 'a' });
    s = act(s, { type: 'POWER', playerId: 'a', target: { playerId: 'b', slot: 1 } });
    expect(s.discard[s.discard.length - 1].id).toBe('eight');
    expect(s.known.a).toContain(s.players[1].hand[1]!.id);
    expect(currentPlayer(s).id).toBe('b');
    const kinds = s.events.slice(-3).map((e) => e.kind);
    expect(kinds).toEqual(['power', 'discard', 'turn']);
  });

  it('10 reshuffles a hand and wipes everyone’s memory of it', () => {
    let s = started();
    s.deck.push(card(10));
    s = act(s, { type: 'DRAW', playerId: 'a' });
    s = act(s, { type: 'DISCARD', playerId: 'a' });
    const before = s.known.b.length;
    s = act(s, { type: 'POWER', playerId: 'a', targetPlayerId: 'b' });
    expect(before).toBeGreaterThan(0);
    expect(s.players[1].hand.every((c) => !s.known.b.includes(c!.id))).toBe(true);
  });

  it('9 swaps two cards of different players', () => {
    let s = started();
    s.deck.push(card(9));
    const a0 = s.players[0].hand[0]!.id;
    const b3 = s.players[1].hand[3]!.id;
    s = act(s, { type: 'DRAW', playerId: 'a' });
    s = act(s, { type: 'DISCARD', playerId: 'a' });
    s = act(s, { type: 'POWER', playerId: 'a', target: { playerId: 'a', slot: 0 }, target2: { playerId: 'b', slot: 3 } });
    expect(s.players[0].hand[0]!.id).toBe(b3);
    expect(s.players[1].hand[3]!.id).toBe(a0);
  });
});

describe('bot sense', () => {
  it('never throws away its own red King on a black King', () => {
    let s = started();
    s.deck.push(card(13, 'S', 'blackK'));
    s = act(act(s, { type: 'DRAW', playerId: 'a' }), { type: 'DISCARD', playerId: 'a' });
    s.players[1].hand[0] = card(13, 'H', 'redK');
    s.known.b.push('redK');
    for (let i = 0; i < 50; i++) {
      const plan = planSnap(s, 'b', buildMemory(s, 'b', new Set()), PROFILES.hard, Math.random);
      expect(plan?.cardId).not.toBe('redK');
    }
  });
});

describe('bot simulation', () => {
  it('bots can play full games to the end without getting stuck', () => {
    for (let g = 0; g < 40; g++) {
      const rng = seeded(g + 7);
      const n = 2 + (g % 5);
      let s = createGame(
        Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true })),
        { limit: g % 2 ? 30 : 80 },
        { rng, now: 0 },
      );
      const profile = PROFILES[(['easy', 'normal', 'hard'] as const)[g % 3]];
      const none = new Set<string>();
      let steps = 0;
      while (s.phase !== 'gameOver') {
        if (++steps > 50000) throw new Error('game did not finish');
        const run = (a: Action) => {
          const r = apply(s, a, { rng, now: steps });
          if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
          s = r.state;
        };
        if (s.phase === 'peek') {
          for (const p of s.players) {
            run({ type: 'PEEK', playerId: p.id, slots: [0, 1] });
            run({ type: 'READY', playerId: p.id });
          }
          continue;
        }
        if (s.phase === 'roundEnd') {
          run({ type: 'NEXT_ROUND' });
          continue;
        }
        expect(isPlayPhase(s)).toBe(true);
        const id = currentPlayer(s).id;
        run(decideAction(s, id, buildMemory(s, id, none), profile, rng));
        if (s.snap.open) {
          for (const p of s.players) {
            const plan = planSnap(s, p.id, buildMemory(s, p.id, none), profile, rng);
            if (plan && isPlayPhase(s)) {
              const where = findCard(s, plan.cardId);
              if (where) run({ type: 'SNAP', playerId: p.id, target: where });
            }
          }
        }
        // Sanity: 54 cards always accounted for.
        const total =
          s.deck.length + s.discard.length + (s.drawn ? 1 : 0) + s.players.reduce((a, p) => a + handCount(p), 0);
        expect(total).toBe(54);
      }
      expect(s.players.some((p) => p.total >= (g % 2 ? 30 : 80))).toBe(true);
    }
  });
});
