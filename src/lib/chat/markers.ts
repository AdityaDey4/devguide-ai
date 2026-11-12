import type { ChatCitation } from "../agents/chat";
import { CODE, linkAddress, MARKER } from "../guide/citations";

// Makes a chat answer ready to show: the [n] markers of sources that have a web page become
// links. The guide's own text has no page, so its markers stay plain text.
//
//   linkAnswer("Use z.url() [1]. See also [2].", [
//     { n: 1, title: "Defining schemas", url: "https://zod.dev/api", kind: "docs" },
//     { n: 2, title: "Zod guide: Setup", url: null, kind: "guide" },
//   ])
//     -> "Use z.url() [1](https://zod.dev/api). See also [2]."
//
// Markers inside code are left alone (same rule as the guide page).

export function linkAnswer(text: string, citations: ChatCitation[]): string {
  return text
    .split(CODE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(MARKER, (marker, digits: string) => {
            const citation = citations.find((c) => c.n === Number(digits));
            const address = citation?.url && linkAddress(citation.url);
            return address ? `[${digits}](${address})` : marker;
          }),
    )
    .join("");
}
