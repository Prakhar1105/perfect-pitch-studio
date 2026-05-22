import { useCallback, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Upload } from "lucide-react";
import { motion } from "framer-motion";

type Props = {
  onPicked: (dataUrl: string) => void;
  loading?: boolean;
};

async function fileToDataUrl(file: File): Promise<string> {
  // Compress to reasonable size for AI vision (max 1024px)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function Uploader({ onPicked, loading }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = await fileToDataUrl(file);
    onPicked(url);
  }, [onPicked]);

  return (
    <div className="space-y-4">
      <motion.div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        animate={{ scale: dragOver ? 1.01 : 1 }}
        className={`glass-strong rounded-3xl p-8 sm:p-12 text-center transition-all ${dragOver ? "neon-border" : ""}`}
      >
        <div className="mx-auto mb-5 h-16 w-16 rounded-2xl bg-[image:var(--gradient-neon)] grid place-items-center neon-border animate-float-y">
          {loading ? <Loader2 className="h-7 w-7 animate-spin text-primary-foreground" /> : <Upload className="h-7 w-7 text-primary-foreground" />}
        </div>
        <h3 className="text-xl sm:text-2xl font-semibold tracking-tight">
          Drop an instrument image
        </h3>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base">
          JPG · PNG · WEBP — paintings, museum photos, and partial views welcome.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            disabled={loading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[image:var(--gradient-neon)] text-primary-foreground font-semibold neon-border disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" /> Choose image
          </button>
          <button
            disabled={loading}
            onClick={() => camRef.current?.click()}
            className="sm:hidden inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full glass text-foreground font-semibold"
          >
            <Camera className="h-4 w-4" /> Use camera
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </motion.div>
    </div>
  );
}
