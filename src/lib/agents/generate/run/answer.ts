import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../supabase/database.types";
import { normaliseQuery } from "../../../search";
import { ChoiceAnswer } from "../nodes/askUser";

// The two checks before a paused run is resumed with the person's choice (FR-SRCH-5):
//
//   checkAnswer(db, runId, { choice: "candidate", url })  -> { ok: true, answer }
//   checkAnswer(db, runId, { choice: "candidate", url: "https://evil.example" })
//                                                          -> { ok: false, status: 400, error }
//   claimWaitingRun(service, runId)  -> true for the first caller, false for a second click
//
// The graph puts the chosen address into a model prompt, so only an address the run itself
// offered is accepted, and a new name goes through the same cleaning as a search.

export type AnswerDb = SupabaseClient<Database>;
type ChoiceAnswerType = ReturnType<typeof ChoiceAnswer.parse>;

export type Checked =
  | { ok: true; answer: ChoiceAnswerType }
  | { ok: false; status: number; error: string };

const refuse = (status: number, error: string): Checked => ({
  ok: false,
  status,
  error,
});

export async function checkAnswer(
  db: AnswerDb,
  runId: string,
  body: unknown,
): Promise<Checked> {
  const parsed = ChoiceAnswer.safeParse(body);
  if (!parsed.success) {
    return refuse(400, "Send a choice: a technology or a new name");
  }

  const { data: run } = await db
    .from("runs")
    .select("status, type")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return refuse(404, "Run not found");
  if (run.type !== "generate" || run.status !== "waiting_user") {
    return refuse(409, "This run is not waiting for a choice");
  }

  const answer = parsed.data;
  if (answer.choice === "refine") {
    const query = normaliseQuery(answer.query);
    if (!query.ok) return refuse(400, "Type 2 to 60 characters");
    return { ok: true, answer: { choice: "refine", query: query.display } };
  }

  const offered = await offeredAddresses(db, runId);
  if (!offered.includes(answer.url)) {
    return refuse(400, "That is not one of the options");
  }
  return { ok: true, answer };
}

/** The addresses in the run's latest `needs_choice` event. */
async function offeredAddresses(db: AnswerDb, runId: string) {
  const { data } = await db
    .from("run_events")
    .select("payload")
    .eq("run_id", runId)
    .eq("type", "needs_choice")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const candidates = (data?.payload as { candidates?: unknown } | null)
    ?.candidates;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) =>
    typeof candidate?.url === "string" ? [candidate.url] : [],
  );
}

/**
 * Takes the run out of "waiting_user" in one step, so two people (or two clicks) cannot both
 * resume it. True for the one that got it. Needs the service client: people only read `runs`.
 */
export async function claimWaitingRun(
  service: AnswerDb,
  runId: string,
): Promise<boolean> {
  const { data, error } = await service
    .from("runs")
    .update({ status: "running" })
    .eq("id", runId)
    .eq("status", "waiting_user")
    .select("id");
  if (error) throw new Error(`Could not resume the run: ${error.message}`);
  return (data ?? []).length === 1;
}
