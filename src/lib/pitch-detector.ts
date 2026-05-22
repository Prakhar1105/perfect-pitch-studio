/**
 * Mic-based monophonic pitch detector using autocorrelation (ACF2+).
 * Returns frequency in Hz, or -1 when no clear pitch.
 */

const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function freqToMidi(f: number): number {
  return 69 + 12 * Math.log2(f / 440);
}

export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  const name = NOTE_STRINGS[((rounded % 12) + 12) % 12];
  return `${name}${octave}`;
}

export function noteNameToMidi(name: string): number | null {
  // Accepts C4, C#4, Db4 (treat b as flat -> previous sharp)
  const m = name.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const accidental = m[2];
  const octave = parseInt(m[3], 10);
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semis = base[letter];
  if (accidental === "#") semis += 1;
  else if (accidental === "b") semis -= 1;
  return semis + (octave + 1) * 12;
}

/**
 * ACF2+ pitch detection (McLeod-inspired simplified). Returns Hz or -1.
 * Works on buffers of ~1024-2048 samples at typical sample rates.
 */
export function detectPitchACF(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;

  // RMS gate — silence/noise rejection
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  // Trim to where signal exceeds threshold
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  const trimmed = buf.subarray(r1, r2);
  const N = trimmed.length;
  if (N < 32) return -1;

  // Autocorrelation
  const c = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let j = 0; j < N - i; j++) sum += trimmed[j] * trimmed[j + i];
    c[i] = sum;
  }

  // First decline, then peak
  let d = 0;
  while (d < N - 1 && c[d] > c[d + 1]) d++;
  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < N; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }
  if (maxPos <= 0) return -1;

  // Parabolic interpolation for sub-sample accuracy
  let T0 = maxPos;
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? x2;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a !== 0) T0 = T0 - b / (2 * a);

  const freq = sampleRate / T0;
  if (freq < 50 || freq > 2000) return -1;
  return freq;
}

export type MicPitchHandle = {
  stop: () => void;
};

export async function startMicPitch(onPitch: (freqHz: number) => void): Promise<MicPitchHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);
  let raf = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buf);
    const f = detectPitchACF(buf, ctx.sampleRate);
    onPitch(f);
    raf = requestAnimationFrame(tick);
  };
  tick();

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}
