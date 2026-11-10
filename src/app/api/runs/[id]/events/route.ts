import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// GET /api/runs/<id>/events?after=<eventId>   (docs/03-Architecture.md section 8, FR-GEN-10)
//
//   200 { status, error, slug, events: [{ id, type, payload }] }
//
//   status  queued | running | waiting_user | completed | failed
//   error   why it failed (status "failed"), else null
//   slug    the technology's real slug once the run has identified it, else null
//   events  everything after `after`, oldest first (at most 500 per call)
//
// The page asks every 2 seconds, starting from 0 when it is opened or reloaded, so it replays
// the run and carries on. Runs as the signed-in person: Row Level Security lets any signed-in
// user read generate runs, because everyone waiting for a technology watches the same run.

const MAX_EVENTS = 500;
const Params = z.object({ id: z.uuid() });
const After = z.coerce.number().int().min(0).default(0);

const fail = (error: string, status: number) =>
  Response.json({ error }, { status });

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = Params.safeParse(await context.params);
  if (!params.success) return fail("Not a run id", 400);
  const after = After.safeParse(
    new URL(request.url).searchParams.get("after") ?? 0,
  );
  if (!after.success) return fail("`after` must be a number", 400);

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return fail("Sign in first", 401);

  const { data: run } = await supabase
    .from("runs")
    .select("status, error, technology_id")
    .eq("id", params.data.id)
    .maybeSingle();
  if (!run) return fail("Run not found", 404);

  const { data: events, error } = await supabase
    .from("run_events")
    .select("id, type, payload")
    .eq("run_id", params.data.id)
    .gt("id", after.data)
    .order("id")
    .limit(MAX_EVENTS);
  if (error) return fail("Could not read the run's events", 500);

  let slug: string | null = null;
  if (run.technology_id) {
    const { data: technology } = await supabase
      .from("technologies")
      .select("slug")
      .eq("id", run.technology_id)
      .maybeSingle();
    slug = technology?.slug ?? null;
  }

  return Response.json({
    status: run.status,
    error: run.error,
    slug,
    events,
  });
}
