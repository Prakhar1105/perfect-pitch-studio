export type InstrumentKey =
  | "Guitar" | "Piano" | "Violin" | "Flute" | "Drums" | "Sitar" | "Veena";

export const KNOWN_INSTRUMENTS: InstrumentKey[] = [
  "Guitar", "Piano", "Violin", "Flute", "Drums", "Sitar", "Veena",
];

export type Detection = {
  instrument: string;
  confidence: number;
  family: string;
  description: string;
  playable: InstrumentKey | null;
  origin?: string;
  era?: string;
  history?: string;
  cultural?: string;
  funFact?: string;
  isArtwork?: boolean;
};

export function mapToPlayable(instrument: string): InstrumentKey | null {
  const i = instrument.toLowerCase();
  if (i.includes("piano") || i.includes("keyboard") || i.includes("organ") || i.includes("harpsichord")) return "Piano";
  if (i.includes("guitar") || i.includes("ukulele") || i.includes("bass") || i.includes("lute") || i.includes("mandolin")) return "Guitar";
  if (i.includes("violin") || i.includes("viola") || i.includes("cello") || i.includes("fiddle")) return "Violin";
  if (i.includes("flute") || i.includes("recorder") || i.includes("piccolo") || i.includes("clarinet") || i.includes("oboe") || i.includes("bansuri")) return "Flute";
  if (i.includes("drum") || i.includes("tabla") || i.includes("percussion") || i.includes("conga") || i.includes("bongo")) return "Drums";
  if (i.includes("sitar")) return "Sitar";
  if (i.includes("veena") || i.includes("vina")) return "Veena";
  return null;
}
