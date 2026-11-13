import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/guides/<id>/versions with the session and the saving replaced by fakes: who and what is
// refused before anything is saved, and what is passed on and sent back.

const GUIDE_ID = "7f1b6a52-7d7c-4c58-8a0e-2f2c5a8f6b11";

const mocks = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  saveEdit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/guide/edit/saveEdit", () => ({ saveEdit: mocks.saveEdit }));

import { POST } from "@/app/api/guides/[id]/versions/route";

const valid = {
  sections: [{ key: "install", markdown: "New text" }],
  note: "Fixed",
};

const call = (
  body: unknown,
  id = GUIDE_ID,
  headers: Record<string, string> = { "content-type": "application/json" },
) =>
  POST(
    new Request(`http://localhost/api/guides/${id}/versions`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  mocks.user = { id: "u1" };
  mocks.saveEdit.mockReset().mockResolvedValue({
    ok: true,
    guideId: "fork-1",
    versionId: "v-2",
    versionNo: 2,
    forked: true,
  });
});

describe("POST /api/guides/:id/versions: what is refused", () => {
  it("refuses a bad guide id (400), non-JSON (415) and a signed-out caller (401)", async () => {
    expect((await call(valid, "not-a-uuid")).status).toBe(400);
    expect(
      (await call("x", GUIDE_ID, { "content-type": "text/plain" })).status,
    ).toBe(415);
    mocks.user = null;
    expect((await call(valid)).status).toBe(401);
    expect(mocks.saveEdit).not.toHaveBeenCalled();
  });

  it("refuses a body that is too large (413), not JSON (400) or the wrong shape (400)", async () => {
    expect((await call("x".repeat(200_001))).status).toBe(413);
    expect((await call("{not json")).status).toBe(400);
    expect((await call({ sections: [] })).status).toBe(400);
    expect((await call({ note: "no sections" })).status).toBe(400);
    expect(mocks.saveEdit).not.toHaveBeenCalled();
  });

  it("passes on the refusal of the saving step, with its message and status", async () => {
    for (const [status, error] of [
      [400, "Nothing was changed"],
      [404, "There is no such guide"],
      [409, "This guide has no text to edit"],
    ] as const) {
      mocks.saveEdit.mockResolvedValueOnce({ ok: false, status, error });
      const response = await call(valid);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
    }
  });
});

describe("POST /api/guides/:id/versions: saving", () => {
  it("saves as the signed-in person, only key and markdown, and says where it went", async () => {
    const response = await call({
      sections: [{ key: "install", markdown: "New text", title: "Hacked" }],
      note: "Fixed",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      guideId: "fork-1",
      versionId: "v-2",
      versionNo: 2,
      forked: true,
    });
    expect(mocks.saveEdit).toHaveBeenCalledWith(expect.anything(), {
      guideId: GUIDE_ID,
      userId: "u1",
      edits: [{ key: "install", markdown: "New text" }],
      note: "Fixed",
    });
  });
});
