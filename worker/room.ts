import { DurableObject } from 'cloudflare:workers';
import { viewFor } from '../src/engine/view';
import type { Action } from '../src/engine/types';
import { BOT_NAMES, GameRunner } from '../src/game/runner';
import type { PedroLobby } from './lobby';
import { cleanName } from '../src/online/names';
import {
  DEFAULT_SETTINGS,
  MAX_SEATS,
  QUICK_SEATS,
  QUICK_WAIT_MS,
  PLAYER_ID_RE,
  type ClientMsg,
  type GameReport,
  type JoinRequest,
  type TableListing,
  type Visibility,
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
/** Most people waiting at a private table's door at once. */
const MAX_KNOCKS = 6;

interface Seat {
  id: string;
  name: string;
  avatar?: string;
  token: string;
  connected: boolean;
  /** Player id + secret, for friends and the ranking (never sent to other players). */
  pid?: string;
  psecret?: string;
}

interface Conn {
  seatId: string | null;
  times: number[];
}

export interface Env {
  ROOMS: DurableObjectNamespace<PedroRoom>;
  LOBBY: DurableObjectNamespace<PedroLobby>;
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
  /** Set by whoever opens the table. */
  private visibility: Visibility = 'private';
  private opened = false;
  /** Private tables: the secret in the invite link. */
  private key = '';
  /** People from the lobby asking to sit at a private table. */
  private knocks = new Map<string, { req: JoinRequest; token: string; ws: WebSocket; pid?: string; psecret?: string }>();
  /** This game's results were already sent to the ranking. */
  private reported = false;
  private gameKey = '';
  private lastRound = 0;
  private knockSeq = 0;
  /** Quick match: when the game starts by itself. */
  private quickAt: number | null = null;
  private quickTimer: ReturnType<typeof setTimeout> | null = null;
  private reportTimer: ReturnType<typeof setTimeout> | null = null;
  private listed = false;

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

    if (msg.t === 'hello') return this.hello(ws, conn, msg);
    const seat = this.seats.find((s) => s.id === conn.seatId);
    if (!seat) return this.send(ws, { t: 'error', message: 'Join the room first.' });

    switch (msg.t) {
      case 'settings':
        if (seat.id !== this.hostId || this.runner || this.visibility === 'quick') return;
        this.settings = cleanSettings(msg.settings, this.seats.length);
        if (msg.visibility === 'open' || msg.visibility === 'private') this.visibility = msg.visibility;
        return this.broadcastRoom();
      case 'friend': {
        const target = this.seats.find((s) => s.id === String(msg.seatId));
        if (!target?.pid || !seat.pid || !seat.psecret || target.pid === seat.pid) return;
        void this.lobby()
          .requestFriend(seat.pid, seat.psecret, target.pid)
          .then((message) => this.send(ws, { t: 'info', message }))
          .catch(() => this.send(ws, { t: 'error', message: "Couldn't send the friend request — try again." }));
        return;
      }
      case 'admit':
        if (seat.id !== this.hostId) return;
        return this.admit(String(msg.id), !!msg.ok);
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

  private hello(ws: WebSocket, conn: Conn, msg: Extract<ClientMsg, { t: 'hello' }>) {
    const token = typeof msg.token === 'string' ? msg.token.slice(0, 64) : '';
    if (!token) return this.kick(ws, 'Missing player token.');
    const avatar = cleanAvatar(msg.avatar);
    const pid = typeof msg.pid === 'string' && PLAYER_ID_RE.test(msg.pid) ? msg.pid : undefined;
    const psecret = pid && typeof msg.psecret === 'string' ? msg.psecret.slice(0, 64) : undefined;
    let seat = this.seats.find((s) => s.token === token);
    if (!seat) {
      if (this.runner) return this.kick(ws, 'This game has already started. Ask the host to start a new one.');
      const key = typeof msg.key === 'string' ? msg.key.slice(0, 32) : '';
      if (!this.opened || this.seats.length === 0) {
        // First one in: they open the table and decide who can join.
        this.opened = true;
        this.visibility = msg.mode === 'open' || msg.mode === 'quick' ? msg.mode : 'private';
        this.key = key || crypto.randomUUID().slice(0, 8);
        if (this.visibility === 'quick') this.settings = { ...DEFAULT_SETTINGS };
      } else if (this.visibility === 'private' && key !== this.key) {
        return this.knock(ws, token, cleanName(msg.name), avatar, pid, psecret);
      }
      if (this.seats.length >= (this.visibility === 'quick' ? QUICK_SEATS : MAX_SEATS)) {
        return this.kick(ws, `This table is full. Try another one!`);
      }
      seat = this.addSeat(token, msg.name, avatar);
    }
    if (avatar) seat.avatar = avatar;
    if (pid) {
      seat.pid = pid;
      seat.psecret = psecret;
    }
    seat.connected = true;
    conn.seatId = seat.id;
    this.broadcastRoom();
    this.runner?.poke();
    if (this.runner) this.sendState(ws, seat.id);
    this.maybeQuickStart();
  }

  private addSeat(token: string, name: unknown, avatar?: string): Seat {
    const seat: Seat = { id: `p${++this.seq}`, name: this.uniqueName(cleanName(name)), avatar, token, connected: true };
    this.seats.push(seat);
    if (!this.hostId) this.hostId = seat.id;
    this.settings = cleanSettings(this.settings, this.seats.length);
    return seat;
  }

  /* ───────────── private tables: knocking at the door ───────────── */

  private knock(ws: WebSocket, token: string, name: string, avatar?: string, pid?: string, psecret?: string) {
    for (const [id, k] of this.knocks) if (k.token === token) this.knocks.delete(id); // asking again
    if (this.knocks.size >= MAX_KNOCKS) return this.kick(ws, 'Too many people are asking to join this table right now.');
    const id = `k${++this.knockSeq}`;
    this.knocks.set(id, { req: { id, name, avatar }, token, ws, pid, psecret });
    this.send(ws, { t: 'knocking' });
    this.broadcastRoom();
  }

  private admit(id: string, ok: boolean) {
    const k = this.knocks.get(id);
    if (!k) return;
    this.knocks.delete(id);
    const conn = this.conns.get(k.ws);
    if (!conn) return this.broadcastRoom();
    if (!ok) {
      this.kick(k.ws, 'The host said no this time. Try another table!');
      return this.broadcastRoom();
    }
    if (this.runner) {
      this.kick(k.ws, 'The game started before you got in. Try another table!');
      return this.broadcastRoom();
    }
    if (this.seats.length >= MAX_SEATS) {
      this.kick(k.ws, 'This table is full now. Try another one!');
      return this.broadcastRoom();
    }
    const seat = this.addSeat(k.token, k.req.name, k.req.avatar);
    seat.pid = k.pid;
    seat.psecret = k.psecret;
    conn.seatId = seat.id;
    this.broadcastRoom();
  }

  /* ───────────── quick match: starts by itself ───────────── */

  private maybeQuickStart() {
    if (this.visibility !== 'quick' || this.runner) return;
    const here = this.seats.filter((s) => s.connected).length;
    if (here === 0) {
      this.quickAt = null;
      if (this.quickTimer) clearTimeout(this.quickTimer);
      this.quickTimer = null;
      return;
    }
    if (here >= QUICK_SEATS) return this.startGame();
    if (this.quickAt) return;
    this.quickAt = Date.now() + QUICK_WAIT_MS;
    this.quickTimer = setTimeout(() => {
      this.quickTimer = null;
      this.quickAt = null;
      if (!this.runner && this.seats.some((s) => s.connected)) this.startGame();
    }, QUICK_WAIT_MS);
    this.broadcastRoom();
  }

  private start(ws: WebSocket, seat: Seat) {
    if (seat.id !== this.hostId) return this.send(ws, { t: 'error', message: 'Only the host can start the game.' });
    if (this.runner) return;
    const settings = cleanSettings(this.settings, this.seats.length);
    if (this.visibility !== 'quick' && this.seats.length + settings.bots < 2) {
      return this.send(ws, { t: 'error', message: 'You need at least 2 players — invite a friend or add a computer player.' });
    }
    this.startGame();
  }

  private startGame() {
    if (this.runner) return;
    if (this.quickTimer) clearTimeout(this.quickTimer);
    this.quickTimer = null;
    this.quickAt = null;
    // Quick match: people play people. Computer players only when nobody else showed up.
    if (this.visibility === 'quick') {
      this.seats = this.seats.filter((s) => s.connected);
      this.settings = { ...this.settings, bots: this.seats.length >= 2 ? 0 : QUICK_SEATS - 1 };
    }
    const settings = cleanSettings(this.settings, this.seats.length);
    // People still waiting at the door won't get in now.
    for (const k of this.knocks.values()) this.kick(k.ws, 'The game started before you got in. Try another table!');
    this.knocks.clear();
    const taken = new Set(this.seats.map((s) => s.name));
    const names = BOT_NAMES.filter((n) => !taken.has(n)).sort(() => Math.random() - 0.5);
    this.botSeats = Array.from({ length: settings.bots }, (_, i) => ({ id: `bot${i + 1}`, name: names[i] ?? `Bot ${i + 1}` }));
    this.runner = new GameRunner(
      [
        ...this.seats.map((s) => ({ id: s.id, name: s.name, isBot: false, avatar: s.avatar })),
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
    this.reported = false;
    this.gameKey = `${this.code}:${Date.now()}`;
    this.lastRound = 0;
    this.runner.subscribe(() => {
      this.broadcastState();
      this.afterGameChange();
    });
    // Remember who sat together ("played with recently", to add them as friends).
    const pids = this.seats.map((s) => s.pid).filter((p): p is string => !!p);
    if (pids.length >= 2) void this.lobby().playedTogether(pids).catch(() => {});
    this.broadcastRoom();
    this.broadcastState();
  }

  private act(ws: WebSocket, seat: Seat, action: Action) {
    if (!this.runner || !action || typeof action !== 'object') return;
    // You can only ever act as yourself.
    // Only the game itself ends a round or starts the next one (when everyone is ready, or on a timer).
    if (action.type === 'END_ROUND' || action.type === 'NEXT_ROUND') return;
    const mine = { ...action, playerId: seat.id } as Action;
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
    this.maybeQuickStart();
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
    this.maybeQuickStart();
  }

  private onClose(ws: WebSocket) {
    const conn = this.conns.get(ws);
    this.conns.delete(ws);
    for (const [id, k] of this.knocks) {
      if (k.ws === ws) {
        this.knocks.delete(id);
        this.broadcastRoom();
      }
    }
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

  private roomInfo(forSeat: string): RoomInfo {
    const host = forSeat === this.hostId;
    return {
      code: this.code,
      visibility: this.visibility,
      requests: host && this.knocks.size ? [...this.knocks.values()].map((k) => k.req) : undefined,
      autoStartIn: this.quickAt ? Math.max(0, this.quickAt - Date.now()) : null,
      key: this.visibility === 'private' ? this.key : undefined,
      hostId: this.hostId,
      seats: [
        ...this.seats.map((s) => ({ id: s.id, name: s.name, avatar: s.avatar, isBot: false, connected: s.connected, social: !!s.pid })),
        ...this.botSeats.map((b) => ({ id: b.id, name: b.name, isBot: true, connected: true })),
      ],
      settings: this.settings,
      started: !!this.runner,
    };
  }

  private broadcastRoom() {
    for (const [ws, c] of this.conns) if (c.seatId) this.send(ws, { t: 'room', room: this.roomInfo(c.seatId), you: c.seatId });
    this.scheduleReport();
  }

  /** New round → update the lobby. Game over → send the results to the weekly ranking. */
  private afterGameChange() {
    const st = this.runner?.getState();
    if (!st) return;
    if (st.round !== this.lastRound) {
      this.lastRound = st.round;
      this.scheduleReport();
    }
    if (st.phase !== 'gameOver' || this.reported) return;
    this.reported = true;
    const players: GameReport['players'] = [];
    for (const seat of this.seats) {
      const p = st.players.find((x) => x.id === seat.id);
      if (p && seat.pid && seat.psecret) players.push({ pid: seat.pid, secret: seat.psecret, total: p.total });
    }
    // Only games between at least two people count.
    if (players.length >= 2) void this.lobby().gameOver({ key: this.gameKey, players }).catch(() => {});
  }

  /* ───────────── telling the lobby about this table ───────────── */

  private lobby() {
    return this.env.LOBBY.get(this.env.LOBBY.idFromName('main'));
  }

  private scheduleReport() {
    if (this.reportTimer) return;
    this.reportTimer = setTimeout(() => {
      this.reportTimer = null;
      void this.report();
    }, 500);
  }

  private async report() {
    if (!this.code) return;
    const humans = this.seats.filter((s) => s.connected);
    try {
      if (humans.length === 0) {
        if (this.listed) await this.lobby().remove(this.code);
        this.listed = false;
        return;
      }
      const state = this.runner?.getState();
      const listing: TableListing = {
        code: this.code,
        visibility: this.visibility,
        players: humans.map((s) => ({ name: s.name, avatar: s.avatar, pid: s.pid })),
        bots: this.botSeats.length || (this.runner ? 0 : this.settings.bots),
        started: !!this.runner,
        round: state?.round,
        limit: this.settings.limit,
        updatedAt: Date.now(),
      };
      await this.lobby().report(listing, this.visibility === 'private' ? this.key : undefined);
      this.listed = true;
    } catch {
      /* the lobby is only a bonus: the table keeps working */
    }
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
    // Once a minute: remind the lobby this table is still here.
    if (Date.now() - this.lastActivity < IDLE_MS) return this.scheduleReport();
    for (const ws of [...this.conns.keys()]) this.kick(ws, 'This room was closed after 30 minutes without activity.');
    this.runner?.destroy();
    this.runner = null;
    this.seats = [];
    this.botSeats = [];
    this.hostId = '';
    this.opened = false;
    this.knocks.clear();
    if (this.quickTimer) clearTimeout(this.quickTimer);
    this.quickTimer = null;
    this.quickAt = null;
    void this.report();
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
  }

  private uniqueName(name: string) {
    const taken = new Set(this.seats.map((s) => s.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
  }
}


/** Avatar code like "frog.2.shades" (anything else is ignored). */
function cleanAvatar(raw: unknown): string | undefined {
  return typeof raw === 'string' && /^[a-z]{2,10}\.\d\.[a-z]{2,12}$/.test(raw) ? raw : undefined;
}

function cleanSettings(raw: Partial<RoomSettings> | undefined, humans: number): RoomSettings {
  const r = raw ?? {};
  const limit = r.limit === null ? null : [30, 50, 80].includes(r.limit as number) ? (r.limit as number) : 30;
  const bots = Math.max(0, Math.min(MAX_SEATS - humans, Math.floor(Number(r.bots) || 0)));
  const difficulty = r.difficulty === 'easy' || r.difficulty === 'hard' ? r.difficulty : 'normal';
  const turnSeconds = r.turnSeconds === null ? null : [30, 60, 90].includes(r.turnSeconds as number) ? (r.turnSeconds as number) : 60;
  return { limit, bots, difficulty, showLog: r.showLog !== false, turnSeconds };
}
