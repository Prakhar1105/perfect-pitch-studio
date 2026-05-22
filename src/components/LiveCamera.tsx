import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, X, Zap } from "lucide-react";

type Props = {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
};

export function LiveCamera({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Camera unavailable");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const snap = () => {
    const v = videoRef.current;
    if (!v) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - side) / 2;
    const sy = (v.videoHeight - side) / 2;
    const max = 1024;
    const c = document.createElement("canvas");
    c.width = max;
    c.height = max;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(v, sx, sy, side, side, 0, 0, max, max);
    onCapture(c.toDataURL("image/jpeg", 0.85));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center p-4"
    >
      <div className="relative w-full max-w-lg aspect-square rounded-3xl overflow-hidden glass-strong neon-border">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Requesting camera…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center text-center p-6">
            <div>
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={onClose} className="mt-4 glass rounded-full px-4 py-2 text-sm">Close</button>
            </div>
          </div>
        )}

        {/* HUD */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-6 border border-[oklch(0.78_0.18_220/0.5)] rounded-2xl" />
          <motion.div
            className="absolute inset-x-6 h-16 scan-line rounded-xl"
            initial={{ y: "-100%" }}
            animate={{ y: "100%" }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <div className="absolute top-3 left-3 glass rounded-full px-3 py-1.5 text-xs flex items-center gap-2">
          <Zap className="h-3 w-3 text-primary" /> Live scan
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-9 w-9 grid place-items-center rounded-full glass"
          aria-label="Close camera"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="absolute inset-x-0 bottom-4 flex justify-center">
          <button
            onClick={snap}
            disabled={!ready}
            className="h-16 w-16 rounded-full bg-[image:var(--gradient-neon)] neon-border grid place-items-center active:scale-95 transition disabled:opacity-50"
            aria-label="Capture"
          >
            <Camera className="h-6 w-6 text-primary-foreground" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
