import { cleanToMarkdown } from "../../../fetch/clean";
import { MIN_PAGE_CHARS } from "../../../ingest/config";
import { originOf } from "../../generate/nodes/identify/grounding";
import { LIVE_MAX_CHARS, LIVE_PAGES, LIVE_TIMEOUT_MS } from "../config";
import type { ChatDeps } from "../deps";
import type { ChatStateType, ChatUpdate, ExternalDoc } from "../state";

// The other outside lookup (SRS FR-CHAT-6): read the official docs live for what the stored text
// lacks.
//
//   state.grade.missing = "fs.writeFile", docsUrl = "https://nodejs.org/docs/latest/api/"
//     1. search the web, only on nodejs.org, for "Node.js fs.writeFile"
//     2. keep the best 2 results that really are on the official site
//     3. download them (the safe fetcher), clean them to Markdown, skip pages with no text
//     -> { external: [{ type: "official", title: "File system | Node.js", url, markdown }] }
//
// Never throws and never takes longer than 20 seconds: a failed search, a page that does not
// load or a technology with no known docs site simply gives an empty list.

export async function liveFetch(
  state: ChatStateType,
  deps: ChatDeps,
): Promise<ChatUpdate> {
  try {
    return { external: await lookup(state, deps) };
  } catch {
    return { external: [] };
  }
}

async function lookup(
  state: ChatStateType,
  deps: ChatDeps,
): Promise<ExternalDoc[]> {
  const { name, docsUrl, officialUrl } = state.technology;
  const origins = new Set(
    [docsUrl, officialUrl].map(originOf).filter((o): o is string => o !== null),
  );
  if (origins.size === 0) return [];

  const signal = AbortSignal.timeout(LIVE_TIMEOUT_MS);
  const topic = state.grade?.missing || state.standaloneQuery;
  const hits = await deps.searchWeb(`${name} ${topic}`, {
    includeDomains: [...origins].map((origin) => new URL(origin).hostname),
    signal,
  });

  // the search is only asked to stay on the official site: check that it did
  const urls = [
    ...new Set(
      hits
        .filter((hit) => origins.has(originOf(hit.url) ?? ""))
        .map((hit) => hit.url),
    ),
  ].slice(0, LIVE_PAGES);

  const pages = await Promise.all(urls.map((url) => load(url, deps, signal)));
  return pages.filter((page): page is ExternalDoc => page !== null);
}

async function load(
  url: string,
  deps: ChatDeps,
  signal: AbortSignal,
): Promise<ExternalDoc | null> {
  try {
    const fetched = await deps.fetchPage(url, { signal });
    const cleaned = cleanToMarkdown({
      body: fetched.body,
      url: fetched.url,
      contentType: fetched.contentType,
    });
    if (cleaned.markdown.length < MIN_PAGE_CHARS) return null;
    return {
      url: fetched.url,
      title: cleaned.title || fetched.url,
      type: "official",
      markdown: cleaned.markdown.slice(0, LIVE_MAX_CHARS),
    };
  } catch {
    return null; // one page that does not load must not lose the other
  }
}
