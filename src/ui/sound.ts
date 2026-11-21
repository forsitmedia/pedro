import { getPrefs, subscribe } from './prefs';

/**
 * Small synthesized sound effects (Web Audio, no files to download).
 * Browsers only allow sound after the first tap/click, so the audio context is unlocked then.
 */

export type Sfx = 'burn' | 'draw' | 'place' | 'flip' | 'snap' | 'wrong' | 'penalty' | 'peek' | 'shuffle' | 'swap' | 'pedro' | 'turn';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    const a = audio();
    if (a && a.state !== 'running') void a.resume().then(syncMusic);
    else syncMusic();
  };
  subscribe(() => syncMusic());
  // Quiet when the tab is in the background.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') void ctx.suspend();
    else void ctx.resume();
  });
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

/** A short filtered noise burst: the "fsst" of a card sliding on felt. */
function swish(a: AudioContext, at: number, dur: number, freq: number, gain: number) {
  const src = a.createBufferSource();
  src.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, at);
  f.frequency.exponentialRampToValueAtTime(freq * 0.6, at + dur);
  f.Q.value = 0.9;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(at, Math.random() * 0.3, dur + 0.05);
}

function tone(a: AudioContext, at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

export function play(name: Sfx, delayMs = 0) {
  if (!getPrefs().sound) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const t = a.currentTime + delayMs / 1000;
  switch (name) {
    case 'draw':
      swish(a, t, 0.12, 2400, 0.35);
      break;
    case 'place':
      swish(a, t, 0.09, 1500, 0.4);
      tone(a, t, 180, 0.06, 0.12, 'triangle');
      break;
    case 'flip':
      swish(a, t, 0.06, 3200, 0.3);
      break;
    case 'burn': {
      // Whoosh of flames + crackles + a low thump.
      const src = a.createBufferSource();
      src.buffer = noise;
      const f = a.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(250, t);
      f.frequency.exponentialRampToValueAtTime(3500, t + 0.25);
      f.frequency.exponentialRampToValueAtTime(600, t + 0.8);
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      src.connect(f).connect(g).connect(a.destination);
      src.start(t, 0, 0.45);
      tone(a, t, 110, 0.25, 0.3, 'triangle', 60);
      for (let i = 0; i < 10; i++) swish(a, t + 0.08 + Math.random() * 0.7, 0.015, 2500 + Math.random() * 3000, 0.25);
      break;
    }
    case 'snap':
      swish(a, t, 0.05, 1200, 0.6);
      tone(a, t, 140, 0.09, 0.3, 'triangle');
      tone(a, t + 0.05, 880, 0.12, 0.1);
      tone(a, t + 0.11, 1320, 0.16, 0.1);
      break;
    case 'wrong':
      tone(a, t, 220, 0.18, 0.14, 'square', 160);
      tone(a, t + 0.2, 160, 0.28, 0.14, 'square', 110);
      break;
    case 'penalty':
      for (let i = 0; i < 2; i++) swish(a, t + i * 0.5, 0.12, 1800, 0.3);
      break;
    case 'peek':
      tone(a, t, 660, 0.12, 0.08);
      tone(a, t + 0.1, 990, 0.18, 0.08);
      break;
    case 'shuffle':
      for (let i = 0; i < 9; i++) swish(a, t + i * 0.07, 0.06, 2000 + Math.random() * 1500, 0.22);
      break;
    case 'swap':
      swish(a, t, 0.3, 1800, 0.3);
      tone(a, t, 400, 0.3, 0.06, 'sine', 700);
      break;
    case 'pedro':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, t + i * 0.11, f, i === 3 ? 0.55 : 0.16, 0.16, 'triangle'));
      tone(a, t + 0.33, 523, 0.55, 0.08, 'sawtooth');
      break;
    case 'turn':
      tone(a, t, 880, 0.25, 0.08);
      tone(a, t + 0.12, 1175, 0.35, 0.07);
      break;
  }
}

// ───────────── soft background music ─────────────
// A gentle, endless lounge loop (Cmaj7 · Am7 · Dm7 · G7) generated on the fly.

const BPM = 80;
const EIGHTH = 60 / BPM / 2;
const CHORDS: [number, number[]][] = [
  [48, [64, 67, 71, 72]], // Cmaj7
  [45, [60, 64, 67, 69]], // Am7
  [50, [62, 65, 69, 72]], // Dm7
  [43, [59, 62, 65, 67]], // G7
  [48, [64, 67, 71, 74]], // Cmaj9
  [41, [60, 64, 65, 69]], // Fmaj7
  [50, [62, 65, 69, 72]], // Dm7
  [43, [59, 62, 65, 71]], // G7
];
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

let music: { gain: GainNode; timer: ReturnType<typeof setInterval>; next: number; step: number } | null = null;

function note(a: AudioContext, out: AudioNode, at: number, m: number, dur: number, gain: number, type: OscillatorType, attack = 0.01) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.value = hz(m);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function scheduleStep(a: AudioContext, out: AudioNode, step: number, at: number) {
  const bar = Math.floor(step / 8);
  const beat = step % 8;
  const [bass, tones] = CHORDS[bar % CHORDS.length];
  if (beat === 0) {
    for (const m of tones) note(a, out, at, m, EIGHTH * 8 * 0.98, 0.035, 'sine', 0.5); // pad
  }
  if (beat === 0 || beat === 3 || beat === 6) note(a, out, at, beat === 3 ? bass + 7 : bass, EIGHTH * 2.5, 0.11, 'triangle', 0.02);
  // A light, slightly random melody on top (same every loop of 8 bars).
  const r = Math.sin(step * 12.9898) * 43758.5453;
  const rnd = r - Math.floor(r);
  if (beat !== 0 && rnd < 0.45) {
    const m = tones[Math.floor(rnd * 9) % tones.length] + 12;
    note(a, out, at, m, EIGHTH * 3, 0.03, 'sine', 0.01);
  }
}

function startMusic(a: AudioContext) {
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.6, a.currentTime + 2);
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  gain.connect(lp).connect(a.destination);
  const m = { gain, next: a.currentTime + 0.1, step: 0, timer: 0 as unknown as ReturnType<typeof setInterval> };
  m.timer = setInterval(() => {
    while (m.next < a.currentTime + 0.5) {
      scheduleStep(a, gain, m.step % (8 * CHORDS.length), m.next);
      m.next += EIGHTH;
      m.step++;
    }
  }, 120);
  music = m;
}

function stopMusic(a: AudioContext) {
  if (!music) return;
  const m = music;
  music = null;
  clearInterval(m.timer);
  m.gain.gain.cancelScheduledValues(a.currentTime);
  m.gain.gain.setValueAtTime(m.gain.gain.value, a.currentTime);
  m.gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.6);
  setTimeout(() => m.gain.disconnect(), 1500);
}

/** Start or stop the music to match the player's choice (only once sound is allowed). */
function syncMusic() {
  if (!ctx || ctx.state !== 'running') return;
  if (getPrefs().music && !music) startMusic(ctx);
  else if (!getPrefs().music && music) stopMusic(ctx);
}
