import type { Action, GameState } from '../engine/types';
import type { GameConnection } from '../game/connection';
import type { ClientMsg, RoomInfo, RoomSettings, ServerMsg, Visibility } from './protocol';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** Did this browser already sit at this table? (Then a refresh rejoins automatically.) */
export function hasSeatAt(code: string): boolean {
  try {
    return !!localStorage.getItem(`pedro.token.${code}`);
  } catch {
    return false;
  }
}

/** A secret per room and browser, so refreshing the page puts you back in your seat. */
function tokenFor(code: string): string {
  const key = `pedro.token.${code}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const t = crypto.randomUUID();
    localStorage.setItem(key, t);
    return t;
  } catch {
    return crypto.randomUUID();
  }
}

/** Connection to an online room. Same interface as the local game, so the table works unchanged. */
export class OnlineGame implements GameConnection {
  readonly online = true;
  meId = '';
  room: RoomInfo | null = null;
  status: ConnStatus = 'connecting';
  /** A fatal problem (room full, game already started…): don't reconnect. */
  fatal: string | null = null;
  private state: GameState | null = null;
  private deadline: number | null = null;
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private errorListeners = new Set<(m: string) => void>();
  private retry = 0;
  private closedByUs = false;
  private readonly token: string;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Waiting for the host of a private table to let us in. */
  knocking = false;
  /** Bumps on every change, for React. */
  version = 0;

  constructor(
    readonly code: string,
    private name: string,
    private avatar?: string,
    /** How a new table is opened (ignored if the table already exists). */
    private mode?: Visibility,
    /** Secret from a private invite link. */
    private key?: string,
  ) {
    this.token = tokenFor(code);
    this.connect();
    document.addEventListener('visibilitychange', this.onVisible);
  }

  /** Back from a locked phone / another app: reconnect right away instead of waiting. */
  private onVisible = () => {
    if (document.visibilityState !== 'visible' || this.closedByUs || this.fatal) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retry = 0;
    this.connect();
  };

  /** The link to send to friends (private tables carry their key). */
  get inviteLink() {
    const k = this.room?.visibility === 'private' && this.key ? `?k=${encodeURIComponent(this.key)}` : '';
    return `${location.origin}/r/${this.code}${k}`;
  }

  get showLog() {
    return this.room?.settings.showLog ?? true;
  }

  getState = (): GameState => this.state!;
  hasState = () => !!this.state;
  getTurnDeadline = () => this.deadline;
  isAway = (playerId: string) => this.room?.seats.some((s) => s.id === playerId && !s.connected) ?? false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  onError = (fn: (m: string) => void) => {
    this.errorListeners.add(fn);
    return () => {
      this.errorListeners.delete(fn);
    };
  };

  dispatch = (action: Action): string | null => {
    if (this.status !== 'open') return 'Not connected — reconnecting…';
    this.send({ t: 'action', action });
    return null;
  };

  updateSettings(settings: RoomSettings, visibility?: Visibility) {
    this.send({ t: 'settings', settings, visibility });
  }
  /** Host: let someone in (or not). */
  admit(id: string, ok: boolean) {
    this.send({ t: 'admit', id, ok });
  }
  start() {
    this.send({ t: 'start' });
  }
  backToLobby() {
    this.send({ t: 'lobby' });
  }

  close() {
    this.closedByUs = true;
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    try {
      this.send({ t: 'leave' });
    } catch {
      /* ignore */
    }
    this.ws?.close();
  }

  private emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/api/room/${this.code}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.status = 'open';
      ws.send(
        JSON.stringify({
          t: 'hello',
          name: this.name,
          token: this.token,
          avatar: this.avatar,
          mode: this.mode,
          key: this.key,
        } satisfies ClientMsg),
      );
      this.emit();
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'knocking') {
        this.knocking = true;
      } else if (msg.t === 'room') {
        this.knocking = false;
        this.room = msg.room;
        // Seated at a private table: remember its key so the invite link (and refresh) work.
        if (msg.room.key) this.key = msg.room.key;
        this.meId = msg.you;
        if (!msg.room.started) {
          this.state = null;
          this.deadline = null;
        }
      } else if (msg.t === 'state') {
        this.state = msg.state;
        this.deadline = msg.deadlineIn === null ? null : Date.now() + msg.deadlineIn;
      } else if (msg.t === 'error') {
        if (msg.fatal) this.fatal = msg.message;
        for (const fn of this.errorListeners) fn(msg.message);
      }
      this.emit();
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      if (this.closedByUs || this.fatal) {
        this.status = 'closed';
        this.emit();
        return;
      }
      // Phone locked, Wi-Fi hiccup… try again, a bit slower each time.
      this.status = 'reconnecting';
      this.emit();
      const wait = Math.min(10_000, 500 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (!this.closedByUs) this.connect();
      }, wait);
    };
  }
}
