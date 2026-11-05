import { z } from "zod";
import { SECTION_KEYS } from "../../sections";

// The model's answer: for each standard section, which pages feed it. The section list itself is
// fixed (sections.ts); the model cannot add, drop or rename sections.

export const OutlineAnswer = z.object({
  sections: z.array(
    z.object({
      key: z.enum(SECTION_KEYS as [string, ...string[]]),
      pageUrls: z.array(z.string()),
      codeHeavy: z.boolean(),
    }),
  ),
});

export type OutlineAnswerType = z.infer<typeof OutlineAnswer>;
