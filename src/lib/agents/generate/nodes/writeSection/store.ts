import { chunkMarkdown } from "../../../../rag/chunker";
import { contentHash } from "../../../../rag/store";
import type { GenerateDeps } from "../../deps";
import type { Material } from "./input";

// FR-GEN-8: every page fetched for a guide is also kept in the knowledge base, so the chat can
// search it later. Cut into chunks, embedded and saved; what is already stored is skipped before
// any embedding is paid for (the same belt as lib/ingest).

export async function storePages(
  technologyId: string,
  pages: Material[],
  deps: GenerateDeps,
): Promise<void> {
  for (const page of pages) {
    await deps.storeChunks({
      technologyId,
      source: {
        url: page.url,
        title: page.title,
        type: "official",
        contentHash: contentHash(page.markdown),
      },
      chunks: chunkMarkdown(page.markdown, { title: page.title }),
    });
  }
}
