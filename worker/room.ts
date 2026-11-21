import { DurableObject } from 'cloudflare:workers';
import { viewFor } from '../src/engine/view';
import type { Action } from '../src/engine/types';
import { BOT_NAMES, GameRunner } from '../src/game/runner';
import {
  DEFAULT_SETTINGS,
  MAX_SEATS,
  type ClientMsg,
  type RoomInfo,
  type RoomSettings,
  type ServerMsg,
} from '../src/online/protocol';

/* ───────────── limits that keep the free plan free ───────────── */
/** A room with no messages for this long is closed. */
const IDLE_MS = 30 * 60 * 1000;
/** At most this many messages per connection in RATE_WINDOW_MS. */
const RATE_MAX = 60;
const RATE_WINDOW_MS = 10_000;
const MAX_MSG_CHARS = 4096;
const MAX_CONNECTIONS = 16;
/** In the lobby, a player who closed the page is removed after this long (refreshing is fine). */
const LOBBY_GRACE_MS = 20_000;

interface Seat {
  id: string;
  name: string;
  token: string;
  connected: boolean;
}

interface Conn {
  seatId: string | null;
  times: number[];
}

export interface Env {
  ROOMS: DurableObjectNamespace<PedroRoom>;
  ASSETS: Fetcher;
}

/**
 * One Pedro table. Cloudflare runs one instance per room code, so everyone
 * who opens the same link talks to the same object, which holds the real cards.
 */
export class PedroRoom extends DurableObject<Env> {
  private conns = new Map<WebSocket, Conn>();
  private seats: Seat[] = [];
  private hostId = '';
  private settings: RoomSettings = { ...DEFAULT_SETTINGS };
  private runner: GameRunner | null = null;
  private botSeats: { id: string; name: string }[] = [];
  private seq = 0;
  private code = '';
  private lastActivity = Date.now();
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (this.conns.size >= MAX_CONNECTIONS) return new Response('Room is busy', { status: 503 });
    this.code = new URL(request.url).pathname.split('/')[3] ?? '';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.conns.set(server, { seatId: null, times: [] });
    server.addEventListener('message', (ev) => this.onMessage(server, ev.data));
    server.addEventListener('close', () => this.onClose(server));
    server.addEventListener('error', () => this.onClose(server));
    this.touch();
    if (!this.idleTimer) this.idleTimer = setInterval(() => this.checkIdle(), 60_000);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ───────────── messages ───────────── */

  private onMessage(ws: WebSocket, data: string | ArrayBuffer) {
    const conn = this.conns.get(ws);
    if (!conn) return;
    const now = Date.now();
    conn.times = conn.times.filter((t) => now - t < RATE_WINDOW_MS);
    conn.times.push(now);
    if (conn.times.length > RATE_MAX) return this.kick(ws, 'Too many messages — slow down.');
    if (typeof data !== 'string' || data.length > MAX_MSG_CHARS) return this.kick(ws, 'Message too large.');
    let msg: ClientMsg;
    try {
      msg = JSON.parse(data);
    } catch {
      return this.kick(ws, 'Bad message.');
    }
    this.touch();

    if (msg.t === 'hello') return this.hello(ws, conn, msg.name, msg.token);
    const seat = this.seats.find((s) => s.id === conn.seatId);
    if (!seat) return this.send(ws, { t: 'error', message: 'Join the room first.' });

    switch (msg.t) {
      case 'settings':
        if (seat.id !== this.hostId || this.runner) return;
        this.settings = cleanSettings(msg.settings, this.seats.length);
        return this.broadcastRoom();
      case 'start':
        return this.start(ws, seat);
      case 'action':
        return this.act(ws, seat, msg.action);
      case 'lobby':
        if (seat.id !== this.hostId || !this.runner) return;
        if (this.runner.getState().phase !== 'gameOver') return;
        return this.backToLobby();
      case 'leave':
        return this.leave(seat);
    }
  }

  private hello(ws: WebSocket, conn: Conn, rawName: unknown, rawToken: unknown) {
    const token = typeof rawToken === 'string' ? rawToken.slice(0, 64) : '';
    if (!token) return this.kick(ws, 'Missing player token.');
    let seat = this.seats.find((s) => s.token === token);
    if (!seat) {
      if (this.runner) return this.kick(ws, 'This game has already started. Ask the host to start a new one.');
      if (this.seats.length >= MAX_SEATS) return this.kick(ws, `This table is full (${MAX_SEATS} players).`);
      seat = { id: `p${++this.seq}`, name: this.uniqueName(cleanName(rawName)), token, connected: true };
      this.seats.push(seat);
      if (!this.hostId) this.hostId = seat.id;
      this.settings = cleanSettings(this.settings, this.seats.length);
    }
    seat.connected = true;
    conn.seatId = seat.id;
    this.broadcastRoom();
    this.runner?.poke();
    if (this.runner) this.sendState(ws, seat.id);
  }

