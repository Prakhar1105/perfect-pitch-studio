import { motion } from "framer-motion";
import { Globe2, Hourglass, ScrollText, Sparkles, Landmark, BookOpen } from "lucide-react";
import type { Detection } from "@/lib/instruments";

function Row({ icon: Icon, label, value, children }: { icon: typeof Globe2; label: string; value?: string; children?: React.ReactNode }) {
  if (!value && !children) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      {value && <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{value}</p>}
      {children}
    </motion.div>
  );
}

export function InfoPanel({ detection }: { detection: Detection }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <Row icon={Globe2} label="Origin" value={detection.origin} />
      <Row icon={Hourglass} label="Era" value={detection.era} />
      <div className="sm:col-span-2">
        <Row icon={ScrollText} label="History" value={detection.history} />
      </div>
      <div className="sm:col-span-2">
        <Row icon={Landmark} label="Cultural significance" value={detection.cultural} />
      </div>
      <div className="sm:col-span-2">
        <Row icon={Sparkles} label="Did you know" value={detection.funFact} />
      </div>

      <div className="sm:col-span-2">
        <Row icon={BookOpen} label="How to play">
          <ul className="mt-2 list-disc list-inside text-sm text-foreground/90 space-y-1">
            <li>Step 1: Understand the basic posture and hold the {detection.instrument} correctly.</li>
            <li>Step 2: Familiarize yourself with the tuning and basic notes.</li>
            <li>Step 3: Practice basic scales and rhythm exercises.</li>
          </ul>
        </Row>
      </div>
    </div>
  );
}
