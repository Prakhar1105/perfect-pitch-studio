import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  song: z.string().trim().min(1).max(200),
  instrument: z.enum(["Piano", "Guitar", "Violin", "Flute", "Sitar", "Veena", "Drums"]),
});

const NoteSchema = z.object({
  note: z.string().min(1).max(8),
  duration: z.enum(["16n", "8n", "4n", "2n", "1n"]).optional().default("8n"),
  lyric: z.string().max(40).optional().default(""),
});

const ResponseSchema = z.object({
  title: z.string(),
  key: z.string().optional().default(""),
  tempo: z.number().min(40).max(220).optional().default(90),
  notes: z.array(NoteSchema).min(4).max(400),
  notesAbout: z.string().optional().default(""),
});

export type SongNote = z.infer<typeof NoteSchema>;
export type SongResult = z.infer<typeof ResponseSchema>;

export const learnSong = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY is not configured");

    const isDrum = data.instrument === "Drums";
    const noteHint = isDrum
      ? "For drums, each 'note' must be exactly one of: 'kick', 'snare', 'hat', 'tom'. Build a full groove pattern. Use 8n or 16n durations."
      : `For melody, each 'note' must be scientific pitch notation (C4, D#4, etc.) in a singable 2-octave range (octave 3-5), tailored idiomatically for ${data.instrument}. Output ONLY the main monophonic melody line for ${data.instrument} — no other instrument parts.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an expert music transcriber. You know Western pop/rock/classical AND Indian music (Bollywood, Hindustani/Carnatic classical, folk, regional). You map sargam to Western notation (Sa=C, Re=D, Ga=E, Ma=F, Pa=G, Dha=A, Ni=B; komal=♭, tivra=♯). Transcribe a longer, faithful arrangement so the listener can play through the whole song. Always respond via the provided tool.",
          },
          {
            role: "user",
            content: `Transcribe an EXTENDED arrangement of "${data.song}" for a virtual ${data.instrument}. ${noteHint}\n\nRequirements:\n- 80 to 150 notes covering THREE sections in order: (1) intro / mukhda hook, (2) verse / antara, (3) chorus / second hook repeat.\n- Use the song's real key/raga; vary durations across 16n / 8n / 4n / 2n for natural rhythm — do NOT flatten everything to 8n.\n- Add short transliterated 'lyric' syllables on vocal notes; leave empty for instrumental.\n- If ambiguous, pick the most famous version and name it in 'notesAbout' (e.g. film + year + singer for Indian songs).`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_song",
              description: "Return the transcribed melody as a sequence of notes.",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string", description: "Resolved song title." },
                  key: { type: "string", description: "Musical key, e.g. 'C major'." },
                  tempo: { type: "number", description: "BPM, 40-220." },
                  notesAbout: { type: "string", description: "Short note about the transcription or alternate match." },
                  notes: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        note: { type: "string", description: "Pitch like C4, D#4 — or drum pad: kick/snare/hat/tom." },
                        duration: { type: "string", enum: ["16n", "8n", "4n", "2n", "1n"] },
                        lyric: { type: "string" },
                      },
                      required: ["note", "duration", "lyric"],
                    },
                  },
                },
                required: ["title", "key", "tempo", "notes", "notesAbout"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_song" } },
      }),
    });

    if (res.status === 429) throw new Error("Rate limit exceeded. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits to your Lovable workspace.");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return a structured response");
    return ResponseSchema.parse(JSON.parse(args));
  });
