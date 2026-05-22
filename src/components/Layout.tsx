import { Link, useLocation } from "@tanstack/react-router";
import { Music2, Sparkles, Clock, ScanLine, GraduationCap } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

export function NavBar() {
  const location = useLocation();
  const path = location.pathname;
  const Item = ({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Music2 }) => {
    const active = to === "/" ? path === "/" : path.startsWith(to);
    return (
      <Link
        to={to}
        className={`group relative flex items-center gap-2 px-3 py-2 rounded-full text-sm transition-colors ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
        {active && (
          <motion.span
            layoutId="nav-active"
            className="absolute inset-0 rounded-full glass-strong neon-border-cyan -z-10"
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          />
        )}
      </Link>
    );
  };
  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="mx-auto max-w-6xl px-3 sm:px-4 pt-3 sm:pt-4">
        <div className="glass rounded-full px-2 sm:px-3 py-2 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 px-2 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-full bg-[image:var(--gradient-neon)] grid place-items-center neon-border">
              <Music2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight truncate text-sm sm:text-base">
              <span className="hidden sm:inline">Virtual Instrument </span>
              <span className="neon-text">Vision AI</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <Item to="/" label="Home" icon={Sparkles} />
            <Item to="/scan" label="Scan" icon={ScanLine} />
            <Item to="/learn" label="Learn" icon={GraduationCap} />
            <Item to="/history" label="History" icon={Clock} />
          </nav>
        </div>
      </div>
    </header>
  );
}

export function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const count = window.innerWidth < 640 ? 28 : 56;
    const colors = ["oklch(0.78 0.18 320 / 0.55)", "oklch(0.78 0.18 220 / 0.55)", "oklch(0.78 0.18 160 / 0.45)"];
    const parts = Array.from({ length: count }).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.6 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.18,
      vy: -0.05 - Math.random() * 0.25,
      c: colors[Math.floor(Math.random() * colors.length)],
      t: Math.random() * Math.PI * 2,
    }));

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.t += 0.01;
        p.x += p.vx + Math.sin(p.t) * 0.12;
        p.y += p.vy;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        ctx.beginPath();
        ctx.fillStyle = p.c;
        ctx.shadowColor = p.c;
        ctx.shadowBlur = 12;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[image:var(--gradient-aurora)] opacity-90" />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />
    </div>
  );
}
