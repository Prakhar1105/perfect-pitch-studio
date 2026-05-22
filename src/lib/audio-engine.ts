import * as Tone from "tone";
import type { InstrumentKey } from "@/lib/instruments";

let initialized = false;
let masterVol: Tone.Volume | null = null;
let limiter: Tone.Limiter | null = null;
let analyser: Tone.Analyser | null = null;
let fft: Tone.FFT | null = null;
let contextTuned = false;

export let suppressEvent = false;

export function setSuppressEvent(val: boolean) {
  suppressEvent = val;
}

export function notifyLocalNote(instrumentType: string, note: string) {
  if (!suppressEvent && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("local_note_played", { detail: { instrumentType, note } }));
  }
}

type AnyInst = {
  triggerAttackRelease: (n: string, d: string | number) => void;
  releaseAll?: () => void;
  dispose?: () => void;
};

const cache = new Map<string, AnyInst>();
const loaded = new Map<string, boolean>();

function tuneContextOnce() {
  if (contextTuned) return;
  contextTuned = true;
  try {
    // Low-latency mobile-friendly scheduling
    Tone.getContext().lookAhead = 0.02; // 20ms — tight but reliable on mobile
  } catch { /* noop */ }
}

export async function ensureAudio() {
  tuneContextOnce();
  if (Tone.getContext().state !== "running") {
    try { await Tone.start(); } catch { /* requires user gesture */ }
  }
  if (!initialized) {
    // Master chain: Volume -> Limiter -> Destination (prevents clipping)
    masterVol = new Tone.Volume(-4);
    limiter = new Tone.Limiter(-1);
    masterVol.connect(limiter);
    limiter.toDestination();
    analyser = new Tone.Analyser("waveform", 256);
    fft = new Tone.FFT(64);
    masterVol.connect(analyser);
    masterVol.connect(fft);
    initialized = true;

    // Auto-resume after the OS suspends the tab (mobile lockscreen, tab switch)
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && Tone.getContext().state !== "running") {
          Tone.getContext().resume().catch(() => {});
        }
      });
    }
  }
}

export function getAnalyser() { return analyser; }
export function getFFT() { return fft; }
export function setMasterVolume(db: number) { if (masterVol) masterVol.volume.rampTo(db, 0.05); }
export function setMuted(muted: boolean) { if (masterVol) masterVol.mute = muted; }

function out() { return masterVol ?? Tone.getDestination(); }

/* -------------------------------------------------------------------------- */
/*  Real instrument samplers (with graceful synth fallback)                   */
/* -------------------------------------------------------------------------- */

// Salamander Grand Piano (official Tone.js sample set)
const PIANO_BASE = "https://tonejs.github.io/audio/salamander/";
const PIANO_URLS: Record<string, string> = {
  A1: "A1.mp3", A2: "A2.mp3", A3: "A3.mp3", A4: "A4.mp3",
  A5: "A5.mp3", A6: "A6.mp3", C2: "C2.mp3", C3: "C3.mp3",
  C4: "C4.mp3", C5: "C5.mp3", C6: "C6.mp3",
  "D#3": "Ds3.mp3", "D#4": "Ds4.mp3", "D#5": "Ds5.mp3",
  "F#2": "Fs2.mp3", "F#3": "Fs3.mp3", "F#4": "Fs4.mp3", "F#5": "Fs5.mp3",
};

// nbrosowsky/tonejs-instruments — CDN of real recorded samples
const NBR_BASE = "https://nbrosowsky.github.io/tonejs-instruments/samples/";

function buildSampler(
  key: string,
  baseUrl: string,
  urls: Record<string, string>,
  reverbDecay: number,
  reverbWet: number,
  fallback: () => AnyInst,
): AnyInst {
  if (cache.has(key)) return cache.get(key)!;
  let inst: AnyInst;
  try {
    const sampler = new Tone.Sampler({
      urls,
      baseUrl,
      release: 1.2,
      onload: () => loaded.set(key, true),
      onerror: () => {
        // Swap to fallback on load failure
        const fb = fallback();
        cache.set(key, fb);
      },
    });
    const rev = new Tone.Reverb({ decay: reverbDecay, wet: reverbWet });
    sampler.chain(rev, out());
    inst = {
      triggerAttackRelease: (n, d) => {
        notifyLocalNote(key, String(n));
        if (loaded.get(key)) sampler.triggerAttackRelease(n, d);
        else cache.get(key + ":_fb")?.triggerAttackRelease(n, d);
      },
      releaseAll: () => sampler.releaseAll?.(),
      dispose: () => { sampler.dispose(); rev.dispose(); },
    };
    // Pre-build a synth fallback that fires while samples are still loading
    cache.set(key + ":_fb", fallback());
  } catch {
    inst = fallback();
  }
  cache.set(key, inst);
  return inst;
}

