import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/chat with the session, the guide lookup and the chat graph replaced by fakes: who and
// what is refused before anything is answered, and the shape of the streamed answer (FR-CHAT-10).

const mocks = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  scope: null as unknown,
  findChatScope: vi.fn(),
  askGuide: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
  }),
}));
vi.mock("@/lib/chat/scope", () => ({ findChatScope: mocks.findChatScope }));
vi.mock("@/lib/agents/chat", () => ({ askGuide: mocks.askGuide }));

import { POST } from "@/app/api/chat/route";
import { CHAT_FAILED } from "@/lib/chat/stream";

const scope = {
  technology: { id: "t1", name: "Zod", version: "4.1.0" },
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
  mocks.user = { id: "u1" };
  mocks.findChatScope.mockReset().mockResolvedValue(scope);
  mocks.askGuide.mockReset().mockImplementation(async (_input, onToken) => {
    await onToken("Use ");
    await onToken("`z.url()` [1].");
    return {
      answer: "Use `z.url()` [1].",
      citations: [
        {
          n: 1,
          title: "Defining schemas",
          url: "https://zod.dev/api",
          kind: "docs",
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
  it("sends the text piece by piece, then the citations", async () => {
    const response = await call(valid);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect(await lines(response)).toEqual([
      { type: "text", text: "Use " },
      { type: "text", text: "`z.url()` [1]." },
      {
        type: "citations",
        citations: [
          {
            n: 1,
            title: "Defining schemas",
            url: "https://zod.dev/api",
            kind: "docs",
          },
        ],
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
