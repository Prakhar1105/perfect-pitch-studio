import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Play, RotateCcw, Trophy, Flame, Target, Piano } from "lucide-react";
import { toast } from "sonner";
import type { SongNote } from "@/lib/song.functions";
import {
  startMicPitch,
  freqToMidi,
  noteNameToMidi,
  midiToNoteName,
  type MicPitchHandle,
} from "@/lib/pitch-detector";
import { VirtualInstrument } from "@/components/VirtualInstrument";
import type { InstrumentKey } from "@/lib/instruments";

type Props = {
  notes: SongNote[];
  isDrum: boolean;
  tempoScale?: number;
  instrument?: InstrumentKey;
};

type InputMode = "mic" | "virtual";


const DURATION_MS: Record<string, number> = {
  "16n": 150,
  "8n": 300,
  "4n": 600,
  "2n": 1200,
  "1n": 2400,
};

type LaneNote = SongNote & {
  index: number;
  startMs: number;
  endMs: number;
  midi: number | null;
  lane: number;
  status: "pending" | "hit" | "missed";
};

const LANES = 5;
const PX_PER_MS = 0.35; // scroll speed
const HIT_ZONE_X = 110; // px from left where the hit line sits
const HIT_WINDOW_MS = 260;
const PERFECT_WINDOW_MS = 90;
const APPROACH_MS = 600; // how far ahead we start brightening notes


const LANE_COLORS = [
  "from-emerald-400 to-emerald-600",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-rose-600",
  "from-sky-400 to-indigo-500",
  "from-fuchsia-400 to-purple-600",
];

