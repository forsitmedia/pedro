import { DurableObject } from 'cloudflare:workers';
import {
  newRoomCode,
  PLAYER_ID_RE,
  POINTS,
  QUICK_SEATS,
  gamePoints,
  type Board,
  type BoardRow,
  type FriendInfo,
  type GameReport,
  type LobbyClientMsg,
  type LobbyMsg,
  type LobbySnapshot,
  type MeInfo,
  type PlayerCard,
  type TableListing,
} from '../src/online/protocol';
import { cleanName } from '../src/online/names';
import type { Env } from './room';

/** A table that stopped reporting for this long is gone (rooms report at least once a minute). */
const STALE_MS = 150 * 1000;
/** A quick-match table handed out but nobody arrived yet. */
const QUICK_CLAIM_MS = 30_000;
const MAX_LISTED = 40;
const MAX_FRIENDS = 100;
const BOARD_SIZE = 20;
const DAY = 86_400_000;

interface Attachment {
  /** Player id once the visitor said who they are. */
  id?: string;
}

/** ISO week ("2026-W47") and when it ends. */
function weekOf(ms: number): { week: string; ends: number } {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  const thursday = new Date(monday + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const n = 1 + Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY / 7);
  return { week: `${year}-W${String(n).padStart(2, '0')}`, ends: monday + 7 * DAY };
}

