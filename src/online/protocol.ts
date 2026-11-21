import type { Difficulty } from '../bots/bot';
import type { Action, GameState } from '../engine/types';

/** Messages between a player's browser and the room on the server. */

export const MAX_SEATS = 6;
export const ROOM_CODE_RE = /^[A-Z0-9]{5}$/;
/** Letters that can't be confused with each other when read aloud or typed. */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newRoomCode(): string {
  let c = '';
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  for (const b of bytes) c += CODE_CHARS[b % CODE_CHARS.length];
  return c;
}

export interface RoomSettings {
  /** 30 / 50 / 80, or null for a single round. */
  limit: number | null;
  /** Computer players filling empty seats. */
  bots: number;
  difficulty: Difficulty;
  showLog: boolean;
  /** Seconds per turn, or null for no timer. */
  turnSeconds: number | null;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  limit: 30,
  bots: 0,
  difficulty: 'normal',
  showLog: true,
  turnSeconds: 60,
};

export interface SeatInfo {
  id: string;
  name: string;
  avatar?: string;
  isBot: boolean;
  connected: boolean;
}

/** open: listed in the lobby, anyone can sit. private: listed, but strangers must ask the host. quick: a quick-match table that starts by itself. */
export type Visibility = 'open' | 'private' | 'quick';
export const QUICK_SEATS = 4;
export const QUICK_WAIT_MS = 20_000;

/** Someone from the lobby knocking at a private table. */
export interface JoinRequest {
  id: string;
  name: string;
  avatar?: string;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  seats: SeatInfo[];
  settings: RoomSettings;
  started: boolean;
  visibility: Visibility;
  /** Only sent to the host of a private table. */
  requests?: JoinRequest[];
  /** Quick-match tables: ms until the game starts on its own. */
  autoStartIn?: number | null;
  /** Private tables: the secret part of the invite link (only sent to people already seated). */
  key?: string;
}

/* ───────────── the lobby (who's online, which tables are open) ───────────── */

export interface TableListing {
  code: string;
  visibility: Visibility;
  /** Human players at the table. */
  players: { name: string; avatar?: string }[];
  bots: number;
  started: boolean;
  round?: number;
  /** Highest total, to show how far the game is. */
  limit: number | null;
  updatedAt: number;
}

export interface LobbySnapshot {
  online: number;
  playing: number;
  tables: TableListing[];
}

export type LobbyMsg = { t: 'lobby'; lobby: LobbySnapshot };

export type ClientMsg =
  | {
      t: 'hello';
      name: string;
      token: string;
      avatar?: string;
      /** Only used by whoever opens a new table. */
      mode?: Visibility;
      /** Invite key from a private link (or set by the creator). */
      key?: string;
    }
  | { t: 'admit'; id: string; ok: boolean }
  | { t: 'settings'; settings: RoomSettings; visibility?: Visibility }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'lobby' }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'room'; room: RoomInfo; you: string }
  /** deadlineIn: ms until the current human turn is auto-played (server and phone clocks differ, so it's relative). */
  | { t: 'state'; state: GameState; deadlineIn: number | null }
  | { t: 'error'; message: string; fatal?: boolean }
  /** You knocked at a private table: waiting for the host. */
  | { t: 'knocking' };