export function getPiano(): AnyInst {
  return buildSampler("piano", PIANO_BASE, PIANO_URLS, 2.2, 0.22, () => {
    const s = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 1.2 },
    });
    const rev = new Tone.Reverb({ decay: 2.2, wet: 0.25 });
    s.chain(rev, out());
    return s as unknown as AnyInst;
  });
}

export function getGuitar(): AnyInst {
  return buildSampler(
    "guitar",
    NBR_BASE + "guitar-acoustic/",
    {
      A2: "A2.mp3", A3: "A3.mp3", A4: "A4.mp3",
      E2: "E2.mp3", E3: "E3.mp3", E4: "E4.mp3",
      D3: "D3.mp3", D4: "D4.mp3",
      G3: "G3.mp3", G4: "G4.mp3",
      B3: "B3.mp3", B4: "B4.mp3",
      C4: "C4.mp3", C5: "C5.mp3",
    },
    1.6,
    0.2,
    () => {
      const rev = new Tone.Reverb({ decay: 1.6, wet: 0.2 });
      rev.connect(out());
      const pool: Tone.PluckSynth[] = [];
      for (let i = 0; i < 8; i++) {
        const p = new Tone.PluckSynth({ attackNoise: 1, dampening: 4000, resonance: 0.85 });
        p.connect(rev);
        pool.push(p);
      }
      let i = 0;
      return {
        triggerAttackRelease: (n, d) => { 
          notifyLocalNote("guitar", String(n));
          pool[i].triggerAttackRelease(n, d); 
          i = (i + 1) % pool.length; 
        },
        dispose: () => pool.forEach((p) => p.dispose()),
      };
    },
  );
}

export function getViolin(): AnyInst {
  return buildSampler(
    "violin",
    NBR_BASE + "violin/",
    {
      A3: "A3.mp3", A4: "A4.mp3", A5: "A5.mp3",
      C4: "C4.mp3", C5: "C5.mp3",
      E4: "E4.mp3", E5: "E5.mp3",
      G3: "G3.mp3", G4: "G4.mp3",
    },
    2.8,
    0.32,
    () => {
      const s = new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 1.5,
        envelope: { attack: 0.25, decay: 0.3, sustain: 0.9, release: 1 },
      });
      const rev = new Tone.Reverb({ decay: 2.8, wet: 0.35 });
      s.chain(rev, out());
      return s as unknown as AnyInst;
    },
  );
}

export function getFlute(): AnyInst {
  return buildSampler(
    "flute",
    NBR_BASE + "flute/",
    {
      A4: "A4.mp3", A5: "A5.mp3", C4: "C4.mp3", C5: "C5.mp3",
      E4: "E4.mp3", E5: "E5.mp3",
    },
    2,
    0.28,
    () => {
      const s = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.15, decay: 0.1, sustain: 0.9, release: 0.6 },
      });
      const rev = new Tone.Reverb({ decay: 2, wet: 0.3 });
      s.chain(rev, out());
      return s as unknown as AnyInst;
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  Sustained Flute Voice — for breath-controlled continuous playing.         */
/*  Uses MonoSynth with attack/release tied to mic breath envelope.           */
/* -------------------------------------------------------------------------- */

type SustainedFlute = {
  start: (note: string) => void;
  setNote: (note: string) => void;
  setBreath: (intensity: number) => void; // 0..1
  stop: () => void;
  dispose: () => void;
};

let _sustainedFlute: SustainedFlute | null = null;