async function hash(secret: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pedro:${secret}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The one lobby for the whole site: who's online, the tables, players, friends and the weekly ranking.
 * Home-page visitors keep a hibernating WebSocket open (cheap: the object sleeps between updates);
 * rooms report their state and game results here.
 */
export class PedroLobby extends DurableObject<Env> {
  private tables: Map<string, TableListing> | null = null;
  /** Private tables' invite keys (only ever given to friends of someone sitting there). */
  private keys: Map<string, string> | null = null;
  /** Quick-match codes just handed out, so two people pressing at once land together. */
  private quickClaims = new Map<string, { at: number; count: number }>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, secret TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT, created INTEGER, seen INTEGER);
      CREATE TABLE IF NOT EXISTS weekly (week TEXT, id TEXT, points INTEGER, wins INTEGER, games INTEGER, PRIMARY KEY (week, id));
      CREATE TABLE IF NOT EXISTS friends (a TEXT, b TEXT, status TEXT, at INTEGER, PRIMARY KEY (a, b));
      CREATE TABLE IF NOT EXISTS recent (a TEXT, b TEXT, at INTEGER, PRIMARY KEY (a, b));
      CREATE TABLE IF NOT EXISTS games (key TEXT PRIMARY KEY, at INTEGER);
      CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, token TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS players_name ON players (name COLLATE NOCASE);
    `);
  }

  private async load() {
    if (!this.tables) {
      const saved = (await this.ctx.storage.get<TableListing[]>('tables')) ?? [];
      this.tables = new Map(saved.map((t) => [t.code, t]));
      this.keys = new Map(Object.entries((await this.ctx.storage.get<Record<string, string>>('keys')) ?? {}));
    }
    return this.tables;
  }

  private async save() {
    await this.ctx.storage.put('tables', [...(await this.load()).values()]);
    await this.ctx.storage.put('keys', Object.fromEntries(this.keys ?? []));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/lobby/quick') {
      return Response.json({ code: await this.quickMatch() });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return Response.json(await this.snapshot());
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({} satisfies Attachment);
    this.send(server, { t: 'lobby', lobby: await this.snapshot() });
    this.send(server, { t: 'board', board: this.board() });
    this.schedulePush(); // everyone sees the online count go up
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ───────────── messages from visitors ───────────── */

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (typeof data !== 'string' || data.length > 1024) return;
    let msg: LobbyClientMsg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.t === 'auth') return this.auth(ws, msg);
    const me = (ws.deserializeAttachment() as Attachment | null)?.id;
    if (!me) return;
    switch (msg.t) {
      case 'search':
        return this.search(ws, me, String(msg.q ?? '').slice(0, 16));
      case 'friend-add': {
        const text = await this.friendRequest(me, String(msg.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
        if (text) this.send(ws, { t: 'notice', message: text });
        return;
      }
      case 'invite-check':
        return this.send(ws, { t: 'invite', id: String(msg.id), from: this.checkInvite(String(msg.id), String(msg.token)) });
      case 'invite-accept': {
        const from = this.checkInvite(String(msg.id), String(msg.token));
        if (!from || from.id === me) return this.send(ws, { t: 'notice', message: from ? "That's your own link 🙂" : "This friend link doesn't work anymore." });
        this.befriend(me, from.id);
        this.send(ws, { t: 'notice', message: `You and ${from.name} are now friends!` });
        return this.pushTo([me, from.id]);
      }
      case 'friend-answer':
        return this.answerFriend(me, String(msg.id), !!msg.ok);
      case 'friend-remove':
        this.sql.exec('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', me, msg.id, msg.id, me);
        return this.pushTo([me, String(msg.id)]);
    }
  }

  webSocketClose(ws: WebSocket) {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    this.schedulePush();
  }
  webSocketError() {
    this.schedulePush();
  }

  private async auth(ws: WebSocket, msg: Extract<LobbyClientMsg, { t: 'auth' }>) {
    if (!PLAYER_ID_RE.test(msg.id) || typeof msg.secret !== 'string' || msg.secret.length < 16) return;
    const h = await hash(msg.secret.slice(0, 64));
    const name = cleanName(msg.name);
    const avatar = typeof msg.avatar === 'string' && /^[a-z]{2,10}\.\d\.[a-z]{2,12}$/.test(msg.avatar) ? msg.avatar : null;
    const row = this.sql.exec<{ secret: string }>('SELECT secret FROM players WHERE id = ?', msg.id).toArray()[0];
    const now = Date.now();
    if (!row) {
      this.sql.exec('INSERT INTO players (id, secret, name, avatar, created, seen) VALUES (?, ?, ?, ?, ?, ?)', msg.id, h, name, avatar, now, now);
    } else if (row.secret !== h) {
      return this.send(ws, { t: 'auth-fail' });
    } else {
      this.sql.exec('UPDATE players SET name = ?, avatar = ?, seen = ? WHERE id = ?', name, avatar, now, msg.id);
    }
    ws.serializeAttachment({ id: msg.id } satisfies Attachment);
    // You, and your friends (who now see you online).
    await this.pushTo([msg.id, ...this.friendIds(msg.id)]);
  }

  /* ───────────── friends ───────────── */

  private friendIds(id: string): string[] {
    return this.sql.exec<{ b: string }>("SELECT b FROM friends WHERE a = ? AND status = 'ok'", id).toArray().map((r) => r.b);
  }

  /** Find players by name (names aren't unique, so the avatar helps to pick the right one). */
  private search(ws: WebSocket, me: string, q: string) {
    const clean = q.trim();
    if (clean.length < 2) return this.send(ws, { t: 'search', q, results: [] });
    const esc = clean.replace(/[\\%_]/g, (c) => `\\${c}`);
    const results = this.sql
      .exec<{ id: string; name: string; avatar: string | null }>(
        `SELECT id, name, avatar FROM players WHERE name LIKE ? ESCAPE '\\' AND id != ? AND name != 'Player'
         ORDER BY (lower(name) = lower(?)) DESC, (name LIKE ? ESCAPE '\\') DESC, seen DESC LIMIT 8`,
        `%${esc}%`,
        me,
        clean,
        `${esc}%`,
      )
      .toArray()
      .map((r) => ({ id: r.id, name: r.name, avatar: r.avatar ?? undefined }));
    this.send(ws, { t: 'search', q, results });
  }

  /** Ask `code` to be friends with `me`. Returns what to tell `me`. */
  private async friendRequest(me: string, code: string): Promise<string | null> {
    if (!PLAYER_ID_RE.test(code) || code === me) return null;
    const them = this.sql.exec<{ name: string }>('SELECT name FROM players WHERE id = ?', code).toArray()[0];
    if (!them) return "That player doesn't exist anymore.";
    const link = (a: string, b: string) => this.sql.exec<{ status: string }>('SELECT status FROM friends WHERE a = ? AND b = ?', a, b).toArray()[0]?.status;
    if (link(me, code) === 'ok') return `You're already friends with ${them.name}.`;
    if (link(me, code) === 'pending') return `You already asked ${them.name} — waiting for an answer.`;
    const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM friends WHERE a = ? AND status = 'ok'", me).one().n;
    if (count >= MAX_FRIENDS) return `You can have up to ${MAX_FRIENDS} friends.`;
    let text: string;
    if (link(code, me) === 'pending') {
      // They already asked you: that's a yes.
      this.befriend(me, code);
      text = `You and ${them.name} are now friends!`;
    } else {
      this.sql.exec("INSERT OR REPLACE INTO friends (a, b, status, at) VALUES (?, ?, 'pending', ?)", me, code, Date.now());
      text = `Friend request sent to ${them.name}.`;
    }
    await this.pushTo([me, code]);
    return text;
  }

  /**
   * Someone sat down at a table: make sure they have a profile, even if they never opened the home page
   * (a friend who came straight from a WhatsApp link). Returns false if the id belongs to someone else.
   */
  async register(id: string, secret: string, name: string, avatar?: string): Promise<boolean> {
    if (!PLAYER_ID_RE.test(id) || typeof secret !== 'string' || secret.length < 16) return false;
    const h = await hash(secret.slice(0, 64));
    const row = this.sql.exec<{ secret: string }>('SELECT secret FROM players WHERE id = ?', id).toArray()[0];
    const now = Date.now();
    const av = typeof avatar === 'string' && /^[a-z]{2,10}\.\d\.[a-z]{2,12}$/.test(avatar) ? avatar : null;
    if (!row) {
      this.sql.exec('INSERT INTO players (id, secret, name, avatar, created, seen) VALUES (?, ?, ?, ?, ?, ?)', id, h, cleanName(name), av, now, now);
      return true;
    }
    if (row.secret !== h) return false;
    this.sql.exec('UPDATE players SET seen = ? WHERE id = ?', now, id);
    return true;
  }

  /** Friend request from inside a game (the room vouches for the table, we check the secret). */
  async requestFriend(from: string, secret: string, to: string): Promise<string> {
    const row = this.sql.exec<{ secret: string }>('SELECT secret FROM players WHERE id = ?', from).toArray()[0];
    if (!row || row.secret !== (await hash(String(secret).slice(0, 64)))) return 'Open the Pedro home page once to set up your profile.';
    return (await this.friendRequest(from, to)) ?? 'Nothing to do.';
  }

  /* ───────────── friend links (/f/<id>-<token>) ───────────── */

  private inviteToken(id: string): string {
    const row = this.sql.exec<{ token: string }>('SELECT token FROM invites WHERE id = ?', id).toArray()[0];
    if (row) return row.token;
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    this.sql.exec('INSERT INTO invites (id, token) VALUES (?, ?)', id, token);
    return token;
  }

  private checkInvite(id: string, token: string): PlayerCard | null {
    if (!PLAYER_ID_RE.test(id)) return null;
    const row = this.sql.exec<{ token: string }>('SELECT token FROM invites WHERE id = ?', id).toArray()[0];
    if (!row || row.token !== token) return null;
    return this.card(id);
  }

  private async answerFriend(me: string, from: string, ok: boolean) {
    const pending = this.sql.exec("SELECT 1 FROM friends WHERE a = ? AND b = ? AND status = 'pending'", from, me).toArray().length > 0;
    if (!pending) return;
    if (ok) this.befriend(me, from);
    else this.sql.exec('DELETE FROM friends WHERE a = ? AND b = ?', from, me);
    await this.pushTo([me, from]);
  }

  private befriend(a: string, b: string) {
    const now = Date.now();
    this.sql.exec("INSERT OR REPLACE INTO friends (a, b, status, at) VALUES (?, ?, 'ok', ?)", a, b, now);
    this.sql.exec("INSERT OR REPLACE INTO friends (a, b, status, at) VALUES (?, ?, 'ok', ?)", b, a, now);
  }

  /* ───────────── called by the rooms ───────────── */

  async report(listing: TableListing, key?: string) {
    const tables = await this.load();
    tables.set(listing.code, { ...listing, updatedAt: Date.now() });
    if (key) this.keys!.set(listing.code, key);
    else this.keys!.delete(listing.code);
    if (listing.players.length) this.quickClaims.delete(listing.code);
    await this.save();
    this.schedulePush();
  }

  async remove(code: string) {
    const tables = await this.load();
    this.keys!.delete(code);
    if (!tables.delete(code)) return;
    await this.save();
    this.schedulePush();
  }

  /** These players just sat down together (for "played with recently"). */
  async playedTogether(pids: string[]) {
    const ids = [...new Set(pids)].filter((p) => PLAYER_ID_RE.test(p)).slice(0, 6);
    const now = Date.now();
    for (const a of ids) for (const b of ids) if (a !== b) this.sql.exec('INSERT OR REPLACE INTO recent (a, b, at) VALUES (?, ?, ?)', a, b, now);
    // Keep the list short.
    this.sql.exec('DELETE FROM recent WHERE at < ?', now - 30 * DAY);
  }

  /** A game between people finished: points for this week's ranking. */
  async gameOver(report: GameReport) {
    if (!report?.key || this.sql.exec('SELECT 1 FROM games WHERE key = ?', report.key).toArray().length) return;
    this.sql.exec('INSERT INTO games (key, at) VALUES (?, ?)', report.key, Date.now());
    // Only players who really are who they say.
    const valid: { pid: string; total: number }[] = [];
    for (const p of report.players ?? []) {
      if (!PLAYER_ID_RE.test(p.pid) || valid.some((v) => v.pid === p.pid)) continue;
      const row = this.sql.exec<{ secret: string }>('SELECT secret FROM players WHERE id = ?', p.pid).toArray()[0];
      if (row && row.secret === (await hash(String(p.secret).slice(0, 64)))) valid.push({ pid: p.pid, total: Number(p.total) || 0 });
    }
    if (valid.length < 2) return;
    const totals = valid.map((v) => v.total);
    const { week } = weekOf(Date.now());
    for (const v of valid) {
      const { points, won } = gamePoints(v.total, totals);
      this.sql.exec(
        `INSERT INTO weekly (week, id, points, wins, games) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT (week, id) DO UPDATE SET points = points + excluded.points, wins = wins + excluded.wins, games = games + 1`,
        week,
        v.pid,
        points,
        won ? 1 : 0,
      );
    }
    this.sql.exec('DELETE FROM games WHERE at < ?', Date.now() - 7 * DAY);
    const msg = JSON.stringify({ t: 'board', board: this.board() } satisfies LobbyMsg);
    for (const ws of this.ctx.getWebSockets()) this.raw(ws, msg);
    await this.pushTo(valid.map((v) => v.pid));
  }

  /* ───────────── quick match ───────────── */

  /** A quick table that's still waiting for players, or a fresh one. */
  private async quickMatch(): Promise<string> {
    const tables = await this.load();
    const now = Date.now();
    for (const [code, c] of this.quickClaims) if (now - c.at > QUICK_CLAIM_MS) this.quickClaims.delete(code);

    const waiting = [...tables.values()]
      .filter((t) => t.visibility === 'quick' && !t.started && now - t.updatedAt < STALE_MS)
      .filter((t) => t.players.length + (this.quickClaims.get(t.code)?.count ?? 0) < QUICK_SEATS)
      .sort((a, b) => b.players.length - a.players.length);
    if (waiting[0]) {
      const claim = this.quickClaims.get(waiting[0].code);
      this.quickClaims.set(waiting[0].code, { at: now, count: (claim?.count ?? 0) + 1 });
      return waiting[0].code;
    }
    // A table someone was just sent to but hasn't reached yet.
    for (const [code, c] of this.quickClaims) {
      if (!tables.has(code) && c.count < QUICK_SEATS) {
        c.count++;
        return code;
      }
    }
    let code = newRoomCode();
    while (tables.has(code)) code = newRoomCode();
    this.quickClaims.set(code, { at: now, count: 1 });
    return code;
  }

  /* ───────────── what visitors see ───────────── */

  private async snapshot(): Promise<LobbySnapshot> {
    const tables = await this.load();
    const now = Date.now();
    let pruned = false;
    for (const [code, t] of tables) {
      if (now - t.updatedAt > STALE_MS || t.players.length === 0) {
        tables.delete(code);
        this.keys!.delete(code);
        pruned = true;
      }
    }
    if (pruned) await this.save();
    const list = [...tables.values()];
    const playing = list.reduce((n, t) => n + t.players.length, 0);
    const visitors = this.ctx.getWebSockets().length;
    // Waiting tables first (you can still sit down), then the busiest.
    list.sort((a, b) => Number(a.started) - Number(b.started) || b.players.length - a.players.length);
    return { online: visitors + playing, playing, tables: list.slice(0, MAX_LISTED) };
  }

  private board(): Board {
    const now = Date.now();
    const { week, ends } = weekOf(now);
    const rows = (w: string, limit: number) =>
      this.sql
        .exec<{ id: string; name: string; avatar: string | null; points: number; wins: number; games: number }>(
          `SELECT p.id, p.name, p.avatar, w.points, w.wins, w.games FROM weekly w JOIN players p ON p.id = w.id
           WHERE w.week = ? AND w.games >= ? ORDER BY w.points DESC, w.wins DESC, w.games ASC LIMIT ?`,
          w,
          POINTS.minGames,
          limit,
        )
        .toArray()
        .map((r): BoardRow => ({ ...r, avatar: r.avatar ?? undefined }));
    return { week, ends, top: rows(week, BOARD_SIZE), lastChampion: rows(weekOf(now - 7 * DAY).week, 1)[0] };
  }

  private card(id: string): PlayerCard | null {
    const r = this.sql.exec<{ id: string; name: string; avatar: string | null }>('SELECT id, name, avatar FROM players WHERE id = ?', id).toArray()[0];
    return r ? { id: r.id, name: r.name, avatar: r.avatar ?? undefined } : null;
  }

  private me(id: string, online: Set<string>, tableOf: Map<string, TableListing>): MeInfo {
    const cards = (sql: string) =>
      this.sql
        .exec<{ id: string; name: string; avatar: string | null }>(sql, id)
        .toArray()
        .map((r) => ({ id: r.id, name: r.name, avatar: r.avatar ?? undefined }));
    const friends: FriendInfo[] = cards(
      "SELECT p.id, p.name, p.avatar FROM friends f JOIN players p ON p.id = f.b WHERE f.a = ? AND f.status = 'ok' ORDER BY p.seen DESC",
    ).map((f) => {
      const t = tableOf.get(f.id);
      if (t) {
        return {
          ...f,
          status: t.started ? 'playing' : 'waiting',
          table: { code: t.code, visibility: t.visibility, started: t.started, round: t.round, key: this.keys?.get(t.code) },
        };
      }
      return { ...f, status: online.has(f.id) ? 'online' : 'offline' };
    });
    const order = { waiting: 0, playing: 1, online: 2, offline: 3 };
    friends.sort((a, b) => order[a.status] - order[b.status]);
    const requests = cards("SELECT p.id, p.name, p.avatar FROM friends f JOIN players p ON p.id = f.a WHERE f.b = ? AND f.status = 'pending'");
    const sent = cards("SELECT p.id, p.name, p.avatar FROM friends f JOIN players p ON p.id = f.b WHERE f.a = ? AND f.status = 'pending'");
    const known = new Set([...friends, ...requests, ...sent].map((c) => c.id));
    const recent = cards('SELECT p.id, p.name, p.avatar FROM recent r JOIN players p ON p.id = r.b WHERE r.a = ? ORDER BY r.at DESC LIMIT 12')
      .filter((c) => !known.has(c.id))
      .slice(0, 6);

    // Real people around right now (people at tables first), to make friends with.
    const others = [...new Set([...tableOf.keys(), ...online])].filter((p) => p !== id && !known.has(p) && !recent.some((r) => r.id === p));
    const onlineCards = others
      .slice(0, 30)
      .map((p) => this.card(p))
      .filter((c): c is PlayerCard => !!c && c.name !== 'Player')
      .slice(0, 10);

    const { week } = weekOf(Date.now());
    const mine = this.sql.exec<{ points: number; wins: number; games: number }>('SELECT points, wins, games FROM weekly WHERE week = ? AND id = ?', week, id).toArray()[0];
    // Ranked once you've played enough games this week.
    const rank =
      mine && mine.games >= POINTS.minGames
        ? this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM weekly WHERE week = ? AND games >= ? AND points > ?', week, POINTS.minGames, mine.points).one().n + 1
        : null;
    return { id, friends, requests, sent, recent, online: onlineCards, invite: this.inviteToken(id), week: { rank, points: mine?.points ?? 0, wins: mine?.wins ?? 0, games: mine?.games ?? 0 } };
  }

  /** Who's online and at which table, for the friends lists. */
  private presence(): { online: Set<string>; tableOf: Map<string, TableListing> } {
    const online = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const id = (ws.deserializeAttachment() as Attachment | null)?.id;
      if (id) online.add(id);
    }
    const tableOf = new Map<string, TableListing>();
    for (const t of this.tables?.values() ?? []) for (const p of t.players) if (p.pid) tableOf.set(p.pid, t);
    return { online, tableOf };
  }

  /** Send fresh friend lists to these players (on every device they have open). */
  private async pushTo(ids: string[]) {
    await this.load();
    const want = new Set(ids);
    const { online, tableOf } = this.presence();
    const cache = new Map<string, string>();
    for (const ws of this.ctx.getWebSockets()) {
      const id = (ws.deserializeAttachment() as Attachment | null)?.id;
      if (!id || !want.has(id)) continue;
      if (!cache.has(id)) cache.set(id, JSON.stringify({ t: 'me', me: this.me(id, online, tableOf) } satisfies LobbyMsg));
      this.raw(ws, cache.get(id)!);
    }
  }

  /** Several changes in a row become one update: tables + everyone's friends (who's online changed). */
  private schedulePush() {
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(async () => {
      this.pushTimer = null;
      const msg = JSON.stringify({ t: 'lobby', lobby: await this.snapshot() } satisfies LobbyMsg);
      const ids: string[] = [];
      for (const ws of this.ctx.getWebSockets()) {
        this.raw(ws, msg);
        const id = (ws.deserializeAttachment() as Attachment | null)?.id;
        if (id) ids.push(id);
      }
      await this.pushTo(ids);
    }, 400);
  }

  private send(ws: WebSocket, msg: LobbyMsg) {
    this.raw(ws, JSON.stringify(msg));
  }

  private raw(ws: WebSocket, data: string) {
    try {
      ws.send(data);
    } catch {
      /* closing */
    }
  }
}
