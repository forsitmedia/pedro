import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cardName, powerOf } from '../engine/cards';
import { currentPlayer, getPlayer, handCount, isPlayPhase, topDiscard } from '../engine/engine';
import type { Action, Card, EventKind, GameState, Player, PowerRank, SlotRef } from '../engine/types';
import type { GameConnection } from '../game/connection';
import { isHidden } from '../engine/view';
import { CardView } from './CardView';
import { flightsFor, FlightView, heldKey, measure, slotKey, type Flight, type Rect } from './flights';
import { Rules } from './Rules';

type Tone = 'info' | 'good' | 'bad' | 'big' | 'error';
interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

type DragSrc =
  | { kind: 'slot'; ref: SlotRef; card: Card; faceUp: boolean }
  | { kind: 'held'; card: Card }
  | { kind: 'deck' }
  | { kind: 'discard'; card: Card };

interface DragState {
  src: DragSrc;
  x: number;
  y: number;
  w: number;
  over: string | null;
}

const TOAST_TONE: Partial<Record<EventKind, Tone>> = {
  pedro: 'big',
  snap: 'good',
  snapWrong: 'bad',
  snapSlow: 'bad',
  reshuffle: 'info',
  power: 'info',
};

const keyOfRef = (r: SlotRef) => slotKey(r.playerId, r.slot);

const VERBS: Record<string, string> = {
  draws: 'draw',
  discards: 'discard',
  keeps: 'keep',
  takes: 'take',
  throws: 'throw',
  shuffles: 'shuffle',
  swaps: 'swap',
  peeks: 'peek',
  calls: 'call',
  starts: 'start',
  has: 'have',
  "doesn't": "don't",
};

