import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatCitation } from "@/lib/agents/chat";
import { askChat, parseChatLine } from "@/lib/chat/client";
import { linkAnswer } from "@/lib/chat/markers";

// What the chat panel does with the stream (SRS FR-CHAT-10): reading the lines, however the
// network cuts them, and turning [n] markers into links.

const request = { slug: "zod", question: "and a URL?", history: [] };
const docs: ChatCitation = {
  n: 1,
  title: "Defining schemas",
  url: "https://zod.dev/api",
  kind: "docs",
};

/** A response whose body arrives in exactly these chunks. */
function streamed(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status });
}

function setup(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  const pieces: string[] = [];
  const lists: ChatCitation[][] = [];
  const handlers = {
    onText: (piece: string) => void pieces.push(piece),
    onCitations: (list: ChatCitation[]) => void lists.push(list),
  };
  return { fetchMock, pieces, lists, handlers };
}

afterEach(() => vi.unstubAllGlobals());

describe("parseChatLine", () => {
  it("reads the three kinds of line", () => {
    expect(parseChatLine('{"type":"text","text":"Hi"}')).toEqual({
      type: "text",
      text: "Hi",
    });
    expect(
      parseChatLine(JSON.stringify({ type: "citations", citations: [docs] })),
    ).toEqual({ type: "citations", citations: [docs] });
    expect(parseChatLine('{"type":"error","message":"No"}')).toEqual({
      type: "error",
      message: "No",
    });
  });

  it("ignores what is not one of ours", () => {
    expect(parseChatLine("not json")).toBeNull();
    expect(parseChatLine('{"type":"other"}')).toBeNull();
    expect(parseChatLine('{"type":"text"}')).toBeNull();
  });
});

describe("askChat", () => {
  it("sends the question and the history, and hands over text then citations", async () => {
    const { fetchMock, pieces, lists, handlers } = setup(
      streamed([
        '{"type":"text","text":"Use "}\n{"type":"text","text":"z.url() [1]."}\n',
        `{"type":"citations","citations":${JSON.stringify([docs])}}\n`,
      ]),
    );
    const history = [{ role: "user" as const, content: "earlier" }];
    const outcome = await askChat({ ...request, history }, handlers);

    expect(outcome).toEqual({ ok: true });
    expect(pieces).toEqual(["Use ", "z.url() [1]."]);
    expect(lists).toEqual([[docs]]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/chat");
    expect(JSON.parse(String(init.body))).toEqual({ ...request, history });
  });

  it("copes with a line cut in the middle by the network", async () => {
    const line = '{"type":"text","text":"Hello there"}\n';
    const { pieces, handlers } = setup(
      streamed([
        line.slice(0, 10),
        line.slice(10, 25),
        line.slice(25) + '{"type":"citations","citations":[]}\n',
      ]),
    );
    expect(await askChat(request, handlers)).toEqual({ ok: true });
    expect(pieces).toEqual(["Hello there"]);
  });

  it("reports the server's error line, after the text it already got", async () => {
    const { pieces, lists, handlers } = setup(
      streamed([
        '{"type":"text","text":"Use "}\n{"type":"error","message":"Something went wrong answering that. Try again."}\n',
      ]),
    );
    const outcome = await askChat(request, handlers);
    expect(outcome).toEqual({
      ok: false,
      error: "Something went wrong answering that. Try again.",
    });
    expect(pieces).toEqual(["Use "]);
    expect(lists).toEqual([]);
  });

  it("says the answer was cut off when the stream ends without citations", async () => {
    const { handlers } = setup(streamed(['{"type":"text","text":"Use "}\n']));
    const outcome = await askChat(request, handlers);
    expect(outcome.ok).toBe(false);
  });

  it("explains a refusal in plain words", async () => {
    for (const [status, text] of [
      [401, "Sign in again"],
      [404, "no guide"],
      [400, "Try again"],
    ] as const) {
      const { handlers } = setup(
        new Response(JSON.stringify({ error: "technical" }), { status }),
      );
      const outcome = await askChat(request, handlers);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.error).toContain(text);
        expect(outcome.error).not.toContain("technical");
      }
    }
  });

  it("says so when the server cannot be reached, and stays quiet when stopped", async () => {
    const lost = setup(new TypeError("fetch failed"));
    const outcome = await askChat(request, lost.handlers);
    expect(outcome).toEqual({
      ok: false,
      error: "Could not reach the server. Check your connection.",
    });

    const controller = new AbortController();
    controller.abort();
    const stopped = setup(new DOMException("aborted", "AbortError"));
    expect(await askChat(request, stopped.handlers, controller.signal)).toEqual(
      {
        ok: false,
        error: "Stopped.",
      },
    );
  });
});

describe("linkAnswer", () => {
  it("links the markers of sources that have a web page, and only those", () => {
    const guide: ChatCitation = {
      n: 2,
      title: "Zod guide: Setup",
      url: null,
      kind: "guide",
    };
    expect(linkAnswer("Use z.url() [1]. See also [2][3].", [docs, guide])).toBe(
      "Use z.url() [1](https://zod.dev/api). See also [2][3].",
    );
  });

  it("leaves markers in code alone", () => {
    const text = "Use `a[1]` and:\n\n```\nb[1]\n```\n";
    expect(linkAnswer(text, [docs])).toBe(text);
  });

  it("does not link an address that is not a web address", () => {
    const bad: ChatCitation = { ...docs, url: "javascript:alert(1)" };
    expect(linkAnswer("Text [1].", [bad])).toBe("Text [1].");
  });
});