export function GamifiedPractice({ notes, isDrum, tempoScale = 1, instrument = "Piano" }: Props) {
  const [inputMode, setInputMode] = useState<InputMode>("mic");

  const [gameSpeed, setGameSpeed] = useState(1); // in-game speed multiplier
  const effectiveScale = tempoScale * gameSpeed;

  // Build timed lane notes
  const laneNotes = useMemo<LaneNote[]>(() => {
    let cursor = 0;
    return notes.map((n, i) => {
      const dur = (DURATION_MS[n.duration ?? "8n"] ?? 300) / effectiveScale;
      const startMs = cursor;
      cursor += dur;
      const midi = !isDrum ? noteNameToMidi(n.note) : null;
      const lane = midi != null ? ((midi % 12) % LANES) : i % LANES;
      return {
        ...n,
        index: i,
        startMs,
        endMs: cursor,
        midi,
        lane,
        status: "pending" as const,
      };
    });
  }, [notes, isDrum, effectiveScale]);

  const totalMs = laneNotes.at(-1)?.endMs ?? 0;

  const [running, setRunning] = useState(false);
  const [listening, setListening] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [detectedNote, setDetectedNote] = useState("—");
  const [statuses, setStatuses] = useState<("pending" | "hit" | "missed")[]>(
    () => laneNotes.map(() => "pending"),
  );
  const [judgement, setJudgement] = useState<{ text: string; tone: "perfect" | "good" | "miss"; at: number; lane: number } | null>(null);
  const [hitFlash, setHitFlash] = useState(0);
  const [missFlash, setMissFlash] = useState(0);


  const startedAt = useRef(0);
  const rafId = useRef(0);
  const handle = useRef<MicPitchHandle | null>(null);
  const currentMidi = useRef(-1);
  const stableCount = useRef(0);
  const lastMidi = useRef(-1);
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  useEffect(() => {
    setStatuses(laneNotes.map(() => "pending"));
    setScore(0); setCombo(0); setMaxCombo(0); setHits(0); setMisses(0);
    setNowMs(0);
  }, [laneNotes]);

  useEffect(() => () => {
    cancelAnimationFrame(rafId.current);
    handle.current?.stop();
  }, []);

  const tick = () => {
    const t = performance.now() - startedAt.current;
    setNowMs(t);

    // Auto-miss notes whose hit window has passed
    setStatuses((prev) => {
      let changed = false;
      const next = prev.slice();
      for (const ln of laneNotes) {
        if (next[ln.index] === "pending" && t > ln.startMs + HIT_WINDOW_MS) {
          next[ln.index] = "missed";
          changed = true;
        }
      }
      if (changed) {
        const newlyMissed = next.filter((s, i) => s === "missed" && prev[i] !== "missed").length;
        if (newlyMissed > 0) {
          setMisses((m) => m + newlyMissed);
          setCombo(0);
          setMissFlash(performance.now());
          setJudgement({ text: "MISS", tone: "miss", at: performance.now(), lane: -1 });
        }
      }
      return changed ? next : prev;
    });


    if (t > totalMs + 1500) {
      stop();
      return;
    }
    rafId.current = requestAnimationFrame(tick);
  };

  const registerHit = (midi: number) => {
    if (!startedAt.current) return;
    const t = performance.now() - startedAt.current;
    for (const ln of laneNotes) {
      if (statusesRef.current[ln.index] !== "pending") continue;
      if (Math.abs(t - ln.startMs) > HIT_WINDOW_MS) continue;
      if (ln.midi == null) continue;
      const diff = ((midi - ln.midi) % 12 + 12) % 12;
      if (diff === 0 || diff === 1 || diff === 11) {
        setStatuses((prev) => {
          if (prev[ln.index] !== "pending") return prev;
          const next = prev.slice();
          next[ln.index] = "hit";
          return next;
        });
        const delta = Math.abs(t - ln.startMs);
        const perfect = delta <= PERFECT_WINDOW_MS;
        setHits((h) => h + 1);
        setCombo((c) => {
          const nc = c + 1;
          setMaxCombo((m) => Math.max(m, nc));
          return nc;
        });
        setScore((s) => s + (perfect ? 150 : 100) + Math.min(combo * 10, 200));
        setJudgement({
          text: perfect ? "PERFECT" : "GOOD",
          tone: perfect ? "perfect" : "good",
          at: performance.now(),
          lane: ln.lane,
        });
        setHitFlash(performance.now());
        break;
      }
    }
  };


  const onPitch = (freq: number) => {
    if (freq < 0) {
      setDetectedNote("—");
      stableCount.current = 0;
      currentMidi.current = -1;
      return;
    }
    const midi = Math.round(freqToMidi(freq));
    setDetectedNote(midiToNoteName(midi));
    if (midi === lastMidi.current) stableCount.current++;
    else { lastMidi.current = midi; stableCount.current = 1; }
    if (stableCount.current < 2) return;
    currentMidi.current = midi;
    registerHit(midi);
  };

  // Listen for notes played on the on-screen virtual instrument.
  useEffect(() => {
    if (inputMode !== "virtual") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ note: string }>).detail;
      if (!detail?.note) return;
      const midi = noteNameToMidi(detail.note);
      if (midi == null) return;
      setDetectedNote(detail.note);
      registerHit(midi);
    };
    window.addEventListener("vinst:note", handler);
    return () => window.removeEventListener("vinst:note", handler);
  }, [inputMode, laneNotes, combo]);


  const startMic = async () => {
    if (isDrum) {
      toast.error("Game mode supports melodic instruments only.");
      return false;
    }
    try {
      handle.current = await startMicPitch(onPitch);
      setListening(true);
      return true;
    } catch (e) {
      console.error(e);
      toast.error("Microphone permission denied or unavailable.");
      return false;
    }
  };

  const start = async () => {
    if (isDrum) {
      toast.error("Game mode supports melodic instruments only.");
      return;
    }
    if (inputMode === "mic" && !listening) {
      const ok = await startMic();
      if (!ok) return;
    }
    if (inputMode === "virtual" && listening) {
      stopMic();
    }
    setStatuses(laneNotes.map(() => "pending"));
    setScore(0); setCombo(0); setMaxCombo(0); setHits(0); setMisses(0);
    startedAt.current = performance.now();
    setRunning(true);
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(tick);
  };


  const stop = () => {
    setRunning(false);
    cancelAnimationFrame(rafId.current);
    startedAt.current = 0;
  };

  const reset = () => {
    stop();
    setStatuses(laneNotes.map(() => "pending"));
    setScore(0); setCombo(0); setMaxCombo(0); setHits(0); setMisses(0);
    setNowMs(0);
  };

  const stopMic = () => {
    handle.current?.stop();
    handle.current = null;
    setListening(false);
    stop();
  };

  const accuracy = hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : 0;
  const progress = totalMs > 0 ? Math.min(100, (nowMs / totalMs) * 100) : 0;

  if (isDrum) {
    return (
      <div className="glass-strong rounded-3xl p-5 text-sm text-muted-foreground">
        Game mode is available for melodic instruments only.
      </div>
    );
  }

  return (
    <div className="glass-strong rounded-3xl p-4 sm:p-5 space-y-4">
      {/* Header / HUD */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Practice — game mode</div>
          <h3 className="text-lg font-semibold neon-text">Hit the notes as they reach the line</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {inputMode === "mic"
              ? "Play your real instrument into the mic. Any octave counts."
              : `Tap the on-screen ${instrument} to hit the notes. Any octave counts.`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Input mode toggle */}
          <div className="inline-flex rounded-full glass p-0.5 text-xs">
            <button
              onClick={() => { if (!running) setInputMode("mic"); }}
              disabled={running}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all ${
                inputMode === "mic"
                  ? "bg-[image:var(--gradient-neon)] text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              } disabled:opacity-50`}
            >
              <Mic className="h-3.5 w-3.5" /> Mic
            </button>
            <button
              onClick={() => { if (!running) setInputMode("virtual"); }}
              disabled={running}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all ${
                inputMode === "virtual"
                  ? "bg-[image:var(--gradient-neon)] text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              } disabled:opacity-50`}
            >
              <Piano className="h-3.5 w-3.5" /> Virtual
            </button>
          </div>
          <label className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-2 text-xs">
            <span className="text-muted-foreground">Speed</span>
            <select
              value={gameSpeed}
              onChange={(e) => setGameSpeed(Number(e.target.value))}
              disabled={running}
              className="bg-transparent outline-none disabled:opacity-50"
            >
              <option value={0.25}>0.25×</option>
              <option value={0.5}>0.5×</option>
              <option value={0.75}>0.75×</option>
              <option value={1}>1×</option>
              <option value={1.25}>1.25×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2×</option>
            </select>
          </label>
          {!running ? (
            <button
              onClick={start}
              className="inline-flex items-center gap-1.5 rounded-full bg-[image:var(--gradient-neon)] text-primary-foreground px-4 py-2 text-sm font-semibold neon-border"
            >
              <Play className="h-4 w-4" /> Start game
            </button>
          ) : (
            <button
              onClick={stop}
              className="inline-flex items-center gap-1.5 rounded-full glass px-4 py-2 text-sm font-medium"
            >
              Pause
            </button>
          )}
          {inputMode === "mic" && (
            listening ? (
              <button onClick={stopMic} className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-2 text-xs">
                <MicOff className="h-4 w-4" /> Mic off
              </button>
            ) : (
              <button onClick={startMic} className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-2 text-xs">
                <Mic className="h-4 w-4" /> Mic on
              </button>
            )
          )}
          <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-2 text-xs">
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
        </div>
      </div>

      {/* Stat bar */}
      <div className="grid grid-cols-4 gap-2">
        <Stat icon={<Trophy className="h-4 w-4 text-amber-400" />} label="Score" value={score.toString()} />
        <Stat icon={<Flame className="h-4 w-4 text-rose-400" />} label="Combo" value={`${combo}x`} sub={`max ${maxCombo}`} />
        <Stat icon={<Target className="h-4 w-4 text-emerald-400" />} label="Accuracy" value={`${accuracy}%`} sub={`${hits}/${hits + misses}`} />
        <Stat
          icon={inputMode === "mic" ? <Mic className="h-4 w-4 text-primary" /> : <Piano className="h-4 w-4 text-primary" />}
          label={inputMode === "mic" ? "Heard" : "Last played"}
          value={inputMode === "mic" ? (listening ? detectedNote : "off") : detectedNote}
        />
      </div>

      {/* Highway */}
      <Highway
        laneNotes={laneNotes}
        statuses={statuses}
        nowMs={nowMs}
        running={running}
        judgement={judgement}
        hitFlash={hitFlash}
        missFlash={missFlash}
      />


      {/* Progress */}
      <div className="h-1.5 rounded-full glass overflow-hidden">
        <div
          className="h-full bg-[image:var(--gradient-neon)] transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Inline virtual instrument for tapping notes */}
      {inputMode === "virtual" && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-1">
            Play here — taps register as hits
          </div>
          <VirtualInstrument kind={instrument} />
        </div>
      )}
    </div>
  );
}


function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="glass rounded-xl px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-lg font-bold font-mono leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Highway({
  laneNotes,
  statuses,
  nowMs,
  running,
  judgement,
  hitFlash,
  missFlash,
}: {
  laneNotes: LaneNote[];
  statuses: ("pending" | "hit" | "missed")[];
  nowMs: number;
  running: boolean;
  judgement: { text: string; tone: "perfect" | "good" | "miss"; at: number; lane: number } | null;
  hitFlash: number;
  missFlash: number;
}) {
  const HEIGHT = 280;
  const LANE_H = HEIGHT / LANES;

  // Find the next pending note overall (for "Next" hint)
  const nextNote = laneNotes.find(
    (ln, i) => statuses[i] === "pending" && ln.startMs + HIT_WINDOW_MS > nowMs,
  );

  // Is any pending note currently inside the hit window? → pulse the hit line
  const inWindow = laneNotes.some(
    (ln, i) =>
      statuses[i] === "pending" &&
      Math.abs(nowMs - ln.startMs) <= HIT_WINDOW_MS,
  );

  // Per-lane "armed" state (a hittable note exists in this lane right now)
  const laneArmed: boolean[] = Array(LANES).fill(false);
  for (let i = 0; i < laneNotes.length; i++) {
    const ln = laneNotes[i];
    if (statuses[i] !== "pending") continue;
    if (Math.abs(nowMs - ln.startMs) <= HIT_WINDOW_MS) laneArmed[ln.lane] = true;
  }

  // Recent flash strengths (0–1)
  const sinceHit = performance.now() - hitFlash;
  const sinceMiss = performance.now() - missFlash;
  const hitFlashOpacity = hitFlash && sinceHit < 320 ? 1 - sinceHit / 320 : 0;
  const missFlashOpacity = missFlash && sinceMiss < 320 ? 1 - sinceMiss / 320 : 0;
  const judgeAge = judgement ? performance.now() - judgement.at : 9999;
  const judgeVisible = judgeAge < 700;

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-white/10"
      style={{
        height: HEIGHT,
        background:
          "linear-gradient(180deg, oklch(0.18 0.04 270) 0%, oklch(0.12 0.03 270) 100%)",
      }}
    >
      {/* Lane lines + lane labels */}
      {Array.from({ length: LANES + 1 }).map((_, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 border-t border-white/5"
          style={{ top: i * LANE_H }}
        />
      ))}
      {Array.from({ length: LANES }).map((_, i) => (
        <div
          key={`larm-${i}`}
          className="absolute left-0 right-0 pointer-events-none transition-opacity duration-150"
          style={{
            top: i * LANE_H,
            height: LANE_H,
            opacity: laneArmed[i] ? 1 : 0,
            background:
              "linear-gradient(90deg, rgba(168,85,247,0.18) 0%, rgba(168,85,247,0.05) 30%, transparent 60%)",
          }}
        />
      ))}

      {/* Perspective lines */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent 0 80px, rgba(255,255,255,0.06) 80px 81px)",
        }}
      />

      {/* Hit zone band (window made visible) */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{
          left: HIT_ZONE_X - HIT_WINDOW_MS * PX_PER_MS,
          width: HIT_WINDOW_MS * PX_PER_MS * 2,
          background:
            "linear-gradient(90deg, transparent, rgba(168,85,247,0.10), transparent)",
        }}
      />
      {/* Perfect zone (tighter inner band) */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{
          left: HIT_ZONE_X - PERFECT_WINDOW_MS * PX_PER_MS,
          width: PERFECT_WINDOW_MS * PX_PER_MS * 2,
          background:
            "linear-gradient(90deg, transparent, rgba(16,185,129,0.18), transparent)",
        }}
      />

      {/* Hit line — pulses when something is in window */}
      <div
        className="absolute top-0 bottom-0 w-[3px] bg-[image:var(--gradient-neon)] transition-all duration-100"
        style={{
          left: HIT_ZONE_X,
          boxShadow: inWindow
            ? "0 0 28px rgba(168,85,247,0.95), 0 0 60px rgba(168,85,247,0.5)"
            : "0 0 14px rgba(168,85,247,0.55)",
          transform: inWindow ? "scaleX(1.6)" : "scaleX(1)",
        }}
      />

      {/* Per-lane target rings on the hit line */}
      {Array.from({ length: LANES }).map((_, i) => {
        const cy = i * LANE_H + LANE_H / 2;
        const armed = laneArmed[i];
        return (
          <div
            key={`ring-${i}`}
            className="absolute pointer-events-none transition-all duration-150"
            style={{
              left: HIT_ZONE_X,
              top: cy,
              width: armed ? 36 : 22,
              height: armed ? 36 : 22,
              transform: "translate(-50%, -50%)",
              borderRadius: "9999px",
              border: armed
                ? "2px solid rgba(16,185,129,0.95)"
                : "2px solid rgba(255,255,255,0.18)",
              background: armed ? "rgba(16,185,129,0.18)" : "transparent",
              boxShadow: armed ? "0 0 20px rgba(16,185,129,0.6)" : "none",
            }}
          />
        );
      })}

      {/* Notes */}
      {laneNotes.map((ln) => {
        const x = HIT_ZONE_X + (ln.startMs - nowMs) * PX_PER_MS;
        const width = Math.max(40, (ln.endMs - ln.startMs) * PX_PER_MS - 4);
        if (x + width < -50 || x > 2000) return null;
        const status = statuses[ln.index];
        const colorClass = LANE_COLORS[ln.lane % LANES];
        const top = ln.lane * LANE_H + 6;
        const h = LANE_H - 12;

        // Approach factor: 0 (far) → 1 (at hit line)
        const dt = ln.startMs - nowMs;
        const approach = Math.max(0, Math.min(1, 1 - dt / APPROACH_MS));
        const inHit = Math.abs(dt) <= HIT_WINDOW_MS && status === "pending";
        const perfect = Math.abs(dt) <= PERFECT_WINDOW_MS && status === "pending";

        const base =
          "absolute rounded-lg flex items-center justify-center text-xs font-mono font-bold text-white shadow-md transition-[transform,box-shadow,opacity] duration-100";
        const styleMap =
          status === "hit"
            ? "bg-emerald-400/80 border border-emerald-200 opacity-60"
            : status === "missed"
              ? "bg-rose-500/25 border border-rose-400/60 text-rose-100 opacity-50"
              : `bg-gradient-to-r ${colorClass} border border-white/25`;

        const glow = perfect
          ? "0 0 24px rgba(16,185,129,0.9), 0 0 8px rgba(255,255,255,0.6)"
          : inHit
            ? "0 0 18px rgba(168,85,247,0.85)"
            : approach > 0.5
              ? `0 0 ${10 * approach}px rgba(168,85,247,${0.4 * approach})`
              : "0 1px 4px rgba(0,0,0,0.4)";

        const scale = status === "hit"
          ? 0.85
          : perfect
            ? 1.12
            : inHit
              ? 1.05
              : 0.9 + approach * 0.1;

        return (
          <div
            key={ln.index}
            className={`${base} ${styleMap}`}
            style={{
              left: x,
              top,
              width,
              height: h,
              transform: `scale(${scale})`,
              boxShadow: glow,
              opacity: status === "pending" ? 0.55 + approach * 0.45 : undefined,
            }}
          >
            <span className="px-1 drop-shadow text-sm">{ln.note}</span>
            {status === "hit" && (
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-emerald-300 text-[11px] font-bold">
                +100
              </span>
            )}
          </div>
        );
      })}

      {/* Judgement popup */}
      {judgeVisible && judgement && (
        <div
          className="absolute pointer-events-none font-extrabold tracking-widest text-2xl sm:text-3xl"
          style={{
            left: HIT_ZONE_X + 20,
            top:
              judgement.lane >= 0
                ? judgement.lane * LANE_H + LANE_H / 2
                : HEIGHT / 2,
            transform: `translate(0, calc(-50% - ${judgeAge / 12}px))`,
            opacity: 1 - judgeAge / 700,
            color:
              judgement.tone === "perfect"
                ? "rgb(110,231,183)"
                : judgement.tone === "good"
                  ? "rgb(196,181,253)"
                  : "rgb(251,113,133)",
            textShadow:
              judgement.tone === "miss"
                ? "0 0 16px rgba(251,113,133,0.7)"
                : "0 0 18px rgba(168,85,247,0.7)",
          }}
        >
          {judgement.text}
        </div>
      )}

      {/* Edge flashes */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 60px rgba(16,185,129,${hitFlashOpacity * 0.55})`,
          opacity: hitFlashOpacity > 0 ? 1 : 0,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 60px rgba(244,63,94,${missFlashOpacity * 0.55})`,
          opacity: missFlashOpacity > 0 ? 1 : 0,
        }}
      />

      {/* Next-note hint */}
      {running && nextNote && (
        <div
          className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur px-2.5 py-1 text-[10px] uppercase tracking-widest text-white/80 border border-white/10"
        >
          <span className="text-muted-foreground">Next</span>
          <span className="font-mono font-bold text-white text-xs">{nextNote.note}</span>
          <span className="text-muted-foreground">
            in {Math.max(0, Math.round((nextNote.startMs - nowMs) / 100) / 10).toFixed(1)}s
          </span>
        </div>
      )}

      {/* Countdown when game just started but first note is far away */}
      {running && nowMs > 0 && nextNote && nextNote.startMs - nowMs > 800 && nowMs < 1200 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-5xl font-extrabold text-white/70 drop-shadow-[0_0_20px_rgba(168,85,247,0.7)]">
            Get ready
          </div>
        </div>
      )}

      {/* Empty state */}
      {nowMs === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Press <span className="mx-1 font-semibold text-foreground">Start game</span> to begin
        </div>
      )}
    </div>
  );
}

