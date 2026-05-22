import { useEffect, useRef, useState } from "react";
import { ensureAudio, getAnalyser } from "@/lib/audio-engine";

export function Waveform({ height = 96, variant = "combo" }: { height?: number; variant?: "wave" | "bars" | "combo" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    (async () => {
      await ensureAudio();
      if (cancelled) return;
      setReady(true);

      const draw = () => {
        const a = getAnalyser();
        const canvas = ref.current;
        if (!a || !canvas) {
          raf = requestAnimationFrame(draw);
          return;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth,
          h = canvas.clientHeight;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        ctx.clearRect(0, 0, w, h);

        const data = a.getValue() as Float32Array;

        // Bars (mirrored, from waveform magnitude)
        if (variant !== "wave") {
          const bars = 56;
          const step = Math.floor(data.length / bars);
          const bw = (w / bars) * 0.62;
          const gap = (w / bars) * 0.38;
          for (let i = 0; i < bars; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) sum += Math.abs(data[i * step + j] || 0);
            const v = Math.min(1, (sum / step) * 3.4);
            const bh = Math.max(2, v * h * 0.95);
            const x = i * (bw + gap) + gap / 2;
            const y = (h - bh) / 2;
            const g = ctx.createLinearGradient(0, y, 0, y + bh);
            g.addColorStop(0, "oklch(0.82 0.2 320)");
            g.addColorStop(1, "oklch(0.78 0.18 220)");
            ctx.fillStyle = g;
            ctx.shadowColor = "oklch(0.78 0.18 220 / 0.7)";
            ctx.shadowBlur = 12;
            ctx.beginPath();
            const r = Math.min(bw / 2, 4);
            ctx.roundRect(x, y, bw, bh, r);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        }

        // Wave overlay
        if (variant !== "bars") {
          const grad = ctx.createLinearGradient(0, 0, w, 0);
          grad.addColorStop(0, "oklch(0.92 0.12 320)");
          grad.addColorStop(1, "oklch(0.92 0.12 220)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.shadowColor = "oklch(0.78 0.18 320 / 0.8)";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          for (let i = 0; i < data.length; i++) {
            const x = (i / data.length) * w;
            const y = h / 2 + data[i] * h * 0.45;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [variant]);

  return (
    <canvas
      ref={ref}
      style={{ height }}
      className={`w-full rounded-2xl glass-strong neon-border-cyan ${ready ? "opacity-100" : "opacity-60"}`}
    />
  );
}
