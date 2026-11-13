import { z } from "zod";
import type { ChatCitation, ChatMessage, ChatOrigin } from "../agents/chat";
import type { ChatEvent } from "./stream";

// Asking a question from the browser: used by the chat panel.
//
//   const outcome = await askChat(
//     { slug: "zod", question: "and a URL?", history },
//     { onText: (piece) => show(piece), onDone: (list, origin) => showSources(list, origin) },
//   );
//   outcome -> { ok: true }
//           |  { ok: false, error: "Something went wrong answering that. Try again." }
//
// Reads the lines POST /api/chat streams (see lib/chat/stream.ts): `onText` is called with each
// piece of the answer as it arrives, `onDone` once at the end
// with the citations and the origin of the answer. Browser only.

export type AskRequest = {
  slug: string;
  question: string;
  history: ChatMessage[];
};
export type AskHandlers = {
  onText: (piece: string) => void;
  onDone: (citations: ChatCitation[], origin: ChatOrigin) => void;
};
export type AskOutcome = { ok: true } | { ok: false; error: string };

const Citation = z.object({
  n: z.number(),
  title: z.string(),
  url: z.string().nullable(),
  kind: z.enum(["guide", "docs"]),
});
const Line = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("done"),
    citations: z.array(Citation),
    origin: z.enum(["guide", "stored_docs", "fetched_now", "not_found"]),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

const TRY_AGAIN = "Something went wrong answering that. Try again.";

/** One line of the stream as an event; null if it is not one of ours. */
export function parseChatLine(line: string): ChatEvent | null {
  try {
    const parsed = Line.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function askChat(
  request: AskRequest,
  handlers: AskHandlers,
  signal?: AbortSignal,
): Promise<AskOutcome> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok || !response.body)
      return { ok: false, error: why(response) };

    // The lines arrive in chunks that can end in the middle of a line: keep the rest for next time.
    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();
    let rest = "";
    let finished = false; // the "done" line came: the answer is complete

    while (true) {
      const { value, done } = await reader.read();
      rest += value ?? "";
      const lines = rest.split("\n");
      rest = lines.pop() ?? ""; // the last piece may be half a line
      if (done && rest) lines.push(rest);

      for (const line of lines) {
        const event = line.trim() ? parseChatLine(line) : null;
        if (!event) continue;
        if (event.type === "text") handlers.onText(event.text);
        if (event.type === "done") {
          handlers.onDone(event.citations, event.origin);
          finished = true;
        }
        if (event.type === "error") return { ok: false, error: event.message };
      }
      if (done) break;
    }
    return finished ? { ok: true } : { ok: false, error: TRY_AGAIN };
  } catch {
    return {
      ok: false,
      error: signal?.aborted
        ? "Stopped."
        : "Could not reach the server. Check your connection.",
    };
  }
}

/** What to tell the person when the route refused the question. */
function why(response: Response): string {
  if (response.status === 401) return "Sign in again to ask questions.";
  if (response.status === 404) return "There is no guide to ask about yet.";
  return TRY_AGAIN;
}
