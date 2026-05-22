import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Image as ImageIcon, Palette } from "lucide-react";
import { Uploader } from "@/components/Uploader";
import { AnalyzingOverlay } from "@/components/AnalyzingOverlay";
import { LiveCamera } from "@/components/LiveCamera";
import { analyzeInstrument } from "@/lib/vision.functions";
import { mapToPlayable } from "@/lib/instruments";
import { useHistoryStore } from "@/lib/history-store";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Scan — Virtual Instrument Vision AI" },
      { name: "description", content: "Upload, capture, or live-scan an instrument and let AI identify it." },
    ],
  }),
  component: ScanPage,
});

type Mode = "photo" | "painting";

function ScanPage() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("photo");
  const [liveOpen, setLiveOpen] = useState(false);
  const analyze = useServerFn(analyzeInstrument);
  const navigate = useNavigate();
  const { add, setCurrent } = useHistoryStore();

  const onPicked = async (dataUrl: string) => {
    setLiveOpen(false);
    setImage(dataUrl);
    setLoading(true);
    try {
      const result = await analyze({ data: { imageDataUrl: dataUrl, mode } });
      const playable = mapToPlayable(result.instrument);
      const item = {
        id: Math.random().toString(36).substring(2) + Date.now().toString(36),
        imageDataUrl: dataUrl,
        detection: { ...result, playable },
        createdAt: Date.now(),
      };
      add(item);
      setCurrent(item);
      navigate({ to: "/result" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed";
      toast.error(msg);
      setLoading(false);
      setImage(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl sm:text-4xl font-semibold tracking-tight text-center"
      >
        Scan an <span className="neon-text">instrument</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mt-3 text-center text-muted-foreground"
      >
        Photo, painting, or live camera — the museum is open.
      </motion.p>

      {/* Mode toggle */}
      <div className="mt-6 flex justify-center">
        <div className="glass rounded-full p-1 flex relative">
          {(["photo", "painting"] as const).map((m) => {
            const active = mode === m;
            const Icon = m === "photo" ? ImageIcon : Palette;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`relative px-4 py-2 text-sm rounded-full flex items-center gap-2 transition-colors ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {active && (
                  <motion.span
                    layoutId="mode-active"
                    className="absolute inset-0 rounded-full bg-[image:var(--gradient-neon)] neon-border -z-10"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon className="h-4 w-4" /> {m === "photo" ? "Photo" : "Painting / Artwork"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8">
        {loading && image ? (
          <AnalyzingOverlay src={image} />
        ) : (
          <>
            <Uploader onPicked={onPicked} loading={loading} />
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setLiveOpen(true)}
                className="inline-flex items-center gap-2 glass rounded-full px-5 py-3 text-sm hover:bg-black/5 transition-colors"
              >
                <Camera className="h-4 w-4 text-primary" /> Use live camera
              </button>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {liveOpen && <LiveCamera onCapture={onPicked} onClose={() => setLiveOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
