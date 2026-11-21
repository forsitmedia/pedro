import { cardValue, powerOf } from '../engine/cards';
import { getPlayer, handCount, topDiscard } from '../engine/engine';
import type { Action, Card, GameState, Player, SlotRef } from '../engine/types';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface BotProfile {
  /** Chance per turn to forget each remembered card. */
  forget: number;
  /** Chance to notice one of its own matching cards and throw it. */
  snapChance: number;
  /** Same, for an opponent's card it remembers (gives them +2). */
  oppSnapChance: number;
  snapDelay: [number, number];
  /** Chance to throw a card it *thinks* matches, but doesn't really remember. */
  wrongSnap: number;
  /** Calls Pedro when its estimated total is at or below this. */
  pedroAt: number;
  /** Compares its total with what it can guess of the opponents before calling Pedro. */
  readsOpponents: boolean;
  /** Swaps a drawn card into an unknown spot if the card is worth at most this. */
  swapUnknownMax: number;
  /** Swaps with a known card when it gains at least this many points. */
  swapKnownGain: number;
  /** Discards a drawn card to throw a remembered opponent card of the same rank (+2 for them). */
  attacks: boolean;
  thinkDelay: [number, number];
}

export const PROFILES: Record<Difficulty, BotProfile> = {
  easy: {
    forget: 0.12,
    snapChance: 0.45,
    oppSnapChance: 0.25,
    snapDelay: [2200, 4200],
    wrongSnap: 0.06,
    pedroAt: 7,
    readsOpponents: false,
    swapUnknownMax: 4,
    swapKnownGain: 3,
    attacks: false,
    thinkDelay: [1900, 2900],
  },
  normal: {
    forget: 0.025,
    snapChance: 0.9,
    oppSnapChance: 0.75,
    snapDelay: [1300, 2600],
    wrongSnap: 0.01,
    pedroAt: 6,
    readsOpponents: true,
    swapUnknownMax: 5,
    swapKnownGain: 2,
    attacks: true,
    thinkDelay: [1700, 2600],
  },
  hard: {
    forget: 0,
    snapChance: 1,
    oppSnapChance: 1,
    snapDelay: [800, 1700],
    wrongSnap: 0,
    pedroAt: 5,
    readsOpponents: true,
    swapUnknownMax: 6,
    swapKnownGain: 1,
    attacks: true,
    thinkDelay: [1500, 2300],
  },
};

/** Expected value of a card you don't know (deck average ≈ 6.4). */
const UNKNOWN_EXP = 6.5;

/** What the bot currently remembers: card id → card, for cards in any player's hand. */
export type Memory = Map<string, Card>;

export function buildMemory(s: GameState, botId: string, forgotten: Set<string>): Memory {
  const ids = new Set((s.known[botId] ?? []).filter((id) => !forgotten.has(id)));
  const mem: Memory = new Map();
  for (const p of s.players) for (const c of p.hand) if (c && ids.has(c.id)) mem.set(c.id, c);
  return mem;
}

interface SlotInfo {
  slot: number;
  card: Card;
  known: boolean;
  exp: number;
}

function mySlots(s: GameState, botId: string, mem: Memory): SlotInfo[] {
  const me = getPlayer(s, botId)!;
  const out: SlotInfo[] = [];
  me.hand.forEach((c, slot) => {
    if (!c) return;
    const known = mem.has(c.id);
    out.push({ slot, card: c, known, exp: known ? cardValue(c) : UNKNOWN_EXP });
  });
  return out;
}

/** Highest expected card; prefers a *known* bad card over an unknown one at equal value. */
function worstSlot(slots: SlotInfo[]): SlotInfo | null {
  let best: SlotInfo | null = null;
  for (const si of slots) {
    if (!best || si.exp > best.exp || (si.exp === best.exp && si.known && !best.known)) best = si;
  }
  return best;
}

/**
 * Rough guess of an opponent's total. Players improve their hands over the round,
 * so unknown cards are assumed to get lower as turns go by.
 */
function guessTotal(s: GameState, p: Player, mem: Memory): number {
  const rounds = s.turnCount / Math.max(1, s.players.length);
  const unknownExp = Math.max(3, UNKNOWN_EXP - rounds * 0.45);
  return p.hand.reduce((a, c) => a + (!c ? 0 : mem.has(c.id) ? cardValue(c) : unknownExp), 0);
}

const pick = <T,>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];

/** A remembered opponent card of this rank (to throw it on the pile: they get +2). */
function oppCardOfRank(s: GameState, botId: string, mem: Memory, rank: number): SlotRef | null {
  for (const p of s.players) {
    if (p.id === botId) continue;
    const slot = p.hand.findIndex((c) => c && mem.has(c.id) && c.rank === rank);
    if (slot >= 0) return { playerId: p.id, slot };
  }
  return null;
}