  private start(ws: WebSocket, seat: Seat) {
    if (seat.id !== this.hostId) return this.send(ws, { t: 'error', message: 'Only the host can start the game.' });
    if (this.runner) return;
    const settings = cleanSettings(this.settings, this.seats.length);
    if (this.seats.length + settings.bots < 2) {
      return this.send(ws, { t: 'error', message: 'You need at least 2 players — invite a friend or add a computer player.' });
    }
    const taken = new Set(this.seats.map((s) => s.name));
    const names = BOT_NAMES.filter((n) => !taken.has(n)).sort(() => Math.random() - 0.5);
    this.botSeats = Array.from({ length: settings.bots }, (_, i) => ({ id: `bot${i + 1}`, name: names[i] ?? `Bot ${i + 1}` }));
    this.runner = new GameRunner(
      [
        ...this.seats.map((s) => ({ id: s.id, name: s.name, isBot: false })),
        ...this.botSeats.map((b) => ({ ...b, isBot: true })),
      ],
      { limit: settings.limit },
      {
        difficulty: settings.difficulty,
        turnSeconds: settings.turnSeconds,
        peekSeconds: settings.turnSeconds ? 60 : null,
        isAway: (id) => !this.seats.find((s) => s.id === id)?.connected,
      },
    );
    this.runner.subscribe(() => this.broadcastState());
    this.broadcastRoom();
    this.broadcastState();
  }

  private act(ws: WebSocket, seat: Seat, action: Action) {
    if (!this.runner || !action || typeof action !== 'object') return;
    // You can only ever act as yourself.
    const mine = action.type === 'NEXT_ROUND' ? action : ({ ...action, playerId: seat.id } as Action);
    const err = this.runner.dispatch(mine);
    if (err) this.send(ws, { t: 'error', message: err });
  }

  private backToLobby() {
    this.runner?.destroy();
    this.runner = null;
    this.botSeats = [];
    this.seats = this.seats.filter((s) => s.connected);
    if (!this.seats.some((s) => s.id === this.hostId)) this.hostId = this.seats[0]?.id ?? '';
    this.broadcastRoom();
  }

  private leave(seat: Seat) {
    if (this.runner) {
      seat.connected = false;
      this.runner.poke();
    } else {
      this.seats = this.seats.filter((s) => s !== seat);
      if (this.hostId === seat.id) this.hostId = this.seats[0]?.id ?? '';
    }
    for (const [ws, c] of this.conns) if (c.seatId === seat.id) c.seatId = null;
    this.broadcastRoom();
  }

  private onClose(ws: WebSocket) {
    const conn = this.conns.get(ws);
    this.conns.delete(ws);
    const seat = this.seats.find((s) => s.id === conn?.seatId);
    if (!seat) return;
    const stillHere = [...this.conns.values()].some((c) => c.seatId === seat.id);
    if (stillHere) return;
    seat.connected = false;
    this.runner?.poke();
    this.broadcastRoom();
    if (!this.runner) {
      setTimeout(() => {
        if (!seat.connected && !this.runner && this.seats.includes(seat)) this.leave(seat);
      }, LOBBY_GRACE_MS);
    }
    if (this.conns.size === 0 && this.idleTimer) {
      // Nobody left: the room will be closed by the idle check (or evicted by Cloudflare).
    }
  }

  /* ───────────── sending ───────────── */

  private roomInfo(): RoomInfo {
    return {
      code: this.code,
      hostId: this.hostId,
      seats: [
        ...this.seats.map((s) => ({ id: s.id, name: s.name, isBot: false, connected: s.connected })),
        ...this.botSeats.map((b) => ({ id: b.id, name: b.name, isBot: true, connected: true })),
      ],
      settings: this.settings,
      started: !!this.runner,
    };
  }

  private broadcastRoom() {
    const room = this.roomInfo();
    for (const [ws, c] of this.conns) if (c.seatId) this.send(ws, { t: 'room', room, you: c.seatId });
  }

  private broadcastState() {
    for (const [ws, c] of this.conns) if (c.seatId) this.sendState(ws, c.seatId);
  }

  private sendState(ws: WebSocket, seatId: string) {
    if (!this.runner) return;
    const deadline = this.runner.turnDeadline;
    this.send(ws, {
      t: 'state',
      state: viewFor(this.runner.getState(), seatId),
      deadlineIn: deadline ? Math.max(0, deadline - Date.now()) : null,
    });
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket already closed */
    }
  }

  private kick(ws: WebSocket, message: string) {
    this.send(ws, { t: 'error', message, fatal: true });
    try {
      ws.close(1008, message.slice(0, 120));
    } catch {
      /* ignore */
    }
    this.onClose(ws);
  }

  /* ───────────── housekeeping ───────────── */

  private touch() {
    this.lastActivity = Date.now();
  }

  private checkIdle() {
    if (Date.now() - this.lastActivity < IDLE_MS) return;
    for (const ws of [...this.conns.keys()]) this.kick(ws, 'This room was closed after 30 minutes without activity.');
    this.runner?.destroy();
    this.runner = null;
    this.seats = [];
    this.botSeats = [];
    this.hostId = '';
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
  }

  private uniqueName(name: string) {
    const taken = new Set(this.seats.map((s) => s.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
  }
}

function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) : '';
  return name || 'Player';
}

function cleanSettings(raw: Partial<RoomSettings> | undefined, humans: number): RoomSettings {
  const r = raw ?? {};
  const limit = r.limit === null ? null : [30, 50, 80].includes(r.limit as number) ? (r.limit as number) : 30;
  const bots = Math.max(0, Math.min(MAX_SEATS - humans, Math.floor(Number(r.bots) || 0)));
  const difficulty = r.difficulty === 'easy' || r.difficulty === 'hard' ? r.difficulty : 'normal';
  const turnSeconds = r.turnSeconds === null ? null : [30, 60, 90].includes(r.turnSeconds as number) ? (r.turnSeconds as number) : 60;
  return { limit, bots, difficulty, showLog: r.showLog !== false, turnSeconds };
}
