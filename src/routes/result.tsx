import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, RotateCcw, Share2, Volume2, VolumeX, Palette } from "lucide-react";
import { toast } from "sonner";
import { useHistoryStore } from "@/lib/history-store";
import { VirtualInstrument } from "@/components/VirtualInstrument";
import { Waveform } from "@/components/Waveform";
import { ConfidenceRing } from "@/components/ConfidenceRing";
import { InfoPanel } from "@/components/InfoPanel";
import { ensureAudio, setMasterVolume, setMuted } from "@/lib/audio-engine";

export const Route = createFileRoute("/result")({
  head: () => ({
    meta: [
      { title: "Result — Virtual Instrument Vision AI" },
      { name: "description", content: "Your identified instrument, ready to play." },
    ],
  }),
  component: ResultPage,
});

function ResultPage() {
  const current = useHistoryStore((s) => s.current);
  const [vol, setVol] = useState(75);
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    const db = vol === 0 ? -60 : Math.log10(vol / 100) * 20;
    setMasterVolume(db);
  }, [vol]);

  if (!current) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">No scan yet</h1>
        <p className="text-muted-foreground mt-2">Start by scanning an instrument.</p>
        <Link
          to="/scan"
          className="mt-6 inline-block rounded-full bg-[image:var(--gradient-neon)] text-primary-foreground font-semibold px-6 py-3 neon-border"
        >
          Go to scan
        </Link>
      </div>
    );
  }

  const { detection, imageDataUrl } = current;

  const share = async () => {
    const text = `I just identified a ${detection.instrument} with Virtual Instrument Vision AI!`;
    if (navigator.share) {
      try { await navigator.share({ title: "Virtual Instrument Vision AI", text }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    }
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = imageDataUrl;
    a.download = `${detection.instrument.replace(/\s+/g, "-").toLowerCase()}.jpg`;
    a.click();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <div className="grid lg:grid-cols-[1fr,1.25fr] gap-5 lg:gap-6">
        {/* Left column: artifact + info */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-4"
        >
          <div className="glass-strong rounded-3xl overflow-hidden relative">
            <div className="relative aspect-square">
              <img src={imageDataUrl} alt={detection.instrument} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent" />
              {detection.isArtwork && (
                <div className="absolute top-3 left-3 glass rounded-full px-3 py-1 text-xs flex items-center gap-1.5">
                  <Palette className="h-3 w-3 text-primary" /> Artwork detected
                </div>
              )}
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {detection.family} family · {detection.era || "—"}
                  </div>
                  <h2 className="mt-0.5 text-2xl sm:text-3xl font-semibold neon-text truncate">{detection.instrument}</h2>
                </div>
                <ConfidenceRing value={detection.confidence} size={84} />
              </div>
            </div>
            <div className="p-5 pt-4">
              <p className="text-sm text-muted-foreground">{detection.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={share} className="inline-flex items-center gap-2 glass rounded-full px-3 py-2 text-sm hover:bg-black/5 transition">
                  <Share2 className="h-4 w-4" /> Share
                </button>
                <button onClick={download} className="inline-flex items-center gap-2 glass rounded-full px-3 py-2 text-sm hover:bg-black/5 transition">
                  <Download className="h-4 w-4" /> Save image
                </button>
                <Link to="/scan" className="inline-flex items-center gap-2 glass rounded-full px-3 py-2 text-sm hover:bg-black/5 transition">
                  <RotateCcw className="h-4 w-4" /> New scan
                </Link>
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <InfoPanel detection={detection} />
          </motion.div>
        </motion.div>

        {/* Right column: playable + visualizer */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-4"
        >
          {detection.playable ? (
            <>
              <div className="flex items-center justify-between glass rounded-2xl px-4 py-3">
                <div className="text-sm min-w-0">
                  <div className="font-semibold truncate">Virtual {detection.playable}</div>
                  <div className="text-xs text-muted-foreground">Tap, click, or use your keyboard</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    aria-label={muted ? "Unmute" : "Mute"}
                    onClick={() => { const m = !muted; setMutedState(m); setMuted(m); }}
                    className="h-9 w-9 grid place-items-center rounded-full glass"
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={vol}
                    onChange={(e) => setVol(Number(e.target.value))}
                    onPointerDown={() => ensureAudio()}
                    className="w-24 sm:w-32 accent-primary"
                    aria-label="Volume"
                  />
                </div>
              </div>

              <VirtualInstrument kind={detection.playable} />
              <Waveform />
            </>
          ) : (
            <div className="glass-strong rounded-3xl p-8 text-center">
              <h3 className="text-xl font-semibold">Playable version coming soon</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                We don't have a virtual {detection.instrument} yet — but it has been added to your museum history.
              </p>
              <Link
                to="/scan"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-[image:var(--gradient-neon)] text-primary-foreground font-semibold px-5 py-2.5 neon-border"
              >
                <RotateCcw className="h-4 w-4" /> Scan another
              </Link>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
