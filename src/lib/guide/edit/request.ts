import { z } from "zod";

// What the edit route accepts (POST /api/guides/<id>/versions). Only the sections that were
// changed are sent, with their new Markdown; titles and sources are not editable here.
//
//   { "sections": [{ "key": "installation", "markdown": "Run `npm i zod` [1]." }],
//     "note": "Fixed the install command" }

export const MAX_BODY_CHARS = 200_000;
export const MAX_SECTION_CHARS = 30_000;
export const MAX_NOTE_CHARS = 200;
const MAX_SECTIONS = 30;

export const EditRequest = z.object({
  sections: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        markdown: z.string().max(MAX_SECTION_CHARS),
      }),
    )
    .min(1)
    .max(MAX_SECTIONS),
  note: z.string().trim().max(MAX_NOTE_CHARS).optional(),
});

export type EditRequestType = z.infer<typeof EditRequest>;