function shouldCallPedro(s: GameState, botId: string, mem: Memory, slots: SlotInfo[], profile: BotProfile): boolean {
  if (s.pedro || s.turnCount < s.players.length * 2) return false;
  const est = slots.reduce((a, si) => a + si.exp, 0);
  const unknown = slots.filter((si) => !si.known).length;
  // The longer the round drags on, the less picky the bot becomes.
  const urgency = Math.floor(s.turnCount / (s.players.length * 6)) * 3;
  if (!profile.readsOpponents) {
    return unknown <= 1 + urgency / 3 && est <= profile.pedroAt + urgency;
  }
  // Smarter bots only call when they're fairly sure they're the lowest (+10 otherwise!).
  if (unknown > 1) return false;
  const opps = s.players.filter((p) => p.id !== botId);
  const best = Math.min(...opps.map((p) => guessTotal(s, p, mem)));
  const margin = unknown === 0 ? 2 : 4;
  return est <= profile.pedroAt + urgency && est + margin <= best;
}

export function decideAction(s: GameState, botId: string, mem: Memory, profile: BotProfile, rng: () => number): Action {
  const slots = mySlots(s, botId, mem);

  if (s.phase === 'turnStart') {
    if (shouldCallPedro(s, botId, mem, slots, profile)) return { type: 'CALL_PEDRO', playerId: botId };
    const top = topDiscard(s);
    const worst = worstSlot(slots);
    if (top && !s.topBurned && worst) {
      const tv = cardValue(top);
      const iHaveSameRank = slots.some((si) => si.known && si.card.rank === top.rank && cardValue(si.card) > 0);
      const gain = worst.exp - tv;
      const need = profile.readsOpponents ? 3 : 4;
      if (!iHaveSameRank && (gain >= need || tv <= 0)) {
        return { type: 'TAKE_DISCARD', playerId: botId, slot: worst.slot };
      }
    }
    return { type: 'DRAW', playerId: botId };
  }

  if (s.phase === 'drawn' && s.drawn) {
    const d = s.drawn;
    const v = cardValue(d);
    const power = powerOf(d);
    // Discard it, then throw my own known card of the same rank (one card less).
    // Never plan to throw away a card worth less than nothing (red King = −1).
    const pair = slots.some((si) => si.known && si.card.rank === d.rank && cardValue(si.card) > 0);
    if (pair && v > 1) return { type: 'DISCARD', playerId: botId };
    // Discard it, then throw an opponent's card of the same rank (they get +2).
    if (profile.attacks && v > 2 && oppCardOfRank(s, botId, mem, d.rank)) return { type: 'DISCARD', playerId: botId };

    const worst = worstSlot(slots);
    if (worst) {
      const gain = worst.exp - v;
      if (worst.known ? gain >= profile.swapKnownGain : v <= profile.swapUnknownMax) {
        return { type: 'SWAP', playerId: botId, slot: worst.slot };
      }
      // Smart bots also replace a known bad card even if an unknown one is "worse on average".
      const worstKnown = worstSlot(slots.filter((si) => si.known));
      if (profile.readsOpponents && worstKnown && worstKnown.exp - v >= Math.max(3, profile.swapKnownGain)) {
        return { type: 'SWAP', playerId: botId, slot: worstKnown.slot };
      }
    }
    // Use the power straight from the hand (the card is discarded right after).
    if (power) {
      const use = decidePower({ ...s, pendingPower: power }, botId, mem, slots, profile, rng);
      if (use.type === 'POWER') return use;
    }
    return { type: 'DISCARD', playerId: botId };
  }

  if (s.phase === 'power' && s.pendingPower) {
    return decidePower(s, botId, mem, slots, profile, rng);
  }

  return { type: 'DRAW', playerId: botId };
}

