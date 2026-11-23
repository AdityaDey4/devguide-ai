import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/chat with the session, the guide lookup and the chat graph replaced by fakes: who and
// what is refused before anything is answered, and the shape of the streamed answer (FR-CHAT-10).

const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as (() => unknown)[],
  saveFetched: vi.fn(),
  user: { id: "u1" } as { id: string } | null,
  scope: null as unknown,
  findChatScope: vi.fn(),
  askGuide: vi.fn(),
  cacheScope: vi.fn(),
  lookupCachedAnswer: vi.fn(),
  saveCachedAnswer: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
  }),
}));
vi.mock("@/lib/chat/scope", () => ({ findChatScope: mocks.findChatScope }));
vi.mock("@/lib/agents/chat", () => ({ askGuide: mocks.askGuide }));
vi.mock("@/lib/agents/chat/realDeps", () => ({ realDeps: { real: true } }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/chat/cache", () => ({
  cacheScope: mocks.cacheScope,
  lookupCachedAnswer: mocks.lookupCachedAnswer,
  saveCachedAnswer: mocks.saveCachedAnswer,
}));
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => void mocks.afterCallbacks.push(callback),
}));
vi.mock("@/lib/chat/saveFetched", () => ({
  saveFetched: mocks.saveFetched,
}));

import { POST } from "@/app/api/chat/route";
import { CHAT_FAILED } from "@/lib/chat/stream";

const scope = {
  technology: {
    id: "t1",
    name: "Zod",
    version: "4.1.0",
    docsUrl: "https://zod.dev",
    officialUrl: "https://zod.dev",
  },
  guideId: "g1",
};
const valid = { slug: "zod", question: "and a URL?", history: [] };

const call = (
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
) =>
  POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

