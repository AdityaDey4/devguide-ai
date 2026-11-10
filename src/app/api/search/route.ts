import { after } from "next/server";
import { z } from "zod";
import {
  createGenerationRun,
  executeGeneration,
} from "@/lib/agents/generate/run";
import { resolveSearch } from "@/lib/search";
import { MAX_QUERY_CHARS, MIN_QUERY_CHARS } from "@/lib/search/config";
import { createClient } from "@/lib/supabase/server";

// POST /api/search  { "q": "next js" }   (docs/03-Architecture.md section 8, SRS FR-SRCH)
//
//   200 { slug }            a guide exists: open /g/<slug>
//   202 { slug, runId }     a new run was started: open /g/<slug>?run=<runId> to watch it
//   400 / 401 / 413 / 415 { error }
//
// A new technology gets a run record at once and the graph runs AFTER the response is sent
// (after()), so the page can start watching the run straight away. The run can take minutes:
// maxDuration is how long the platform lets after() keep going.
// Rate limits and the daily quota come later (SEC-8).

export const maxDuration = 300;

const MAX_BODY_CHARS = 1024;
const Body = z.object({ q: z.string() });

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
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(JSON.parse(text));
  } catch {
    return fail('Send {"q": "technology name"}', 400);
  }

  const result = await resolveSearch(supabase, body.q);
  switch (result.kind) {
    case "invalid":
      return fail(
        `Type ${MIN_QUERY_CHARS} to ${MAX_QUERY_CHARS} characters`,
        400,
      );

    case "guide":
      return Response.json({ slug: result.slug });

    case "new": {
      const runId = await createGenerationRun(data.user.id);
      after(() => executeGeneration(runId, result.query));
      return Response.json({ slug: result.slug, runId }, { status: 202 });
    }
  }
}
