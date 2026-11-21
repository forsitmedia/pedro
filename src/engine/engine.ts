import { cardName, cardValue, makeDeck, powerOf, shuffle } from './cards';
import type { Action, Card, Ctx, GameEvent, GameSettings, GameState, Player, SlotRef } from './types';

export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: string };

const MAX_EVENTS = 300;
export const START_HAND = 4;
export const PEDRO_PENALTY = 10;

// ───────────────────────── helpers ─────────────────────────

export const handCount = (p: Player) => p.hand.filter(Boolean).length;
export const handSum = (p: Player) => p.hand.reduce((s, c) => s + (c ? cardValue(c) : 0), 0);
export const topDiscard = (s: GameState): Card | null => s.discard[s.discard.length - 1] ?? null;
export const currentPlayer = (s: GameState) => s.players[s.current];
export const getPlayer = (s: GameState, id: string) => s.players.find((p) => p.id === id);
export const isPlayPhase = (s: GameState) => s.phase === 'turnStart' || s.phase === 'drawn' || s.phase === 'power';

export function cardAt(s: GameState, ref: SlotRef): Card | null {
  return getPlayer(s, ref.playerId)?.hand[ref.slot] ?? null;
}

export function findCard(s: GameState, cardId: string): SlotRef | null {
  for (const p of s.players) {
    const slot = p.hand.findIndex((c) => c?.id === cardId);
    if (slot >= 0) return { playerId: p.id, slot };
  }
  return null;
}

const nameOf = (s: GameState, id: string) => getPlayer(s, id)?.name ?? '?';
const newId = (s: GameState) => `c${++s.idSeq}`;

function log(s: GameState, ctx: Ctx, ev: Omit<GameEvent, 'id' | 'at'>) {
  s.events.push({ ...ev, id: ++s.seq, at: ctx.now });
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
}

function know(s: GameState, playerId: string, cardId: string) {
  const k = (s.known[playerId] ??= []);
  if (!k.includes(cardId)) k.push(cardId);
}

function knowAll(s: GameState, cardId: string) {
  for (const p of s.players) know(s, p.id, cardId);
}

function forgetEverywhere(s: GameState, ids: Set<string>) {
  for (const pid of Object.keys(s.known)) s.known[pid] = s.known[pid].filter((id) => !ids.has(id));
}

function drawCard(s: GameState, ctx: Ctx): Card | null {
  if (s.deck.length === 0 && s.discard.length > 1) {
    const top = s.discard.pop()!;
    s.deck = shuffle(s.discard, ctx.rng);
    s.discard = [top];
    forgetEverywhere(s, new Set(s.deck.map((c) => c.id)));
    log(s, ctx, { kind: 'reshuffle', text: 'The deck ran out — discard pile reshuffled into a new deck.' });
  }
  return s.deck.pop() ?? null;
}

function givePenalty(s: GameState, ctx: Ctx, playerId: string, n: number, reason: string, penalty: GameEvent['penalty']) {
  const p = getPlayer(s, playerId)!;
  const slots: SlotRef[] = [];
  for (let i = 0; i < n; i++) {
    const c = drawCard(s, ctx);
    if (!c) break;
    const empty = p.hand.findIndex((x) => x === null);
    const slot = empty >= 0 ? empty : p.hand.length;
    p.hand[slot] = c;
    slots.push({ playerId, slot });
  }
  if (slots.length) {
    log(s, ctx, {
      kind: 'penalty',
      actorId: playerId,
      slots,
      penalty,
      text: `${p.name} takes ${slots.length} penalty card${slots.length > 1 ? 's' : ''} (${reason}).`,
    });
  }
}

/** Put a card on the discard pile from a normal turn action: opens a new throw window. */
function discardCard(s: GameState, c: Card) {
  s.discard.push(c);
  s.topBurned = false;
  s.snap = { eventId: s.snap.eventId + 1, open: true, closedAt: 0 };
}