/** The lines of a streamed answer, as objects. */
const lines = async (response: Response) =>
  (await response.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

beforeEach(() => {
  mocks.afterCallbacks.length = 0;
  mocks.saveFetched.mockReset().mockResolvedValue(1);
  mocks.user = { id: "u1" };
  mocks.findChatScope.mockReset().mockResolvedValue(scope);
  mocks.cacheScope.mockReset().mockResolvedValue(null);
  mocks.lookupCachedAnswer.mockReset().mockResolvedValue(null);
  mocks.saveCachedAnswer.mockReset().mockResolvedValue(true);
  mocks.askGuide.mockReset().mockImplementation(async (_input, onToken) => {
    await onToken("Use ");
    await onToken("`z.url()` [1].");
    return {
      answer: "Use `z.url()` [1].",
      origin: "stored_docs",
      cached: false,
      standaloneQuery: "How do I validate a URL with Zod?",
      grade: "GOOD",
      citations: [
        {
          n: 1,
          title: "Defining schemas",
          url: "https://zod.dev/api",
          kind: "docs",
        },
      ],
      toStore: [
        {
          url: "https://zod.dev/api",
          title: "Defining schemas",
          type: "official",
          markdown: "text",
        },
      ],
    };
  });
});

describe("POST /api/chat: what is refused", () => {
  it("refuses non-JSON (415) and a signed-out caller (401), asking nothing", async () => {
    expect((await call("x", { "content-type": "text/plain" })).status).toBe(
      415,
    );
    mocks.user = null;
    expect((await call(valid)).status).toBe(401);
    expect(mocks.askGuide).not.toHaveBeenCalled();
  });

  it("refuses a body that is too large (413) or not JSON (400)", async () => {
    expect((await call("x".repeat(60_001))).status).toBe(413);
    expect((await call("{not json")).status).toBe(400);
  });

  it("refuses a missing, empty or too long question, and a bad history (400)", async () => {
    expect((await call({ ...valid, question: "" })).status).toBe(400);
    expect((await call({ ...valid, question: "   " })).status).toBe(400);
    expect((await call({ ...valid, question: "x".repeat(1001) })).status).toBe(
      400,
    );
    expect((await call({ slug: "zod", question: "hi" })).status).toBe(400);
    expect(
      (await call({ ...valid, history: [{ role: "system", content: "x" }] }))
        .status,
    ).toBe(400);
    expect(
      (
        await call({
          ...valid,
          history: Array.from({ length: 21 }, () => ({
            role: "user",
            content: "x",
          })),
        })
      ).status,
    ).toBe(400);
    expect(mocks.askGuide).not.toHaveBeenCalled();
  });

  it("answers 404 when there is no guide to ask about", async () => {
    mocks.findChatScope.mockResolvedValue(null);
    const response = await call(valid);
    expect(response.status).toBe(404);
    expect(mocks.askGuide).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat: the streamed answer", () => {
  it("sends the text piece by piece, then the citations and the origin", async () => {
    const response = await call(valid);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect(await lines(response)).toEqual([
      { type: "text", text: "Use " },
      { type: "text", text: "`z.url()` [1]." },
      {
        type: "done",
        citations: [
          {
            n: 1,
            title: "Defining schemas",
            url: "https://zod.dev/api",
            kind: "docs",
          },
        ],
        origin: "stored_docs",
        cached: false,
      },
    ]);
  });

  it("asks about the technology and guide found for the slug, with the history", async () => {
    const history = [{ role: "user", content: "How do I validate an email?" }];
    await (await call({ ...valid, history })).text();
    expect(mocks.findChatScope).toHaveBeenCalledWith(expect.anything(), "zod");
    expect(mocks.askGuide.mock.calls[0][0]).toEqual({
      technology: scope.technology,
      guideId: "g1",
      history,
      question: "and a URL?",
    });
  });

  it("hands over the shared guide and replaced passages when the person has a copy", async () => {
    mocks.findChatScope.mockResolvedValue({
      ...scope,
      guideId: "mine",
      alsoGuideId: "g1",
      hiddenHashes: ["abc"],
    });
    await (await call(valid)).text();
    expect(mocks.askGuide.mock.calls[0][0]).toMatchObject({
      guideId: "mine",
      alsoGuideId: "g1",
      hiddenHashes: ["abc"],
    });
  });

  it("answers without the cache when the question is not cacheable (an edited copy)", async () => {
    await (await call(valid)).text();
    expect(mocks.cacheScope).toHaveBeenCalledWith(expect.anything(), scope);
    expect(mocks.askGuide.mock.calls[0][2]).toEqual({ real: true });
  });

  it("gives the chat a cache lookup for the shared guide's scope, and logs each lookup", async () => {
    const where = { technologyId: "t1", guideId: "g1", guideVersionId: "v1" };
    mocks.cacheScope.mockResolvedValue(where);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await (await call(valid)).text();

    const deps = mocks.askGuide.mock.calls[0][2];
    expect(deps.real).toBe(true);

    mocks.lookupCachedAnswer.mockResolvedValueOnce({
      answer: "saved",
      similarity: 0.97123,
    });
    expect(await deps.lookupCache("How do I validate a URL?")).toMatchObject({
      answer: "saved",
    });
    expect(mocks.lookupCachedAnswer).toHaveBeenCalledWith(
      expect.anything(),
      where,
      "How do I validate a URL?",
    );

    mocks.lookupCachedAnswer.mockResolvedValueOnce(null);
    expect(await deps.lookupCache("Something new?")).toBeNull();

    const logged = info.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(logged).toEqual([
      {
        event: "chat_cache",
        result: "hit",
        similarity: 0.971,
        technologyId: "t1",
      },
      {
        event: "chat_cache",
        result: "miss",
        similarity: null,
        technologyId: "t1",
      },
    ]);
    info.mockRestore();
  });

  it("trims the question", async () => {
    await (await call({ ...valid, question: "  and a URL?  " })).text();
    expect(mocks.askGuide.mock.calls[0][0].question).toBe("and a URL?");
  });

  it("ends with an error line, and no details, when answering fails half-way", async () => {
    mocks.askGuide.mockImplementation(async (_input, onToken) => {
      await onToken("Use ");
      throw new Error("OpenAI key sk-secret was rejected");
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(valid);
    const sent = await lines(response);
    quiet.mockRestore();

    expect(sent).toEqual([
      { type: "text", text: "Use " },
      { type: "error", message: CHAT_FAILED },
    ]);
    expect(JSON.stringify(sent)).not.toContain("sk-secret");
  });
});

describe("POST /api/chat: saving what was fetched", () => {
  it("saves nothing before the response is sent, and the pages used after it", async () => {
    const response = await call(valid);
    await response.text(); // the whole answer has been streamed

    expect(mocks.saveFetched).not.toHaveBeenCalled(); // not part of the response itself
    expect(mocks.afterCallbacks).toHaveLength(1);

    await mocks.afterCallbacks[0]();
    expect(mocks.saveFetched).toHaveBeenCalledTimes(1);
    expect(mocks.saveFetched).toHaveBeenCalledWith("t1", [
      expect.objectContaining({ url: "https://zod.dev/api" }),
    ]);
  });

  it("saves nothing when answering failed", async () => {
    mocks.askGuide.mockRejectedValue(new Error("down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await (await call(valid)).text();
    quiet.mockRestore();

    await mocks.afterCallbacks[0]();
    expect(mocks.saveFetched).not.toHaveBeenCalled();
  });

  it("does not arrange any saving for a refused request", async () => {
    mocks.user = null;
    await call(valid);
    mocks.findChatScope.mockResolvedValue(null);
    mocks.user = { id: "u1" };
    await call(valid);
    expect(mocks.afterCallbacks).toEqual([]);
  });
});

describe("POST /api/chat: saving the answer for next time", () => {
  const where = { technologyId: "t1", guideId: "g1", guideVersionId: "v1" };

  it("saves a good answer to the shared guide after the response, keyed on the rewritten question", async () => {
    mocks.cacheScope.mockResolvedValue(where);
    await (await call(valid)).text();
    expect(mocks.saveCachedAnswer).not.toHaveBeenCalled(); // never before the response is sent

    await mocks.afterCallbacks[0]();
    expect(mocks.saveCachedAnswer).toHaveBeenCalledWith(
      expect.anything(),
      where,
      {
        question: "How do I validate a URL with Zod?",
        answer: "Use `z.url()` [1].",
        citations: [expect.objectContaining({ n: 1 })],
        origin: "stored_docs",
        grade: "GOOD",
      },
    );
  });

  it("does not save an answer that came from the cache", async () => {
    mocks.cacheScope.mockResolvedValue(where);
    const answered = await mocks.askGuide.getMockImplementation()!(
      {},
      () => {},
    );
    mocks.askGuide.mockResolvedValue({ ...answered, cached: true });
    await (await call(valid)).text();
    await mocks.afterCallbacks[0]();
    expect(mocks.saveCachedAnswer).not.toHaveBeenCalled();
  });

  it("does not save when there is no cache scope (a person's edited copy)", async () => {
    await (await call(valid)).text();
    await mocks.afterCallbacks[0]();
    expect(mocks.saveCachedAnswer).not.toHaveBeenCalled();
    expect(mocks.saveFetched).toHaveBeenCalled(); // the other saving is unaffected
  });

  it("does not save when answering failed", async () => {
    mocks.cacheScope.mockResolvedValue(where);
    mocks.askGuide.mockRejectedValue(new Error("down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await (await call(valid)).text();
    quiet.mockRestore();
    await mocks.afterCallbacks[0]();
    expect(mocks.saveCachedAnswer).not.toHaveBeenCalled();
  });
});
