import type { GuideSection } from "../agents/generate/guide/saveGuide";

// Makes a saved guide ready to read: [1] markers become links, and the whole guide gets ONE
// numbered list of sources.
//
// Each section numbers its own sources, so [1] in section A can be a different page than [1] in
// section B. Here the numbers are made guide-wide, in order of first use:
//
//   A: "Zod parses data [1]."   (A's 1 = zod.dev/api)
//   B: "See also [2][1]."       (B's 1 = zod.dev/basics, B's 2 = zod.dev/api)
//   becomes
//   A: "Zod parses data [1](https://zod.dev/api)."
//   B: "See also [1](https://zod.dev/api)[2](https://zod.dev/basics)."
//   sources: 1 = zod.dev/api, 2 = zod.dev/basics
//
// Not touched: markers inside code, and markers with no matching source.

export type Source = { n: number; url: string; title: string };
export type ReadableSection = {
  key: string;
  title: string;
  markdown: string;
  needsReview: boolean;
};

const CODE = /(```[\s\S]*?```|`[^`\n]*`)/; // a code block, or inline code
const MARKER = /\[(\d+)\]/g; // [1], [23]

export function linkCitations(sections: GuideSection[]) {
  const sources: Source[] = [];

  // The guide-wide number of a page. A page seen for the first time gets the next number.
  function numberOf(url: string, title: string): number {
    let source = sources.find((s) => s.url === url);
    if (!source) {
      source = { n: sources.length + 1, url, title };
      sources.push(source);
    }
    return source.n;
  }

  function linkMarkers(text: string, citations: GuideSection["citations"]) {
    return text.replace(MARKER, (marker, digits: string) => {
      const citation = citations.find((c) => c.n === Number(digits));
      // only web addresses become links
      if (!citation || !/^https?:\/\//.test(citation.url)) return marker;

      // spaces and brackets would break a Markdown link
      const address = encodeURI(citation.url)
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29");
      return `[${numberOf(citation.url, citation.title)}](${address})`;
    });
  }

  const readable: ReadableSection[] = sections.map((section) => {
    // split() keeps the code parts at the odd positions: leave those as they are
    const parts = section.markdown
      .split(CODE)
      .map((part, i) =>
        i % 2 === 1 ? part : linkMarkers(part, section.citations),
      );
    return {
      key: section.key,
      title: section.title,
      markdown: parts.join(""),
      needsReview: section.needs_review,
    };
  });

  return { sections: readable, sources };
}