function checkAutoPedro(s: GameState, ctx: Ctx, playerId: string) {
  const p = getPlayer(s, playerId)!;
  if (handCount(p) > 0) return;
  if (!s.pedro) {
    s.pedro = { callerId: playerId, auto: true, remaining: s.players.filter((o) => o.id !== playerId).map((o) => o.id) };
    log(s, ctx, {
      kind: 'pedro',
      actorId: playerId,
      text: `${p.name} has no cards left — automatic PEDRO! Everyone else gets one last turn.`,
    });
  } else {
    s.pedro.remaining = s.pedro.remaining.filter((id) => id !== playerId);
    log(s, ctx, { kind: 'pedro', actorId: playerId, text: `${p.name} has no cards left!` });
  }
}

function endTurn(s: GameState, ctx: Ctx) {
  s.drawn = null;
  s.pendingPower = null;
  s.turnCount++;
  const n = s.players.length;
  const curId = s.players[s.current].id;
  if (s.pedro) {
    s.pedro.remaining = s.pedro.remaining.filter((id) => id !== curId);
    if (s.pedro.remaining.length === 0) return endRound(s, ctx);
    for (let i = 1; i <= n; i++) {
      const idx = (s.current + i) % n;
      if (s.pedro.remaining.includes(s.players[idx].id)) {
        s.current = idx;
        break;
      }
    }
  } else {
    s.current = (s.current + 1) % n;
  }
  s.phase = 'turnStart';
  const next = s.players[s.current];
  log(s, ctx, {
    kind: 'turn',
    actorId: next.id,
    text: s.pedro ? `${next.name}'s last turn.` : `${next.name}'s turn.`,
  });
}

function endRound(s: GameState, ctx: Ctx) {
  const sums = new Map(s.players.map((p) => [p.id, handSum(p)]));
  const results = s.players.map((p) => {
    const sum = sums.get(p.id)!;
    let penalty = 0;
    if (s.pedro && !s.pedro.auto && s.pedro.callerId === p.id) {
      // The caller must be strictly the lowest — a tie is not enough.
      const beaten = s.players.some((o) => o.id !== p.id && sums.get(o.id)! <= sum);
      if (beaten) penalty = PEDRO_PENALTY;
    }
    p.total += sum + penalty;
    return { playerId: p.id, cards: p.hand.filter((c): c is Card => !!c), sum, penalty, total: p.total };
  });
  s.results = results;
  s.drawn = null;
  s.pendingPower = null;
  s.snap = { ...s.snap, open: false };
  const over = s.settings.limit === null || s.players.some((p) => p.total >= s.settings.limit!);
  s.phase = over ? 'gameOver' : 'roundEnd';
  s.starter = (s.starter + 1) % s.players.length;
  const summary = results.map((r) => `${nameOf(s, r.playerId)} ${r.sum}${r.penalty ? ` (+${r.penalty})` : ''}`).join(', ');
  log(s, ctx, { kind: over ? 'gameOver' : 'roundEnd', text: `Round ${s.round} over: ${summary}.` });
}

function dealRound(s: GameState, ctx: Ctx) {
  s.round += 1;
  // Ids are given AFTER shuffling: online, hidden cards keep their id, so ids must say nothing about the card.
  s.deck = shuffle(makeDeck(() => ''), ctx.rng);
  for (const c of s.deck) c.id = newId(s);
  s.discard = [];
  s.topBurned = false;
  s.snap = { eventId: s.snap.eventId + 1, open: false, closedAt: 0 };
  for (const p of s.players) {
    p.hand = [];
    for (let i = 0; i < START_HAND; i++) p.hand.push(s.deck.pop()!);
    s.known[p.id] = [];
    s.peeked[p.id] = false;
    s.ready[p.id] = false;
  }
  s.pedro = null;
  s.results = null;
  s.drawn = null;
  s.pendingPower = null;
  s.phase = 'peek';
  s.current = s.starter;
  s.turnCount = 0;
  log(s, ctx, { kind: 'deal', text: `Round ${s.round}: 4 cards dealt to everyone. Look at 2 of yours!` });
}

