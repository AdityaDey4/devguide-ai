import { afterEach, describe, expect, it, vi } from "vitest";
import { guideHref, startSearch } from "@/lib/search/client";

// The browser side of a search, with fetch replaced: what is sent, how answers are read, and the
// address of the page to open.

function stubFetch(response: () => Promise<Response>) {
  const fetchMock = vi.fn((...args: Parameters<typeof fetch>) => {
    void args;
    return response();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(Response.json(body, { status }));

afterEach(() => vi.unstubAllGlobals());

describe("startSearch", () => {
  it("sends the name, and the retry flag only when it is a retry", async () => {
    const fetchMock = stubFetch(() => json({ slug: "zod" }));
    await startSearch("Zod");
    await startSearch("Zod", true);

    const bodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    expect(bodies).toEqual([{ q: "Zod" }, { q: "Zod", retry: true }]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/search");
  });

  it("reads a guide answer and a run answer", async () => {
    stubFetch(() => json({ slug: "zod" }));
    expect(await startSearch("Zod")).toEqual({
      ok: true,
      answer: { slug: "zod", runId: undefined },
    });

    stubFetch(() => json({ slug: "hono", runId: "r1" }, 202));
    expect(await startSearch("Hono")).toEqual({
      ok: true,
      answer: { slug: "hono", runId: "r1" },
    });
  });

  it("says so, in words, when the server refuses, answers nonsense, or is unreachable", async () => {
    stubFetch(() => json({ error: "Sign in first" }, 401));
    expect(await startSearch("Zod")).toMatchObject({ ok: false });

    stubFetch(() => json({ nothing: "useful" }));
    expect(await startSearch("Zod")).toMatchObject({ ok: false });

    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect(await startSearch("Zod")).toEqual({
      ok: false,
      error: "Could not reach the server. Check your connection.",
    });
  });
});

describe("guideHref", () => {
  it("opens a guide by its slug", () => {
    expect(guideHref({ slug: "zod" }, "Zod")).toBe("/g/zod");
  });

  it("opens a run with the typed name, safely encoded, so Retry can send it again", () => {
    expect(guideHref({ slug: "hono", runId: "r1" }, "Hono & co")).toBe(
      "/g/hono?run=r1&q=Hono%20%26%20co",
    );
  });
});
