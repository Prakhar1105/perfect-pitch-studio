import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useHistoryStore } from "@/lib/history-store";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — Virtual Instrument Vision AI" },
      { name: "description", content: "Previously identified instruments. Replay any of them instantly." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { items, remove, clear, setCurrent } = useHistoryStore();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Your <span className="neon-text">history</span>
          </h1>
          <p className="text-muted-foreground mt-2">Replay sounds from previous scans.</p>
        </div>
        {items.length > 0 && (
          <button onClick={clear} className="glass rounded-full px-3 py-2 text-xs hover:bg-black/5">
            Clear all
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="glass-strong rounded-3xl p-12 text-center">
          <p className="text-muted-foreground">Nothing here yet.</p>
          <Link
            to="/scan"
            className="mt-5 inline-block rounded-full bg-[image:var(--gradient-neon)] text-primary-foreground font-semibold px-6 py-3 neon-border"
          >
            Make your first scan
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => { setCurrent(item); navigate({ to: "/result" }); }}
              className="text-left group glass-strong rounded-2xl overflow-hidden hover:scale-[1.015] transition-transform"
            >
              <div className="aspect-video overflow-hidden">
                <img src={item.imageDataUrl} alt={item.detection.instrument} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              </div>
              <div className="p-4 flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{item.detection.instrument}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.detection.family} · {Math.round(item.detection.confidence)}%
                  </div>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); remove(item.id); }}
                  className="h-8 w-8 grid place-items-center rounded-full glass hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
