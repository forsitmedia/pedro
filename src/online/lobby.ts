import { useEffect, useState } from 'react';
import type { LobbyMsg, LobbySnapshot } from './protocol';

/**
 * Live view of the lobby (players online, open tables) while the home page is open.
 * One shared connection, closed again when nobody is looking.
 */
let snapshot: LobbySnapshot | null = null;
let ws: WebSocket | null = null;
let users = 0;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(s: LobbySnapshot | null) => void>();

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const sock = new WebSocket(`${proto}//${location.host}/api/lobby/ws`);
  ws = sock;
  sock.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data) as LobbyMsg;
      if (msg.t !== 'lobby') return;
      retry = 0;
      snapshot = msg.lobby;
      for (const fn of listeners) fn(snapshot);
    } catch {
      /* ignore */
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

export function useLobby(): LobbySnapshot | null {
  const [s, set] = useState(snapshot);
  useEffect(() => {
    listeners.add(set);
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
  return s;
}

/** Ask the lobby for a quick-match table to sit at. */
export async function findQuickMatch(): Promise<string> {
  const res = await fetch('/api/lobby/quick', { method: 'POST' });
  if (!res.ok) throw new Error('Quick match is not available right now.');
  const { code } = (await res.json()) as { code: string };
  return code;
}
