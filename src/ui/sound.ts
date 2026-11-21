import { getPrefs, subscribe, type MusicStyle } from './prefs';

/**
 * Sound effects and background music, synthesized with Web Audio (no files to download).
 * Card sounds are shaped noise (paper rubbing on felt, a card slapping down), not tones.
 * Browsers only allow sound after the first tap/click, so the audio context is unlocked then.
 */

export type Sfx = 'burn' | 'draw' | 'place' | 'flip' | 'snap' | 'wrong' | 'penalty' | 'peek' | 'shuffle' | 'swap' | 'pedro' | 'turn';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let sfxOut: GainNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    noise = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // All effects go through a gentle low-pass and a modest volume: soft, never piercing.
    sfxOut = ctx.createGain();
    sfxOut.gain.value = 0.55;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 4200;
    soften.Q.value = 0.5;
    sfxOut.connect(soften).connect(ctx.destination);
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

/** Filtered noise with an attack/decay envelope — the building block of every card sound. */
function burst(
  a: AudioContext,
  out: AudioNode,
  at: number,
  o: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number; attack: number; decay: number; gain: number },
) {
  const src = a.createBufferSource();
  src.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.freq, at);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, at + o.attack + o.decay);
  f.Q.value = o.q ?? 0.7;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.gain, at + o.attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.attack + o.decay);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random() * 0.5, o.attack + o.decay + 0.05);
}

/** Paper sliding across felt. */
const slide = (a: AudioContext, out: AudioNode, at: number, len = 0.16, gain = 0.22) =>
  burst(a, out, at, { type: 'bandpass', freq: 3200, freqEnd: 1800, q: 0.5, attack: len * 0.4, decay: len * 0.6, gain });

/** A card landing on the table: a crisp slap plus a soft body. */
function slap(a: AudioContext, out: AudioNode, at: number, gain = 0.5) {
  burst(a, out, at, { type: 'bandpass', freq: 1600, q: 0.6, attack: 0.008, decay: 0.07, gain: gain * 0.7 });
  burst(a, out, at, { type: 'lowpass', freq: 380, attack: 0.01, decay: 0.09, gain: gain * 0.6 });
}

/** The quick "tk" of a card's edge being flipped. */
const flick = (a: AudioContext, out: AudioNode, at: number, gain = 0.3) =>
  burst(a, out, at, { type: 'bandpass', freq: 2400, q: 0.8, attack: 0.004, decay: 0.03, gain: gain * 0.7 });

