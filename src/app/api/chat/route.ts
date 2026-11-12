import { askGuide } from "@/lib/agents/chat";
import {
  ChatRequest,
  MAX_BODY_CHARS,
  MAX_QUESTION_CHARS,
} from "@/lib/chat/request";
import { findChatScope } from "@/lib/chat/scope";
import { chatResponse } from "@/lib/chat/stream";
import { createClient } from "@/lib/supabase/server";

// POST /api/chat  { "slug": "zod", "question": "and a URL?", "history": [...] }
// (docs/03-Architecture.md section 8, SRS FR-CHAT)
//
//   200  a stream of lines: the answer text piece by piece, then its citations (see lib/chat/stream.ts)
//   400 / 401 / 404 / 413 / 415 { error }     refused before any answering starts
//
// The question is answered from what is stored for that technology and its guide. The page keeps
// the conversation and sends the earlier messages along; nothing is saved here yet.
// Rate limits and the per-question budget come later (SEC-8, FR-CHAT-11).

export const maxDuration = 60;

const fail = (error: string, status: number) =>
  Response.json({ error }, { status });

export async function POST(request: Request) {
  // A browser form on another site cannot send JSON, so this also blocks cross-site posts.
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return fail("Send the request as application/json", 415);
  }

  // The proxy only does an optimistic redirect: the real check is here, next to the work.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail("Sign in first", 401);

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return fail("Request too large", 413);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("Send JSON", 400);
  }
  const body = ChatRequest.safeParse(json);
  if (!body.success) {
    return fail(
      `Send {"slug", "question" (1 to ${MAX_QUESTION_CHARS} characters), "history"}`,
      400,
    );
  }

  const scope = await findChatScope(supabase, body.data.slug);
  if (!scope) return fail("There is no guide to ask about yet", 404);

  return chatResponse((onToken) =>
    askGuide(
      {
        technology: scope.technology,
        guideId: scope.guideId,
        history: body.data.history,
        question: body.data.question,
      },
      onToken,
    ),
  );
}
