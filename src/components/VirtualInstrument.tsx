import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, Minimize2, Mic, MicOff } from "lucide-react";
import {
  ensureAudio,
  getPiano,
  getGuitar,
  getViolin,
  getFlute,
  getSustainedFlute,
  getSitar,
  getVeena,
  triggerDrum,
  preloadInstrument,
  getFFT,
} from "@/lib/audio-engine";
import { startBreathDetection, type BreathHandle } from "@/lib/breath-engine";
import type { InstrumentKey } from "@/lib/instruments";

/* -------------------------------------------------------------------------- */
/*  helpers                                                                   */
/* -------------------------------------------------------------------------- */

function useActive() {
  const [active, setActive] = useState<Set<string>>(new Set());
  const on = (k: string) => setActive((s) => (s.has(k) ? s : new Set(s).add(k)));
  const off = (k: string) =>
    setActive((s) => {
      if (!s.has(k)) return s;
      const n = new Set(s);
      n.delete(k);
      return n;
    });
  return { active, on, off };
}


function vibrate(ms = 8) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* noop */
    }
  }
}

function emitNote(note: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("vinst:note", { detail: { note } }));
}


/* -------------------------------------------------------------------------- */
/*  PIANO – 2 octaves, multitouch, keyboard shortcuts, sustain                */
/* -------------------------------------------------------------------------- */

const PIANO_OCTAVES = [4, 5] as const;
const WHITE_KEYS = ["C", "D", "E", "F", "G", "A", "B"];
const BLACK_AFTER = new Set(["C", "D", "F", "G", "A"]);
const KB_MAP = "awsedftgyhujkolp;'".split("");

type PianoKey = { note: string; black: boolean; shortcut?: string };

function buildPianoKeys(): PianoKey[] {
  const keys: PianoKey[] = [];
  let shortcutIdx = 0;
  for (const oct of PIANO_OCTAVES) {
    for (const w of WHITE_KEYS) {
      keys.push({ note: `${w}${oct}`, black: false, shortcut: KB_MAP[shortcutIdx++] });
      if (BLACK_AFTER.has(w)) {
        keys.push({ note: `${w}#${oct}`, black: true, shortcut: KB_MAP[shortcutIdx++] });
      }
    }
  }
  keys.push({ note: `C${PIANO_OCTAVES[PIANO_OCTAVES.length - 1] + 1}`, black: false, shortcut: KB_MAP[shortcutIdx] });
  return keys;
}

