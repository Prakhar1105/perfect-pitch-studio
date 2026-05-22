import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Music2, Play, Pause, RotateCcw, Sparkles, Loader2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { learnSong, type SongResult, type SongNote } from "@/lib/song.functions";
import type { InstrumentKey } from "@/lib/instruments";
import { VirtualInstrument } from "@/components/VirtualInstrument";
import { GamifiedPractice } from "@/components/GamifiedPractice";
import {
  ensureAudio,
  getPiano,
  getGuitar,
  getViolin,
  getFlute,
  getSitar,
  getVeena,
  preloadInstrument,
  triggerDrum,
} from "@/lib/audio-engine";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Learn a Song — Virtual Instrument Vision AI" },
      { name: "description", content: "Type any song name and instantly learn the notes on your virtual instrument." },
    ],
  }),
  component: LearnPage,
});

const INSTRUMENTS: InstrumentKey[] = ["Piano", "Guitar", "Violin", "Flute", "Sitar", "Veena", "Drums"];

const DURATION_BEATS: Record<string, number> = {
  "16n": 0.25,
  "8n": 0.5,
  "4n": 1,
  "2n": 2,
  "1n": 4,
};

function getDurationMs(duration: SongNote["duration"], bpm: number) {
  const safeBpm = Math.max(40, bpm || 90);
  const quarterNoteMs = 60000 / safeBpm;
  return quarterNoteMs * (DURATION_BEATS[duration ?? "8n"] ?? 0.5);
}

function getInstrument(kind: InstrumentKey) {
  switch (kind) {
    case "Piano": return getPiano();
    case "Guitar": return getGuitar();
    case "Violin": return getViolin();
    case "Flute": return getFlute();
    case "Sitar": return getSitar();
    case "Veena": return getVeena();
    default: return null;
  }
}

function playNote(kind: InstrumentKey, n: SongNote) {
  if (kind === "Drums") {
    const pad = n.note.toLowerCase();
    if (pad === "kick" || pad === "snare" || pad === "hat" || pad === "tom") {
      triggerDrum(pad);
    }
    return;
  }
  const inst = getInstrument(kind);
  inst?.triggerAttackRelease(n.note, n.duration ?? "8n");
}

