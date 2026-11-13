import type { AskGuideResult, ChatCitation, ChatOrigin } from "../agents/chat";

// The chat's answer as a stream of lines, one JSON object per line (SRS FR-CHAT-10):
//
//   {"type":"text","text":"Use "}
//   {"type":"text","text":"`z.url()` [1]."}
//   {"type":"done","citations":[{"n":1,"title":"Defining schemas","url":"https://zod.dev/api","kind":"docs"}],"origin":"stored_docs"}
//
// The text comes first, piece by piece, as it is written; the last line, "done", comes once at the end, when
// it is known which sources the finished answer used and where it came from (guide, stored_docs,
// fetched_now or not_found). If something goes wrong half-way the last
// line is {"type":"error","message":"..."} and the stream ends. The page reads it line by line.

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "done"; citations: ChatCitation[]; origin: ChatOrigin }
  | { type: "error"; message: string };

export const CHAT_FAILED = "Something went wrong answering that. Try again.";

const encoder = new TextEncoder();

/**
 * Runs `answer` and streams what it sends to `onToken`, then the citations, as a response.
 * The error is logged here (never sent): the person only gets CHAT_FAILED.
 */
export function chatResponse(
  answer: (
    onToken: (piece: string) => Promise<void>,
  ) => Promise<AskGuideResult>,
): Response {
  let closed = false; // the reader went away (page closed): stop writing

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => {
        if (!closed)
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const result = await answer(async (text) =>
          send({ type: "text", text }),
        );
        send({
          type: "done",
          citations: result.citations,
          origin: result.origin,
        });
      } catch (error) {
        console.error(
          "chat failed:",
          error instanceof Error ? error.message : "unknown error",
        );
        send({ type: "error", message: CHAT_FAILED });
      }
      if (!closed) controller.close();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
