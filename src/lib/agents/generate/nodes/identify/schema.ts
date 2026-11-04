import { z } from "zod";

// The shape of the model's answer. Every field is required (OpenAI strict mode), so "no value"
// is `null` and the fields that do not apply to the outcome are null or an empty list.
//
// There is deliberately NO version field: asked for one, the small model sometimes never stops
// writing it (the request hung until the output limit). The version is read from the search
// results instead (see findVersion in grounding.ts).

export const IdentifyAnswer = z.object({
  outcome: z.enum(["single", "ambiguous", "unknown"]),
  name: z.string().nullable(),
  officialUrl: z.string().nullable(),
  docsUrl: z.string().nullable(),
  candidates: z.array(
    z.object({ name: z.string(), description: z.string(), url: z.string() }),
  ),
});

export type IdentifyAnswerType = z.infer<typeof IdentifyAnswer>;
