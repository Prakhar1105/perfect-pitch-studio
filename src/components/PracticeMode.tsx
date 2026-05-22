import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import type { SongNote } from "@/lib/song.functions";
import {
  startMicPitch,
  freqToMidi,
  noteNameToMidi,
  midiToNoteName,
  type MicPitchHandle,
} from "@/lib/pitch-detector";

type Props = {
  notes: SongNote[];
  isDrum: boolean;
};

type Status = "pending" | "correct" | "missed";

export function PracticeMode({ notes, isDrum }: Props) {
  const [listening, setListening] = useState(false);
  const [targetIdx, setTargetIdx] = useState(0);
  const [statuses, setStatuses] = useState<Status[]>(() => notes.map(() => "pending" as Status));
  const [detectedNote, setDetectedNote] = useState<string>("—");
  const [detectedFreq, setDetectedFreq] = useState(0);
  const [score, setScore] = useState(0);
  const handle = useRef<MicPitchHandle | null>(null);
  const targetRef = useRef(0);
  const lastMatchAt = useRef(0);
  const stableCount = useRef(0);
  const lastMidi = useRef(-1);

  // Reset when notes change
  useEffect(() => {
    setTargetIdx(0);
    setStatuses(notes.map(() => "pending"));
    setScore(0);
    targetRef.current = 0;
  }, [notes]);

  useEffect(() => () => handle.current?.stop(), []);

  const target = notes[targetIdx];
  const targetMidi = target && !isDrum ? noteNameToMidi(target.note) : null;

  const start = async () => {
    if (isDrum) {
      toast.error("Practice mode supports melodic instruments only (not drums).");
      return;
    }
    try {
      handle.current = await startMicPitch((freq) => {
        if (freq < 0) {
          setDetectedNote("—");
          setDetectedFreq(0);
          stableCount.current = 0;
          return;
        }
        const midi = freqToMidi(freq);
        const rounded = Math.round(midi);
        setDetectedFreq(freq);
        setDetectedNote(midiToNoteName(rounded));

        // Require stable pitch across a few frames (~3) to debounce
        if (rounded === lastMidi.current) stableCount.current++;
        else { lastMidi.current = rounded; stableCount.current = 1; }
        if (stableCount.current < 3) return;

        // Cooldown to prevent same note re-triggering
        const now = performance.now();
        if (now - lastMatchAt.current < 250) return;

        const idx = targetRef.current;
        const tgt = notes[idx];
        if (!tgt) return;
        const tgtMidi = noteNameToMidi(tgt.note);
        if (tgtMidi == null) return;

        // Allow octave-agnostic match: any octave of the target pitch class counts.
        const diff = ((rounded - tgtMidi) % 12 + 12) % 12;
        const matchExact = Math.abs(rounded - tgtMidi) <= 1; // ±1 semitone
        const matchOctave = diff === 0 || diff === 11 || diff === 1;
        if (matchExact || matchOctave) {
          lastMatchAt.current = now;
          setStatuses((prev) => {
            const next = [...prev];
            next[idx] = "correct";
            return next;
          });
          setScore((s) => s + 1);
          const nextIdx = idx + 1;
          targetRef.current = nextIdx;
          setTargetIdx(nextIdx);
        }
      });
      setListening(true);
    } catch (e) {
      console.error(e);
      toast.error("Microphone permission denied or unavailable.");
    }
  };

  const stop = () => {
    handle.current?.stop();
    handle.current = null;
    setListening(false);
  };

  const reset = () => {
    setStatuses(notes.map(() => "pending"));
    setScore(0);
    setTargetIdx(0);
    targetRef.current = 0;
  };

  const skip = () => {
    setStatuses((prev) => {
      const next = [...prev];
      if (next[targetRef.current] === "pending") next[targetRef.current] = "missed";
      return next;
    });
    const nextIdx = targetRef.current + 1;
    targetRef.current = nextIdx;
    setTargetIdx(nextIdx);
  };

  const done = targetIdx >= notes.length;
  const accuracy = notes.length > 0 ? Math.round((score / notes.length) * 100) : 0;

  if (isDrum) {
    return (
      <div className="glass-strong rounded-3xl p-5 text-sm text-muted-foreground">
        Practice listening mode is available for melodic instruments only.
      </div>
    );
  }

  return (
    <div className="glass-strong rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Practice — listen with mic</div>
          <h3 className="text-lg font-semibold neon-text">Play along on your real instrument</h3>
          <p className="text-xs text-muted-foreground mt-1">
            We listen via mic and check each note. Play the highlighted note — any octave counts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!listening ? (
            <button
              onClick={start}
              className="inline-flex items-center gap-1.5 rounded-full bg-[image:var(--gradient-neon)] text-primary-foreground px-4 py-2 text-sm font-semibold neon-border"
            >
              <Mic className="h-4 w-4" /> Start listening
            </button>
          ) : (
            <button
              onClick={stop}
              className="inline-flex items-center gap-1.5 rounded-full glass px-4 py-2 text-sm font-medium"
            >
              <MicOff className="h-4 w-4" /> Stop
            </button>
          )}
          <button onClick={skip} disabled={done} className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-2 text-xs disabled:opacity-50">
            Skip
          </button>
          <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-2 text-xs">
            Reset
          </button>
        </div>
      </div>

      {/* Big target + detection HUD */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Play this</div>
          <div className="mt-1 text-3xl font-mono font-bold neon-text">
            {target ? target.note : "✓"}
          </div>
          {target?.lyric && <div className="text-xs text-muted-foreground mt-1">“{target.lyric}”</div>}
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">You played</div>
          <div className={`mt-1 text-3xl font-mono font-bold ${listening ? "text-foreground" : "text-muted-foreground"}`}>
            {listening ? detectedNote : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {listening ? (detectedFreq > 0 ? `${detectedFreq.toFixed(1)} Hz` : "listening…") : "mic off"}
          </div>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Score</div>
          <div className="mt-1 text-3xl font-bold flex items-center justify-center gap-1.5">
            <Trophy className="h-5 w-5 text-primary" /> {score}/{notes.length}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">{accuracy}% so far</div>
        </div>
      </div>

      {/* Note ribbon — Yousician-style */}
      <div className="rounded-2xl glass p-3 overflow-x-auto">
        <div className="flex gap-1.5 min-w-max">
          {notes.map((n, i) => {
            const st = statuses[i];
            const active = i === targetIdx && listening;
            const cls =
              st === "correct"
                ? "bg-emerald-500/30 border-emerald-400/60 text-emerald-100"
                : st === "missed"
                  ? "bg-rose-500/25 border-rose-400/50 text-rose-100"
                  : active
                    ? "bg-[image:var(--gradient-neon)] text-primary-foreground border-transparent scale-110 shadow-lg animate-pulse"
                    : "glass border-white/10 text-foreground/80";
            const targetMidiHere = noteNameToMidi(n.note);
            const showWrong = active && detectedNote !== "—" && targetMidiHere != null;
            return (
              <div
                key={i}
                className={`relative rounded-lg px-2.5 py-2 text-xs font-mono border transition-all min-w-[44px] text-center ${cls}`}
              >
                <div className="font-semibold">{n.note}</div>
                {n.lyric && <div className="text-[9px] mt-0.5 opacity-70">{n.lyric}</div>}
                {st === "correct" && <div className="absolute -top-1 -right-1 text-[10px]">✓</div>}
                {st === "missed" && (
                  <div className="absolute -top-1 -right-1 text-[10px] text-rose-200">
                    <X className="h-3 w-3 inline" />
                  </div>
                )}
                {showWrong && i === targetIdx && (
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground whitespace-nowrap">
                    heard {detectedNote}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {done && (
        <div className="text-center text-sm">
          <div className="font-semibold neon-text">Run complete! {accuracy}% accuracy</div>
          <button onClick={reset} className="mt-2 inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs">
            Try again
          </button>
        </div>
      )}

      <span className="sr-only">{targetMidi ?? ""}</span>
    </div>
  );
}