/** Event texts are written in third person; fix the grammar when the human is literally called "You". */
function youify(text: string, myName: string): string {
  if (myName !== 'You') return text;
  let t = text.replace(/^You's\b/, 'Your').replace(/\bYou's\b/g, 'your').replace(/\bYou was\b/g, 'you were');
  if (t.startsWith('You ')) {
    t = t.replace(/^You ([\w']+)/, (m, verb: string) => (VERBS[verb] ? `You ${VERBS[verb]}` : m));
    t = t.replace(/\btheir\b/g, 'your');
  }
  return t;
}

/** 2×2 square: slots 0-1 on top, 2-3 below; extra (penalty) cards grow sideways. */
function gridPos(i: number): CSSProperties {
  if (i < 4) return { gridRow: i < 2 ? 1 : 2, gridColumn: (i % 2) + 1 };
  const j = i - 4;
  return { gridRow: (j % 2) + 1, gridColumn: 3 + Math.floor(j / 2) };
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastSeq = 0;

export function GameTable({
  game,
  onRestart,
  onExit,
  restartLabel = 'Play again',
}: {
  game: GameConnection;
  onRestart: () => void;
  onExit: () => void;
  restartLabel?: string;
}) {
  const HUMAN_ID = game.meId;
  const s = useSyncExternalStore(game.subscribe, game.getState);
  const me = getPlayer(s, HUMAN_ID)!;
  const cur = currentPlayer(s);
  const [now, setNow] = useState(Date.now());
  /** Your turn only "arrives" once the previous player's animations are over. */
  const [gate, setGate] = useState<{ until: number; actorId: string }>({ until: 0, actorId: '' });
  const gated = now < gate.until && cur.id === HUMAN_ID;
  const myTurn = isPlayPhase(s) && cur.id === HUMAN_ID && !gated;
  const shownCurId = gated ? gate.actorId : cur.id;
  const canThrow = isPlayPhase(s) && s.discard.length > 0;
  const held = myTurn && s.phase === 'drawn' ? s.drawn : null;
  /** Power I can use right now by tapping a target (drawn power card, or already discarded). */
  const activePower: PowerRank | null = held ? powerOf(held) : myTurn && s.phase === 'power' ? s.pendingPower : null;

  const [takeMode, setTakeMode] = useState(false);
  const [nineFirst, setNineFirst] = useState<SlotRef | null>(null);
  const [peekSel, setPeekSel] = useState<number[]>([]);
  const [reveals, setReveals] = useState<Record<string, number>>({});
  const [flashes, setFlashes] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [hidden, setHidden] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Cards someone else is peeking at (7/8): lifted and tilted towards the peeker. */
  const [peeks, setPeeks] = useState<Record<string, { until: number; ax: number; ay: number; px: number; py: number; by: string }>>({});
  /** Players whose hand is being shuffled by a 10. */
  const [shuffles, setShuffles] = useState<Record<string, number>>({});
  /** Recent penalties per player (seat shakes + "+2 cards" badge). */
  const [penalties, setPenalties] = useState<Record<string, { until: number; n: number; why: string }>>({});
  /** Cards that were wrongly thrown and came back (red glow, face-up). */
  const [rejected, setRejected] = useState<Record<string, number>>({});
  // Only react to events that happen from now on: after a refresh or rejoin,
  // old ones (like the peek at the start) must not be replayed.
  const lastSeen = useRef(s.phase === 'peek' && !s.peeked[game.meId] ? 0 : s.seq);
  /** Faces of cards we've legitimately seen (online, face-down cards arrive blank). */
  const faces = useRef<Record<string, Card>>({});
  const learn = (c: Card | null | undefined) => {
    if (c && !isHidden(c)) faces.current[c.id] = c;
  };
  for (const c of s.discard) learn(c);
  learn(s.drawn);
  for (const p of s.players) for (const c of p.hand) learn(c);
  for (const e of s.events) {
    learn(e.card);
    for (const r of e.reveal?.cards ?? []) learn(r.card);
  }
  const faceOf = (c: Card): Card => (isHidden(c) ? (faces.current[c.id] ?? c) : c);
  const deadlineMs = game.getTurnDeadline();
  const deadlineLeft = deadlineMs ? Math.max(0, Math.ceil((deadlineMs - now) / 1000)) : null;

  useEffect(() => game.onError?.((m) => toast(m, 'error')), [game]); // eslint-disable-line react-hooks/exhaustive-deps
  const rects = useRef<Record<string, Rect>>({});
  const suppressClick = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const toast = (text: string, tone: Tone) => {
    const id = ++toastSeq;
    setToasts((ts) => [...ts.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), tone === 'big' ? 4500 : 3800);
  };

  // New game events → reveals, flashes, toasts and flying cards.
  // Runs before the "remember positions" effect below, so `rects.current` still holds the old layout.
  useLayoutEffect(() => {
    const fresh = s.events.filter((e) => e.id > lastSeen.current);
    if (!fresh.length) return;
    lastSeen.current = s.seq;
    const t = Date.now();
    const rv: Record<string, number> = {};
    const fl: Record<string, number> = {};
    const newFlights: Flight[] = [];
    const curRects = measure();
    const pk: typeof peeks = {};
    const sh: Record<string, number> = {};
    const pen: Record<string, { until: number; n: number; why: string }> = {};
    const rej: Record<string, number> = {};
    let powerHold = 0;
    let gateEnd = 0;
    let gateActor = '';
    for (const e of fresh) {
      if (e.kind === 'power') {
        const twoPlayers = e.slots?.length === 2 && e.slots[0].playerId !== e.slots[1].playerId;
        powerHold = e.actorId === HUMAN_ID ? 300 : e.reveal ? 2600 : twoPlayers ? 1100 : 1400;
      }
      if (e.kind === 'penalty' && e.actorId && e.slots?.length) {
        const by = e.penalty?.byId ? (e.penalty.byId === HUMAN_ID && me.name === 'You' ? 'YOU' : getPlayer(s, e.penalty.byId)?.name) : '';
        const why =
          e.penalty?.reason === 'wrong'
            ? 'WRONG CARD'
            : e.penalty?.reason === 'slow'
              ? 'TOO SLOW'
              : e.penalty?.reason === 'caught'
                ? `${(by ?? '').toUpperCase()} GOT ${e.actorId === HUMAN_ID ? 'YOU' : 'THEM'}`
                : '';
        pen[e.actorId] = { until: t + 4500, n: e.slots.length, why };
      }
      if ((e.kind === 'snapWrong' || e.kind === 'snapSlow') && e.slots?.[0]) rej[keyOfRef(e.slots[0])] = t + 4500;
      const ref0 = e.slots?.[0];
      if (e.kind === 'power' && e.reveal && ref0 && e.actorId && e.actorId !== HUMAN_ID) {
        // Someone peeks (7/8): lift the card towards them so everyone sees WHICH card, but not its face.
        const k = keyOfRef(ref0);
        const cr = curRects[k];
        const sr = curRects[`seat:${e.actorId}`];
        let dx = 0;
        let dy = -1;
        if (cr && sr) {
          const vx = sr.x + sr.w / 2 - (cr.x + cr.w / 2);
          const vy = sr.y + sr.h / 2 - (cr.y + cr.h / 2);
          const len = Math.hypot(vx, vy);
          if (len > 60) {
            dx = vx / len;
            dy = vy / len;
          }
        }
        pk[k] = { until: t + 2800, ax: -dy, ay: dx, px: dx * 28, py: dy * 28 - 8, by: e.actorId };
      }
      if (e.kind === 'power' && !e.reveal && e.slots?.length && e.slots.every((r) => r.playerId === e.slots![0].playerId)) {
        sh[e.slots[0].playerId] = t + 1300;
      }
      if (e.reveal && (e.reveal.to === 'all' || e.reveal.to.includes(HUMAN_ID))) {
        const dur = e.kind === 'peek' ? Infinity : e.reveal.to === 'all' ? 4500 : 3000;
        for (const { card } of e.reveal.cards) rv[card.id] = t + dur;
      }
      for (const r of e.slots ?? []) fl[keyOfRef(r)] = t + 1800;
      const tone = TOAST_TONE[e.kind];
      if (tone && !(e.kind === 'power' && e.actorId === HUMAN_ID)) toast(youify(e.text, me.name), tone);
      if (!reducedMotion() && fresh.length < 12) {
        const fs = flightsFor(e, s, rects.current, curRects, HUMAN_ID, e.kind === 'discard' ? powerHold : 0, faceOf);
        newFlights.push(...fs);
        if (e.actorId && e.actorId !== HUMAN_ID) {
          for (const f of fs) {
            if (t + f.delay + f.dur > gateEnd) {
              gateEnd = t + f.delay + f.dur;
              gateActor = e.actorId;
            }
          }
        }
      }
      if (e.kind === 'discard') powerHold = 0;
    }
    // Only hold back the *start* of your turn — never block you in the middle of it.
    const turnPassedToMe = fresh.some((e) => (e.kind === 'turn' || e.kind === 'start') && e.actorId === HUMAN_ID);
    if (turnPassedToMe && gateEnd > t) setGate({ until: gateEnd + 150, actorId: gateActor });
    setReveals((r) => ({ ...r, ...rv }));
    setFlashes((f) => ({ ...f, ...fl }));
    if (Object.keys(pk).length) setPeeks((p) => ({ ...p, ...pk }));
    if (Object.keys(sh).length) setShuffles((x) => ({ ...x, ...sh }));
    if (Object.keys(pen).length) setPenalties((x) => ({ ...x, ...pen }));
    if (Object.keys(rej).length) setRejected((x) => ({ ...x, ...rej }));
    if (newFlights.length) {
      setFlights((f) => [...f, ...newFlights]);
      setHidden((h) => {
        const n = { ...h };
        for (const f of newFlights) n[f.hideKey] = (n[f.hideKey] ?? 0) + 1;
        return n;
      });
    }
  }, [s.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember where everything is, for the next animation.
  useLayoutEffect(() => {
    rects.current = measure();
  });

  const onFlightDone = (f: Flight) => {
    setFlights((fs) => fs.filter((x) => x.id !== f.id));
    setHidden((h) => ({ ...h, [f.hideKey]: Math.max(0, (h[f.hideKey] ?? 1) - 1) }));
  };

  useEffect(() => {
    if (!(myTurn && s.phase === 'turnStart')) setTakeMode(false);
    if (activePower !== 9) setNineFirst(null);
  }, [s.phase, s.current, myTurn, activePower]);

  const run = (...actions: Action[]) => {
    for (const a of actions) {
      const err = game.dispatch(a);
      if (err) {
        toast(err, 'error');
        return false;
      }
    }
    return true;
  };

  /** Use the power of the card in hand: it goes to the discard pile, then the power happens. */
  const usePower = (a: Omit<Extract<Action, { type: 'POWER' }>, 'type' | 'playerId'>) => {
    run({ type: 'POWER', playerId: HUMAN_ID, ...a });
  };

  /** Throw the held card away without using its power. */
  const discardHeld = () => {
    if (!myTurn) return;
    if (s.phase === 'drawn') {
      const p = s.drawn ? powerOf(s.drawn) : null;
      run({ type: 'DISCARD', playerId: HUMAN_ID }, ...(p ? [{ type: 'SKIP_POWER', playerId: HUMAN_ID } as Action] : []));
    } else if (s.phase === 'power') run({ type: 'SKIP_POWER', playerId: HUMAN_ID });
  };

  const isFaceUp = (c: Card | null) => {
    if (!c) return false;
    if (s.phase === 'roundEnd' || s.phase === 'gameOver') return true;
    return (reveals[c.id] ?? 0) > now;
  };

  // ───────────── taps ─────────────

  const tapTarget = (ref: SlotRef): boolean => {
    const mine = ref.playerId === HUMAN_ID;
    if (s.phase === 'peek') return mine && !s.peeked[HUMAN_ID];
    if (!myTurn) return false;
    if (s.phase === 'turnStart') return takeMode && mine;
    if (activePower === 7) return mine;
    if (activePower === 8) return !mine || s.phase === 'drawn'; // opponent = peek, mine = swap
    if (activePower === 9) return !nineFirst || nineFirst.playerId !== ref.playerId || keyOfRef(nineFirst) === keyOfRef(ref);
    if (activePower === 10) return !mine || s.phase === 'drawn';
    return s.phase === 'drawn' && mine;
  };

  const onSlotTap = (ref: SlotRef) => {
    if (suppressClick.current) return;
    const mine = ref.playerId === HUMAN_ID;
    if (s.phase === 'peek') {
      if (!mine || s.peeked[HUMAN_ID]) return;
      const sel = peekSel.includes(ref.slot) ? peekSel.filter((x) => x !== ref.slot) : [...peekSel, ref.slot];
      setPeekSel(sel);
      if (sel.length === 2) run({ type: 'PEEK', playerId: HUMAN_ID, slots: [sel[0], sel[1]] });
      return;
    }
    if (!myTurn || !tapTarget(ref)) return;
    if (s.phase === 'turnStart') {
      setTakeMode(false);
      run({ type: 'TAKE_DISCARD', playerId: HUMAN_ID, slot: ref.slot });
      return;
    }
    if (activePower === 7 && mine) return usePower({ target: ref });
    if (activePower === 8 && !mine) return usePower({ target: ref });
    if (activePower === 10 && !mine) return usePower({ targetPlayerId: ref.playerId });
    if (activePower === 9) {
      if (!nineFirst || nineFirst.playerId === ref.playerId) {
        setNineFirst(nineFirst && keyOfRef(nineFirst) === keyOfRef(ref) ? null : ref);
      } else {
        usePower({ target: nineFirst, target2: ref });
        setNineFirst(null);
      }
      return;
    }
    if (s.phase === 'drawn' && mine) run({ type: 'SWAP', playerId: HUMAN_ID, slot: ref.slot });
  };

  const onDeckTap = () => {
    if (suppressClick.current) return;
    if (myTurn && s.phase === 'turnStart') run({ type: 'DRAW', playerId: HUMAN_ID });
  };

  const onDiscardTap = () => {
    if (suppressClick.current) return;
    if (!myTurn) return;
    if (s.phase === 'turnStart') {
      if (s.discard.length && !s.topBurned) setTakeMode(!takeMode);
      else if (s.topBurned) toast('That card is burned 🔥 — it cannot be taken.', 'error');
    } else discardHeld();
  };

  const onSeatTap = (p: Player) => {
    if (activePower === 10) usePower({ targetPlayerId: p.id });
  };

  // ───────────── drag & drop ─────────────

  const canDrag = (src: DragSrc) => {
    switch (src.kind) {
      case 'slot':
        return canThrow;
      case 'held':
        return myTurn && s.phase === 'drawn';
      case 'deck':
        return myTurn && s.phase === 'turnStart';
      case 'discard':
        return myTurn && s.phase === 'turnStart' && !s.topBurned;
    }
  };

  const dropTargetsFor = (src: DragSrc): ((key: string) => boolean) => {
    switch (src.kind) {
      case 'slot':
        return (k) => k === 'discard';
      case 'held':
        return (k) => k === 'discard' || k.startsWith(`slot:${HUMAN_ID}:`);
      case 'discard':
        return (k) => k.startsWith(`slot:${HUMAN_ID}:`);
      case 'deck':
        return (k) => k === 'zone:me' || k.startsWith(`slot:${HUMAN_ID}:`);
    }
  };

  const findDrop = (x: number, y: number, accept: (k: string) => boolean): string | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      const k = (el as HTMLElement).closest<HTMLElement>('[data-key]')?.dataset.key;
      if (k && accept(k)) return k;
    }
    // Be generous with the discard pile — it's the main target when you're in a hurry.
    if (accept('discard')) {
      const r = document.querySelector('[data-key="discard"]')?.getBoundingClientRect();
      const pad = 36;
      if (r && x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad) return 'discard';
    }
    return null;
  };

  const onDrop = (src: DragSrc, key: string) => {
    const slot = key.startsWith(`slot:${HUMAN_ID}:`) ? Number(key.split(':')[2]) : -1;
    if (src.kind === 'slot' && key === 'discard') run({ type: 'SNAP', playerId: HUMAN_ID, target: src.ref });
    else if (src.kind === 'held' && key === 'discard') discardHeld();
    else if (src.kind === 'held' && slot >= 0) run({ type: 'SWAP', playerId: HUMAN_ID, slot });
    else if (src.kind === 'discard' && slot >= 0) run({ type: 'TAKE_DISCARD', playerId: HUMAN_ID, slot });
    else if (src.kind === 'deck') run({ type: 'DRAW', playerId: HUMAN_ID });
  };

  const startDrag = (e: ReactPointerEvent<HTMLElement>, src: DragSrc) => {
    if (e.button !== 0 || !canDrag(src)) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const w = e.currentTarget.getBoundingClientRect().width;
    const accept = dropTargetsFor(src);
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) dragging = true;
      if (dragging) {
        ev.preventDefault();
        setDrag({ src, x: ev.clientX, y: ev.clientY, w, over: findDrop(ev.clientX, ev.clientY, accept) });
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!dragging) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 60);
      setDrag(null);
      const key = ev.type === 'pointerup' ? findDrop(ev.clientX, ev.clientY, accept) : null;
      if (key) onDrop(src, key);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const dragAccept = drag ? dropTargetsFor(drag.src) : null;
  const dropProps = (key: string) => ({
    dropTarget: !!dragAccept?.(key),
    over: drag?.over === key,
  });

  // ───────────── rendering ─────────────

  const renderHand = (p: Player) => (
    <div className={`hand ${(shuffles[p.id] ?? 0) > now ? 'is-shuffling' : ''}`}>
      {p.hand.map((c, slot) => {
        const ref = { playerId: p.id, slot };
        const key = keyOfRef(ref);
        if (!c) return <CardView key={slot} card={null} faceUp={false} empty dataKey={key} style={gridPos(slot)} />;
        const selected =
          (p.id === HUMAN_ID && s.phase === 'peek' && peekSel.includes(slot) && !s.peeked[HUMAN_ID]) ||
          (!!nineFirst && keyOfRef(nineFirst) === key);
        const faceUp = isFaceUp(c);
        const peek = peeks[key] && peeks[key].until > now ? peeks[key] : null;
        const style = {
          ...gridPos(slot),
          '--sx': `${((slot * 53) % 7) * 9 - 27}px`,
          '--sy': `${((slot * 31) % 5) * 10 - 20}px`,
          '--sr': `${((slot * 17) % 9) * 5 - 20}deg`,
          ...(peek ? { '--px': `${peek.px}px`, '--py': `${peek.py}px`, '--ax': peek.ax, '--ay': peek.ay } : {}),
        } as CSSProperties;
        return (
          <CardView
            key={slot}
            card={faceOf(c)}
            faceUp={faceUp}
            dataKey={key}
            style={style}
            className={peek ? 'is-peeked' : (rejected[key] ?? 0) > now ? 'is-rejected' : ''}
            selectable={tapTarget(ref)}
            selected={selected}
            hidden={(hidden[key] ?? 0) > 0}
            flash={(flashes[key] ?? 0) > now}
            dim={drag?.src.kind === 'slot' && keyOfRef(drag.src.ref) === key}
            draggable={canThrow}
            {...dropProps(key)}
            onClick={() => onSlotTap(ref)}
            onPointerDown={(e) => startDrag(e, { kind: 'slot', ref, card: c, faceUp })}
          />
        );
      })}
    </div>
  );

  const badges = (p: Player) => (
    <>
      {s.pedro?.callerId === p.id && <span className="badge badge--pedro">PEDRO!</span>}
      {isPlayPhase(s) && shownCurId === p.id && <span className="badge badge--turn">playing</span>}
      {s.phase === 'peek' && s.ready[p.id] && <span className="badge">ready</span>}
      {game.isAway?.(p.id) && <span className="badge badge--away">📵 away</span>}
      {Object.values(peeks).some((v) => v.by === p.id && v.until > now) && <span className="badge badge--peek">👀 peeking</span>}
      {(shuffles[p.id] ?? 0) > now && <span className="badge badge--peek">🔀 shuffled</span>}
      {(penalties[p.id]?.until ?? 0) > now && (
        <span className="badge badge--penalty">
          +{penalties[p.id].n} · {penalties[p.id].why.toLowerCase() || `card${penalties[p.id].n > 1 ? 's' : ''}`}
        </span>
      )}
    </>
  );

  const penaltyPop = (id: string) => {
    const pen = penalties[id];
    if (!pen || pen.until <= now) return null;
    return (
      <div key={pen.until} className="penalty-pop" aria-hidden>
        <span className="penalty-pop-n">+{pen.n}</span>
        {pen.why && <span className="penalty-pop-why">{pen.why}</span>}
      </div>
    );
  };

  const opponents = s.players.filter((p) => p.id !== HUMAN_ID);
  /** Seats keep a fixed size: with many (penalty) cards, the cards shrink instead of the seat growing. */
  const handScale = (p: Player): CSSProperties => {
    const cols = 2 + Math.max(0, Math.ceil((p.hand.length - 4) / 2));
    return { '--cols': cols, ...(cols > 3 ? { '--cw': `calc(var(--base-cw) * ${3 / cols})` } : {}) } as CSSProperties;
  };
  const limitText = s.settings.limit ? ` / ${s.settings.limit}` : '';
  const discardHidden = hidden.discard ?? 0;
  const visibleDiscard = s.discard.slice(0, Math.max(0, s.discard.length - discardHidden));
  const shownTop = visibleDiscard[visibleDiscard.length - 1] ?? null;
  const shownUnder = visibleDiscard[visibleDiscard.length - 2] ?? null;
  const top = topDiscard(s);
  const deckActive = myTurn && s.phase === 'turnStart';
  const discardActive = myTurn && (s.phase === 'drawn' || s.phase === 'power' || (s.phase === 'turnStart' && !!top && !s.topBurned));

  return (
    <div className="table">
      <header className="topbar">
        <button className="link" onClick={onExit}>
          ← Menu
        </button>
        <div className="title">
          PEDRO <span className="round">Round {s.round}</span>
        </div>
        <button className="link" onClick={() => setShowRules(true)}>
          Rules
        </button>
      </header>

      <main className={`felt felt--n${opponents.length}`}>
          {opponents.map((p, i) => (
            <div
              key={p.id}
              data-key={`seat:${p.id}`}
              style={handScale(p)}
              className={`seat seat--opp area-o${i} ${(penalties[p.id]?.until ?? 0) > now ? 'is-penalized' : ''} ${isPlayPhase(s) && shownCurId === p.id ? 'is-active' : ''} ${activePower === 10 ? 'is-target' : ''}`}
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('.card')) onSeatTap(p);
              }}
            >
              <div className="seat-head">
                <span className="seat-name">{p.name}</span>
                <span className="seat-score">
                  {p.total}
                  {limitText}
                </span>
                {badges(p)}
              </div>
              {penaltyPop(p.id)}
              {renderHand(p)}
              {s.drawn && cur.id === p.id && s.phase === 'drawn' && (
                <div className="held held--opp">
                  <CardView card={null} faceUp={false} dataKey={heldKey(p.id)} hidden={(hidden[heldKey(p.id)] ?? 0) > 0} />
                </div>
              )}
            </div>
          ))}

        <section className="center">
          <div className="pile">
            <CardView
              card={null}
              faceUp={false}
              dataKey="deck"
              selectable={deckActive}
              draggable={deckActive}
              title="Deck — tap or drag to draw"
              onClick={onDeckTap}
              onPointerDown={(e) => startDrag(e, { kind: 'deck' })}
            />
            <span className="pile-label">Deck · {s.deck.length}</span>
          </div>

          <div className="pile pile--discard">
            <div className="discard-stack">
              {shownUnder && (
                <div className="under">
                  <CardView card={shownUnder} faceUp />
                </div>
              )}
              <CardView
                card={shownTop}
                faceUp
                empty={!shownTop}
                dataKey="discard"
                selectable={discardActive}
                selected={takeMode}
                draggable={myTurn && s.phase === 'turnStart' && !s.topBurned && !!top}
                {...dropProps('discard')}
                title={s.topBurned ? 'Burned — cannot be taken' : 'Discard pile'}
                onClick={onDiscardTap}
                onPointerDown={(e) => top && startDrag(e, { kind: 'discard', card: top })}
              />
              {s.topBurned && !discardHidden && <span className="burned">🔥</span>}
            </div>
            <span className="pile-label">{s.topBurned && !discardHidden ? 'Burned' : 'Discard'}</span>
          </div>
        </section>

        <section
          className={`seat seat--me ${(penalties[HUMAN_ID]?.until ?? 0) > now ? 'is-penalized' : ''} ${myTurn ? 'is-active' : ''} ${drag && dragAccept?.('zone:me') ? 'is-droptarget' : ''}`}
          data-key="zone:me"
        >
          <div className="seat-head">
            <span className="seat-name">{me.name}</span>
            <span className="seat-score">
              {me.total}
              {limitText}
            </span>
            {badges(me)}
            {myTurn && s.phase === 'turnStart' && !s.pedro && (
              <button className="btn btn--pedro" onClick={() => run({ type: 'CALL_PEDRO', playerId: HUMAN_ID })}>
                PEDRO!
              </button>
            )}
          </div>
          {penaltyPop(HUMAN_ID)}
          <div className="seat-body">
            {renderHand(me)}
            {held && (
              <div className="held held--me">
                <CardView
                  card={held}
                  faceUp
                  dataKey={heldKey(HUMAN_ID)}
                  hidden={(hidden[heldKey(HUMAN_ID)] ?? 0) > 0}
                  draggable
                  dim={drag?.src.kind === 'held'}
                  onPointerDown={(e) => startDrag(e, { kind: 'held', card: held })}
                />
                <span className="held-label">{powerOf(held) ? `Power ${held.rank}` : 'In your hand'}</span>
              </div>
            )}
          </div>
          <Hint
            meId={HUMAN_ID}
            deadline={deadlineLeft}
            s={s}
            myTurn={myTurn}
            shownCurName={getPlayer(s, shownCurId)?.name ?? ''}
            takeMode={takeMode}
            nineFirst={nineFirst}
            activePower={activePower}
            onReady={() => {
              setReveals((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== Infinity)));
              setPeekSel([]);
              run({ type: 'READY', playerId: HUMAN_ID });
            }}
          />
        </section>
      </main>

      <aside className="sidebar">
        <h3>Scores</h3>
        <ul className="scores">
          {[...s.players]
            .sort((a, b) => a.total - b.total)
            .map((p) => (
              <li key={p.id} className={p.id === HUMAN_ID ? 'is-me' : ''}>
                <span>{p.name}</span>
                <span>
                  {handCount(p)} cards · <b>{p.total}</b>
                </span>
              </li>
            ))}
        </ul>
        {game.showLog ? <h3>What happened</h3> : <p className="muted small">Move history is hidden — trust your memory!</p>}
        <ol className="log" hidden={!game.showLog}>
          {s.events
            .filter((e) => e.kind !== 'turn' && e.kind !== 'ready')
            .slice(-40)
            .reverse()
            .map((e) => (
              <li key={e.id} className={`log--${e.kind}`}>
                {youify(e.text, me.name)}
              </li>
            ))}
        </ol>
      </aside>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>

      {flights.map((f) => (
        <FlightView key={f.id} f={f} onDone={onFlightDone} />
      ))}

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y, '--cw': `${drag.w}px` } as CSSProperties}>
          <CardView
            card={drag.src.kind === 'deck' ? null : faceOf(drag.src.card)}
            faceUp={drag.src.kind === 'held' || drag.src.kind === 'discard' || (drag.src.kind === 'slot' && drag.src.faceUp)}
          />
        </div>
      )}

      {(s.phase === 'roundEnd' || s.phase === 'gameOver') && flights.length === 0 && (
        <RoundSummary meId={HUMAN_ID} restartLabel={restartLabel} s={s} onNext={() => run({ type: 'NEXT_ROUND' })} onRestart={onRestart} onExit={onExit} />
      )}

      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </div>
  );
}

