import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cardName, powerOf, rankLabel } from '../engine/cards';
import { currentPlayer, getPlayer, handCount, isPlayPhase, topDiscard } from '../engine/engine';
import type { Action, Card, EventKind, GameState, Player, PowerRank, SlotRef } from '../engine/types';
import type { GameConnection } from '../game/connection';
import { isHidden } from '../engine/view';
import { CardView } from './CardView';
import { flightsFor, FlightView, heldKey, measure, slotKey, type Flight, type Rect } from './flights';
import { Rules } from './Rules';
import { RoundReveal } from './RoundReveal';
import { gridPos } from './layout';
import { MUSIC_STYLES, setPrefs, usePrefs } from './prefs';
import { Icon, IconButton } from './art/Icon';
import { Avatar, avatarFor } from './art/Avatar';
import { SettingsPanel } from './Personalize';
import { play } from './sound';

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
  lastCall: 'big',
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
    t = t.replace(/ and (discards|throws|takes|swaps) /, (_m, v: string) => ` and ${VERBS[v] ?? v} `);
  }
  return t;
}


const systemReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastSeq = 0;

/** A real Pedro call (by a player, or automatic) — not "another player also ran out of cards". */
const isPedroCall = (e: { kind: EventKind; actorId?: string; text: string }) => e.kind === 'pedro' && !!e.actorId && e.text.includes('PEDRO');

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
  const prefs = usePrefs();
  const reducedMotion = () => !prefs.animations || systemReducedMotion();
  const me = getPlayer(s, HUMAN_ID)!;
  const cur = currentPlayer(s);
  const [now, setNow] = useState(Date.now());
  /** Your turn only "arrives" once the previous player's animations are over. */
  const [gate, setGate] = useState<{ until: number; actorId: string }>({ until: 0, actorId: '' });
  const gated = now < gate.until && cur.id === HUMAN_ID;
  const myTurn = isPlayPhase(s) && cur.id === HUMAN_ID && !gated;
  const shownCurId = gated ? gate.actorId : cur.id;
  const lastCall = s.phase === 'lastCall';
  const canThrow = (isPlayPhase(s) || lastCall) && s.discard.length > 0;
  const held = myTurn && s.phase === 'drawn' ? s.drawn : null;
  /** Power I can use right now by tapping a target (drawn power card, or already discarded). */
  /**
   * Holding a drawn power card: first choose — use its power, or keep the card (swap it into your hand).
   * Tapping one of your cards would otherwise be ambiguous (7: peek or swap?).
   */
  const [heldMode, setHeldMode] = useState<'ask' | 'power' | 'swap'>('ask');
  const heldIsPower = !!held && !!powerOf(held);
  useEffect(() => setHeldMode('ask'), [held?.id]);
  const activePower: PowerRank | null =
    held && heldIsPower && heldMode === 'power' ? powerOf(held) : myTurn && s.phase === 'power' ? s.pendingPower : null;
  const choosing = heldIsPower && heldMode === 'ask';

  const [takeMode, setTakeMode] = useState(false);
  const [nineFirst, setNineFirst] = useState<SlotRef | null>(null);
  const [peekSel, setPeekSel] = useState<number[]>([]);
  const [reveals, setReveals] = useState<Record<string, number>>({});
  const [flashes, setFlashes] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
  /** A card was just burned (thrown correctly): flames on the pile. */
  const [burnAt, setBurnAt] = useState<{ from: number; until: number } | null>(null);
  /** Someone called Pedro: big announcement across the table. */
  const [pedroSplash, setPedroSplash] = useState<{ until: number; title: string; sub: string } | null>(null);
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

  /** A sound for each move, timed to land with its animation. */
  const soundFor = (e: (typeof s.events)[number], powerHold: number) => {
    const anim = !reducedMotion();
    switch (e.kind) {
      case 'deal':
        return play('shuffle');
      case 'draw':
        return play('draw');
      case 'swap':
      case 'takeDiscard':
        play('flip', anim ? 450 : 0);
        return play('place', anim ? 1150 : 0);
      case 'discard':
        return play('place', anim ? 150 + powerHold + 400 : 0);
      case 'snap':
        return play('burn', anim ? 350 : 0);
      case 'snapWrong':
      case 'snapSlow':
        return play('wrong', anim ? 450 : 0);
      case 'penalty':
        return play('penalty', anim ? 1500 : 0);
      case 'reshuffle':
        return play('shuffle');
      case 'lastCall':
        return play('turn');
      case 'pedro':
        return isPedroCall(e) ? play('pedro') : play('place');
      case 'power':
        if (e.reveal) return play('peek');
        if (e.slots?.length === 2 && e.slots[0].playerId !== e.slots[1].playerId) return play('swap', anim ? 300 : 0);
        return play('shuffle');
    }
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
      if (tone && !(e.kind === 'power' && e.actorId === HUMAN_ID) && !isPedroCall(e)) toast(youify(e.text, me.name), tone);
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
      if (e.kind === 'snap') {
        const from = t + (reducedMotion() ? 0 : 350);
        setBurnAt({ from, until: from + 1400 });
      }
      if (isPedroCall(e) && e.actorId) {
        const who = getPlayer(s, e.actorId);
        const mine = e.actorId === HUMAN_ID;
        setPedroSplash({
          until: t + 2800,
          title: 'PEDRO!',
          sub: mine ? (me.name === 'You' ? 'You called it!' : `${me.name}, you called it!`) : `${who?.name ?? ''} ${/no cards left/.test(e.text) ? 'has no cards left' : 'called it'} — last round!`,
        });
      }
      if (fresh.length < 12) soundFor(e, powerHold);
      if (e.kind === 'discard') powerHold = 0;
    }
    // Only hold back the *start* of your turn — never block you in the middle of it.
    const turnPassedToMe = fresh.some((e) => (e.kind === 'turn' || e.kind === 'start') && e.actorId === HUMAN_ID);
    if (turnPassedToMe && fresh.length < 12) play('turn', Math.max(0, gateEnd - t));
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

  // The start-of-round peek stays face-up until you're ready. If the timer made you ready
  // (you didn't tap "I've got them"), give a short last look, then turn them face down.
  const imReady = s.phase !== 'peek' || !!s.ready[HUMAN_ID];
  useEffect(() => {
    if (!imReady) return;
    setReveals((r) => {
      if (!Object.values(r).includes(Infinity)) return r;
      const until = Date.now() + 2500;
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === Infinity ? until : v]));
    });
  }, [imReady, s.seq]);

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
    return (reveals[c.id] ?? 0) > now;
  };

  // ───────────── taps ─────────────

  const tapTarget = (ref: SlotRef): boolean => {
    const mine = ref.playerId === HUMAN_ID;
    if (s.phase === 'peek') return mine && !s.peeked[HUMAN_ID];
    if (!myTurn) return false;
    if (s.phase === 'turnStart') return takeMode && mine;
    if (choosing) return false;
    if (activePower === 7) return mine;
    if (activePower === 8) return !mine;
    if (activePower === 9) return !nineFirst || nineFirst.playerId !== ref.playerId || keyOfRef(nineFirst) === keyOfRef(ref);
    if (activePower === 10) return true; // any player's hand, yours included
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
    if (activePower === 10) return usePower({ targetPlayerId: ref.playerId });
    if (activePower === 9) {
      if (!nineFirst || nineFirst.playerId === ref.playerId) {
        setNineFirst(nineFirst && keyOfRef(nineFirst) === keyOfRef(ref) ? null : ref);
      } else {
        usePower({ target: nineFirst, target2: ref });
        setNineFirst(null);
      }
      return;
    }
    if (s.phase === 'drawn' && mine && !activePower) run({ type: 'SWAP', playerId: HUMAN_ID, slot: ref.slot });
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
      else if (s.topBurned) toast('That card is burned — it cannot be taken.', 'error');
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
    if (src.kind === 'slot' && key === 'discard') run({ type: 'SNAP', playerId: HUMAN_ID, target: src.ref, cardId: src.card.id });
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
      {s.pedro?.callerId === p.id && <span className="badge badge--pedro">Pedro!</span>}
      {/* Opponents' seats light up on their turn; the label only goes on yours (space is tight). */}
      {isPlayPhase(s) && shownCurId === p.id && p.id === HUMAN_ID && <span className="badge badge--turn">playing</span>}
      {s.phase === 'peek' && s.ready[p.id] && <span className="badge">ready</span>}
      {game.isAway?.(p.id) && <span className="badge badge--away"><Icon name="away" size={12} /> away</span>}
      {Object.values(peeks).some((v) => v.by === p.id && v.until > now) && <span className="badge badge--peek"><Icon name="eye" size={13} /> peeking</span>}
      {(shuffles[p.id] ?? 0) > now && <span className="badge badge--peek"><Icon name="shuffle" size={13} /> shuffled</span>}
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
    <div className={`table ${prefs.animations ? '' : 'no-anim'}`}>
      <header className="topbar">
        <IconButton icon="home" label="Back to the menu" onClick={onExit} />
        <div className="title">
          PEDRO <span className="round">Round {s.round}</span>
        </div>
        <div className="topbar-right">
          <IconButton
            icon={prefs.sound ? 'sound' : 'mute'}
            label={prefs.sound ? 'Sound on — tap to mute' : 'Sound off — tap to turn on'}
            off={!prefs.sound}
            pressed={prefs.sound}
            onClick={() => setPrefs({ sound: !prefs.sound })}
          />
          <IconButton
            icon="music"
            label={`Music: ${MUSIC_STYLES.find((m) => m.id === prefs.musicStyle)?.label} — tap to change`}
            off={prefs.musicStyle === 'off'}
            onClick={() => {
              const i = MUSIC_STYLES.findIndex((m) => m.id === prefs.musicStyle);
              const next = MUSIC_STYLES[(i + 1) % MUSIC_STYLES.length];
              setPrefs({ musicStyle: next.id });
              toast(next.id === 'off' ? 'Music off' : `Music: ${next.label}`, 'info');
            }}
          />
          <IconButton icon="gear" label="Settings: table, deck, sound" onClick={() => setShowSettings(true)} />
          <IconButton icon="help" label="Rules" onClick={() => setShowRules(true)} />
        </div>
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
                <Avatar code={avatarFor(p)} size={28} className="seat-avatar" />
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

          <div className={`pile pile--discard ${lastCall && s.snap.open ? 'is-lastcall' : ''}`}>
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
              {s.topBurned && !discardHidden && <Icon name="fire" className="burned" size={30} />}
              {burnAt && now >= burnAt.from - 250 && now < burnAt.until && (
                <span key={burnAt.from} className="burn-fx" aria-hidden>
                  <Icon name="fire" />
                  <Icon name="fire" />
                  <Icon name="fire" />
                </span>
              )}
            </div>
            <span className="pile-label">{s.topBurned && !discardHidden ? 'Burned' : 'Discard'}</span>
          </div>
        </section>

        <section
          className={`seat seat--me ${(penalties[HUMAN_ID]?.until ?? 0) > now ? 'is-penalized' : ''} ${myTurn ? 'is-active' : ''} ${drag && dragAccept?.('zone:me') ? 'is-droptarget' : ''}`}
          data-key="zone:me"
        >
          <div className="seat-head">
            <Avatar code={avatarFor(me)} size={30} className="seat-avatar" />
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
            <Hint
              meId={HUMAN_ID}
              deadline={deadlineLeft}
              s={s}
              myTurn={myTurn}
              shownCurName={getPlayer(s, shownCurId)?.name ?? ''}
              takeMode={takeMode}
              nineFirst={nineFirst}
              activePower={activePower}
              choosing={choosing}
              heldMode={heldIsPower ? heldMode : null}
              onHeldMode={setHeldMode}
              onReady={() => {
                setReveals((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== Infinity)));
                setPeekSel([]);
                run({ type: 'READY', playerId: HUMAN_ID });
              }}
            />
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

      {pedroSplash && pedroSplash.until > now && (
        <div key={pedroSplash.until} className="pedro-splash" aria-live="assertive">
          <div className="pedro-splash-title">{pedroSplash.title}</div>
          <div className="pedro-splash-sub">{pedroSplash.sub}</div>
        </div>
      )}

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
        <RoundReveal key={`${s.round}-${s.phase}`} meId={HUMAN_ID} restartLabel={restartLabel} s={s} onNext={() => run({ type: 'READY_NEXT', playerId: HUMAN_ID })} deadline={deadlineLeft} onRestart={onRestart} onExit={onExit} />
      )}

      {showRules && <Rules onClose={() => setShowRules(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

const POWER_LABEL: Record<PowerRank, string> = {
  7: 'peek at one of your cards',
  8: "peek at an opponent's card",
  9: 'swap two cards blindly',
  10: "shuffle a player's cards",
};

function Hint(props: {
  meId: string;
  deadline: number | null;
  s: GameState;
  myTurn: boolean;
  shownCurName: string;
  takeMode: boolean;
  nineFirst: SlotRef | null;
  activePower: PowerRank | null;
  /** Holding a power card and haven't chosen yet: power or keep? */
  choosing: boolean;
  heldMode: 'ask' | 'power' | 'swap' | null;
  onHeldMode: (m: 'ask' | 'power' | 'swap') => void;
  onReady: () => void;
}) {
  const { s, myTurn, takeMode, nineFirst, activePower, onReady, choosing, heldMode, onHeldMode } = props;
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
  } else if (s.phase === 'lastCall') {
    text =
      top && s.snap.open
        ? `Last chance! Throw a ${top.rank === 0 ? 'Joker' : rankLabel(top.rank)} now — drag it onto the pile before the cards are counted.`
        : 'Counting the cards…';
  } else if (!isPlayPhase(s)) {
    text = '';
  } else if (!myTurn) {
    text = `${props.shownCurName} is playing… Drag a matching card onto the pile to throw it!`;
  } else if (s.phase === 'turnStart') {
    text = takeMode
      ? `Tap one of your cards to swap it with the ${top ? cardName(top) : ''} (tap the pile again to cancel).`
      : `Your turn — tap the deck to draw${top && !s.topBurned ? `, or drag the ${cardName(top)} onto one of your cards` : ''}.`;
  } else if (choosing && s.drawn) {
    const r = s.drawn.rank as PowerRank;
    text = `You drew a ${r} — a power card! What do you want to do?`;
    button = (
      <div className="choice">
        <button className="btn btn--primary" onClick={() => onHeldMode('power')}>
          Use the power: {POWER_LABEL[r]}
        </button>
        <button className="btn" onClick={() => onHeldMode('swap')}>
          Keep the {r} (swap it with one of my cards)
        </button>
        <span className="muted small">…or tap the pile to throw it away.</span>
      </div>
    );
  } else {
    const away = 'or tap the pile to throw it away';
    const back =
      heldMode && heldMode !== 'ask' ? (
        <button className="btn btn--small" onClick={() => onHeldMode('ask')}>
          ← Change my mind
        </button>
      ) : null;
    switch (activePower) {
      case 7:
        text = 'Power 7: tap one of your cards to peek at it.';
        break;
      case 8:
        text = "Power 8: tap an opponent's card to peek at it.";
        break;
      case 9:
        text = nineFirst ? 'Power 9: now tap a card of a different player — they swap blindly.' : 'Power 9: tap two cards of different players to swap them blindly.';
        break;
      case 10:
        text = "Power 10: tap a player's cards (yours too) to shuffle them.";
        break;
      default:
        text = s.drawn
          ? heldMode === 'swap'
            ? `Keep the ${cardName(s.drawn)}: tap the card of yours it replaces, ${away}.`
            : `You drew ${cardName(s.drawn)}. Tap or drag onto one of your cards to swap, ${away}.`
          : '';
    }
    button = back;
  }

  return (
    <div className={`actionbar ${myTurn || s.phase === 'lastCall' || (s.phase === 'peek' && !s.ready[HUMAN_ID]) ? 'is-urgent' : ''}`}>
      <p className="hint">
        {props.deadline !== null && props.deadline <= 20 && <span className="timer">⏱ {props.deadline}s</span>} {text}
      </p>
      {button}
    </div>
  );
}
