import type { Difficulty } from '../bots/bot';
import { BOT_NAMES, GameRunner } from './runner';
import type { GameConnection } from './connection';

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
  }

  getTurnDeadline = () => this.turnDeadline;
}