function Hint(props: {
  meId: string;
  deadline: number | null;
  s: GameState;
  myTurn: boolean;
  shownCurName: string;
  takeMode: boolean;
  nineFirst: SlotRef | null;
  activePower: PowerRank | null;
  onReady: () => void;
}) {
  const { s, myTurn, takeMode, nineFirst, activePower, onReady } = props;
  const HUMAN_ID = props.meId;
  const top = topDiscard(s);
  let text = '';
  let button: JSX.Element | null = null;

  if (s.phase === 'peek') {
    if (!s.peeked[HUMAN_ID]) text = 'Tap 2 of your cards to look at them — only once, so memorize them!';
    else if (!s.ready[HUMAN_ID]) {
      text = 'Memorize these two cards. They will be turned face down.';
      button = (
        <button className="btn btn--primary" onClick={onReady}>
          I've got them
        </button>
      );
    } else text = 'Waiting for the others…';
  } else if (!isPlayPhase(s)) {
    text = '';
  } else if (!myTurn) {
    text = `${props.shownCurName} is playing… Drag a matching card onto the pile to throw it!`;
  } else if (s.phase === 'turnStart') {
    text = takeMode
      ? `Tap one of your cards to swap it with the ${top ? cardName(top) : ''} (tap the pile again to cancel).`
      : `Your turn — tap the deck to draw${top && !s.topBurned ? `, or drag the ${cardName(top)} onto one of your cards` : ''}.`;
  } else {
    const keep = 'drag it onto your card to keep it';
    const away = 'or tap the pile to discard it';
    switch (activePower) {
      case 7:
        text = `Power 7: tap one of your cards to peek at it — ${keep}, ${away}.`;
        break;
      case 8:
        text = `Power 8: tap an opponent's card to peek at it — tap one of yours to swap, ${away}.`;
        break;
      case 9:
        text = nineFirst
          ? 'Power 9: now tap a card of a different player — they swap blindly.'
          : `Power 9: tap two cards of different players to swap them blindly — ${keep}, ${away}.`;
        break;
      case 10:
        text = `Power 10: tap an opponent to shuffle their cards — tap one of yours to swap, ${away}.`;
        break;
      default:
        text = s.drawn ? `You drew ${cardName(s.drawn)}. Tap or drag onto one of your cards to swap, ${away}.` : '';
    }
  }

  return (
    <div className="actionbar">
      <p className="hint">
        {props.deadline !== null && props.deadline <= 20 && <span className="timer">⏱ {props.deadline}s</span>} {text}
      </p>
      {button}
    </div>
  );
}

