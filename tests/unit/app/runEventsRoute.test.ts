import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/runs/<id>/events with the Supabase session replaced by a fake: who may read, which
// events come back, and what the page gets to know about the run.

const RUN_ID = "7f1b6a52-7d7c-4c58-8a0e-2f2c5a8f6b11";

const mocks = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  run: null as Record<string, unknown> | null,
  events: [] as unknown[],
  slug: null as string | null,
  afterIds: [] as number[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        gt: (_column: string, value: number) => {
          mocks.afterIds.push(value);
          return query;
        },
        order: () => query,
        limit: async () => ({ data: mocks.events, error: null }),
        maybeSingle: async () => ({
          data: table === "runs" ? mocks.run : { slug: mocks.slug },
        }),
      };
      return query;
    },
  }),
}));

import { GET } from "@/app/api/runs/[id]/events/route";

const call = (id: string, query = "") =>
  GET(new Request(`http://localhost/api/runs/${id}/events${query}`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  mocks.user = { id: "u1" };
  mocks.run = { status: "running", error: null, technology_id: null };
  mocks.events = [{ id: 5, type: "docs_found", payload: { count: 3 } }];
  mocks.slug = null;
  mocks.afterIds.length = 0;
});

describe("GET /api/runs/:id/events", () => {
  it("refuses a signed-out caller (401) and a bad id or cursor (400)", async () => {
    mocks.user = null;
    expect((await call(RUN_ID)).status).toBe(401);
    mocks.user = { id: "u1" };
    expect((await call("not-a-uuid")).status).toBe(400);
    expect((await call(RUN_ID, "?after=abc")).status).toBe(400);
    expect((await call(RUN_ID, "?after=-1")).status).toBe(400);
  });

  it("says 404 for a run the caller cannot see", async () => {
    mocks.run = null;
    expect((await call(RUN_ID)).status).toBe(404);
  });

  it("returns the status and the events after the cursor", async () => {
    const response = await call(RUN_ID, "?after=4");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "running",
      error: null,
      slug: null,
      events: mocks.events,
    });
    expect(mocks.afterIds).toEqual([4]);
  });

  it("starts from the beginning when there is no cursor (a reload)", async () => {
    await call(RUN_ID);
    expect(mocks.afterIds).toEqual([0]);
  });

  it("tells the page the technology's real slug and why a run failed", async () => {
    mocks.run = {
      status: "failed",
      error: "No docs found",
      technology_id: "t1",
    };
    mocks.slug = "hono";
    const body = await (await call(RUN_ID)).json();
    expect(body).toMatchObject({
      status: "failed",
      error: "No docs found",
      slug: "hono",
    });
  });
});
