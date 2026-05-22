import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Brain, Sparkles, Waves, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Virtual Instrument Vision AI — See it. Play it." },
      { name: "description", content: "An AI museum that turns any instrument photo into a playable virtual instrument." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    const id = Math.random().toString(36).substring(2, 8);
    navigate({ to: `/room/${id}` });
  };

  return (
    <div className="relative">
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:pt-24 pb-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 glass rounded-full px-3 py-1 text-xs sm:text-sm text-muted-foreground"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Ancient music · Futuristic AI
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="mt-6 text-4xl sm:text-6xl md:text-7xl font-semibold tracking-tight leading-[1.05]"
        >
          See an instrument.
          <br />
          <span className="neon-text">Play it instantly.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-6 mx-auto max-w-xl text-base sm:text-lg text-muted-foreground"
        >
          Upload a photo, a museum piece, or even a painting. Our vision AI identifies
          the instrument and generates a playable virtual version with real-time sound.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/scan"
              className="inline-flex items-center gap-2 rounded-full bg-black/5 text-foreground font-semibold px-6 py-3 border border-black/10 hover:bg-black/10 transition-colors"
            >
              Scan Instrument
            </Link>
            <button
              onClick={handleCreateRoom}
              className="inline-flex items-center gap-2 rounded-full bg-[image:var(--gradient-neon)] text-primary-foreground font-semibold px-6 py-3 neon-border hover:scale-[1.02] transition-transform"
            >
              <Users className="h-4 w-4" /> Create Live Room
            </button>
            <Link to="/history" className="rounded-full glass px-6 py-3 text-sm hover:bg-black/5 transition-colors flex items-center justify-center">
              Past Discoveries
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="mt-16 mx-auto max-w-3xl"
        >
          <div className="relative aspect-[16/9] rounded-3xl glass-strong overflow-hidden neon-border">
            <div className="absolute inset-0 bg-[image:var(--gradient-aurora)] opacity-60" />
            <div className="absolute inset-x-6 bottom-10 top-6 grid grid-cols-12 gap-1.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ height: "15%" }}
                  animate={{ height: ["15%", "70%", "25%", "55%", "15%"] }}
                  transition={{ duration: 3 + (i % 4), repeat: Infinity, delay: i * 0.1 }}
                  className="self-end rounded-t-full bg-[image:var(--gradient-neon)] opacity-60"
                />
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground font-medium tracking-wide">
              Live audio visualization
            </div>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 grid sm:grid-cols-3 gap-4">
        {[
          { icon: Brain, title: "Vision AI", body: "Detects modern, historical, and depicted instruments — even partial views." },
          { icon: Waves, title: "Real-time audio", body: "Tone.js-powered playable instruments tuned for low-latency response." },
          { icon: Sparkles, title: "Museum mode", body: "Beautiful interactions for paintings, sculptures, and historical artefacts." },
        ].map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
            className="glass rounded-2xl p-6"
          >
            <f.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </motion.div>
        ))}
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-xs text-muted-foreground">
        Crafted as an interactive museum of sound · © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
