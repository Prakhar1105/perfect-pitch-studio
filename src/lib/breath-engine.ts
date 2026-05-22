/**
 * Breath detection engine — uses the device microphone to detect airflow
 * (not voice). Returns a smoothed 0..1 "breath" intensity by emphasising the
 * broadband high-frequency noise that characterises blown air, while
 * suppressing low-frequency speech/room rumble.
 */

export type BreathState = {
  intensity: number; // smoothed 0..1
  raw: number;       // instantaneous 0..1
  active: boolean;   // crossed the threshold
};

export type BreathHandle = {
  stop: () => void;
  isActive: () => boolean;
};

export type BreathOptions = {
  threshold?: number;        // 0..1, activation floor
  smoothing?: number;        // 0..1, low-pass coefficient (higher = smoother)
  onUpdate: (s: BreathState) => void;
};

let sharedStream: MediaStream | null = null;
let sharedCtx: AudioContext | null = null;

async function getStream(): Promise<MediaStream> {
  if (sharedStream) return sharedStream;
  sharedStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });
  return sharedStream;
}

export async function startBreathDetection(opts: BreathOptions): Promise<BreathHandle> {
  const threshold = opts.threshold ?? 0.08;
  const smoothing = opts.smoothing ?? 0.7;

  const stream = await getStream();
  // Re-use a single AudioContext to avoid mobile "too many contexts" errors
  if (!sharedCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    sharedCtx = new Ctx();
  }
  const ctx = sharedCtx;
  if (ctx.state !== "running") {
    try { await ctx.resume(); } catch { /* noop */ }
  }

  const source = ctx.createMediaStreamSource(stream);
  // High-pass to kill room rumble / vocal fundamentals (speech ~85–255 Hz).
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1200;
  hp.Q.value = 0.7;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.4;

  source.connect(hp);
  hp.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);
  let smoothed = 0;
  let raf = 0;
  let stopped = false;
  let active = false;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buf);
    // RMS of high-passed signal — proxy for airflow noise energy
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    // Map to 0..1 with a sensitivity curve. Breath RMS post-HP typically ~0.005–0.15
    const raw = Math.max(0, Math.min(1, (rms - 0.005) * 8));
    smoothed = smoothed * smoothing + raw * (1 - smoothing);
    const wasActive = active;
    active = smoothed > threshold;
    opts.onUpdate({ intensity: smoothed, raw, active });
    // Optional logging suppressed to avoid console spam
    if (!wasActive && active) { /* attack edge */ }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      try { source.disconnect(); hp.disconnect(); analyser.disconnect(); } catch { /* noop */ }
    },
    isActive: () => active,
  };
}

export function releaseBreathResources() {
  if (sharedStream) {
    sharedStream.getTracks().forEach((t) => t.stop());
    sharedStream = null;
  }
}
