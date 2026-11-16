import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/guides/<id>/restore with the session and the restoring replaced by fakes: what is
// refused before anything is restored, and what is passed on and sent back.

const GUIDE_ID = "7f1b6a52-7d7c-4c58-8a0e-2f2c5a8f6b11";

const mocks = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  restoreVersion: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/guide/edit/restore", () => ({
  restoreVersion: mocks.restoreVersion,
}));

import { POST } from "@/app/api/guides/[id]/restore/route";

const call = (
  body: unknown,
  id = GUIDE_ID,
  headers: Record<string, string> = { "content-type": "application/json" },
) =>
  POST(
    new Request(`http://localhost/api/guides/${id}/restore`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  mocks.user = { id: "u1" };
  mocks.restoreVersion
    .mockReset()
    .mockResolvedValue({ ok: true, versionId: "v-4", versionNo: 4 });
});

describe("POST /api/guides/:id/restore", () => {
  it("refuses a bad guide id (400), non-JSON (415) and a signed-out caller (401)", async () => {
    expect((await call({ versionNo: 1 }, "not-a-uuid")).status).toBe(400);
    expect(
      (await call("x", GUIDE_ID, { "content-type": "text/plain" })).status,
    ).toBe(415);
    mocks.user = null;
    expect((await call({ versionNo: 1 })).status).toBe(401);
    expect(mocks.restoreVersion).not.toHaveBeenCalled();
  });

  it("refuses a body that is too large (413), not JSON or the wrong shape (400)", async () => {
    expect((await call("x".repeat(1_001))).status).toBe(413);
    expect((await call("{not json")).status).toBe(400);
    for (const bad of [
      {},
      { versionNo: 0 },
      { versionNo: 1.5 },
      { versionNo: "1" },
    ]) {
      expect((await call(bad)).status).toBe(400);
    }
    expect(mocks.restoreVersion).not.toHaveBeenCalled();
  });

  it("passes on the refusal of the restoring step, with its message and status", async () => {
    for (const [status, error] of [
      [400, "That is already the current version"],
      [404, "There is no such version"],
    ] as const) {
      mocks.restoreVersion.mockResolvedValueOnce({ ok: false, status, error });
      const response = await call({ versionNo: 1 });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
    }
  });

  it("restores as the signed-in person and returns the new version (201)", async () => {
    const response = await call({ versionNo: 1 });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ versionId: "v-4", versionNo: 4 });
    expect(mocks.restoreVersion).toHaveBeenCalledWith(expect.anything(), {
      guideId: GUIDE_ID,
      userId: "u1",
      versionNo: 1,
    });
  });
});
