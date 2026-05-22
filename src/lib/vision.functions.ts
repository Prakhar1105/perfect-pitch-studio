import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  imageDataUrl: z.string().min(20).max(8_000_000),
  mode: z.enum(["photo", "painting"]).optional().default("photo"),
});

const ResponseSchema = z.object({
  instrument: z.string(),
  confidence: z.number().min(0).max(100),
  family: z.string(),
  description: z.string(),
  origin: z.string().optional().default("Unknown"),
  era: z.string().optional().default("Unknown"),
  history: z.string().optional().default(""),
  cultural: z.string().optional().default(""),
  funFact: z.string().optional().default(""),
  isArtwork: z.boolean().optional().default(false),
});

export const analyzeInstrument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const paintingHint =
      data.mode === "painting"
        ? "This image is a painting, fresco, sculpture or museum artwork. Identify the depicted instrument as a musicologist would. Set isArtwork to true."
        : "This image is a photograph of a real or partial instrument.";

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
              "You are a master ethnomusicologist and museum curator. Identify the most prominent musical instrument in the image and provide rich, scholarly, but accessible context. Always respond via the provided tool.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${paintingHint} Identify the most prominent musical instrument. Provide: a 1-2 sentence description, geographic origin, era/century, a 2-3 sentence history, a 1-2 sentence note on cultural significance, and a short surprising fun fact.`,
              },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_instrument",
              description: "Report the identified instrument with museum-grade context.",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  instrument: { type: "string" },
                  confidence: { type: "number", description: "0 to 100" },
                  family: {
                    type: "string",
                    description: "One of: String, Keyboard, Wind, Brass, Percussion, Plucked, Bowed, Electronic, Unknown",
                  },
                  description: { type: "string" },
                  origin: { type: "string" },
                  era: { type: "string" },
                  history: { type: "string" },
                  cultural: { type: "string" },
                  funFact: { type: "string" },
                  isArtwork: { type: "boolean" },
                },
                required: [
                  "instrument",
                  "confidence",
                  "family",
                  "description",
                  "origin",
                  "era",
                  "history",
                  "cultural",
                  "funFact",
                  "isArtwork",
                ],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_instrument" } },
      }),
    });

    if (res.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a moment.");
    }
    if (res.status === 402) {
      throw new Error("AI credits exhausted. Please add credits to your Lovable workspace.");
    }
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
