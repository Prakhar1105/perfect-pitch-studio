import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Copy, Users, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useMultiplayer } from "@/hooks/useMultiplayer";
import { VirtualInstrument } from "@/components/VirtualInstrument";
import type { InstrumentKey } from "@/lib/instruments";

export const Route = createFileRoute("/room/$roomId")({
  component: RoomPage,
});

function RoomPage() {
  const { roomId } = Route.useParams();
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const [joined, setJoined] = useState(false);
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("muse_username") : null;
    setUserName(stored || "");
  }, []);
  const [instrument, setInstrument] = useState<InstrumentKey>("Piano");

  const { users, connected, updateInstrument } = useMultiplayer(
    joined ? roomId : null,
    userName,
    instrument
  );

  useEffect(() => {
    if (joined) {
      updateInstrument(instrument);
    }
  }, [instrument, joined, updateInstrument]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedName = userName.trim() || `Guest ${Math.floor(Math.random() * 1000)}`;
    setUserName(normalizedName);
    localStorage.setItem("muse_username", normalizedName);
    setJoined(true);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Room link copied to clipboard");
  };

  const leaveRoom = () => {
    setJoined(false);
    navigate({ to: "/" });
  };

  if (!joined) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-strong rounded-3xl p-8"
        >
          <h1 className="text-3xl font-semibold neon-text mb-2">Join Room</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Collaborate in real-time with other musicians.
          </p>
          <form onSubmit={handleJoin} className="space-y-4 text-left">
            <div>
              <label className="text-sm font-medium text-foreground">Your Name</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Your display name"
                className="w-full mt-1 bg-black/5 border border-black/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-foreground"
                maxLength={20}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Choose Instrument</label>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as InstrumentKey)}
                className="w-full mt-1 bg-black/5 border border-black/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-foreground"
              >
                <option value="Piano">Grand Piano</option>
                <option value="Guitar">Acoustic Guitar</option>
                <option value="Violin">Violin</option>
                <option value="Flute">Flute</option>
                <option value="Sitar">Sitar</option>
                <option value="Veena">Veena</option>
                <option value="Drums">Drum Kit</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-[image:var(--gradient-neon)] text-primary-foreground font-semibold px-6 py-3.5 neon-border hover:scale-[1.02] transition-transform mt-4"
            >
              Enter Room
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Live Session <span className="text-muted-foreground text-sm font-normal ml-2">#{roomId}</span>
          </h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'}`} />
            {connected ? 'Connected' : 'Connecting...'}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={copyLink} className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm hover:bg-black/5 transition">
            <Copy className="h-4 w-4" /> Share Link
          </button>
          <button onClick={leaveRoom} className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition">
            <LogOut className="h-4 w-4" /> Leave
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Participants Sidebar */}
        <div className="glass-strong rounded-3xl p-5 h-fit flex flex-col gap-4">
          <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wider text-muted-foreground border-b border-white/5 pb-3">
            <Users className="h-4 w-4" /> Musicians ({users.length})
          </div>
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                <div className="min-w-0 pr-3">
                  <div className="font-medium text-sm truncate">{u.name} {u.name === userName && "(You)"}</div>
                  <div className="text-xs text-muted-foreground">{u.instrumentType}</div>
                </div>
                <div className="h-2 w-2 rounded-full bg-[image:var(--gradient-neon)]" />
              </div>
            ))}
            {users.length === 0 && (
              <div className="text-sm text-center text-muted-foreground py-4">Waiting for others...</div>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-white/5">
            <label className="text-xs text-muted-foreground block mb-2">Switch Instrument</label>
            <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as InstrumentKey)}
                className="w-full bg-black/5 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors text-foreground"
              >
                <option value="Piano">Grand Piano</option>
                <option value="Guitar">Acoustic Guitar</option>
                 <option value="Violin">Violin</option>
                 <option value="Flute">Flute</option>
                 <option value="Sitar">Sitar</option>
                 <option value="Veena">Veena</option>
                 <option value="Drums">Drum Kit</option>
            </select>
          </div>
        </div>

        {/* Playable Area */}
        <div className="space-y-6">
          <VirtualInstrument kind={instrument} />
        </div>
      </div>
    </div>
  );
}
