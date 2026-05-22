import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

const STAGES = [
  "Initializing vision core…",
  "Detecting silhouettes…",
  "Mapping resonant geometry…",
  "Cross-referencing cultural archives…",
  "Synthesizing playable model…",
];

export function AnalyzingOverlay({ src }: { src: string }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 1100);
    return () => clearInterval(i);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative mx-auto max-w-md aspect-square rounded-3xl overflow-hidden glass-strong neon-border"
    >
      <img src={src} alt="Analyzing" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-background/55" />

      {/* Grid overlay */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.78 0.18 220 / 0.35) 1px, transparent 1px), linear-gradient(90deg, oklch(0.78 0.18 220 / 0.35) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: "radial-gradient(circle at center, black 55%, transparent 90%)",
        }}
      />

      {/* Corner brackets */}
      {([
        "top-3 left-3 border-l-2 border-t-2",
        "top-3 right-3 border-r-2 border-t-2",
        "bottom-3 left-3 border-l-2 border-b-2",
        "bottom-3 right-3 border-r-2 border-b-2",
      ] as const).map((c, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
          className={`absolute h-6 w-6 ${c}`}
          style={{ borderColor: "oklch(0.78 0.18 220)" }}
        />
      ))}

      {/* Scan sweep */}
      <motion.div
        className="absolute inset-x-0 h-24 scan-line"
        initial={{ y: "-100%" }}
        animate={{ y: "100%" }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Radar pulses */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[oklch(0.78_0.18_220)]"
        animate={{ scale: [1, 4, 1], opacity: [0.8, 0, 0.8] }}
        transition={{ duration: 2.4, repeat: Infinity }}
      />

      {/* Bottom HUD */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="glass rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[image:var(--gradient-neon)]" />
            </span>
            <span className="uppercase tracking-widest text-muted-foreground">Vision AI</span>
            <span className="ml-auto tabular-nums text-muted-foreground">
              {String(stage + 1).padStart(2, "0")}/{String(STAGES.length).padStart(2, "0")}
            </span>
          </div>
          <div className="mt-1.5 h-5 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={stage}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-sm font-medium"
              >
                {STAGES[stage]}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full bg-[image:var(--gradient-neon)]"
              initial={{ width: "5%" }}
              animate={{ width: ["5%", "92%"] }}
              transition={{ duration: 5.5, ease: "easeInOut" }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
