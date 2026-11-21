import type { Difficulty } from '../bots/bot';
import type { Action, GameState } from '../engine/types';

/** Messages between a player's browser and the room on the server. */

export const MAX_SEATS = 6;
export const ROOM_CODE_RE = /^[A-Z0-9]{5}$/;
/** Player ids double as friend codes: 8 easy-to-read characters. */
export const PLAYER_ID_RE = /^[A-HJ-NP-Z2-9]{8}$/;
/** Letters that can't be confused with each other when read aloud or typed. */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newPlayerId(): string {
  let c = '';
  for (const b of crypto.getRandomValues(new Uint8Array(8))) c += CODE_CHARS[b % CODE_CHARS.length];
  return c;
}

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
  /** Has an online profile (so you can send a friend request from the table). */
  social?: boolean;
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
  players: { name: string; avatar?: string; pid?: string }[];
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

/* ───────────── players, friends and the weekly ranking ───────────── */

export interface PlayerCard {
  id: string;
  name: string;
  avatar?: string;
}

export interface FriendInfo extends PlayerCard {
  status: 'offline' | 'online' | 'waiting' | 'playing';
  /** The table they're at (with the key, so friends can walk straight in). */
  table?: { code: string; visibility: Visibility; started: boolean; round?: number; key?: string };
}

export interface MeInfo {
  id: string;
  friends: FriendInfo[];
  /** People asking to be your friend. */
  requests: PlayerCard[];
  /** Requests you sent that aren't answered yet. */
  sent: PlayerCard[];
  /** People you played with lately (not friends yet). */
  recent: PlayerCard[];
  /** Real people online right now (not friends yet), to add. */
  online: PlayerCard[];
  /** Secret for your friend link: /f/<id>-<invite>. */
  invite: string;
  /** Your place in this week's ranking. */
  week: { rank: number | null; points: number; wins: number; games: number };
}

export interface BoardRow extends PlayerCard {
  points: number;
  wins: number;
  games: number;
}

export interface Board {
  /** e.g. "2026-W47". */
  week: string;
  /** When this week's ranking closes (ms since epoch). */
  ends: number;
  top: BoardRow[];
  /** Last week's winner, for bragging rights. */
  lastChampion?: BoardRow;
}

/**
 * Points in the weekly ranking (only online games with at least 2 people count).
 * - play: every finished game (playing more pays off)
 * - win: lowest total at the end
 * - beat: for each person who finished above you
 * - margin: up to `marginMax` for finishing well below the table's average total (1 point per `marginPer` below it)
 * You enter the chart after `minGames` games, so one lucky game can't top the week.
 */
export const POINTS = { play: 5, win: 10, beat: 4, marginPer: 5, marginMax: 10, minGames: 3 };

/** Points for one finished game, given everyone's final totals. */
export function gamePoints(mine: number, totals: number[]): { points: number; won: boolean } {
  const best = Math.min(...totals);
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  const won = mine === best;
  const beaten = totals.filter((t) => t > mine).length;
  const margin = Math.max(0, Math.min(POINTS.marginMax, Math.floor((avg - mine) / POINTS.marginPer)));
  return { points: POINTS.play + (won ? POINTS.win : 0) + POINTS.beat * beaten + margin, won };
}

export type LobbyMsg =
  | { t: 'lobby'; lobby: LobbySnapshot }
  | { t: 'me'; me: MeInfo }
  | { t: 'board'; board: Board }
  | { t: 'notice'; message: string }
  /** Who sent this friend link (null: the link doesn't work). */
  | { t: 'invite'; id: string; from: PlayerCard | null }
  /** Players whose name matches what you typed. */
  | { t: 'search'; q: string; results: PlayerCard[] }
  /** This browser's player id belongs to someone else: make a new one. */
  | { t: 'auth-fail' };

export type LobbyClientMsg =
  | { t: 'auth'; id: string; secret: string; name: string; avatar?: string }
  | { t: 'friend-add'; code: string }
  | { t: 'search'; q: string }
  | { t: 'invite-check'; id: string; token: string }
  | { t: 'invite-accept'; id: string; token: string }
  | { t: 'friend-answer'; id: string; ok: boolean }
  | { t: 'friend-remove'; id: string };

/** Game results sent by a room to the lobby when a game ends. */
export interface GameReport {
  key: string;
  players: { pid: string; secret: string; total: number }[];
}

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
      /** Your player id and its secret (for friends and the ranking). */
      pid?: string;
      psecret?: string;
    }
  | { t: 'admit'; id: string; ok: boolean }
  /** Send a friend request to the player in this seat. */
  | { t: 'friend'; seatId: string }
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
  /** Good news for you only ("Friend request sent"). */
  | { t: 'info'; message: string }
  /** You knocked at a private table: waiting for the host. */
  | { t: 'knocking' };
