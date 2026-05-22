import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Detection } from "./instruments";

export type HistoryItem = {
  id: string;
  imageDataUrl: string;
  detection: Detection;
  createdAt: number;
};

type State = {
  items: HistoryItem[];
  current: HistoryItem | null;
  add: (item: HistoryItem) => void;
  setCurrent: (item: HistoryItem | null) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useHistoryStore = create<State>()(
  persist(
    (set) => ({
      items: [],
      current: null,
      add: (item) => set((s) => ({ items: [item, ...s.items.filter(x => x.id !== item.id)].slice(0, 30) })),
      setCurrent: (item) => set({ current: item }),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "viv-ai-history",
      partialize: (s) => ({ items: s.items, current: s.current }),
    },
  ),
);
