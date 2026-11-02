import { buildUnits } from "./buildUnits";
import { pack } from "./pack";
import { parseBlocks } from "./parseBlocks";
import { splitLarge } from "./splitLarge";
import type { Chunk, ChunkOptions } from "./types";

export type { Chunk, ChunkOptions } from "./types";

// Cuts a page of Markdown into chunks for search (SRS FR-KB-2).
//
//   const chunks = chunkMarkdown(markdown, { title: "Basic usage" });
//   chunks[0] -> { content: "# Basic usage\n\n...", headingPath: "Basic usage", tokens: 612 }
//
// Chunks are 500 to 800 tokens, cut at headings, with about 15% overlap when a section has to
// be cut by size. A code block is never cut (unless it is over 2,000 tokens).
// The numbers live in config.ts. Read this file first: it is the whole recipe.

export function chunkMarkdown(
  markdown: string,
  options: ChunkOptions = {},
): Chunk[] {
  const blocks = parseBlocks(markdown); //              1. headings, code blocks, text
  const units = buildUnits(blocks, options.title); //    2. keep headings and intro lines with their text
  const sized = splitLarge(units); //                    3. split what is too big for one chunk
  return pack(sized); //                                 4. fill chunks, add the overlap
}
