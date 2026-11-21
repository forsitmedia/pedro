import { cardValue } from '../engine/cards';
import { buildMemory, decideAction, planSnap, PROFILES, type BotProfile, type Difficulty } from '../bots/bot';
import { apply, createGame, currentPlayer, findCard, isPlayPhase } from '../engine/engine';
import type { Action, GameSettings, GameState } from '../engine/types';

export interface RunnerPlayer {
  id: string;
  name: string;
  isBot: boolean;
  avatar?: string;
}

export interface RunnerOptions {
  difficulty: Difficulty;
  /** Seconds a human has for their whole turn before it is played for them. `null` = no limit. */
  turnSeconds?: number | null;
  /** Seconds to look at the first two cards before the game does it for you. `null` = no limit. */
  peekSeconds?: number | null;
  /** Is this human currently disconnected? Their turn is then played automatically after a short wait. */
  isAway?: (playerId: string) => boolean;
  /** Pick up a saved game (after the server restarted) instead of dealing a new one. */
  resume?: RunnerSnapshot;
}

/** Everything needed to continue a game later. */
export interface RunnerSnapshot {
  state: GameState;
  /** Cards each computer player has forgotten. */
  forgotten: Record<string, string[]>;
}

/** How long we wait for a disconnected player before playing their turn for them. */
const AWAY_SECONDS = 8;
/** Seconds everyone gets to throw on the very last discard of a round. */
const LAST_CALL_SECONDS = 5;
/** Seconds between rounds (results + reveal) before the next round starts on its own. */
const NEXT_ROUND_SECONDS = 45;

export const BOT_NAMES = ['Lucía', 'Mateo', 'Valentina', 'Santiago', 'Martina', 'Joaquín', 'Camila'];

/**
 * Runs one game: applies actions with the rules engine, plays the computer
 * players on timers and (optionally) enforces a turn timer for humans.
 * Used both in the browser (vs computer) and on the server (online rooms).
 */
export class GameRunner {
  protected state: GameState;
  private listeners = new Set<() => void>();
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private humanTimer: ReturnType<typeof setTimeout> | null = null;
  private humanTimerKey = '';
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private snapPlannedFor = -1;
  private forgotten: Record<string, Set<string>> = {};
  private profile: BotProfile;
  private destroyed = false;
  private rng = Math.random;
  private watchdog: ReturnType<typeof setInterval>;
  /** When the current human's turn will be played for them (ms timestamp), if there is a limit. */
  turnDeadline: number | null = null;

  constructor(
    players: RunnerPlayer[],
    settings: GameSettings,
    private opts: RunnerOptions,
  ) {
    this.profile = PROFILES[opts.difficulty];
    for (const p of players) if (p.isBot) this.forgotten[p.id] = new Set(opts.resume?.forgotten[p.id] ?? []);
    this.state = opts.resume ? opts.resume.state : createGame(players, settings, { rng: this.rng, now: Date.now() });
    this.later(() => this.afterChange(), 0);
    // Safety net: if someone should be playing but nothing is scheduled, nudge it.
    this.watchdog = setInterval(() => this.afterChange(), 1500);
  }

  getState = () => this.state;

