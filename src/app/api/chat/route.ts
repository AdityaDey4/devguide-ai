import { after } from "next/server";
import { askGuide, type AskGuideResult } from "@/lib/agents/chat";
import type { ChatDeps } from "@/lib/agents/chat/deps";
import { realDeps } from "@/lib/agents/chat/realDeps";
import {
  cacheScope,
  lookupCachedAnswer,
  saveCachedAnswer,
} from "@/lib/chat/cache";
import {
  ChatRequest,
  MAX_BODY_CHARS,
  MAX_QUESTION_CHARS,
} from "@/lib/chat/request";
import { saveFetched } from "@/lib/chat/saveFetched";
import { findChatScope } from "@/lib/chat/scope";
import { chatResponse } from "@/lib/chat/stream";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/chat  { "slug": "zod", "question": "and a URL?", "history": [...] }
// (docs/03-Architecture.md section 8, SRS FR-CHAT)
//
//   200  a stream of lines: the answer text piece by piece, then its citations (see lib/chat/stream.ts)
//   400 / 401 / 404 / 413 / 415 { error }     refused before any answering starts
//
// The question is answered from what is stored for that technology and its guide (and, when that
// is not enough, from Context7 and the official docs read live). Pages found that way and used
// are saved afterwards for next time. The page keeps the conversation and sends the earlier
// messages along; the conversation itself is not saved.
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

  // A question about the shared guide may be answered from a saved answer, and a good new answer
  // is saved for next time (see lib/chat/cache). A person's edited copy is never cached: the
  // answer would not follow their text.
  const db = createServiceClient();
  const where = await cacheScope(db, scope);
  const deps: ChatDeps = where
    ? {
        ...realDeps,
        lookupCache: async (question) => {
          const hit = await lookupCachedAnswer(db, where, question);
          // one line per lookup, so the hit rate can be counted in the logs
          console.info(
            JSON.stringify({
              event: "chat_cache",
              result: hit ? "hit" : "miss",
              similarity: hit ? Number(hit.similarity.toFixed(3)) : null,
              technologyId: where.technologyId,
            }),
          );
          return hit;
        },
      }
    : realDeps;

  // What the answer found outside the stored text, and the answer itself, are saved AFTER the
  // response is sent (after()), so saving never delays the person. `result` is set by then: the
  // response only ends when the answer has been written, and stays unset if answering failed.
  let result: AskGuideResult | undefined;
  after(async () => {
    if (!result) return;
    await saveFetched(scope.technology.id, result.toStore);
    if (where && !result.cached) {
      await saveCachedAnswer(db, where, {
        question: result.standaloneQuery,
        answer: result.answer,
        citations: result.citations,
        origin: result.origin,
        grade: result.grade,
      });
    }
  });

  return chatResponse(async (onToken) => {
    result = await askGuide(
      {
        technology: scope.technology,
        guideId: scope.guideId,
        alsoGuideId: scope.alsoGuideId,
        hiddenHashes: scope.hiddenHashes,
        history: body.data.history,
        question: body.data.question,
      },
      onToken,
      deps,
    );
    return result;
  });
}
