import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  getPiano,
  getGuitar,
  getViolin,
  getFlute,
  getSitar,
  getVeena,
  triggerDrum,
  setSuppressEvent
} from "@/lib/audio-engine";

export type RoomUser = {
  id: string;
  name: string;
  instrumentType: string;
};

function getClientId() {
  if (typeof window === "undefined") return Math.random().toString(36).slice(2);
  let id = sessionStorage.getItem("muse_client_id");
  if (!id) {
    id =
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now());
    sessionStorage.setItem("muse_client_id", id);
  }
  return id;
}

export function useMultiplayer(roomId: string | null, userName: string, defaultInstrument: string) {
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clientIdRef = useRef<string>(getClientId());
  const instrumentRef = useRef<string>(defaultInstrument);
  const userNameRef = useRef<string>(userName);

  useEffect(() => { userNameRef.current = userName; }, [userName]);

  useEffect(() => {
    if (!roomId) return;

    const clientId = clientIdRef.current;
    instrumentRef.current = defaultInstrument;

    const playRemoteNote = (instrumentType: string, note: string) => {
      try {
        setSuppressEvent(true);
        switch (instrumentType.toLowerCase()) {
          case "piano": getPiano().triggerAttackRelease(note, "8n"); break;
          case "guitar": getGuitar().triggerAttackRelease(note, "4n"); break;
          case "violin": getViolin().triggerAttackRelease(note, "4n"); break;
          case "flute": getFlute().triggerAttackRelease(note, "4n"); break;
          case "sitar": getSitar().triggerAttackRelease(note, "2n"); break;
          case "veena": getVeena().triggerAttackRelease(note, "2n"); break;
          case "drums": triggerDrum(note as any); break;
        }
      } catch (e) {
        console.error("Remote play note failed", e);
      } finally {
        setSuppressEvent(false);
      }
    };

    const channel = supabase.channel(`jam:${roomId}`, {
      config: {
        presence: { key: clientId },
        broadcast: { self: false },
      },
    });
    channelRef.current = channel;

    const syncUsers = () => {
      const state = channel.presenceState() as Record<
        string,
        Array<{ name: string; instrumentType: string }>
      >;
      const list: RoomUser[] = Object.entries(state).map(([id, metas]) => ({
        id,
        name: metas[0]?.name ?? "Guest",
        instrumentType: metas[0]?.instrumentType ?? "Piano",
      }));
      setUsers(list);
    };

    channel
      .on("presence", { event: "sync" }, syncUsers)
      .on("presence", { event: "join" }, syncUsers)
      .on("presence", { event: "leave" }, syncUsers)
      .on("broadcast", { event: "play_note" }, ({ payload }) => {
        if (payload?.userId === clientId) return;
        playRemoteNote(payload.instrumentType, payload.note);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
          await channel.track({
            name: userNameRef.current,
            instrumentType: instrumentRef.current,
          });
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setConnected(false);
        }
      });

    const handleLocalNote = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      channel.send({
        type: "broadcast",
        event: "play_note",
        payload: {
          userId: clientId,
          instrumentType: detail.instrumentType,
          note: detail.note,
        },
      });
    };

    window.addEventListener("local_note_played", handleLocalNote as EventListener);

    return () => {
      window.removeEventListener("local_note_played", handleLocalNote as EventListener);
      try { channel.untrack(); } catch { /* noop */ }
      supabase.removeChannel(channel);
      channelRef.current = null;
      setConnected(false);
      setUsers([]);
    };
  }, [roomId, defaultInstrument]);

  const updateInstrument = useCallback((instrumentType: string) => {
    instrumentRef.current = instrumentType;
    const channel = channelRef.current;
    if (channel) {
      channel.track({
        name: userNameRef.current,
        instrumentType,
      }).catch(() => {});
    }
  }, []);

  return {
    users,
    connected,
    updateInstrument,
  };
}
