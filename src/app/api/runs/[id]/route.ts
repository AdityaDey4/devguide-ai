import { after } from "next/server";
import { z } from "zod";
import { resumeGeneration } from "@/lib/agents/generate/run";
import { checkAnswer, claimWaitingRun } from "@/lib/agents/generate/run/answer";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/runs/<id>   (docs/03-Architecture.md section 8, SRS FR-SRCH-5)
//
// Answers a run that stopped to ask which technology the person means:
//
//   { "choice": "candidate", "url": "https://…" }   one of the offered technologies
//   { "choice": "refine", "query": "a better name" } "None of these": search again
//
//   202 { ok: true }       the run carries on (after the response, like a new search)
//   400 / 401 / 404 / 409 / 413 / 415 { error }
//
// Any signed-in person may answer: everyone waiting for a technology watches the same run.

export const maxDuration = 300;

const MAX_BODY_CHARS = 1024;
const Id = z.uuid();

const fail = (error: string, status: number) =>
  Response.json({ error }, { status });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const runId = Id.safeParse((await context.params).id);
  if (!runId.success) return fail("Not a run id", 400);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return fail("Send the request as application/json", 415);
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail("Sign in first", 401);

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return fail("Request too large", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail("Send JSON", 400);
  }

  const checked = await checkAnswer(supabase, runId.data, body);
  if (!checked.ok) return fail(checked.error, checked.status);

  // Only the first answer resumes the run.
  const claimed = await claimWaitingRun(createServiceClient(), runId.data);
  if (!claimed) return fail("This run is not waiting for a choice", 409);

  after(() => resumeGeneration(runId.data, checked.answer));
  return Response.json({ ok: true }, { status: 202 });
}