function tone(a: AudioContext, out: AudioNode, at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

export function play(name: Sfx, delayMs = 0) {
  if (!getPrefs().sound) return;
  const a = audio();
  if (!a || a.state !== 'running' || !sfxOut) return;
  const out = sfxOut;
  const t = a.currentTime + delayMs / 1000;
  switch (name) {
    case 'draw':
      slide(a, out, t, 0.18, 0.2);
      break;
    case 'place':
      slide(a, out, t, 0.1, 0.12);
      slap(a, out, t + 0.08, 0.45);
      break;
    case 'flip':
      flick(a, out, t, 0.3);
      flick(a, out, t + 0.03, 0.18);
      break;
    case 'snap':
      // A card thrown down firmly.
      slap(a, out, t, 0.55);
      break;
    case 'burn': {
      slap(a, out, t, 0.5);
      // Flames: a soft whoosh opening up, then a few quiet crackles.
      burst(a, out, t + 0.03, { type: 'lowpass', freq: 250, freqEnd: 2200, attack: 0.22, decay: 0.6, gain: 0.3 });
      for (let i = 0; i < 7; i++) flick(a, out, t + 0.15 + Math.random() * 0.6, 0.05 + Math.random() * 0.08);
      break;
    }
    case 'wrong':
      slap(a, out, t, 0.35);
      tone(a, out, t + 0.05, 330, 0.2, 0.06, 'sine', 247);
      tone(a, out, t + 0.25, 247, 0.32, 0.06, 'sine', 196);
      break;
    case 'penalty':
      for (let i = 0; i < 2; i++) {
        slide(a, out, t + i * 0.5, 0.2, 0.2);
        slap(a, out, t + i * 0.5 + 0.18, 0.35);
      }
      break;
    case 'peek':
      flick(a, out, t, 0.25);
      tone(a, out, t + 0.02, 523, 0.15, 0.035);
      tone(a, out, t + 0.12, 784, 0.22, 0.035);
      break;
    case 'shuffle': {
      // A riffle: fast, slightly irregular clicks speeding up, then the bridge.
      let at = t;
      for (let i = 0; i < 26; i++) {
        flick(a, out, at, 0.08 + Math.random() * 0.06);
        at += 0.035 - i * 0.0006 + Math.random() * 0.008;
      }
      slide(a, out, at, 0.25, 0.18);
      break;
    }
    case 'swap':
      slide(a, out, t, 0.3, 0.2);
      slide(a, out, t + 0.12, 0.3, 0.16);
      slap(a, out, t + 0.45, 0.35);
      break;
    case 'pedro':
      slap(a, out, t, 0.45);
      [523, 659, 784, 1047].forEach((f, i) => tone(a, out, t + 0.05 + i * 0.11, f, i === 3 ? 0.55 : 0.18, 0.08, 'sine'));
      break;
    case 'turn':
      tone(a, out, t, 660, 0.3, 0.05);
      tone(a, out, t + 0.14, 880, 0.4, 0.04);
      break;
  }
}

// ───────────── background music ─────────────
// Generated on the fly in a few styles. Each style loops 8 bars of 8 eighth notes.

interface Style {
  bpm: number;
  chords: [number, number[]][];
  /** Eighths (0-7) with a bass note. */
  bass: number[];
  padGain: number;
  /** Probability of a melody note on each eighth. */
  melody: number;
  melodyType: OscillatorType;
  /** Offbeat chord stabs, for groove. */
  stabs?: number[];
  drums?: { kick: number[]; snare: number[]; hat: number[] };
  volume: number;
}

const STYLES: Record<Exclude<MusicStyle, 'off'>, Style> = {
  // Slow, warm, lots of space.
  chill: {
    bpm: 64,
    chords: [
      [48, [64, 67, 71, 74]],
      [45, [60, 64, 67, 71]],
      [41, [60, 64, 65, 69]],
      [43, [59, 62, 65, 69]],
      [48, [64, 67, 71, 74]],
      [40, [59, 62, 64, 67]],
      [41, [60, 64, 65, 69]],
      [43, [62, 65, 67, 71]],
    ],
    bass: [0],
    padGain: 0.04,
    melody: 0.25,
    melodyType: 'sine',
    volume: 0.6,
  },
  // Easy lounge / bossa feel.
  lounge: {
    bpm: 84,
    chords: [
      [48, [64, 67, 71, 72]],
      [45, [60, 64, 67, 69]],
      [50, [62, 65, 69, 72]],
      [43, [59, 62, 65, 67]],
      [48, [64, 67, 71, 74]],
      [41, [60, 64, 65, 69]],
      [50, [62, 65, 69, 72]],
      [43, [59, 62, 65, 71]],
    ],
    bass: [0, 3, 6],
    padGain: 0.03,
    melody: 0.45,
    melodyType: 'sine',
    stabs: [3, 7],
    drums: { kick: [], snare: [], hat: [2, 6] },
    volume: 0.6,
  },
  // Fast and bright, with a beat.
  upbeat: {
    bpm: 124,
    chords: [
      [41, [65, 69, 72, 76]],
      [43, [67, 71, 74, 79]],
      [45, [64, 69, 72, 76]],
      [40, [64, 67, 71, 76]],
      [41, [65, 69, 72, 77]],
      [43, [67, 71, 74, 77]],
      [36, [64, 67, 72, 76]],
      [43, [62, 67, 71, 74]],
    ],
    bass: [0, 2, 3, 4, 6, 7],
    padGain: 0.015,
    melody: 0.6,
    melodyType: 'triangle',
    stabs: [1, 3, 5, 7],
    drums: { kick: [0, 4], snare: [2, 6], hat: [0, 1, 2, 3, 4, 5, 6, 7] },
    volume: 0.5,
  },
};

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

let music: { style: MusicStyle; gain: GainNode; timer: ReturnType<typeof setInterval>; next: number; step: number } | null = null;

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

function scheduleStep(a: AudioContext, out: AudioNode, st: Style, step: number, at: number) {
  const eighth = 60 / st.bpm / 2;
  const fast = st.bpm > 100;
  const bar = Math.floor(step / 8);
  const beat = step % 8;
  const [bass, tones] = st.chords[bar % st.chords.length];
  if (beat === 0) for (const m of tones) note(a, out, at, m, eighth * 8 * 0.98, st.padGain, 'sine', eighth * 2);
  if (st.bass.includes(beat)) {
    const m = beat === 0 ? bass : beat % 3 === 0 ? bass + 7 : beat % 2 === 0 ? bass + 12 : bass;
    note(a, out, at, m, eighth * (fast ? 0.9 : 2.5), 0.11, 'triangle', 0.015);
  }
  if (st.stabs?.includes(beat)) for (const m of tones.slice(0, 3)) note(a, out, at, m, eighth * 0.7, 0.025, 'triangle', 0.005);
  // A light melody, the same on every loop (pseudo-random from the step number).
  const r = Math.sin((step + 1) * 12.9898) * 43758.5453;
  const rnd = r - Math.floor(r);
  if (beat !== 0 && rnd < st.melody) {
    const m = tones[Math.floor(rnd * 97) % tones.length] + 12;
    note(a, out, at, m, eighth * (fast ? 1.2 : 3), 0.03, st.melodyType, 0.008);
  }
  const d = st.drums;
  if (d) {
    if (d.kick.includes(beat)) tone(a, out, at, 120, 0.18, 0.35, 'sine', 45);
    if (d.snare.includes(beat)) burst(a, out, at, { type: 'bandpass', freq: 1500, q: 0.7, attack: 0.006, decay: 0.12, gain: 0.08 });
    if (d.hat.includes(beat)) burst(a, out, at, { type: 'bandpass', freq: 6000, q: 0.7, attack: 0.004, decay: beat % 2 ? 0.03 : 0.05, gain: fast ? 0.03 : 0.02 });
  }
}

function startMusic(a: AudioContext, style: Exclude<MusicStyle, 'off'>) {
  const st = STYLES[style];
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(st.volume, a.currentTime + 1.5);
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = st.bpm > 100 ? 6000 : 2400;
  gain.connect(lp).connect(a.destination);
  const m = { style, gain, next: a.currentTime + 0.1, step: 0, timer: 0 as unknown as ReturnType<typeof setInterval> };
  m.timer = setInterval(() => {
    while (m.next < a.currentTime + 0.5) {
      scheduleStep(a, gain, st, m.step % (8 * st.chords.length), m.next);
      m.next += 60 / st.bpm / 2;
      m.step++;
    }
  }, 100);
  music = m;
}

function stopMusic(a: AudioContext) {
  if (!music) return;
  const m = music;
  music = null;
  clearInterval(m.timer);
  m.gain.gain.cancelScheduledValues(a.currentTime);
  m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value), a.currentTime);
  m.gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.6);
  setTimeout(() => m.gain.disconnect(), 1500);
}

/** Start, stop or change the music to match the player's choice (only once sound is allowed). */
function syncMusic() {
  if (!ctx || ctx.state !== 'running') return;
  const want = getPrefs().musicStyle;
  if (music && music.style === want) return;
  if (music) stopMusic(ctx);
  if (want !== 'off') startMusic(ctx, want);
}
