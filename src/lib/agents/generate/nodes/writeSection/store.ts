import { chunkMarkdown } from "../../../../rag/chunker";
import { contentHash, type SourceType } from "../../../../rag/store";
import type { Snippet } from "../../../../mcp/context7";
import type { GenerateDeps } from "../../deps";
import type { Material } from "./input";

// FR-GEN-8: everything a guide was written from is also kept in the knowledge base, so the chat
// can search it later. Cut into chunks, embedded and saved; what is already stored is skipped
// before any embedding is paid for (the same belt as lib/ingest).
//
//   storePages    the documentation pages we downloaded      -> source type "official" (kept 90 days)
//   storeSnippets the code snippets from Context7             -> source type "context7" (kept 30 days)

export function storePages(
  technologyId: string,
  pages: Material[],
  deps: GenerateDeps,
): Promise<void> {
  return storeAll("official", technologyId, pages, deps);
}

export function storeSnippets(
  technologyId: string,
  snippets: Snippet[],
  deps: GenerateDeps,
): Promise<void> {
  return storeAll("context7", technologyId, snippets, deps);
}

async function storeAll(
  type: SourceType,
  technologyId: string,
  items: { url: string; title: string; markdown: string }[],
  deps: GenerateDeps,
): Promise<void> {
  for (const item of items) {
    await deps.storeChunks({
      technologyId,
      source: {
        url: item.url,
        title: item.title,
        type,
        contentHash: contentHash(item.markdown),
      },
      chunks: chunkMarkdown(item.markdown, { title: item.title }),
    });
  }
}