export function createGame(
  players: { id: string; name: string; isBot: boolean }[],
  settings: GameSettings,
  ctx: Ctx,
): GameState {
  const s: GameState = {
    settings,
    players: players.map((p) => ({ ...p, hand: [], total: 0 })),
    deck: [],
    discard: [],
    topBurned: false,
    snap: { eventId: 0, open: false, closedAt: 0 },
    phase: 'peek',
    current: 0,
    starter: Math.floor(ctx.rng() * players.length),
    round: 0,
    drawn: null,
    pendingPower: null,
    peeked: {},
    ready: {},
    known: {},
    pedro: null,
    results: null,
    events: [],
    seq: 0,
    idSeq: 0,
    turnCount: 0,
  };
  dealRound(s, ctx);
  return s;
}

// ───────────────────────── reducer ─────────────────────────

export function apply(state: GameState, action: Action, ctx: Ctx): ApplyResult {
  const s: GameState = structuredClone(state);
  const fail = (error: string): ApplyResult => ({ ok: false, error });
  const done = (): ApplyResult => ({ ok: true, state: s });

  if (action.type === 'NEXT_ROUND') {
    if (s.phase !== 'roundEnd') return fail('The round is not over.');
    dealRound(s, ctx);
    return done();
  }

  const actor = getPlayer(s, action.playerId);
  if (!actor) return fail('Unknown player.');
  const isCurrent = currentPlayer(s).id === actor.id;
  const needTurn = (phase: GameState['phase']) => {
    if (s.phase !== phase) return 'You cannot do that now.';
    if (!isCurrent) return "It's not your turn.";
    return null;
  };

  switch (action.type) {
    case 'PEEK': {
      if (s.phase !== 'peek') return fail('Peeking is only at the start of the round.');
      if (s.peeked[actor.id]) return fail('You already looked at your cards.');
      const [a, b] = action.slots;
      if (a === b || !actor.hand[a] || !actor.hand[b]) return fail('Choose two different cards.');
      know(s, actor.id, actor.hand[a]!.id);
      know(s, actor.id, actor.hand[b]!.id);
      s.peeked[actor.id] = true;
      log(s, ctx, {
        kind: 'peek',
        actorId: actor.id,
        text: `${actor.name} looked at 2 cards.`,
        slots: [
          { playerId: actor.id, slot: a },
          { playerId: actor.id, slot: b },
        ],
        reveal: {
          to: [actor.id],
          cards: [
            { ref: { playerId: actor.id, slot: a }, card: actor.hand[a]! },
            { ref: { playerId: actor.id, slot: b }, card: actor.hand[b]! },
          ],
        },
      });
      return done();
    }

    case 'READY': {
      if (s.phase !== 'peek') return fail('Not in the peek phase.');
      if (!s.peeked[actor.id]) return fail('Look at your two cards first.');
      s.ready[actor.id] = true;
      if (s.players.every((p) => s.ready[p.id])) {
        s.phase = 'turnStart';
        log(s, ctx, { kind: 'start', actorId: currentPlayer(s).id, text: `${currentPlayer(s).name} starts.` });
      }
      return done();
    }

    case 'CALL_PEDRO': {
      const err = needTurn('turnStart');
      if (err) return fail(err);
      if (s.pedro) return fail('Pedro has already been called.');
      s.pedro = {
        callerId: actor.id,
        auto: false,
        remaining: s.players.filter((p) => p.id !== actor.id && handCount(p) > 0).map((p) => p.id),
      };
      log(s, ctx, { kind: 'pedro', actorId: actor.id, text: `${actor.name} calls PEDRO! This is the last round.` });
      return done();
    }

    case 'DRAW': {
      const err = needTurn('turnStart');
      if (err) return fail(err);
      const c = drawCard(s, ctx);
      if (!c) {
        // Every card is in someone's hand: nothing left to play — count the cards.
        log(s, ctx, { kind: 'pedro', text: 'No cards left to draw — the round ends now.' });
        endRound(s, ctx);
        return done();
      }
      s.drawn = c;
      know(s, actor.id, c.id);
      s.phase = 'drawn';
      log(s, ctx, { kind: 'draw', actorId: actor.id, text: `${actor.name} draws from the deck.` });
      return done();
    }

    case 'TAKE_DISCARD': {
      const err = needTurn('turnStart');
      if (err) return fail(err);
      const top = topDiscard(s);
      if (!top) return fail('The discard pile is empty.');
      if (s.topBurned) return fail('That card was thrown by matching — it is burned and cannot be taken.');
      const old = actor.hand[action.slot];
      if (!old) return fail('Choose one of your cards to replace.');
      s.discard.pop();
      actor.hand[action.slot] = top;
      knowAll(s, top.id); // everyone saw which card you took
      discardCard(s, old);
      log(s, ctx, {
        kind: 'takeDiscard',
        actorId: actor.id,
        card: old,
        slots: [{ playerId: actor.id, slot: action.slot }],
        text: `${actor.name} takes the ${cardName(top)} from the discard and throws away ${cardName(old)}.`,
      });
      endTurn(s, ctx);
      return done();
    }

    case 'SWAP': {
      const err = needTurn('drawn');
      if (err) return fail(err);
      const old = actor.hand[action.slot];
      if (!old || !s.drawn) return fail('Choose one of your cards to swap.');
      actor.hand[action.slot] = s.drawn;
      s.drawn = null;
      discardCard(s, old);
      log(s, ctx, {
        kind: 'swap',
        actorId: actor.id,
        card: old,
        slots: [{ playerId: actor.id, slot: action.slot }],
        text: `${actor.name} keeps the drawn card and discards ${cardName(old)}.`,
      });
      endTurn(s, ctx);
      return done();
    }

    case 'DISCARD': {
      const err = needTurn('drawn');
      if (err) return fail(err);
      const c = s.drawn!;
      s.drawn = null;
      discardCard(s, c);
      const power = powerOf(c);
      log(s, ctx, {
        kind: 'discard',
        actorId: actor.id,
        card: c,
        text: `${actor.name} discards ${cardName(c)}.`,
      });
      if (power) {
        s.phase = 'power';
        s.pendingPower = power;
      } else {
        endTurn(s, ctx);
      }
      return done();
    }

    case 'SKIP_POWER': {
      const err = needTurn('power');
      if (err) return fail(err);
      log(s, ctx, { kind: 'skipPower', actorId: actor.id, text: `${actor.name} doesn't use the power.` });
      endTurn(s, ctx);
      return done();
    }

    case 'POWER': {
      // Either straight from the hand (the power card is used, THEN goes to the pile),
      // or after the power card was already discarded.
      if (!isCurrent) return fail("It's not your turn.");
      const held = s.phase === 'drawn' ? s.drawn : null;
      const power = held ? powerOf(held) : s.phase === 'power' ? s.pendingPower : null;
      if (!power) return fail('You cannot use a power now.');
      s.drawn = null;
      if (power === 7 || power === 8) {
        const t = action.target;
        const c = t ? cardAt(s, t) : null;
        if (!t || !c) return fail('Choose a card.');
        if (power === 7 && t.playerId !== actor.id) return fail('The 7 lets you look at one of YOUR cards.');
        if (power === 8 && t.playerId === actor.id) return fail("The 8 lets you look at an OPPONENT's card.");
        know(s, actor.id, c.id);
        log(s, ctx, {
          kind: 'power',
          actorId: actor.id,
          slots: [t],
          reveal: { to: [actor.id], cards: [{ ref: t, card: c }] },
          text:
            power === 7
              ? `${actor.name} peeks at one of their own cards (7).`
              : `${actor.name} peeks at one of ${nameOf(s, t.playerId)}'s cards (8).`,
        });
      } else if (power === 9) {
        const a = action.target;
        const b = action.target2;
        if (!a || !b || !cardAt(s, a) || !cardAt(s, b)) return fail('Choose two cards.');
        if (a.playerId === b.playerId) return fail('The two cards must belong to different players.');
        const pa = getPlayer(s, a.playerId)!;
        const pb = getPlayer(s, b.playerId)!;
        const ca = pa.hand[a.slot]!;
        pa.hand[a.slot] = pb.hand[b.slot];
        pb.hand[b.slot] = ca;
        log(s, ctx, {
          kind: 'power',
          actorId: actor.id,
          slots: [a, b],
          text: `${actor.name} swaps a card of ${pa.name} with a card of ${pb.name} (9).`,
        });
      } else {
        const target = action.targetPlayerId ? getPlayer(s, action.targetPlayerId) : undefined;
        if (!target) return fail('Choose a player.');
        const cards = target.hand.filter((c): c is Card => !!c);
        forgetEverywhere(s, new Set(cards.map((c) => c.id)));
        target.hand = shuffle(cards, ctx.rng).map((c) => ({ ...c, id: newId(s) }));
        log(s, ctx, {
          kind: 'power',
          actorId: actor.id,
          slots: target.hand.map((_, slot) => ({ playerId: target.id, slot })),
          text: `${actor.name} shuffles ${target.id === actor.id ? 'their own' : `${target.name}'s`} cards (10).`,
        });
      }
      if (held) {
        discardCard(s, held);
        log(s, ctx, { kind: 'discard', actorId: actor.id, card: held, text: `${actor.name} discards ${cardName(held)}.` });
      }
      endTurn(s, ctx);
      return done();
    }

    case 'SNAP': {
      if (!isPlayPhase(s)) return fail('You cannot throw cards right now.');
      const top = topDiscard(s);
      if (!top) return fail('There is nothing on the discard pile yet.');
      const owner = getPlayer(s, action.target.playerId);
      const c = owner?.hand[action.target.slot];
      // Someone else threw (or moved) the card you were dragging before your throw arrived.
      if (action.cardId && c?.id !== action.cardId) {
        const thrownAlready = s.topBurned && top.id === action.cardId && !s.snap.open && s.snap.by !== actor.id;
        if (!thrownAlready) return fail('That card has moved — throw cancelled.');
        log(s, ctx, {
          kind: 'snapSlow',
          actorId: actor.id,
          card: top,
          text: `${actor.name} tried to throw the same ${cardName(top)} but ${nameOf(s, s.snap.by!)} was faster.`,
        });
        givePenalty(s, ctx, actor.id, 1, 'too slow', { reason: 'slow', byId: s.snap.by });
        return done();
      }
      if (!owner || !c) return fail('Choose a card to throw.');
      const ref = action.target;
      const whose = owner.id === actor.id ? 'their' : `${owner.name}'s`;

      if (c.rank === top.rank && s.snap.open) {
        owner.hand[ref.slot] = null;
        s.discard.push(c);
        s.topBurned = true;
        s.snap = { ...s.snap, open: false, closedAt: ctx.now, by: actor.id };
        log(s, ctx, {
          kind: 'snap',
          actorId: actor.id,
          card: c,
          slots: [ref],
          text: `${actor.name} throws ${whose} ${cardName(c)} on the ${cardName(top)}!`,
        });
        if (owner.id !== actor.id) givePenalty(s, ctx, owner.id, 2, `${actor.name} threw their card`, { reason: 'caught', byId: actor.id });
        checkAutoPedro(s, ctx, owner.id);
        return done();
      }

      knowAll(s, c.id); // the card was shown and goes back to its place
      const reveal = { to: 'all' as const, cards: [{ ref, card: c }] };
      if (c.rank === top.rank) {
        log(s, ctx, {
          kind: 'snapSlow',
          actorId: actor.id,
          card: c,
          slots: [ref],
          reveal,
          text: `${actor.name} tried to throw ${whose} ${cardName(c)} but ${s.snap.by ? `${nameOf(s, s.snap.by)} was faster` : 'was too slow'} — it goes back.`,
        });
        givePenalty(s, ctx, actor.id, 1, 'too slow', { reason: 'slow', byId: s.snap.by });
      } else {
        log(s, ctx, {
          kind: 'snapWrong',
          actorId: actor.id,
          card: c,
          slots: [ref],
          reveal,
          text: `${actor.name} tried to throw ${whose} ${cardName(c)} on a ${cardName(top)} — wrong! It goes back.`,
        });
        givePenalty(s, ctx, actor.id, 2, 'wrong throw', { reason: 'wrong' });
      }
      return done();
    }
  }
}