export function getSustainedFlute(): SustainedFlute {
  if (_sustainedFlute) return _sustainedFlute;

  // Airy breath-noise layer
  const noise = new Tone.Noise("pink");
  const noiseFilt = new Tone.Filter({ type: "bandpass", frequency: 2000, Q: 1.2 });
  const noiseGain = new Tone.Gain(0);
  noise.chain(noiseFilt, noiseGain);

  // Tonal body
  const body = new Tone.MonoSynth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.15, decay: 0.1, sustain: 1.0, release: 0.4 },
    filterEnvelope: { attack: 0.2, decay: 0.2, sustain: 0.9, release: 0.4, baseFrequency: 800, octaves: 3 },
  });
  const bodyGain = new Tone.Gain(0);
  body.connect(bodyGain);

  // Subtle vibrato for realism
  const vibrato = new Tone.Vibrato({ frequency: 5.2, depth: 0.04 });
  const reverb = new Tone.Reverb({ decay: 2.4, wet: 0.32 });

  const mixer = new Tone.Gain(0.9);
  bodyGain.connect(mixer);
  noiseGain.connect(mixer);
  mixer.chain(vibrato, reverb, out());

  let started = false;

  _sustainedFlute = {
    start(note: string) {
      if (!started) {
        noise.start();
        started = true;
      }
      notifyLocalNote("flute", note);
      body.triggerAttack(note);
    },
    setNote(note: string) {
      notifyLocalNote("flute", note);
      body.setNote(note);
    },
    setBreath(i: number) {
      const clamped = Math.max(0, Math.min(1, i));
      bodyGain.gain.rampTo(clamped * 0.85, 0.06);
      noiseGain.gain.rampTo(clamped * 0.18, 0.06);
      vibrato.depth.rampTo(0.03 + clamped * 0.05, 0.1);
    },
    stop() {
      body.triggerRelease();
      bodyGain.gain.rampTo(0, 0.15);
      noiseGain.gain.rampTo(0, 0.15);
    },
    dispose() {
      try { noise.stop(); } catch { /* noop */ }
      noise.dispose(); noiseFilt.dispose(); noiseGain.dispose();
      body.dispose(); bodyGain.dispose(); vibrato.dispose(); reverb.dispose(); mixer.dispose();
      _sustainedFlute = null;
    },
  };
  return _sustainedFlute;
}

// Indian classical: keep richly-tuned PluckSynth pool — no clean free sample set
function makePool(key: string, voices: number, factory: () => Tone.PluckSynth, decay: number, wet: number): AnyInst {
  if (cache.has(key)) return cache.get(key)!;
  const rev = new Tone.Reverb({ decay, wet });
  rev.connect(out());
  const pool: Tone.PluckSynth[] = [];
  for (let i = 0; i < voices; i++) {
    const s = factory();
    s.connect(rev);
    pool.push(s);
  }
  let i = 0;
  const inst: AnyInst = {
    triggerAttackRelease: (n, d) => { 
      notifyLocalNote(key, String(n));
      pool[i].triggerAttackRelease(n, d); 
      i = (i + 1) % pool.length; 
    },
    dispose: () => pool.forEach((p) => p.dispose()),
  };
  cache.set(key, inst);
  return inst;
}

export function getSitar() {
  if (cache.has("sitar")) return cache.get("sitar")!;
  // Sitar: bright metallic plucks + sympathetic-string drone shimmer
  const rev = new Tone.Reverb({ decay: 3.4, wet: 0.42 });
  const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 4, depth: 0.5, wet: 0.35 }).start();
  const hp = new Tone.Filter({ type: "highpass", frequency: 180 });
  chorus.chain(hp, rev, out());
  const pool: Tone.PluckSynth[] = [];
  for (let i = 0; i < 10; i++) {
    const p = new Tone.PluckSynth({ attackNoise: 3.2, dampening: 3200, resonance: 0.985 });
    p.connect(chorus);
    pool.push(p);
  }
  let i = 0;
  const inst: AnyInst = {
    triggerAttackRelease: (n, d) => {
      notifyLocalNote("sitar", String(n));
      pool[i].triggerAttackRelease(n, d);
      i = (i + 1) % pool.length;
    },
    dispose: () => pool.forEach((p) => p.dispose()),
  };
  cache.set("sitar", inst);
  return inst;
}
export function getVeena() {
  if (cache.has("veena")) return cache.get("veena")!;
  // Veena: warmer, woodier than sitar — softer attack, lower dampening
  const rev = new Tone.Reverb({ decay: 3.8, wet: 0.46 });
  const lp = new Tone.Filter({ type: "lowpass", frequency: 3200, Q: 0.7 });
  lp.chain(rev, out());
  const pool: Tone.PluckSynth[] = [];
  for (let i = 0; i < 10; i++) {
    const p = new Tone.PluckSynth({ attackNoise: 1.4, dampening: 1600, resonance: 0.99 });
    p.connect(lp);
    pool.push(p);
  }
  let i = 0;
  const inst: AnyInst = {
    triggerAttackRelease: (n, d) => {
      notifyLocalNote("veena", String(n));
      pool[i].triggerAttackRelease(n, d);
      i = (i + 1) % pool.length;
    },
    dispose: () => pool.forEach((p) => p.dispose()),
  };
  cache.set("veena", inst);
  return inst;
}

