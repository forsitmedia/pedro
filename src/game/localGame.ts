import type { Difficulty } from '../bots/bot';
import { BOT_NAMES, GameRunner } from './runner';
import type { GameConnection } from './connection';
import type { Reaction } from '../online/protocol';

export const HUMAN_ID = 'you';

export interface LocalSetup {
  playerName: string;
  /** Your avatar code. */
  avatar?: string;
  /** Names (and so avatars) of the computer players, in seat order. */
  botNames?: string[];
  bots: number;
  difficulty: Difficulty;
  limit: number | null;
  /** Show the list of moves on the side (off = harder, pure memory). */
  showLog: boolean;
}

/** A game against the computer, entirely in the browser. */
export class LocalGame extends GameRunner implements GameConnection {
  readonly meId = HUMAN_ID;
  readonly showLog: boolean;
  readonly online = false;

  constructor(readonly setup: LocalSetup) {
    const names = setup.botNames?.length ? setup.botNames : [...BOT_NAMES].sort(() => Math.random() - 0.5);
    super(
      [
        { id: HUMAN_ID, name: setup.playerName.trim() || 'You', isBot: false, avatar: setup.avatar },
        ...Array.from({ length: setup.bots }, (_, i) => ({ id: `bot${i + 1}`, name: names[i], isBot: true })),
      ],
      { limit: setup.limit },
      { difficulty: setup.difficulty },
    );
    this.showLog = setup.showLog;
    // The computer players have feelings too (now and then).
    this.subscribe(() => this.botFeelings());
  }

  private reactListeners = new Set<(playerId: string, r: Reaction) => void>();
  private seenEvent = 0;
  private reactedRound = 0;

  react = (r: Reaction) => this.emitReaction(HUMAN_ID, r);

  onReact = (fn: (playerId: string, r: Reaction) => void) => {
    this.reactListeners.add(fn);
    return () => {
      this.reactListeners.delete(fn);
    };
  };

  private emitReaction(playerId: string, r: Reaction, delayMs = 0) {
    const go = () => {
      for (const fn of this.reactListeners) fn(playerId, r);
    };
    if (delayMs) setTimeout(go, delayMs);
    else go();
  }

  private botFeelings() {
    const s = this.getState();
    const fresh = s.events.filter((e) => e.id > this.seenEvent);
    if (s.events.length) this.seenEvent = Math.max(this.seenEvent, ...s.events.map((e) => e.id));
    for (const e of fresh) {
      // A computer player who just got penalty cards is sometimes furious.
      if (e.kind === 'penalty' && e.actorId?.startsWith('bot') && Math.random() < 0.35) this.emitReaction(e.actorId, 'angry', 600);
    }
    // End of a round: the winner flexes, the worst one cries. (After the reveal, so it doesn't spoil it.)
    if ((s.phase === 'roundEnd' || s.phase === 'gameOver') && s.results && this.reactedRound !== s.round) {
      this.reactedRound = s.round;
      const scores = s.results.map((r) => ({ id: r.playerId, v: r.sum + r.penalty }));
      const best = Math.min(...scores.map((x) => x.v));
      const worst = Math.max(...scores.map((x) => x.v));
      const wait = 1000 * (3 + s.players.length * 1.5);
      const winner = scores.find((x) => x.v === best && x.id.startsWith('bot'));
      const loser = scores.find((x) => x.v === worst && x.v !== best && x.id.startsWith('bot'));
      if (winner && Math.random() < 0.7) this.emitReaction(winner.id, 'aura', wait);
      if (loser && Math.random() < 0.6) this.emitReaction(loser.id, 'cry', wait + 900);
    }
  }

  getTurnDeadline = () => this.turnDeadline;
}