const Piano = memo(function Piano({ sustain }: { sustain: boolean }) {
  const { active, on, off } = useActive();
  const keys = useMemo(buildPianoKeys, []);
  const whites = keys.filter((k) => !k.black);

  const play = useCallback(
    async (note: string) => {
      await ensureAudio();
      getPiano().triggerAttackRelease(note, sustain ? "2n" : "8n");
      emitNote(note);
      vibrate(6);
      on(note);
      window.setTimeout(() => off(note), sustain ? 600 : 220);
    },
    [sustain, on, off],
  );


  useEffect(() => {
    const map = new Map<string, string>();
    keys.forEach((k) => k.shortcut && map.set(k.shortcut, k.note));
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const n = map.get(e.key.toLowerCase());
      if (n) play(n);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [keys, play]);

  const whiteIndex = (i: number) => keys.slice(0, i).filter((k) => !k.black).length;

  // Per-finger tracking — enables glissando + true two-hand chords on mobile
  const fingerNote = useRef<Map<number, string>>(new Map());

  const hitFromPoint = useCallback(
    (pointerId: number, x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const k = el?.closest<HTMLElement>("[data-piano-key]");
      if (!k) return;
      const note = k.dataset.note!;
      if (fingerNote.current.get(pointerId) === note) return;
      fingerNote.current.set(pointerId, note);
      play(note);
    },
    [play],
  );

  return (
    <div className="w-full overflow-x-auto pb-2" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
      <div
        className="relative mx-auto select-none"
        style={{ width: `${whites.length * 48}px`, minWidth: "100%", touchAction: "none" }}
        onPointerDown={(e) => hitFromPoint(e.pointerId, e.clientX, e.clientY)}
        onPointerMove={(e) => {
          if (!fingerNote.current.has(e.pointerId)) return;
          hitFromPoint(e.pointerId, e.clientX, e.clientY);
        }}
        onPointerUp={(e) => fingerNote.current.delete(e.pointerId)}
        onPointerCancel={(e) => fingerNote.current.delete(e.pointerId)}
        onPointerLeave={(e) => fingerNote.current.delete(e.pointerId)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* whites */}
        <div className="flex gap-[2px]">
          {whites.map((k) => (
            <div
              key={k.note}
              data-piano-key="1"
              data-note={k.note}
              className={`relative flex-1 h-40 sm:h-48 rounded-b-xl border border-border bg-gradient-to-b from-white to-zinc-200 text-zinc-700 font-semibold transition-transform duration-75 cursor-pointer ${
                active.has(k.note) ? "translate-y-1 from-zinc-200 to-zinc-300 shadow-[inset_0_4px_12px_rgba(0,0,0,0.25)]" : ""
              }`}
              style={{ minWidth: 42 }}
            >
              <span className="absolute bottom-1.5 left-0 right-0 text-[10px] opacity-50 text-center pointer-events-none">{k.note}</span>
            </div>
          ))}
        </div>
        {/* blacks overlay */}
        <div className="absolute top-0 left-0 right-0 h-24 sm:h-28 pointer-events-none">
          {keys.map((k, i) => {
            if (!k.black) return null;
            const wIdx = whiteIndex(i);
            const left = (wIdx / whites.length) * 100;
            return (
              <div
                key={k.note}
                data-piano-key="1"
                data-note={k.note}
                className={`pointer-events-auto absolute -translate-x-1/2 h-24 sm:h-28 w-7 sm:w-8 rounded-b-lg text-[9px] font-medium transition-transform duration-75 cursor-pointer ${
                  active.has(k.note)
                    ? "translate-y-1 bg-gradient-to-b from-zinc-700 to-black neon-border"
                    : "bg-gradient-to-b from-zinc-900 to-black text-zinc-400"
                }`}
                style={{ left: `${left}%` }}
              >
                <span className="absolute bottom-1 left-0 right-0 text-center pointer-events-none">{k.note.replace(/\d/, "")}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 text-center text-[11px] text-muted-foreground">
        Tap, slide for glissando, or use keys <kbd className="px-1 rounded bg-white/10">A S D F G H J K L</kbd>
      </div>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  GUITAR / SITAR / VEENA / VIOLIN – pluckable fretboard                     */
/* -------------------------------------------------------------------------- */

type StringDef = { open: string; label: string };

const GUITAR_TUNING: StringDef[] = [
  { open: "E2", label: "E" },
  { open: "A2", label: "A" },
  { open: "D3", label: "D" },
  { open: "G3", label: "G" },
  { open: "B3", label: "B" },
  { open: "E4", label: "e" },
];

const VIOLIN_TUNING: StringDef[] = [
  { open: "G3", label: "G" },
  { open: "D4", label: "D" },
  { open: "A4", label: "A" },
  { open: "E5", label: "E" },
];

const SITAR_TUNING: StringDef[] = [
  { open: "C3", label: "Sa" },
  { open: "G3", label: "Pa" },
  { open: "C4", label: "Sa'" },
  { open: "F4", label: "Ma" },
  { open: "A4", label: "Dha" },
  { open: "C5", label: "Sa''" },
];

const VEENA_TUNING: StringDef[] = [
  { open: "C3", label: "Sa" },
  { open: "F3", label: "Ma" },
  { open: "G3", label: "Pa" },
  { open: "C4", label: "Sa'" },
];

const NOTE_ORDER = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function noteAt(open: string, fret: number): string {
  const m = /^([A-G]#?)(\d)$/.exec(open);
  if (!m) return open;
  const idx = NOTE_ORDER.indexOf(m[1]);
  const oct = parseInt(m[2], 10);
  const total = idx + fret;
  const newIdx = ((total % 12) + 12) % 12;
  const newOct = oct + Math.floor(total / 12);
  return `${NOTE_ORDER[newIdx]}${newOct}`;
}

const Fretboard = memo(function Fretboard({
  tuning,
  get,
  frets = 5,
  flavor = "guitar",
}: {
  tuning: StringDef[];
  get: () => { triggerAttackRelease: (n: string, d: string) => void };
  frets?: number;
  flavor?: "guitar" | "sitar" | "veena" | "violin";
}) {
  const { active, on, off } = useActive();
  const pluck = useCallback(
    async (key: string, note: string, duration: string) => {
      await ensureAudio();
      get().triggerAttackRelease(note, duration);
      emitNote(note);
      vibrate(10);
      on(key);
      window.setTimeout(() => off(key), 800);
    },
    [get, on, off],
  );


  const strumAll = useCallback(async () => {
    await ensureAudio();
    const inst = get();
    tuning.forEach((s, i) => {
      const key = `strum-${s.open}`;
      window.setTimeout(() => {
        inst.triggerAttackRelease(s.open, "2n");
        emitNote(s.open);
        on(key);
        window.setTimeout(() => off(key), 600);
      }, i * 35);
    });
    vibrate(18);
  }, [get, tuning, on, off]);


  const duration = flavor === "sitar" || flavor === "veena" ? "1n" : flavor === "violin" ? "2n" : "2n";
  const accent =
    flavor === "sitar"
      ? "from-amber-400 to-rose-500"
      : flavor === "veena"
        ? "from-amber-300 to-orange-500"
        : flavor === "violin"
          ? "from-rose-300 to-fuchsia-500"
          : "from-cyan-300 to-fuchsia-400";

  // Per-finger tracking: each active pointer remembers its last cell + string,
  // so simultaneous fingers (chord pressing + strumming) never interfere.
  const fingerCell = useRef<Map<number, string>>(new Map());
  const fingerString = useRef<Map<number, string>>(new Map());

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const cell = el?.closest<HTMLElement>("[data-fret-cell]");
      if (!cell) return;
      const key = cell.dataset.cellKey!;
      const note = cell.dataset.note!;
      const stringId = cell.dataset.stringId!;
      fingerCell.current.set(e.pointerId, key);
      fingerString.current.set(e.pointerId, stringId);
      pluck(key, note, duration);
    },
    [pluck, duration],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only react to fingers actually pressed down on this surface
      if (!fingerCell.current.has(e.pointerId)) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const cell = el?.closest<HTMLElement>("[data-fret-cell]");
      if (!cell) return;
      const key = cell.dataset.cellKey!;
      const note = cell.dataset.note!;
      const stringId = cell.dataset.stringId!;
      const prevKey = fingerCell.current.get(e.pointerId);
      const prevString = fingerString.current.get(e.pointerId);
      // Re-trigger when this finger crosses to a new string (strum) or a new fret on its string.
      if (prevKey === key) return;
      fingerCell.current.set(e.pointerId, key);
      fingerString.current.set(e.pointerId, stringId);
      // Avoid double-triggering the SAME cell another finger just hit.
      pluck(key, note, prevString !== stringId ? duration : duration);
    },
    [pluck, duration],
  );

  const releaseFinger = (e: React.PointerEvent<HTMLDivElement>) => {
    fingerCell.current.delete(e.pointerId);
    fingerString.current.delete(e.pointerId);
  };

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Tap or swipe across strings to strum</div>
        <button
          onClick={strumAll}
          className="text-xs glass rounded-full px-3 py-1.5 hover:bg-black/5 transition active:scale-95"
        >
          Strum all
        </button>
      </div>
      <div
        className="rounded-2xl glass-strong p-3 sm:p-4 overflow-x-auto"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releaseFinger}
        onPointerCancel={releaseFinger}
        onPointerLeave={releaseFinger}
      >
        <div className="min-w-[480px]">
          {tuning.map((s) => (
            <div key={s.open} className="flex items-center gap-1 sm:gap-1.5 h-12 sm:h-14 relative">
              <div className="w-7 sm:w-8 shrink-0 text-[11px] font-semibold text-muted-foreground text-center">
                {s.label}
              </div>
              {/* string line behind buttons */}
              <div className="absolute left-9 right-0 top-1/2 h-px bg-white/20" />
              {Array.from({ length: frets + 1 }).map((_, fret) => {
                const note = noteAt(s.open, fret);
                const key = `${s.open}-${fret}`;
                const isActive = active.has(key);
                return (
                  <div
                    key={key}
                    data-fret-cell="1"
                    data-note={note}
                    data-cell-key={key}
                    data-string-id={s.open}
                    className={`relative z-10 flex-1 h-9 sm:h-10 rounded-md border border-white/10 text-[10px] font-medium transition-all grid place-items-center cursor-pointer select-none ${
                      fret === 0 ? "bg-white/5" : "bg-white/[0.03] hover:bg-white/10"
                    } ${isActive ? "scale-[0.97]" : ""}`}
                  >
                    {/* vibration glow */}
                    {isActive && (
                      <motion.span
                        initial={{ opacity: 0.9, scaleX: 1 }}
                        animate={{ opacity: 0, scaleX: 1.15 }}
                        transition={{ duration: 0.6 }}
                        className={`absolute inset-0 rounded-md bg-gradient-to-r ${accent} opacity-60 pointer-events-none`}
                      />
                    )}
                    <span className="relative opacity-70 pointer-events-none">{note}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  DRUMS – 6 pads with ripple + beat dot                                     */
/* -------------------------------------------------------------------------- */

const DRUM_PADS = [
  { id: "kick", label: "Kick", key: "Z" },
  { id: "snare", label: "Snare", key: "X" },
  { id: "hat", label: "Hi-Hat", key: "C" },
  { id: "tom", label: "Tom", key: "V" },
  { id: "kick", label: "Kick 2", key: "B", alt: true },
  { id: "hat", label: "Crash", key: "N", alt: true },
] as const;

const Drums = memo(function Drums() {
  const { active, on, off } = useActive();
  const [pulse, setPulse] = useState(0);
  const [velocities, setVelocities] = useState<Record<string, number>>({});
  const lastHit = useRef<Record<string, number>>({});

  const hit = useCallback(
    async (id: "kick" | "snare" | "hat" | "tom", key: string) => {
      await ensureAudio();
      const now = performance.now();
      const dt = now - (lastHit.current[key] ?? 0);
      lastHit.current[key] = now;
      // closer hits = higher velocity (visual only)
      const v = Math.max(0.5, Math.min(1.4, 1.4 - Math.min(700, dt) / 700));
      setVelocities((s) => ({ ...s, [key]: v }));
      triggerDrum(id);
      vibrate(Math.round(8 + v * 8));
      on(key);
      setPulse((p) => p + 1);
      window.setTimeout(() => off(key), 160);
    },
    [on, off],
  );

  useEffect(() => {
    const map: Record<string, { id: "kick" | "snare" | "hat" | "tom"; key: string }> = {};
    DRUM_PADS.forEach((p) => (map[p.key.toLowerCase()] = { id: p.id, key: p.key }));
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const m = map[e.key.toLowerCase()];
      if (m) hit(m.id, m.key);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [hit]);

  return (
    <div className="space-y-3 py-2">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {DRUM_PADS.map((p) => {
          const isActive = active.has(p.key);
          const v = velocities[p.key] ?? 1;
          return (
            <button
              key={p.key}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
                hit(p.id, p.key);
              }}
              onPointerEnter={(e) => {
                if (e.buttons > 0) hit(p.id, p.key);
              }}
              style={{ touchAction: "none" }}
              className={`relative aspect-square rounded-2xl glass-strong grid place-items-center font-semibold transition-transform overflow-hidden ${
                isActive ? "neon-border scale-[0.96]" : ""
              }`}
            >
              {isActive && (
                <>
                  <motion.span
                    initial={{ scale: 0, opacity: 0.7 * v }}
                    animate={{ scale: 1.6 + v * 0.5, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0 rounded-2xl bg-[image:var(--gradient-neon)]"
                  />
                  <motion.span
                    initial={{ scale: 0.5, opacity: 0.9 }}
                    animate={{ scale: 1 + v * 0.3, opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="absolute inset-2 rounded-2xl border-2 border-white/60"
                  />
                </>
              )}
              <div className="relative text-center">
                <div className="text-sm sm:text-base">{p.label}</div>
                <kbd className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">
                  {p.key}
                </kbd>
              </div>
            </button>
          );
        })}
      </div>
      {/* beat dot */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
        <motion.span
          key={pulse}
          initial={{ scale: 1.6, opacity: 1 }}
          animate={{ scale: 1, opacity: 0.4 }}
          transition={{ duration: 0.25 }}
          className="h-2 w-2 rounded-full bg-[image:var(--gradient-neon)]"
        />
        Live beat
      </div>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  FLUTE – hole combinations produce different notes                         */
/* -------------------------------------------------------------------------- */

// Each pattern of covered holes (top to bottom) → note
const FLUTE_FINGERINGS: { holes: boolean[]; note: string }[] = [
  { holes: [true, true, true, true, true, true], note: "C5" },
  { holes: [true, true, true, true, true, false], note: "D5" },
  { holes: [true, true, true, true, false, false], note: "E5" },
  { holes: [true, true, true, false, false, false], note: "F5" },
  { holes: [true, true, false, false, false, false], note: "G5" },
  { holes: [true, false, false, false, false, false], note: "A5" },
  { holes: [false, false, false, false, false, false], note: "B5" },
];

const Flute = memo(function Flute() {
  const [covered, setCovered] = useState<boolean[]>([false, false, false, false, false, false]);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(0);
  const breathRef = useRef<BreathHandle | null>(null);
  const blowingRef = useRef(false);

  const currentNote = useMemo(() => {
    const match = FLUTE_FINGERINGS.find((f) => f.holes.every((v, i) => v === covered[i]));
    return match?.note ?? "C6";
  }, [covered]);

  // Multitouch: pointer down/up on each hole
  const setHole = useCallback((i: number, v: boolean) => {
    setCovered((c) => {
      if (c[i] === v) return c;
      const n = [...c];
      n[i] = v;
      return n;
    });
  }, []);

  // Keep sustained-flute note in sync when fingering changes mid-blow
  useEffect(() => {
    if (blowingRef.current) {
      try { getSustainedFlute().setNote(currentNote); } catch { /* noop */ }
    }
  }, [currentNote]);

  const enableMic = useCallback(async () => {
    try {
      setMicError(null);
      await ensureAudio();
      // Warm up sustained flute voice (silent)
      getSustainedFlute().setBreath(0);
      const handle = await startBreathDetection({
        threshold: 0.08,
        smoothing: 0.65,
        onUpdate: ({ intensity, active }) => {
          setIntensity(intensity);
          const flute = getSustainedFlute();
          if (active && !blowingRef.current) {
            blowingRef.current = true;
            flute.start(currentNote);
            vibrate(8);
          } else if (!active && blowingRef.current) {
            blowingRef.current = false;
            flute.stop();
          }
          flute.setBreath(active ? intensity : 0);
        },
      });
      breathRef.current = handle;
      setMicOn(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Microphone unavailable";
      setMicError(msg.includes("denied") || msg.includes("Permission") ? "Microphone permission denied" : msg);
      setMicOn(false);
    }
  }, [currentNote]);

  const disableMic = useCallback(() => {
    breathRef.current?.stop();
    breathRef.current = null;
    if (blowingRef.current) {
      blowingRef.current = false;
      try { getSustainedFlute().stop(); } catch { /* noop */ }
    }
    setMicOn(false);
    setIntensity(0);
  }, []);

  useEffect(() => () => { breathRef.current?.stop(); try { getSustainedFlute().stop(); } catch { /* noop */ } }, []);

  // Tap-to-play fallback (no mic)
  const tapPlay = useCallback(async () => {
    await ensureAudio();
    getFlute().triggerAttackRelease(currentNote, "2n");
    emitNote(currentNote);
    vibrate(12);
  }, [currentNote]);


  const pct = Math.round(intensity * 100);
  const glow = Math.min(1, intensity * 1.4);

  return (
    <div className="py-4 space-y-4" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
      {/* Flute body with finger holes */}
      <div className="relative mx-auto max-w-xl">
        <div
          className="h-16 sm:h-20 rounded-full bg-gradient-to-r from-amber-200/40 via-amber-100/20 to-amber-200/40 glass-strong flex items-center justify-around px-8 sm:px-12 relative overflow-hidden"
          style={{ boxShadow: micOn ? `0 0 ${20 + glow * 60}px hsl(var(--primary) / ${0.2 + glow * 0.5})` : undefined }}
        >
          {covered.map((c, i) => (
            <button
              key={i}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setHole(i, true); }}
              onPointerUp={() => setHole(i, false)}
              onPointerCancel={() => setHole(i, false)}
              onPointerLeave={(e) => { if (e.buttons) setHole(i, false); }}
              className={`h-9 w-9 sm:h-11 sm:w-11 rounded-full border-2 transition-all touch-none ${
                c ? "bg-[image:var(--gradient-neon)] border-white/40 neon-border scale-95" : "bg-background border-border"
              }`}
              aria-label={`Hole ${i + 1}`}
            />
          ))}
        </div>
        {/* Airflow trail — reactive to breath intensity */}
        <AnimatePresence>
          {micOn && intensity > 0.05 && (
            <motion.div
              key="airflow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 + glow * 0.6, scaleX: 1 + glow * 0.6 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="pointer-events-none absolute -right-4 top-1/2 -translate-y-1/2 h-2 rounded-full bg-gradient-to-r from-cyan-300 via-cyan-200/50 to-transparent blur-[2px]"
              style={{ width: `${40 + glow * 120}px`, transformOrigin: "left center" }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Breath meter + note */}
      <div className="mx-auto max-w-xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Breath</span>
          <span className="text-muted-foreground">
            Note: <span className="neon-text font-semibold">{currentNote}</span>
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <motion.div
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.08, ease: "linear" }}
            className="h-full bg-[image:var(--gradient-neon)]"
            style={{ boxShadow: `0 0 ${10 + glow * 20}px hsl(var(--primary) / ${0.4 + glow * 0.6})` }}
          />
        </div>
      </div>

      {/* Mic control */}
      <div className="flex flex-col items-center gap-2">
        {!micOn ? (
          <button
            onClick={enableMic}
            className="flex items-center gap-2 rounded-full bg-[image:var(--gradient-neon)] text-primary-foreground font-semibold px-6 py-2.5 neon-border active:scale-95"
          >
            <Mic className="h-4 w-4" />
            Enable Breath Mode
          </button>
        ) : (
          <button
            onClick={disableMic}
            className="flex items-center gap-2 rounded-full glass-strong border border-border px-5 py-2 text-sm active:scale-95"
          >
            <MicOff className="h-4 w-4" />
            Stop mic
          </button>
        )}

        {/* Tap-to-play fallback */}
        <button
          onPointerDown={tapPlay}
          className="rounded-full glass-strong border border-border px-4 py-1.5 text-xs text-muted-foreground active:scale-95"
        >
          Or tap to blow once
        </button>

        {micError && <div className="text-xs text-destructive">{micError}</div>}
      </div>

      <div className="text-center text-[11px] text-muted-foreground px-4">
        {micOn
          ? "Cover holes with fingers, then blow softly into the mic. Harder breath = louder, brighter tone."
          : "Enable the mic and blow air across it like a real flute. Cover holes to change pitch."}
      </div>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*  Audio-reactive halo (fullscreen ambience)                                 */
/* -------------------------------------------------------------------------- */

const ReactiveHalo = memo(function ReactiveHalo({ color }: { color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fft = getFFT();
    if (!fft) return;
    let raf = 0;
    let bass = 0, treble = 0;
    const tick = () => {
      const v = fft.getValue() as Float32Array;
      // bass = avg of lowest 8 bins, treble = avg of top 16 bins (values are dB, -100..0)
      let b = 0, t = 0;
      for (let i = 0; i < 8; i++) b += v[i] ?? -100;
      for (let i = v.length - 16; i < v.length; i++) t += v[i] ?? -100;
      const bN = Math.max(0, (b / 8 + 100) / 100);
      const tN = Math.max(0, (t / 16 + 100) / 100);
      // smooth (low-pass) to avoid layout thrash
      bass += (bN - bass) * 0.25;
      treble += (tN - treble) * 0.3;
      const el = ref.current;
      if (el) {
        const scale = 1 + bass * 0.35;
        const blur = 40 + treble * 60;
        const op = 0.35 + bass * 0.55;
        el.style.transform = `scale(${scale.toFixed(3)})`;
        el.style.filter = `blur(${blur.toFixed(1)}px)`;
        el.style.opacity = op.toFixed(3);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        background: `radial-gradient(50% 40% at 50% 50%, ${color}, transparent 70%)`,
        willChange: "transform, filter, opacity",
      }}
    />
  );
});

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */


const MOODS: Record<InstrumentKey, { label: string; glow: string; halo: string; bg: string }> = {
  Piano: {
    label: "Concert Hall",
    glow: "oklch(0.9 0.05 80 / 0.6)",
    halo: "from-amber-100/50 via-orange-100/30 to-transparent",
    bg: "radial-gradient(80% 60% at 50% 0%, oklch(0.95 0.05 70 / 0.5), transparent 70%)",
  },
  Guitar: {
    label: "Warm Stage",
    glow: "oklch(0.85 0.08 60 / 0.6)",
    halo: "from-amber-200/40 via-orange-200/20 to-transparent",
    bg: "radial-gradient(80% 60% at 50% 0%, oklch(0.9 0.08 60 / 0.4), transparent 70%)",
  },
  Violin: {
    label: "Velvet Room",
    glow: "oklch(0.88 0.06 30 / 0.6)",
    halo: "from-rose-100/50 via-red-100/30 to-transparent",
    bg: "radial-gradient(80% 60% at 50% 0%, oklch(0.92 0.06 30 / 0.4), transparent 70%)",
  },
  Sitar: {
    label: "Mystic Raga",
    glow: "oklch(0.85 0.1 50 / 0.6)",
    halo: "from-amber-300/30 via-orange-200/20 to-transparent",
    bg: "radial-gradient(80% 60% at 50% 0%, oklch(0.88 0.1 50 / 0.4), transparent 70%)",
  },
  Veena: {
    label: "Temple Glow",
    glow: "oklch(0.82 0.12 70 / 0.6)",
    halo: "from-yellow-200/40 via-amber-200/20 to-transparent",
    bg: "radial-gradient(80% 60% at 50% 0%, oklch(0.85 0.12 70 / 0.4), transparent 70%)",
  },
  Drums: {
    label: "Pulse Arena",
    glow: "oklch(0.85 0.05 320 / 0.6)",
    halo: "from-fuchsia-100/50 via-purple-100/30 to-transparent",
    bg: "radial-gradient(80% 60% at 50% 0%, oklch(0.9 0.05 320 / 0.4), transparent 70%)",
  },
  Flute: {
    label: "Airy Mist",
    glow: "oklch(0.92 0.04 180 / 0.6)",
    halo: "from-cyan-100/50 via-teal-100/30 to-transparent",
    bg: "radial-gradient(80% 60% at 50% 0%, oklch(0.95 0.04 180 / 0.4), transparent 70%)",
  },
};

export function VirtualInstrument({ kind }: { kind: InstrumentKey }) {
  const [sustain, setSustain] = useState(false);
  const [fs, setFs] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadCounts, setLoadCounts] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [ready, setReady] = useState(false);

  // Preload samples whenever the active instrument changes
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadProgress(0);
    setLoadCounts({ done: 0, total: 0 });
    ensureAudio().then(() =>
      preloadInstrument(kind, (ratio, done, total) => {
        if (cancelled) return;
        setLoadProgress(ratio);
        setLoadCounts({ done, total });
      }).then(() => {
        if (!cancelled) setReady(true);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const fretConfig = useMemo(() => {
    if (kind === "Sitar") return { tuning: SITAR_TUNING, get: getSitar, flavor: "sitar" as const, frets: 6 };
    if (kind === "Veena") return { tuning: VEENA_TUNING, get: getVeena, flavor: "veena" as const, frets: 6 };
    if (kind === "Violin") return { tuning: VIOLIN_TUNING, get: getViolin, flavor: "violin" as const, frets: 5 };
    return { tuning: GUITAR_TUNING, get: getGuitar, flavor: "guitar" as const, frets: 5 };
  }, [kind]);

  const mood = MOODS[kind];

  useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFs(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [fs]);

  const content = (
    <motion.div
      key={kind}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative glass-strong rounded-3xl p-3 sm:p-5 overflow-hidden"
      style={{
        boxShadow: `0 0 60px ${mood.glow}, 0 0 0 1px oklch(1 0 0 / 0.08)`,
        backgroundImage: mood.bg,
      }}
    >
      {/* stage halo */}
      <div
        className={`pointer-events-none absolute -inset-1 bg-gradient-to-b ${mood.halo} blur-2xl opacity-70`}
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground truncate">
            {kind} · <span className="neon-text font-semibold">{mood.label}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {kind === "Piano" && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sustain}
                  onChange={(e) => setSustain(e.target.checked)}
                  className="accent-primary"
                />
                Sustain
              </label>
            )}
            <button
              onClick={() => setFs((v) => !v)}
              aria-label={fs ? "Exit fullscreen" : "Enter performance mode"}
              className="h-8 w-8 grid place-items-center rounded-full glass hover:bg-black/5 transition"
            >
              {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className={ready ? "" : "pointer-events-none opacity-40 blur-[1px] transition-all"}>
          {kind === "Piano" && <Piano sustain={sustain} />}
          {(kind === "Guitar" || kind === "Sitar" || kind === "Veena" || kind === "Violin") && (
            <Fretboard
              tuning={fretConfig.tuning}
              get={fretConfig.get}
              frets={fretConfig.frets}
              flavor={fretConfig.flavor}
            />
          )}
          {kind === "Drums" && <Drums />}
          {kind === "Flute" && <Flute />}
        </div>

        <AnimatePresence>
          {!ready && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 grid place-items-center rounded-3xl bg-background/70 backdrop-blur-md"
            >
              <div className="w-72 max-w-[85%] text-center space-y-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Loading {kind} samples
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full bg-[image:var(--gradient-neon)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(4, Math.round(loadProgress * 100))}%` }}
                    transition={{ ease: "easeOut", duration: 0.25 }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {loadCounts.total > 0
                    ? `${loadCounts.done} / ${loadCounts.total} samples · ${Math.round(loadProgress * 100)}%`
                    : "Warming up audio engine…"}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  return (
    <>
      {!fs && content}
      <AnimatePresence>
        {fs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/95 backdrop-blur-2xl p-3 sm:p-6 overflow-auto"
            style={{
              backgroundImage: mood.bg,
              paddingTop: "max(env(safe-area-inset-top), 0.75rem)",
              paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)",
            }}
          >
            <ReactiveHalo color={mood.glow} />
            <div className="mx-auto max-w-5xl">{content}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
