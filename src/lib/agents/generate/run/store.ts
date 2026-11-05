import type { Json, TablesUpdate } from "../../../supabase/database.types";
import type { ServiceClient } from "../../../supabase/service";
import type { Budget } from "../../shared/budget";
import type { RunStore } from "./types";

// The `runs` table: one row per generation, kept in step with what the graph is doing. Writes use
// the service role; people only read it (docs/03-Architecture.md section 4).

export class SupabaseRunStore implements RunStore {
  constructor(private readonly db: ServiceClient) {}

  createRun = async (userId?: string): Promise<string> => {
    const { data, error } = await this.db
      .from("runs")
      .insert({ type: "generate", status: "queued", user_id: userId ?? null })
      .select("id")
      .single();
    if (error) throw new Error(`Could not create the run: ${error.message}`);
    return data.id;
  };

  markRunning = (runId: string) => this.update(runId, { status: "running" });

  setTechnology = async (
    runId: string,
    technologyId: string,
  ): Promise<"ok" | "already_running"> => {
    const { error } = await this.db
      .from("runs")
      .update({ technology_id: technologyId })
      .eq("id", runId);
    if (!error) return "ok";
    // The unique index "one active generate run per technology" refused it.
    if (error.code === "23505") return "already_running";
    throw new Error(`Could not update the run: ${error.message}`);
  };

  markWaiting = (runId: string, budget: Budget | null) =>
    this.update(runId, { status: "waiting_user", ...asBudget(budget) });

  markCompleted = (runId: string, budget: Budget | null) =>
    this.update(runId, {
      status: "completed",
      finished_at: new Date().toISOString(),
      ...asBudget(budget),
    });

  markFailed = (runId: string, reason: string, budget: Budget | null) =>
    this.update(runId, {
      status: "failed",
      error: reason,
      finished_at: new Date().toISOString(),
      ...asBudget(budget),
    });

  hasGuide = async (technologyId: string): Promise<boolean> => {
    const { count, error } = await this.db
      .from("guides")
      .select("id", { count: "exact", head: true })
      .eq("technology_id", technologyId)
      .is("owner_id", null)
      .not("current_version_id", "is", null);
    if (error) throw new Error(`Could not read the guide: ${error.message}`);
    return (count ?? 0) > 0;
  };

  private async update(runId: string, values: TablesUpdate<"runs">) {
    const { error } = await this.db.from("runs").update(values).eq("id", runId);
    if (error) throw new Error(`Could not update the run: ${error.message}`);
  }
}

const asBudget = (budget: Budget | null) =>
  budget ? { budget: budget as unknown as NonNullable<Json> } : {};