export function triggerDrum(pad: "kick" | "snare" | "hat" | "tom") {
  const k = `drum-${pad}`;
  if (!cache.has(k)) {
    let inst: AnyInst;
    if (pad === "kick") {
      const s = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 6 });
      s.connect(out());
      inst = { triggerAttackRelease: (n, d) => s.triggerAttackRelease(n, d), dispose: () => s.dispose() };
    } else if (pad === "tom") {
      const s = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 3 });
      s.connect(out());
      inst = { triggerAttackRelease: (n, d) => s.triggerAttackRelease(n, d), dispose: () => s.dispose() };
    } else if (pad === "snare") {
      const s = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } });
      s.connect(out());
      inst = { triggerAttackRelease: (_n, d) => s.triggerAttackRelease(d), dispose: () => s.dispose() };
    } else {
      const s = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.1, release: 0.05 }, harmonicity: 5.1, resonance: 4000 });
      s.connect(out());
      inst = { triggerAttackRelease: (n, d) => s.triggerAttackRelease(n, d), dispose: () => s.dispose() };
    }
    cache.set(k, inst);
  }
  const inst = cache.get(k)!;
  notifyLocalNote("drums", pad);
  if (pad === "kick") inst.triggerAttackRelease("C2", "8n");
  else if (pad === "tom") inst.triggerAttackRelease("A2", "8n");
  else if (pad === "snare") inst.triggerAttackRelease("C2", "16n");
  else inst.triggerAttackRelease("C5", "32n");
}

export function disposeAll() {
  cache.forEach((s) => s.dispose?.());
  cache.clear();
  loaded.clear();
}

/* -------------------------------------------------------------------------- */
/*  Preloader — fetches sample URLs in parallel and reports progress.         */
/*  Browser cache means Tone.Sampler reuses the same downloads instantly.     */
/* -------------------------------------------------------------------------- */

const PRELOAD_REGISTRY: Partial<Record<InstrumentKey, { base: string; urls: string[]; warm: () => void }>> = {
  Piano: {
    base: PIANO_BASE,
    urls: Object.values(PIANO_URLS),
    warm: () => getPiano(),
  },
  Guitar: {
    base: NBR_BASE + "guitar-acoustic/",
    urls: ["A2.mp3","A3.mp3","A4.mp3","E2.mp3","E3.mp3","E4.mp3","D3.mp3","D4.mp3","G3.mp3","G4.mp3","B3.mp3","B4.mp3","C4.mp3","C5.mp3"],
    warm: () => getGuitar(),
  },
  Violin: {
    base: NBR_BASE + "violin/",
    urls: ["A3.mp3","A4.mp3","A5.mp3","C4.mp3","C5.mp3","E4.mp3","E5.mp3","G3.mp3","G4.mp3"],
    warm: () => getViolin(),
  },
  Flute: {
    base: NBR_BASE + "flute/",
    urls: ["A4.mp3","A5.mp3","C4.mp3","C5.mp3","E4.mp3","E5.mp3"],
    warm: () => getFlute(),
  },
};

const preloadCache = new Map<InstrumentKey, Promise<void>>();

export function preloadInstrument(
  kind: InstrumentKey,
  onProgress?: (ratio: number, loaded: number, total: number) => void,
): Promise<void> {
  const cfg = PRELOAD_REGISTRY[kind];
  if (!cfg) {
    // No remote samples (Sitar, Veena, Drums) — instant ready
    onProgress?.(1, 0, 0);
    return Promise.resolve();
  }
  // Kick off Tone.Sampler instantiation so it can ingest the cached bytes.
  cfg.warm();

  if (preloadCache.has(kind)) {
    const cached = preloadCache.get(kind)!;
    // Replay completion for late subscribers
    cached.then(() => onProgress?.(1, cfg.urls.length, cfg.urls.length));
    return cached;
  }

  const total = cfg.urls.length;
  let done = 0;
  const p = Promise.all(
    cfg.urls.map((u) =>
      fetch(cfg.base + u, { cache: "force-cache" })
        .then((r) => r.arrayBuffer())
        .catch(() => null)
        .finally(() => {
          done++;
          onProgress?.(done / total, done, total);
        }),
    ),
  ).then(async () => {
    // Wait for Tone to finish decoding all buffers
    await Tone.loaded();
  });
  preloadCache.set(kind, p);
  return p;
}
