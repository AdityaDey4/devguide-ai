import { Context7Session } from "./client";
import { MAX_SNIPPETS, TOTAL_TIMEOUT_MS } from "./config";
import { parseLibraries, parseSnippets } from "./parse";
import type { Context7Deps, Library, Snippet } from "./types";

export type { Snippet } from "./types";

// Current code examples for a library, from Context7 (docs/03-Architecture.md section 7.1).
//
//   const snippets = await fetchSnippets({ library: "Zod", topic: "Installation: show how to install it" });
//   snippets[0] -> { title: "Define and parse schemas with Zod",
//                    url: "https://github.com/colinhacks/zod/blob/main/...", markdown: "..." }
//
// Two calls over MCP: `resolve-library-id` (which library is "Zod"?) then `query-docs` (examples
// for this topic). It NEVER throws: if Context7 is slow, rate-limited, down or finds nothing, the
// answer is an empty list and the section is simply written without snippets. Server only.

const realDeps: Context7Deps = {
  open: () => Context7Session.open(),
  onError: (error) =>
    console.error(
      "Context7 skipped:",
      error instanceof Error ? error.message : error,
    ),
};

export async function fetchSnippets(
  query: { library: string; topic: string },
  deps: Context7Deps = realDeps,
): Promise<Snippet[]> {
  try {
    return await withTimeout(lookup(query, deps), TOTAL_TIMEOUT_MS);
  } catch (error) {
    deps.onError(error);
    return [];
  }
}

async function lookup(
  query: { library: string; topic: string },
  deps: Context7Deps,
): Promise<Snippet[]> {
  const session = await deps.open();
  try {
    // 1. Which library is this?
    const listed = await session.call("resolve-library-id", {
      libraryName: query.library,
      query: query.topic,
    });
    const library = pickLibrary(parseLibraries(listed), query.library);
    if (!library) return [];

    // 2. Examples for this topic.
    const answer = await session.call("query-docs", {
      libraryId: library.id,
      query: query.topic,
    });
    return parseSnippets(answer).slice(0, MAX_SNIPPETS);
  } finally {
    await session.close().catch(() => {}); // closing must never hide the real result
  }
}

/** Context7 lists the best match first; one whose title is exactly the name wins over that. */
function pickLibrary(libraries: Library[], name: string): Library | undefined {
  const wanted = name.trim().toLowerCase();
  return (
    libraries.find((library) => library.title.toLowerCase() === wanted) ??
    libraries[0]
  );
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Context7 took longer than ${ms / 1000} seconds`)),
      ms,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
