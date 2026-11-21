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
  isBot: boolean;
  connected: boolean;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  seats: SeatInfo[];
  settings: RoomSettings;
  started: boolean;
}

export type ClientMsg =
  | { t: 'hello'; name: string; token: string }
  | { t: 'settings'; settings: RoomSettings }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'lobby' }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'room'; room: RoomInfo; you: string }
  /** deadlineIn: ms until the current human turn is auto-played (server and phone clocks differ, so it's relative). */
  | { t: 'state'; state: GameState; deadlineIn: number | null }
  | { t: 'error'; message: string; fatal?: boolean };
