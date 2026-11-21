import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Card, GameEvent, GameState } from '../engine/types';
import { CardView } from './CardView';

/** Cards flying across the table so players can follow every move. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Flight {
  id: number;
  card: Card | null;
  faceUp: boolean;
  from: Rect;
  to: Rect;
  /** ms the card waits (lifted) at its origin before moving — time for your eye to catch it. */
  delay: number;
  dur: number;
  /** data-key of the destination, hidden until the card lands. */
  hideKey: string;
  /** Goes to `to` and comes back (a rejected throw). */
  bounce?: boolean;
  penalty?: boolean;
}

export const slotKey = (playerId: string, slot: number) => `slot:${playerId}:${slot}`;
export const heldKey = (playerId: string) => `held:${playerId}`;

export function measure(): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  document.querySelectorAll<HTMLElement>('[data-key]').forEach((el) => {
    const r = el.getBoundingClientRect();
    out[el.dataset.key!] = { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  return out;
}

let flightSeq = 0;

/**
 * Turn game events into flights. `prev` = positions before the change, `cur` = after.
 */
export function flightsFor(
  e: GameEvent,
  s: GameState,
  prev: Record<string, Rect>,
  cur: Record<string, Rect>,
  viewerId: string,
  /** Extra wait before a discarded power card drops (so the power can be watched first). */
  discardHold = 0,
  /** Resolves blank (hidden) cards to faces we know, for online games. */
  faceOf: (c: Card) => Card = (c) => c,
): Flight[] {
  const at = (key: string, prefer: 'prev' | 'cur') => (prefer === 'prev' ? prev[key] ?? cur[key] : cur[key] ?? prev[key]);
  const out: Flight[] = [];
  const add = (card: Card | null, faceUp: boolean, fromKey: string, toKey: string, delay: number, dur: number, bounce = false) => {
    const from = at(fromKey, 'prev');
    const to = at(toKey, 'cur');
    if (from && to) out.push({ id: ++flightSeq, card, faceUp, from, to, delay, dur, hideKey: bounce ? fromKey : toKey, bounce });
  };
  const actor = e.actorId ?? '';
  const ref = e.slots?.[0];

  switch (e.kind) {
    case 'draw':
      add(null, false, 'deck', heldKey(actor), 0, 450);
      break;
    case 'swap':
      if (!ref) break;
      // The old card lifts face-up, pauses, then goes to the pile; the new one slides into its place.
      add(e.card ?? null, true, slotKey(ref.playerId, ref.slot), 'discard', 700, 550);
      {
        // You know the card you keep: watch it go into its place face-up.
        const keptRaw = actor === viewerId ? (s.players.find((p) => p.id === actor)?.hand[ref.slot] ?? null) : null;
        const kept = keptRaw ? faceOf(keptRaw) : null;
        add(kept, !!kept, heldKey(actor), slotKey(ref.playerId, ref.slot), 450, 550);
      }
      break;
    case 'takeDiscard': {
      if (!ref) break;
      const takenRaw = s.players.find((p) => p.id === ref.playerId)?.hand[ref.slot] ?? null;
      const taken = takenRaw ? faceOf(takenRaw) : null;
      add(e.card ?? null, true, slotKey(ref.playerId, ref.slot), 'discard', 700, 550);
      add(taken, true, 'discard', slotKey(ref.playerId, ref.slot), 450, 500);
      break;
    }
    case 'discard':
      add(e.card ?? null, true, heldKey(actor), 'discard', 150 + discardHold, 500);
      break;
    case 'snap':
      if (ref) add(e.card ?? null, true, slotKey(ref.playerId, ref.slot), 'discard', 0, 420);
      break;
    case 'snapWrong':
    case 'snapSlow':
      // The card goes towards the pile, gets rejected, and comes back face-up.
      if (ref) add(e.card ?? null, true, slotKey(ref.playerId, ref.slot), 'discard', 0, 1500, true);
      break;
    case 'penalty':
      (e.slots ?? []).forEach((r, i) => add(null, false, 'deck', slotKey(r.playerId, r.slot), 1500 + i * 500, 750));
      for (const f of out) f.penalty = true;
      break;
    case 'power':
      if (e.slots?.length === 2 && e.slots[0].playerId !== e.slots[1].playerId) {
        const [a, b] = e.slots;
        add(null, false, slotKey(a.playerId, a.slot), slotKey(b.playerId, b.slot), 700, 900);
        add(null, false, slotKey(b.playerId, b.slot), slotKey(a.playerId, a.slot), 700, 900);
      }
      break;
  }
  return out;
}

export function FlightView({ f, onDone }: { f: Flight; onDone: (f: Flight) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDone(f);
    };
    const dx = f.to.x - f.from.x;
    const dy = f.to.y - f.from.y;
    const sc = f.to.w / f.from.w;
    const total = f.delay + f.dur;
    const keyframes: Keyframe[] = [{ transform: 'translate(0,0) scale(1)', offset: 0 }];
    if (f.bounce) {
      const near = `translate(${dx * 0.85}px, ${dy * 0.85}px) scale(${sc})`;
      const anim = el.animate(
        [
          { transform: 'translate(0,0) scale(1)', offset: 0, easing: 'ease-out' },
          { transform: near, offset: 0.3 },
          { transform: `${near} translateX(-10px) rotate(-6deg)`, offset: 0.38 },
          { transform: `${near} translateX(10px) rotate(6deg)`, offset: 0.46 },
          { transform: `${near} translateX(-8px) rotate(-4deg)`, offset: 0.54 },
          { transform: near, offset: 0.62, easing: 'ease-in-out' },
          { transform: 'translate(0,0) scale(1)', offset: 1 },
        ],
        { duration: f.dur, fill: 'forwards' },
      );
      anim.onfinish = finish;
      const safety = setTimeout(finish, f.dur + 800);
      return () => {
        clearTimeout(safety);
        anim.cancel();
      };
    }
    if (f.delay) {
      keyframes.push({ transform: 'translate(0,-12px) scale(1.08)', offset: (f.delay * 0.4) / total });
      keyframes.push({ transform: 'translate(0,-12px) scale(1.08)', offset: f.delay / total, easing: 'ease-in-out' });
    } else keyframes[0].easing = 'ease-in-out';
    keyframes.push({ transform: `translate(${dx}px, ${dy}px) scale(${sc})`, offset: 1 });
    const anim = el.animate(keyframes, { duration: total, fill: 'forwards' });
    anim.onfinish = finish;
    const safety = setTimeout(finish, total + 800); // background tabs may pause animations
    return () => {
      clearTimeout(safety);
      anim.cancel();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const style = { left: f.from.x, top: f.from.y, '--cw': `${f.from.w}px` } as CSSProperties;
  return (
    <div ref={ref} className={`flight ${f.bounce ? 'flight--rejected' : ''} ${f.penalty ? 'flight--penalty' : ''}`} style={style}>
      <CardView card={f.card} faceUp={f.faceUp} />
    </div>
  );
}
