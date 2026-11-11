import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/runs/<id> with Next's `after`, the session and the run modules replaced by fakes:
// who may answer, what is refused, that only the first answer resumes the run, and that the
// graph carries on only AFTER the response.

const RUN_ID = "7f1b6a52-7d7c-4c58-8a0e-2f2c5a8f6b11";

const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as (() => unknown)[],
  user: { id: "u1" } as { id: string } | null,
  checked: {} as Record<string, unknown>,
  claimed: true,
  checkAnswer: vi.fn(),
  claimWaitingRun: vi.fn(),
  resumeGeneration: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: (callback: () => unknown) => void mocks.afterCallbacks.push(callback),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/agents/generate/run", () => ({
  resumeGeneration: mocks.resumeGeneration,
}));
vi.mock("@/lib/agents/generate/run/answer", () => ({
  checkAnswer: mocks.checkAnswer,
  claimWaitingRun: mocks.claimWaitingRun,
}));

import { POST } from "@/app/api/runs/[id]/route";

const call = (
  body: unknown,
  id = RUN_ID,
  headers: Record<string, string> = { "content-type": "application/json" },
) =>
  POST(
    new Request(`http://localhost/api/runs/${id}`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

const choice = { choice: "candidate", url: "https://bun.sh" };

beforeEach(() => {
  mocks.afterCallbacks.length = 0;
  mocks.user = { id: "u1" };
  mocks.checked = { ok: true, answer: choice };
  mocks.checkAnswer.mockReset().mockImplementation(async () => mocks.checked);
  mocks.claimWaitingRun.mockReset().mockResolvedValue(true);
  mocks.resumeGeneration.mockReset().mockResolvedValue({ status: "completed" });
});

describe("POST /api/runs/:id: who and what is refused", () => {
  it("refuses a bad run id (400), non-JSON (415) and a signed-out caller (401)", async () => {
    expect((await call(choice, "not-a-uuid")).status).toBe(400);
    expect(
      (await call("x", RUN_ID, { "content-type": "text/plain" })).status,
    ).toBe(415);
    mocks.user = null;
    expect((await call(choice)).status).toBe(401);
    expect(mocks.checkAnswer).not.toHaveBeenCalled();
  });

  it("refuses a body that is too large (413) or not JSON (400)", async () => {
    expect((await call({ x: "y".repeat(2000) })).status).toBe(413);
    expect((await call("not json")).status).toBe(400);
    expect(mocks.checkAnswer).not.toHaveBeenCalled();
  });

  it("passes on the reason when the answer does not check out", async () => {
    mocks.checked = { ok: false, status: 409, error: "Not waiting" };
    const response = await call(choice);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Not waiting" });
    expect(mocks.claimWaitingRun).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it("lets only the first answer through: a second click gets 409", async () => {
    mocks.claimWaitingRun.mockResolvedValue(false);
    expect((await call(choice)).status).toBe(409);
    expect(mocks.afterCallbacks).toHaveLength(0);
  });
});

describe("POST /api/runs/:id: resuming", () => {
  it("answers 202 at once and resumes the graph only AFTER the response", async () => {
    const response = await call(choice);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });

    expect(mocks.resumeGeneration).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(1);
    await mocks.afterCallbacks[0]();
    expect(mocks.resumeGeneration).toHaveBeenCalledWith(RUN_ID, choice);
  });
});
