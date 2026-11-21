import { DurableObject } from 'cloudflare:workers';
import { newRoomCode, QUICK_SEATS, type LobbyMsg, type LobbySnapshot, type TableListing } from '../src/online/protocol';
import type { Env } from './room';

/** A table that stopped reporting for this long is gone (rooms report at least once a minute). */
const STALE_MS = 150 * 1000;
/** A quick-match table handed out but nobody arrived yet. */
const QUICK_CLAIM_MS = 30_000;
const MAX_LISTED = 40;

/**
 * The one lobby for the whole site: counts who's online and lists the tables.
 * Home-page visitors keep a hibernating WebSocket open (cheap: the object sleeps
 * between updates); rooms report their state here whenever something changes.
 */
export class PedroLobby extends DurableObject<Env> {
  private tables: Map<string, TableListing> | null = null;
  /** Quick-match codes just handed out, so two people pressing at once land together. */
  private quickClaims = new Map<string, { at: number; count: number }>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;

  private async load() {
    if (!this.tables) {
      const saved = (await this.ctx.storage.get<TableListing[]>('tables')) ?? [];
      this.tables = new Map(saved.map((t) => [t.code, t]));
    }
    return this.tables;
  }

  private async save() {
    await this.ctx.storage.put('tables', [...(await this.load()).values()]);
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
    server.send(JSON.stringify({ t: 'lobby', lobby: await this.snapshot() } satisfies LobbyMsg));
    this.schedulePush(); // everyone sees the online count go up
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage() {
    /* visitors only listen */
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

  /* ───────────── called by the rooms ───────────── */

  async report(listing: TableListing) {
    const tables = await this.load();
    tables.set(listing.code, { ...listing, updatedAt: Date.now() });
    if (listing.players.length) this.quickClaims.delete(listing.code);
    await this.save();
    this.schedulePush();
  }

  async remove(code: string) {
    const tables = await this.load();
    if (!tables.delete(code)) return;
    await this.save();
    this.schedulePush();
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

  /* ───────────── telling the visitors ───────────── */

  private async snapshot(): Promise<LobbySnapshot> {
    const tables = await this.load();
    const now = Date.now();
    let pruned = false;
    for (const [code, t] of tables) {
      if (now - t.updatedAt > STALE_MS || t.players.length === 0) {
        tables.delete(code);
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

  /** Several changes in a row become one message. */
  private schedulePush() {
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(async () => {
      this.pushTimer = null;
      const msg = JSON.stringify({ t: 'lobby', lobby: await this.snapshot() } satisfies LobbyMsg);
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(msg);
        } catch {
          /* closing */
        }
      }
    }, 400);
  }
}