  /** The game as it is now, to save it. */
  snapshot(): RunnerSnapshot {
    return { state: this.state, forgotten: Object.fromEntries(Object.entries(this.forgotten).map(([id, set]) => [id, [...set]])) };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  destroy() {
    this.destroyed = true;
    clearInterval(this.watchdog);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  dispatch = (action: Action): string | null => {
    if (this.destroyed) return null;
    const prevSeq = this.state.seq;
    const res = apply(this.state, action, { rng: this.rng, now: Date.now() });
    if (!res.ok) return res.error;
    this.state = res.state;
    this.onEvents(prevSeq);
    this.afterChange();
    for (const fn of this.listeners) fn();
    return null;
  };

  /** Something outside changed (e.g. a player disconnected): re-check timers. */
  poke() {
    this.afterChange();
    for (const fn of this.listeners) fn();
  }

  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  private rand([a, b]: [number, number]) {
    return a + this.rng() * (b - a);
  }

  /** Bots re-learn cards that are shown to them. */
  private onEvents(prevSeq: number) {
    for (const ev of this.state.events) {
      if (ev.id <= prevSeq || !ev.reveal) continue;
      for (const botId of Object.keys(this.forgotten)) {
        if (ev.reveal.to === 'all' || ev.reveal.to.includes(botId)) {
          for (const { card } of ev.reveal.cards) this.forgotten[botId].delete(card.id);
        }
      }
    }
  }

  private afterChange() {
    const s = this.state;
    if (this.destroyed) return;
    this.scheduleHumanTimer();

    if (s.phase === 'peek') {
      if (s.players.some((p) => p.isBot && !s.ready[p.id]) && !this.turnTimer) {
        this.turnTimer = this.later(() => {
          this.turnTimer = null;
          const st = this.state;
          const bot = st.players.find((p) => p.isBot && !st.ready[p.id]);
          if (st.phase !== 'peek' || !bot) {
            // The round started meanwhile: make sure the first bot gets going.
            this.afterChange();
            return;
          }
          if (!st.peeked[bot.id]) {
            const slots = [0, 1, 2, 3].sort(() => this.rng() - 0.5).slice(0, 2) as [number, number];
            this.dispatch({ type: 'PEEK', playerId: bot.id, slots });
          }
          this.dispatch({ type: 'READY', playerId: bot.id });
        }, 250);
      }
      return;
    }

    if (s.phase === 'roundEnd') {
      // Next round as soon as every (connected) human is ready — or when the countdown runs out.
      const waiting = s.players.filter((p) => !p.isBot && !s.nextReady?.[p.id] && !this.opts.isAway?.(p.id));
      if (!waiting.length) {
        this.turnDeadline = null;
        this.dispatch({ type: 'NEXT_ROUND' });
        return;
      }
      if (this.nextRoundFor !== s.round) {
        this.nextRoundFor = s.round;
        const round = s.round;
        this.turnDeadline = Date.now() + NEXT_ROUND_SECONDS * 1000;
        this.later(() => {
          if (this.state.phase === 'roundEnd' && this.state.round === round) {
            this.turnDeadline = null;
            this.dispatch({ type: 'NEXT_ROUND' });
          }
        }, NEXT_ROUND_SECONDS * 1000);
      }
      return;
    }

    if (s.phase === 'lastCall') {
      if (s.snap.open && s.snap.eventId !== this.snapPlannedFor) {
        this.snapPlannedFor = s.snap.eventId;
        this.planBotSnaps();
      }
      this.scheduleRoundEnd();
      return;
    }

    if (!isPlayPhase(s)) return;

    if (currentPlayer(s).isBot && !this.turnTimer) {
      // Give humans time to watch powers (peeks, swaps, shuffles) before the game moves on.
      const recentPower = s.events
        .slice(-4)
        .some((e) => e.kind === 'power' || e.kind === 'penalty' || e.kind === 'snapWrong' || e.kind === 'snapSlow');
      // A beat at the start of each bot turn so you can see whose turn it is.
      const extra = (s.phase === 'turnStart' ? 1000 : 0) + (recentPower ? 2000 : 0);
      this.turnTimer = this.later(() => this.botStep(), this.rand(this.profile.thinkDelay) + extra);
    }

    if (s.snap.open && s.snap.eventId !== this.snapPlannedFor) {
      this.snapPlannedFor = s.snap.eventId;
      this.planBotSnaps();
    }
  }

  /**
   * Last chance to throw: a few seconds after the final turn, then the cards are counted.
   * Any throw in that time pushes the end back a little, so its animation and penalty can be seen.
   */
  private lastCallTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCallSeq = -1;
  private nextRoundFor = -1;
  private scheduleRoundEnd() {
    const s = this.state;
    const first = this.lastCallTimer === null && this.lastCallSeq === -1;
    if (!first && s.seq === this.lastCallSeq) return;
    const wait = first ? LAST_CALL_SECONDS * 1000 : Math.max(2500, (this.turnDeadline ?? 0) - Date.now());
    this.lastCallSeq = s.seq;
    if (this.lastCallTimer) clearTimeout(this.lastCallTimer);
    this.turnDeadline = Date.now() + wait;
    this.lastCallTimer = this.later(() => {
      this.lastCallTimer = null;
      this.lastCallSeq = -1;
      this.turnDeadline = null;
      if (this.state.phase === 'lastCall') this.dispatch({ type: 'END_ROUND' });
    }, wait);
  }

  /** Turn timer for humans (and auto-play for disconnected players). */
  private scheduleHumanTimer() {
    const s = this.state;
    let key = '';
    let seconds: number | null = null;
    let who: string[] = [];
    if (s.phase === 'peek') {
      who = s.players.filter((p) => !p.isBot && !s.ready[p.id]).map((p) => p.id);
      const away = who.some((id) => this.opts.isAway?.(id));
      seconds = away ? 3 : (this.opts.peekSeconds ?? null);
      key = `peek:${s.round}:${who.join(',')}:${away}`;
    } else if (isPlayPhase(s) && !currentPlayer(s).isBot) {
      const id = currentPlayer(s).id;
      who = [id];
      const away = !!this.opts.isAway?.(id);
      seconds = away ? AWAY_SECONDS : (this.opts.turnSeconds ?? null);
      key = `turn:${s.round}:${s.turnCount}:${away}`;
    }
    if (key === this.humanTimerKey) return;
    this.humanTimerKey = key;
    if (this.humanTimer) clearTimeout(this.humanTimer);
    this.humanTimer = null;
    this.turnDeadline = null;
    if (!who.length || seconds === null) return;
    this.turnDeadline = Date.now() + seconds * 1000;
    this.humanTimer = this.later(() => {
      this.humanTimer = null;
      this.humanTimerKey = '';
      this.turnDeadline = null;
      this.autoPlay(who);
    }, seconds * 1000);
  }

  /** Play the simplest legal moves for humans who ran out of time. */
  private autoPlay(ids: string[]) {
    const s = this.state;
    if (s.phase === 'peek') {
      for (const id of ids) {
        if (!s.peeked[id]) this.dispatch({ type: 'PEEK', playerId: id, slots: [2, 3] });
        this.dispatch({ type: 'READY', playerId: id });
      }
      return;
    }
    const id = ids[0];
    if (!isPlayPhase(s) || currentPlayer(s).id !== id) return;
    if (this.state.phase === 'turnStart') this.dispatch({ type: 'DRAW', playerId: id });
    if (this.state.phase === 'drawn') this.dispatch({ type: 'DISCARD', playerId: id });
    if (this.state.phase === 'power') this.dispatch({ type: 'SKIP_POWER', playerId: id });
  }

  private botStep() {
    this.turnTimer = null;
    const s = this.state;
    if (!isPlayPhase(s)) return;
    const bot = currentPlayer(s);
    if (!bot.isBot) return this.afterChange();
    const forgotten = this.forgotten[bot.id];
    if (s.phase === 'turnStart') {
      for (const id of s.known[bot.id] ?? []) if (this.rng() < this.profile.forget) forgotten.add(id);
    }
    const mem = buildMemory(s, bot.id, forgotten);
    const action = decideAction(s, bot.id, mem, this.profile, this.rng);
    const err = this.dispatch(action);
    if (err) {
      // Safety net: never let a bot get stuck.
      const fallback: Action =
        s.phase === 'drawn'
          ? { type: 'DISCARD', playerId: bot.id }
          : s.phase === 'power'
            ? { type: 'SKIP_POWER', playerId: bot.id }
            : { type: 'DRAW', playerId: bot.id };
      this.dispatch(fallback);
    }
  }

  private planBotSnaps() {
    const s = this.state;
    const eventId = s.snap.eventId;
    for (const p of s.players) {
      if (!p.isBot) continue;
      const mem = buildMemory(s, p.id, this.forgotten[p.id]);
      const plan = planSnap(s, p.id, mem, this.profile, this.rng);
      if (!plan) continue;
      this.later(() => {
        const st = this.state;
        if ((!isPlayPhase(st) && st.phase !== 'lastCall') || st.snap.eventId !== eventId) return;
        // If someone just beat us to it, a bot (like a human) may still slam its card down and get penalised.
        if (!st.snap.open && Date.now() - st.snap.closedAt > 350) return;
        const where = findCard(st, plan.cardId);
        if (!where) return;
        this.dispatch({ type: 'SNAP', playerId: p.id, target: where });
        // First with its own card? Then any other card of that rank it remembers goes down too.
        const after = this.state;
        if (!(after.snap.by === p.id && after.snap.own && after.snap.eventId === eventId)) return;
        const top = after.discard[after.discard.length - 1];
        const memNow = buildMemory(after, p.id, this.forgotten[p.id]);
        const me = after.players.find((x) => x.id === p.id)!;
        const extra = me.hand.findIndex((c) => c && memNow.has(c.id) && top && c.rank === top.rank && cardValue(c) >= 0);
        if (extra < 0) return;
        const extraId = me.hand[extra]!.id;
        this.later(() => {
          const st2 = this.state;
          if (st2.snap.eventId !== eventId) return;
          const w2 = findCard(st2, extraId);
          if (w2) this.dispatch({ type: 'SNAP', playerId: p.id, target: w2 });
        }, 350 + this.rng() * 300);
      }, plan.delay);
    }
  }
}
