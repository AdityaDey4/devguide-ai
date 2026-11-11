// Starting a search from the browser: used by the Home search box and the Retry button.
//
//   const result = await startSearch("Hono");
//   result -> { ok: true, answer: { slug: "hono", runId: "…" } }   a run to watch
//          |  { ok: true, answer: { slug: "zod" } }                a guide to read
//          |  { ok: false, error: "Could not reach the server. …" }
//
//   guideHref(result.answer, "Hono")  ->  "/g/hono?run=…&q=Hono"   (the page keeps the typed name
//                                          so Retry can send it again)
//
// Browser only: no server code in here.

export type SearchAnswer = { slug: string; runId?: string };

export type SearchResult =
  { ok: true; answer: SearchAnswer } | { ok: false; error: string };

/** `retry`: after a failure, so a partial draft is not reopened instead of trying again. */
export async function startSearch(
  q: string,
  retry = false,
): Promise<SearchResult> {
  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(retry ? { q, retry } : { q }),
    });
    const body: unknown = await response.json().catch(() => null);
    const answer = response.ok ? readAnswer(body) : null;
    if (!answer) {
      return {
        ok: false,
        error: "Could not start the search. Please try again.",
      };
    }
    return { ok: true, answer };
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Check your connection.",
    };
  }
}

export function guideHref(answer: SearchAnswer, q: string): string {
  if (!answer.runId) return `/g/${answer.slug}`;
  return `/g/${answer.slug}?run=${answer.runId}&q=${encodeURIComponent(q)}`;
}

function readAnswer(body: unknown): SearchAnswer | null {
  if (!body || typeof body !== "object" || !("slug" in body)) return null;
  const runId = "runId" in body ? String(body.runId) : undefined;
  return { slug: String(body.slug), runId };
}
