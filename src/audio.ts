// Synthesized terminal SFX. No audio files ship — every cue is a short
// oscillator envelope built on the Web Audio API, which keeps the build
// asset-free and on theme with the game's deterministic, command-line look.
// The context is created lazily and resumed from the first user gesture
// (browsers block audio until then); every call is a no-op before unlock and
// while muted. None of this touches the simulation, so determinism is intact.

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function context(): AudioContext | null {
  if (ac) return ac;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ac = new Ctor();
    master = ac.createGain();
    master.gain.value = 0.42;
    master.connect(ac.destination);
  } catch {
    ac = null;
  }
  return ac;
}

interface Blip {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  sweepTo?: number; // glide the pitch to this frequency over `dur`
  attack?: number;
  delay?: number; // start offset, in seconds
}

/** Play one oscillator with a quick percussive attack/decay envelope. */
function blip(b: Blip): void {
  const c = context();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + (b.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = b.type ?? 'square';
  osc.frequency.setValueAtTime(b.freq, t0);
  if (b.sweepTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, b.sweepTo), t0 + b.dur);
  }
  const peak = b.gain ?? 0.3;
  const atk = b.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + b.dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + b.dur + 0.03);
}

/** Play `freqs` as a quick staggered arpeggio — used for the result stingers. */
function arp(freqs: number[], step: number, base: Partial<Blip>): void {
  freqs.forEach((freq, i) => blip({ freq, dur: step * 1.6, delay: i * step, ...base }));
}

export const sfx = {
  boot(): void {
    blip({ freq: 160, sweepTo: 640, dur: 0.38, type: 'sawtooth', gain: 0.16 });
    blip({ freq: 880, dur: 0.13, type: 'square', gain: 0.12, delay: 0.34 });
  },
  tool(): void {
    blip({ freq: 420, dur: 0.04, type: 'square', gain: 0.1 });
  },
  place(): void {
    blip({ freq: 300, dur: 0.05, type: 'square', gain: 0.18 });
    blip({ freq: 620, dur: 0.06, type: 'square', gain: 0.13, delay: 0.045 });
  },
  wire(): void {
    blip({ freq: 520, dur: 0.06, type: 'triangle', gain: 0.18 });
    blip({ freq: 784, dur: 0.07, type: 'triangle', gain: 0.15, delay: 0.05 });
  },
  pick(): void {
    blip({ freq: 660, dur: 0.04, type: 'triangle', gain: 0.12 });
  },
  reject(): void {
    blip({ freq: 200, sweepTo: 110, dur: 0.2, type: 'square', gain: 0.2 });
  },
  remove(): void {
    blip({ freq: 360, sweepTo: 150, dur: 0.13, type: 'square', gain: 0.16 });
  },
  run(): void {
    arp([330, 440, 660], 0.07, { type: 'square', gain: 0.16, dur: 0.1 });
  },
  tick(): void {
    blip({ freq: 1200, dur: 0.025, type: 'square', gain: 0.04 });
  },
  pause(): void {
    blip({ freq: 420, sweepTo: 240, dur: 0.09, type: 'square', gain: 0.12 });
  },
  resume(): void {
    blip({ freq: 280, sweepTo: 460, dur: 0.09, type: 'square', gain: 0.12 });
  },
  overload(): void {
    blip({ freq: 240, sweepTo: 180, dur: 0.11, type: 'sawtooth', gain: 0.16 });
  },
  pass(): void {
    arp([523.25, 659.25, 783.99], 0.1, { type: 'triangle', gain: 0.18 });
  },
  gold(): void {
    arp([523.25, 659.25, 783.99, 1046.5], 0.09, { type: 'triangle', gain: 0.2 });
    blip({ freq: 1318.51, dur: 0.55, type: 'triangle', gain: 0.12, delay: 0.42 });
  },
  fail(): void {
    arp([440, 349.23, 261.63], 0.12, { type: 'sawtooth', gain: 0.16 });
  },
};

/** Resume the context — must be called from within a user gesture. */
export function unlock(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume();
}

export function isMuted(): boolean {
  return muted;
}

/** Flip mute and return the new state. Unmuting also re-arms the context. */
export function toggleMuted(): boolean {
  muted = !muted;
  if (!muted) unlock();
  return muted;
}