function decidePower(
  s: GameState,
  botId: string,
  mem: Memory,
  slots: SlotInfo[],
  profile: BotProfile,
  rng: () => number,
): Action {
  const skip: Action = { type: 'SKIP_POWER', playerId: botId };
  const opponents = s.players.filter((p) => p.id !== botId && handCount(p) > 0);
  const oppCards = (filter: (c: Card) => boolean, among = opponents): SlotRef[] =>
    among.flatMap((p) => p.hand.flatMap((c, slot) => (c && filter(c) ? [{ playerId: p.id, slot }] : [])));
  // The most dangerous opponent: the Pedro caller, otherwise the lowest guessed total.
  const threats = [...opponents].sort((a, b) => {
    const ca = s.pedro?.callerId === a.id ? -100 : 0;
    const cb = s.pedro?.callerId === b.id ? -100 : 0;
    return ca + guessTotal(s, a, mem) - (cb + guessTotal(s, b, mem));
  });

  switch (s.pendingPower) {
    case 7: {
      const unknown = slots.filter((si) => !si.known);
      if (!unknown.length) return skip;
      return { type: 'POWER', playerId: botId, target: { playerId: botId, slot: pick(unknown, rng).slot } };
    }
    case 8: {
      for (const p of threats) {
        const unknown = p.hand.flatMap((c, slot) => (c && !mem.has(c.id) ? [slot] : []));
        if (unknown.length) return { type: 'POWER', playerId: botId, target: { playerId: p.id, slot: pick(unknown, rng) } };
      }
      return skip;
    }
    case 9: {
      const worstKnown = worstSlot(slots.filter((si) => si.known));
      const worstAny = worstSlot(slots);
      // Give my worst known card for an opponent's known low card.
      if (worstKnown && worstKnown.exp >= 6) {
        const good = oppCards((c) => mem.has(c.id) && cardValue(c) <= worstKnown.exp - 4);
        if (good.length) {
          const best = good.reduce((a, b) => (cardValue(cardOf(s, b)!) < cardValue(cardOf(s, a)!) ? b : a));
          return { type: 'POWER', playerId: botId, target: { playerId: botId, slot: worstKnown.slot }, target2: best };
        }
      }
      // Dump a known high card on the most dangerous opponent.
      const dump = worstKnown && worstKnown.exp >= (profile.readsOpponents ? 9 : 10) ? worstKnown : null;
      if (dump && threats.length) {
        const unknown = oppCards((c) => !mem.has(c.id), [threats[0]]);
        if (unknown.length) {
          return { type: 'POWER', playerId: botId, target: { playerId: botId, slot: dump.slot }, target2: pick(unknown, rng) };
        }
      }
      // Ruin an opponent's memory: swap one of their cards with another opponent's.
      if (profile.readsOpponents && !worstAny?.known && opponents.length >= 2 && s.pedro) {
        const [a, b] = threats;
        const ca = oppCards(() => true, [a]);
        const cb = oppCards(() => true, [b]);
        if (ca.length && cb.length) return { type: 'POWER', playerId: botId, target: pick(ca, rng), target2: pick(cb, rng) };
      }
      return skip;
    }
    case 10: {
      const threat = threats[0];
      if (!threat) return skip;
      const dangerous = s.pedro?.callerId === threat.id || handCount(threat) <= 2 || guessTotal(s, threat, mem) <= 8;
      if (dangerous && (profile.readsOpponents || rng() < 0.6)) return { type: 'POWER', playerId: botId, targetPlayerId: threat.id };
      return skip;
    }
  }
  return skip;
}

function cardOf(s: GameState, ref: SlotRef): Card | null {
  return getPlayer(s, ref.playerId)?.hand[ref.slot] ?? null;
}

/** Decide whether (and what) to throw onto the current top discard. */
export function planSnap(
  s: GameState,
  botId: string,
  mem: Memory,
  profile: BotProfile,
  rng: () => number,
): { target: SlotRef; cardId: string; delay: number } | null {
  const top = topDiscard(s);
  if (!top || !s.snap.open) return null;
  const me = getPlayer(s, botId)!;
  const delay = profile.snapDelay[0] + rng() * (profile.snapDelay[1] - profile.snapDelay[0]);

  // Throwing your own red King (−1) would raise your total — a real player keeps it.
  const own = me.hand.findIndex((c) => c && mem.has(c.id) && c.rank === top.rank && cardValue(c) >= 0);
  if (own >= 0 && rng() < profile.snapChance) {
    return { target: { playerId: botId, slot: own }, cardId: me.hand[own]!.id, delay };
  }
  // An opponent's remembered card: removing it gives them +2 cards (even their red King: +1 for losing the −1).
  const opp = oppCardOfRank(s, botId, mem, top.rank);
  if (opp && rng() < profile.oppSnapChance) {
    return { target: opp, cardId: cardOf(s, opp)!.id, delay: delay + 200 };
  }
  // Occasionally "misremember" and throw a card it isn't sure about.
  if (rng() < profile.wrongSnap) {
    const unsure = me.hand.flatMap((c, slot) => (c && !mem.has(c.id) ? [slot] : []));
    if (unsure.length) {
      const slot = pick(unsure, rng);
      return { target: { playerId: botId, slot }, cardId: me.hand[slot]!.id, delay };
    }
  }
  return null;
}
