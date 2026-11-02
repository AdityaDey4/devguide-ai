import { cleanToMarkdown } from "../fetch/clean";
import { chunkMarkdown } from "../rag/chunker";
import { contentHash } from "../rag/store";
import { MIN_PAGE_CHARS } from "./config";
import type { DiscoveredPage, IngestDeps, PageOutcome } from "./types";

// ONE page through the belt: fetch -> clean -> chunk -> store.
//
//   Never throws: whatever goes wrong becomes a "failed" outcome with the reason,
//   so one bad page cannot stop the rest of the site.

export async function ingestPage(
  page: DiscoveredPage,
  technologyId: string,
  deps: IngestDeps,
  signal?: AbortSignal,
): Promise<PageOutcome> {
  const empty = { chunks: 0, inserted: 0, skipped: 0, tokens: 0 };

  try {
    // 1. Download the page (guarded against unsafe addresses, with timeout and size limit).
    const fetched = await deps.fetchPage(page.url, { signal });

    // 2. Turn it into clean Markdown.
    const cleaned = cleanToMarkdown({
      body: fetched.body,
      url: fetched.url,
      contentType: fetched.contentType,
    });
    const title = cleaned.title || page.title;
    if (cleaned.markdown.length < MIN_PAGE_CHARS) {
      return { url: fetched.url, title, status: "too_short", ...empty };
    }

    // 3. Cut it into chunks.
    const chunks = chunkMarkdown(cleaned.markdown, { title });

    // 4. Save them (the store skips what it already has, before embedding).
    const stored = await deps.storeChunks({
      technologyId,
      source: {
        url: fetched.url, // after redirects, so two links to one page are one source
        title,
        type: "official",
        contentHash: contentHash(cleaned.markdown),
      },
      chunks,
    });

    return {
      url: fetched.url,
      title,
      status: "stored",
      chunks: stored.total,
      inserted: stored.inserted,
      skipped: stored.skipped,
      tokens: stored.tokens,
    };
  } catch (error) {
    return {
      url: page.url,
      title: page.title,
      status: "failed",
      ...empty,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
