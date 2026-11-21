import type { Difficulty } from '../bots/bot';
import { BOT_NAMES, GameRunner } from './runner';
import type { GameConnection } from './connection';

export const HUMAN_ID = 'you';

export interface LocalSetup {
  playerName: string;
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
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    super(
      [
        { id: HUMAN_ID, name: setup.playerName.trim() || 'You', isBot: false },
        ...Array.from({ length: setup.bots }, (_, i) => ({ id: `bot${i + 1}`, name: names[i], isBot: true })),
      ],
      { limit: setup.limit },
      { difficulty: setup.difficulty },
    );
    this.showLog = setup.showLog;
  }

  getTurnDeadline = () => this.turnDeadline;
}
