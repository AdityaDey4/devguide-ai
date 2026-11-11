import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/search with Next's `after`, the Supabase session and the search/run modules replaced
// by fakes: who may call it, what is refused, what each answer looks like, and that the graph
// starts only AFTER the response.

const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as (() => unknown)[],
  user: { id: "user-1" } as { id: string } | null,
  resolution: {} as Record<string, unknown>,
  createGenerationRun: vi.fn(),
  executeGeneration: vi.fn(),
  resolveSearch: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: (callback: () => unknown) => void mocks.afterCallbacks.push(callback),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
  }),
}));
vi.mock("@/lib/search", () => ({ resolveSearch: mocks.resolveSearch }));
vi.mock("@/lib/agents/generate/run", () => ({
  createGenerationRun: mocks.createGenerationRun,
  executeGeneration: mocks.executeGeneration,
}));

import { POST, maxDuration } from "@/app/api/search/route";

const call = (
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
) =>
  POST(
    new Request("http://localhost/api/search", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  mocks.afterCallbacks.length = 0;
  mocks.user = { id: "user-1" };
  mocks.resolveSearch.mockReset();
  mocks.resolveSearch.mockImplementation(async () => mocks.resolution);
  mocks.createGenerationRun.mockReset().mockResolvedValue("run-9");
  mocks.executeGeneration
    .mockReset()
    .mockResolvedValue({ status: "completed" });
});

describe("POST /api/search: who and what is refused", () => {
  it("refuses a request that is not JSON (415)", async () => {
    const response = await call("q=zod", {
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(response.status).toBe(415);
    expect(mocks.resolveSearch).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller (401) before doing any work", async () => {
    mocks.user = null;
    expect((await call({ q: "zod" })).status).toBe(401);
    expect(mocks.resolveSearch).not.toHaveBeenCalled();
    expect(mocks.createGenerationRun).not.toHaveBeenCalled();
  });

  it("refuses a body that is too large (413) or is not {q: string} (400)", async () => {
    expect((await call({ q: "x".repeat(2000) })).status).toBe(413);
    expect((await call("not json")).status).toBe(400);
    expect((await call({ query: "zod" })).status).toBe(400);
    expect((await call({ q: 42 })).status).toBe(400);
    expect(mocks.resolveSearch).not.toHaveBeenCalled();
  });

  it("says how long the text may be when it is the wrong length (FR-SRCH-1)", async () => {
    mocks.resolution = { kind: "invalid", reason: "too_short" };
    const response = await call({ q: "x" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Type 2 to 60 characters",
    });
  });
});

describe("POST /api/search: the answers", () => {
  it("opens an existing guide (200) without starting anything", async () => {
    mocks.resolution = { kind: "guide", slug: "zod" };
    const response = await call({ q: "zod" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slug: "zod" });
    expect(mocks.createGenerationRun).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it("points at the run already writing it (200) without starting another (FR-GEN-12)", async () => {
    mocks.resolution = { kind: "join", slug: "hono", runId: "run-3" };
    const response = await call({ q: "hono" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slug: "hono", runId: "run-3" });
    expect(mocks.createGenerationRun).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it("passes the retry flag on, and refuses one that is not true or false", async () => {
    mocks.resolution = { kind: "new", query: "Mercury", slug: "mercury" };
    await call({ q: "mercury", retry: true });
    expect(mocks.resolveSearch).toHaveBeenLastCalledWith(
      expect.anything(),
      "mercury",
      { retry: true },
    );
    await call({ q: "mercury" });
    expect(mocks.resolveSearch).toHaveBeenLastCalledWith(
      expect.anything(),
      "mercury",
      { retry: undefined },
    );
    expect((await call({ q: "mercury", retry: "yes" })).status).toBe(400);
  });

  it("starts a new run: the record is made for this user and the ids are returned (202)", async () => {
    mocks.resolution = { kind: "new", query: "Some Thing", slug: "something" };
    const response = await call({ q: "some thing" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      slug: "something",
      runId: "run-9",
    });
    expect(mocks.createGenerationRun).toHaveBeenCalledWith("user-1");
  });

  it("runs the graph only AFTER the response: scheduled with after(), not awaited", async () => {
    mocks.resolution = { kind: "new", query: "Some Thing", slug: "something" };
    await call({ q: "some thing" });

    expect(mocks.executeGeneration).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(1);

    await mocks.afterCallbacks[0]();
    expect(mocks.executeGeneration).toHaveBeenCalledWith("run-9", "Some Thing");
  });

  it("allows the background run as long as the platform lets it (a guide takes minutes)", () => {
    expect(maxDuration).toBeGreaterThanOrEqual(300);
  });
});
