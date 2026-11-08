import { z } from "zod";

// The shape of the model's answer. Every field is required (OpenAI strict mode), so "no value"
// is `null` and the fields that do not apply to the outcome are null or an empty list.
//
// The model never writes a URL: it points at a search result by its number, and the address is
// looked up from the results (see resultUrl in grounding.ts). Asked to copy long addresses
// (java: docs.oracle.com/...#Java_Overview_1_0_0_...), the small model looped on them until the
// output limit and the answer was cut off. The same happened with a version field, so there is
// none: the version is read from the search results (see findVersion).

export const IdentifyAnswer = z.object({
  outcome: z.enum(["single", "ambiguous", "unknown"]),
  name: z.string().nullable(),
  /** Number of the search result that is the official site, as shown in the prompt (1, 2, ...). */
  officialResult: z.number().int().nullable(),
  candidates: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      /** Number of the search result that is this candidate's official site. */
      result: z.number().int(),
    }),
  ),
});

export type IdentifyAnswerType = z.infer<typeof IdentifyAnswer>;
