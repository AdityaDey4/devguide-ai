import { withoutMarkers } from "../../guide/citations";
import { chunkMarkdown } from "../chunker";
import { contentHash, storeChunks } from "../store";
import type { StoreInput, StoreResult } from "../store";
import { createServiceClient } from "../../supabase/service";
import { removeStaleGuideChunks } from "./stale";

// Makes a guide's own text searchable for the chat (SRS FR-KB-5, FR-KB-8, M6). Called every time
// a guide version is saved: the end of a run, a partial draft, and later an edit.
//
//   await indexGuide({ technology, guideId, sections })
//     -> { inserted: 9, removed: 3 }
//
// The steps:
//   1. Each section that cites at least one source is cut into chunks, with its [n] markers
//      taken out (they only mean something inside the section). Sections that cite nothing are
//      just "could not be written" notes and are left out.
//   2. All the chunks are stored together, tied to the guide, with no fetched page behind them.
//      Text that is already stored is skipped, so an unchanged section costs nothing.
//   3. Chunks of this guide that are not in the new text any more are deleted, so the chat never
//      answers from a passage the guide no longer has.
// Server only.

export type IndexableSection = {
  title: string;
  markdown: string;
  citations: unknown[];
};

export type IndexGuideInput = {
  technology: {
    id: string;
    name: string;
    slug: string;
    version: string | null;
  };
  guideId: string;
  sections: IndexableSection[];
};

export type IndexGuideResult = { inserted: number; removed: number };

export type IndexGuideDeps = {
  store: (input: StoreInput) => Promise<StoreResult>;
  removeStale: (guideId: string, keep: string[]) => Promise<number>;
};

const realDeps: IndexGuideDeps = {
  store: (input) => storeChunks(input),
  removeStale: (guideId, keep) =>
    removeStaleGuideChunks(createServiceClient(), guideId, keep),
};

export async function indexGuide(
  { technology, guideId, sections }: IndexGuideInput,
  deps: IndexGuideDeps = realDeps,
): Promise<IndexGuideResult> {
  // 1. chunks of every section that is backed by sources
  const chunks = sections
    .filter((section) => section.citations.length > 0)
    .flatMap((section) =>
      chunkMarkdown(withoutMarkers(section.markdown), {
        title: `${technology.name} guide: ${section.title}`,
      }),
    );

  // 2. store the new text
  const stored =
    chunks.length > 0
      ? await deps.store({
          technologyId: technology.id,
          guideId,
          source: {
            url: `guide:${technology.slug}`,
            title: `${technology.name} guide`,
            type: "guide",
          },
          chunks,
          ...(technology.version && { techVersion: technology.version }),
        })
      : { inserted: 0 };

  // 3. drop what the new text no longer has
  const removed = await deps.removeStale(
    guideId,
    chunks.map((chunk) => contentHash(chunk.content)),
  );
  return { inserted: stored.inserted, removed };
}