function RoundSummary({
  meId: HUMAN_ID,
  restartLabel,
  s,
  onNext,
  onRestart,
  onExit,
}: {
  meId: string;
  restartLabel: string;
  s: GameState;
  onNext: () => void;
  onRestart: () => void;
  onExit: () => void;
}) {
  const results = s.results ?? [];
  const over = s.phase === 'gameOver';
  const ranking = [...s.players].sort((a, b) => a.total - b.total);
  const winner = ranking[0];
  const lowest = Math.min(...results.map((r) => r.sum));
  return (
    <div className="modal-backdrop">
      <div className="modal summary">
        <h2>{over ? (winner.id === HUMAN_ID ? '🏆 You win!' : `🏆 ${winner.name} wins!`) : `Round ${s.round} results`}</h2>
        {s.pedro && (
          <p className="muted">
            {getPlayer(s, s.pedro.callerId)?.name} {s.pedro.auto ? 'ran out of cards' : 'called Pedro'}.
          </p>
        )}
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Cards</th>
              <th>Round</th>
              <th>Total</th>
              {s.settings.limit && <th className="col-progress">Points</th>}
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const p = getPlayer(s, r.playerId)!;
              return (
                <tr key={r.playerId} className={r.sum === lowest ? 'is-best' : ''}>
                  <td>{p.name}</td>
                  <td className="mini-cards">
                    {r.cards.length
                      ? r.cards.map((c) => (
                          <span key={c.id} className={`mini ${c.suit === 'H' || c.suit === 'D' ? 'is-red' : ''}`}>
                            {cardName(c)}
                          </span>
                        ))
                      : '—'}
                  </td>
                  <td>
                    {r.sum}
                    {r.penalty ? <span className="penalty"> +{r.penalty}</span> : null}
                  </td>
                  <td>
                    <b>{r.total}</b>
                  </td>
                  {s.settings.limit && <ProgressCell before={r.total - r.sum - r.penalty} after={r.total} limit={s.settings.limit} />}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="buttons">
          {over ? (
            <>
              <button className="btn btn--primary" onClick={onRestart}>
                {restartLabel}
              </button>
              <button className="btn" onClick={onExit}>
                Menu
              </button>
            </>
          ) : (
            <button className="btn btn--primary" onClick={onNext}>
              Next round
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressCell({ before, after, limit }: { before: number; after: number; limit: number }) {
  const pct = (x: number) => `${Math.min(100, Math.max(0, (x / limit) * 100))}%`;
  const lost = after >= limit;
  const danger = !lost && after >= limit * 0.7;
  return (
    <td className="col-progress">
      <div className={`progress ${lost ? 'is-lost' : danger ? 'is-danger' : ''}`}>
        <div className="progress-before" style={{ width: pct(Math.min(before, after)) }} />
        <div
          className="progress-add"
          style={{ left: pct(Math.min(before, after)), width: pct(Math.max(0, after - Math.max(0, Math.min(before, after)))) }}
        />
      </div>
      <span className="progress-text">
        {after} / {limit} pts
      </span>
    </td>
  );
}
