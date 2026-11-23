import { useEffect, useState } from 'react';
import { getIdentity, resetIdentity } from './identity';
import type { Board, LobbyClientMsg, LobbyMsg, LobbySnapshot, MeInfo, PlayerCard, PlayerProfile, Visibility } from './protocol';

/** Someone asking you to sit at their table. */
export interface PlayInvite {
  from: PlayerCard;
  code: string;
  visibility: Visibility;
  key?: string;
  /** When it arrived (invites fade after a minute). */
  at: number;
}

/**
 * Live connection to the lobby while the home page is open: players online, open tables,
 * your friends and the weekly ranking. One shared connection, closed when nobody is looking.
 */
export interface LobbyData {
  lobby: LobbySnapshot | null;
  me: MeInfo | null;
  board: Board | null;
  /** Last message for you ("Friend request sent"…), with a counter so the same text shows again. */
  notice: { text: string; n: number } | null;
  /** Results of the last player search. */
  search: { q: string; results: PlayerCard[] } | null;
  /** The friend link you opened: who sent it (null: broken link). */
  invite: { id: string; from: PlayerCard | null } | null;
  /** The last player card asked for. */
  profile: { id: string; profile: PlayerProfile | null } | null;
  /** Table invites waiting for an answer (newest last). */
  playInvites: PlayInvite[];
  /** People you invited to your current table (to show "Invited ✓"). */
  invited: string[];
}

let data: LobbyData = { lobby: null, me: null, board: null, notice: null, search: null, invite: null, profile: null, playInvites: [], invited: [] };
/** Invites to send as soon as the lobby sees you sitting at your new table. */
let queued: { id: string; code: string; at: number }[] = [];
const INVITE_TTL = 60_000;
let ws: WebSocket | null = null;
let users = 0;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let who: { name: string; avatar?: string } | null = null;
const listeners = new Set<(d: LobbyData) => void>();
/** Things to (re)send whenever the connection opens. */
const onOpen = new Set<() => void>();

/** Run `fn` now if connected, and again after every reconnect, until the returned cleanup is called. */
export function whenConnected(fn: () => void): () => void {
  onOpen.add(fn);
  if (ws?.readyState === WebSocket.OPEN) fn();
  return () => {
    onOpen.delete(fn);
  };
}

function update(patch: Partial<LobbyData>) {
  data = { ...data, ...patch };
  for (const fn of listeners) fn(data);
}

function send(msg: LobbyClientMsg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function auth() {
  if (!who?.name.trim()) return;
  const { id, secret } = getIdentity();
  send({ t: 'auth', id, secret, name: who.name, avatar: who.avatar });
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const sock = new WebSocket(`${proto}//${location.host}/api/lobby/ws`);
  ws = sock;
  sock.onopen = () => {
    auth();
    for (const fn of onOpen) fn();
  };
  sock.onmessage = (ev) => {
    let msg: LobbyMsg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    retry = 0;
    if (msg.t === 'lobby') update({ lobby: msg.lobby });
    else if (msg.t === 'me') {
      // Left the table (or moved to another): the "Invited" marks start over.
      const invited = msg.me.table && msg.me.table === data.me?.table ? data.invited : [];
      update({ me: msg.me, invited });
      flushQueued();
    } else if (msg.t === 'play-invite') {
      const rest = data.playInvites.filter((i) => i.from.id !== msg.from.id && Date.now() - i.at < INVITE_TTL);
      update({ playInvites: [...rest, { from: msg.from, code: msg.code, visibility: msg.visibility, key: msg.key, at: Date.now() }] });
    }
    else if (msg.t === 'board') update({ board: msg.board });
    else if (msg.t === 'profile') update({ profile: { id: msg.id, profile: msg.profile } });
    else if (msg.t === 'invite') update({ invite: { id: msg.id, from: msg.from } });
    else if (msg.t === 'search') update({ search: { q: msg.q, results: msg.results } });
    else if (msg.t === 'notice') update({ notice: { text: msg.message, n: (data.notice?.n ?? 0) + 1 } });
    else if (msg.t === 'auth-fail') {
      resetIdentity();
      auth();
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    if (users === 0) return;
    retryTimer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** retry++));
  };
}

function disconnect() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const sock = ws;
  ws = null;
  sock?.close();
}

/** Tell the lobby who you are (name and avatar shown to friends and in the ranking). */
export function setLobbyPlayer(name: string, avatar?: string) {
  if (who && who.name === name && who.avatar === avatar) return;
  who = { name, avatar };
  auth();
}

export const addFriend = (id: string) => send({ t: 'friend-add', code: id });
export const searchPlayers = (q: string) => send({ t: 'search', q });
export const requestProfile = (id: string) => send({ t: 'profile', id });
export const checkInvite = (id: string, token: string) => send({ t: 'invite-check', id, token });
export const acceptInvite = (id: string, token: string) => send({ t: 'invite-accept', id, token });

/** Your friend link, to send on WhatsApp, Messages… */
export function friendLink(me: MeInfo): string {
  return `${location.origin}/f/${me.id}-${me.invite}`;
}
/** Ask someone online (friend or not) to sit at the table you're at. */
export function invitePlayer(id: string) {
  send({ t: 'play-invite', to: id });
  if (!data.invited.includes(id)) update({ invited: [...data.invited, id] });
}

/** Invite someone to a table you're about to open: sent once the lobby sees you sitting there. */
export function queueInvite(id: string, code: string) {
  queued = [...queued.filter((q) => q.id !== id), { id, code, at: Date.now() }];
  update({ invited: [] });
}

function flushQueued() {
  if (!data.me?.table) return;
  const now = Date.now();
  const table = data.me.table;
  const ids = queued.filter((q) => q.code === table && now - q.at < INVITE_TTL).map((q) => q.id);
  queued = queued.filter((q) => q.code !== table && now - q.at < INVITE_TTL);
  for (const id of ids) invitePlayer(id);
}

/** Yes (you're going to their table) or no (they're told you can't right now). */
export function answerPlayInvite(inv: PlayInvite, ok: boolean) {
  send({ t: 'play-answer', from: inv.from.id, ok });
  update({ playInvites: data.playInvites.filter((i) => i !== inv) });
}

/** Forget invites that are too old to answer. */
export function dropOldInvites() {
  const fresh = data.playInvites.filter((i) => Date.now() - i.at < INVITE_TTL);
  if (fresh.length !== data.playInvites.length) update({ playInvites: fresh });
}

export const answerFriend = (id: string, ok: boolean) => send({ t: 'friend-answer', id, ok });
export const removeFriend = (id: string) => send({ t: 'friend-remove', id });

export function useLobby(): LobbyData {
  const [d, set] = useState(data);
  useEffect(() => {
    listeners.add(set);
    set(data);
    if (users++ === 0 && !ws) connect();
    // Phone back from sleep: reconnect at once.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !ws && users > 0) {
        if (retryTimer) clearTimeout(retryTimer);
        retry = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      listeners.delete(set);
      document.removeEventListener('visibilitychange', onVisible);
      if (--users === 0) disconnect();
    };
  }, []);
  return d;
}

/** Ask the lobby for a quick-match table to sit at. */
export async function findQuickMatch(): Promise<string> {
  const res = await fetch('/api/lobby/quick', { method: 'POST' });
  if (!res.ok) throw new Error('Quick match is not available right now.');
  const { code } = (await res.json()) as { code: string };
  return code;
}