function LearnPage() {
  const [song, setSong] = useState("");
  const [instrument, setInstrument] = useState<InstrumentKey>("Piano");
  const [tempoScale, setTempoScale] = useState(1);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);
  const learn = useServerFn(learnSong);
  const mutation = useMutation({
    mutationFn: (input: { song: string; instrument: InstrumentKey }) =>
      learn({ data: input }),
    onSuccess: (data) => {
      stopPlayback();
    },
    onError: (err: Error) => toast.error(err.message || "Could not fetch song"),
  });

  const data = mutation.data;

  function clearTimers() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }

  function stopPlayback() {
    clearTimers();
    setPlaying(false);
    setCurrentIdx(-1);
  }

  async function start(fromIdx = 0) {
    if (!data) return;
    await preloadInstrument(instrument);
    await ensureAudio();
    clearTimers();
    setPlaying(true);
    let cursor = 0;
    for (let i = fromIdx; i < data.notes.length; i++) {
      const n = data.notes[i];
      const delay = cursor;
      cursor += getDurationMs(n.duration, data.tempo) / tempoScale;
      timers.current.push(
        window.setTimeout(() => {
          setCurrentIdx(i);
          playNote(instrument, n);
        }, delay),
      );
    }
    timers.current.push(
      window.setTimeout(() => {
        setPlaying(false);
        setCurrentIdx(-1);
      }, cursor + 200),
    );
  }

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!data) return;
    preloadInstrument(instrument).catch(() => undefined);
  }, [data, instrument]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!song.trim()) return;
    stopPlayback();
    mutation.mutate({ song: song.trim(), instrument });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <div className="inline-flex items-center gap-2 glass rounded-full px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" /> AI Song Tutor
        </div>
        <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight">
          Learn any song — <span className="neon-text">note by note</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
          Type a song name, pick your instrument, and the AI will transcribe the melody so you can play it right here.
        </p>
      </motion.div>

      <form onSubmit={submit} className="mt-8 glass-strong rounded-3xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Music2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={song}
              onChange={(e) => setSong(e.target.value)}
              placeholder="e.g. Twinkle Twinkle Little Star"
              maxLength={200}
              className="w-full h-12 rounded-full glass pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value as InstrumentKey)}
            className="h-12 rounded-full glass px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            {INSTRUMENTS.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={mutation.isPending || !song.trim()}
            className="h-12 rounded-full bg-[image:var(--gradient-neon)] text-primary-foreground font-semibold px-6 neon-border disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {mutation.isPending ? "Transcribing…" : "Get notes"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground px-1">
          Tip: the more famous the song, the more accurate the transcription.
        </p>
      </form>

      {mutation.isPending && (
        <div className="mt-8 grid grid-cols-8 sm:grid-cols-12 gap-2">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg glass animate-pulse" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      )}

      {data && !mutation.isPending && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 space-y-4"
        >
          <div className="glass-strong rounded-3xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Now learning</div>
                <h2 className="text-xl sm:text-2xl font-semibold neon-text truncate">{data.title}</h2>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {data.key && <span>Key: <span className="text-foreground">{data.key}</span></span>}
                  <span>Tempo: <span className="text-foreground">{data.tempo} BPM</span></span>
                  <span>{data.notes.length} notes</span>
                  <span>Instrument: <span className="text-foreground">{instrument}</span></span>
                </div>
                {data.notesAbout && (
                  <p className="text-xs text-muted-foreground mt-2 italic">{data.notesAbout}</p>
                )}
                {data.reference && (
                  <a
                    href={data.reference}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Youtube className="h-3.5 w-3.5" />
                    Listen to the original on YouTube
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground flex items-center gap-2">
                  Speed
                  <select
                    value={tempoScale}
                    onChange={(e) => setTempoScale(Number(e.target.value))}
                    className="rounded-full glass px-2 py-1 text-xs"
                  >
                    <option value={0.5}>0.5×</option>
                    <option value={0.75}>0.75×</option>
                    <option value={1}>1×</option>
                    <option value={1.25}>1.25×</option>
                    <option value={1.5}>1.5×</option>
                  </select>
                </label>
                {playing ? (
                  <button
                    onClick={stopPlayback}
                    className="inline-flex items-center gap-1.5 rounded-full glass px-4 py-2 text-sm font-medium"
                  >
                    <Pause className="h-4 w-4" /> Pause
                  </button>
                ) : (
                  <button
                    onClick={() => start(0)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[image:var(--gradient-neon)] text-primary-foreground px-4 py-2 text-sm font-semibold neon-border"
                  >
                    <Play className="h-4 w-4" /> Play
                  </button>
                )}
                <button
                  onClick={() => { stopPlayback(); }}
                  className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-2 text-sm"
                  title="Reset"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="glass-strong rounded-3xl p-4 sm:p-5">
            <div className="text-xs text-muted-foreground mb-3">
              Tap any note to hear it. The highlighted note shows what to play next during playback.
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.notes.map((n, i) => {
                const active = i === currentIdx;
                return (
                  <button
                    key={i}
                    onClick={async () => {
                      await ensureAudio();
                      setCurrentIdx(i);
                      playNote(instrument, n);
                    }}
                    className={`relative group rounded-lg px-2.5 py-2 text-xs font-mono border transition-all min-w-[44px] text-center ${
                      active
                        ? "bg-[image:var(--gradient-neon)] text-primary-foreground border-transparent scale-110 shadow-lg"
                        : "glass border-white/10 hover:border-primary/50 hover:scale-105"
                    }`}
                  >
                    <div className="font-semibold">{n.note}</div>
                    {n.lyric && (
                      <div className={`text-[9px] mt-0.5 ${active ? "opacity-90" : "opacity-60"}`}>
                        {n.lyric}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <GamifiedPractice notes={data.notes} isDrum={instrument === "Drums"} tempoScale={tempoScale} instrument={instrument} bpm={data.tempo} />

          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Music2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Try it yourself — play the virtual {instrument}</h3>
            </div>
            <VirtualInstrument kind={instrument} />
          </div>


          <div className="text-center text-xs text-muted-foreground">
            Want to identify an instrument from a photo? Head to the{" "}
            <a href="/scan" className="text-primary underline">scan</a> page.
          </div>
        </motion.div>
      )}
    </div>
  );
}
