import { MemorySaver } from "@langchain/langgraph";
import { afterAll, describe, expect, it } from "vitest";
import { buildGenerateGraph } from "@/lib/agents/generate/graph";
import {
  startGeneration,
  SupabaseRunStore,
  type RunDeps,
} from "@/lib/agents/generate/run";
import { saveGuide } from "@/lib/agents/generate/guide/saveGuide";
import { newBudget } from "@/lib/agents/shared/budget";
import { createServiceClient } from "@/lib/supabase/service";
import { fakeDeps } from "../helpers/generateFakes";

// The `runs` table as the runner drives it, in the real local database, plus one whole run with
// the fake model/web and the real run record. Everything is created under throwaway names.

const db = createServiceClient();
const store = new SupabaseRunStore(db);
const stamp = Date.now();
let count = 0;

const newTechnology = async () => {
  const slug = `test-run-${stamp}-${++count}`;
  const { data, error } = await db
    .from("technologies")
    .insert({ name: slug, slug })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
};
const rowOf = async (runId: string) =>
  (await db.from("runs").select("*").eq("id", runId).single()).data!;

afterAll(async () => {
  await db.from("technologies").delete().like("slug", `test-run-${stamp}-%`);
});

describe("SupabaseRunStore (real database)", () => {
  it("follows a run from queued to completed, with the budget and the finish time", async () => {
    const id = await store.createRun();
    expect(await rowOf(id)).toMatchObject({
      type: "generate",
      status: "queued",
      user_id: null,
    });

    await store.markRunning(id);
    expect((await rowOf(id)).status).toBe("running");

    await store.markWaiting(id, null);
    expect((await rowOf(id)).status).toBe("waiting_user");

    await store.markCompleted(id, { ...newBudget(), steps: 12, fetches: 8 });
    const done = await rowOf(id);
    expect(done.status).toBe("completed");
    expect(done.finished_at).toBeTruthy();
    expect(done.budget).toMatchObject({ steps: 12, fetches: 8 });
  });

  it("records why a run failed", async () => {
    const id = await store.createRun();
    await store.markFailed(
      id,
      "Stopped: the run reached its limit of 60 steps",
      null,
    );
    expect(await rowOf(id)).toMatchObject({
      status: "failed",
      error: "Stopped: the run reached its limit of 60 steps",
    });
    expect((await rowOf(id)).finished_at).toBeTruthy();
  });

  it("lets only one active run hold a technology, and frees it when that run ends", async () => {
    const technology = await newTechnology();
    const first = await store.createRun();
    const second = await store.createRun();
    await store.markRunning(first);
    await store.markRunning(second);

    expect(await store.setTechnology(first, technology)).toBe("ok");
    expect(await store.setTechnology(second, technology)).toBe(
      "already_running",
    );

    await store.markFailed(first, "stopped", null);
    expect(await store.setTechnology(second, technology)).toBe("ok");
  });

  it("knows whether a technology already has a guide", async () => {
    const technology = await newTechnology();
    expect(await store.hasGuide(technology)).toBe(false);

    await saveGuide(db, {
      technologyId: technology,
      sections: [],
      status: "ready",
    });
    expect(await store.hasGuide(technology)).toBe(true);
  });
});

describe("a whole run with the real run record", () => {
  it("is created, tied to its technology, and ends completed", async () => {
    const technology = await newTechnology();
    const fake = fakeDeps();
    fake.deps.saveTechnology = async () => technology;
    const deps: RunDeps = {
      store,
      graph: buildGenerateGraph(new MemorySaver(), fake.deps),
      generate: fake.deps,
    };

    const outcome = await startGeneration("zod", {}, deps);
    expect(outcome.status).toBe("completed");

    const row = await rowOf(outcome.runId);
    expect(row).toMatchObject({
      status: "completed",
      technology_id: technology,
    });
    expect(row.budget).toMatchObject({ steps: 12 });
    expect(row.finished_at).toBeTruthy();
  });

  it("ends failed with the reason saved, when the technology cannot be found", async () => {
    const fake = fakeDeps({
      identify: () => ({
        outcome: "unknown",
        name: null,
        officialUrl: null,
        docsUrl: null,
        candidates: [],
      }),
    });
    const deps: RunDeps = {
      store,
      graph: buildGenerateGraph(new MemorySaver(), fake.deps),
      generate: fake.deps,
    };

    const outcome = await startGeneration("asdf", {}, deps);
    expect(outcome.status).toBe("failed");
    const row = await rowOf(outcome.runId);
    expect(row.status).toBe("failed");
    expect(row.error).toBe(
      'Could not find the official documentation for "asdf"',
    );
  });
});
