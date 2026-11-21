import type { Action, GameState } from '../engine/types';

/** What the game table needs, whether the game runs in this browser or on the server. */
export interface GameConnection {
  /** Which player you are. */
  readonly meId: string;
  readonly showLog: boolean;
  readonly online: boolean;
  getState(): GameState;
  subscribe(fn: () => void): () => void;
  /** Returns an error message right away (local), or null and reports errors later via `onError` (online). */
  dispatch(action: Action): string | null;
  onError?(fn: (message: string) => void): () => void;
  /** When the current human turn will be played automatically, if there is a turn timer. */
  getTurnDeadline(): number | null;
  /** Online: is this player disconnected right now? */
  isAway?(playerId: string): boolean;
  /** Online: can you send this player a friend request from the table? */
  canBefriend?(playerId: string): boolean;
  befriend?(playerId: string): void;
  /** Online: good news for you ("Friend request sent"). */
  onInfo?(fn: (message: string) => void): () => void;
}
