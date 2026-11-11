import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkAnswer, claimWaitingRun } from "@/lib/agents/generate/run/answer";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";

// Answering a paused run against the real local database: the checks run as a signed-in person
// (Row Level Security applies), the claim as the server. Rows are throwaway.

const service = createServiceClient();
const stamp = Date.now();
const user = {
  id: "",
  email: `answer-${stamp}@guide-test.local`,
  password: crypto.randomUUID(),
};
let signedIn = createClient<Database>("http://unused", "unused");
const runIds: string[] = [];

const OFFERED = [
  { name: "Bun (runtime)", description: "A runtime", url: "https://bun.sh" },
  { name: "Bun (build)", description: "A tool", url: "https://bun.build" },
];

async function waitingRun(status = "waiting_user") {
  const { data, error } = await service
    .from("runs")
    .insert({ type: "generate", status })
    .select("id")
    .single();
  if (error) throw error;
  runIds.push(data.id);
  await service.from("run_events").insert([
    { run_id: data.id, type: "needs_choice", payload: { candidates: [] } },
    {
      run_id: data.id,
      type: "needs_choice",
      payload: { candidates: OFFERED },
    },
  ]);
  return data.id;
}

beforeAll(async () => {
  const created = await service.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  user.id = created.data.user.id;
  signedIn = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const login = await signedIn.auth.signInWithPassword(user);
  if (login.error) throw login.error;
});

afterAll(async () => {
  if (runIds.length) await service.from("runs").delete().in("id", runIds);
  if (user.id) await service.auth.admin.deleteUser(user.id);
});

describe("checkAnswer on a real waiting run", () => {
  it("accepts an address from the LATEST offer and a cleaned new name", async () => {
    const id = await waitingRun();
    expect(
      await checkAnswer(signedIn, id, {
        choice: "candidate",
        url: "https://bun.build",
      }),
    ).toMatchObject({ ok: true });
    expect(
      await checkAnswer(signedIn, id, {
        choice: "refine",
        query: "  Bun   runtime ",
      }),
    ).toEqual({ ok: true, answer: { choice: "refine", query: "Bun runtime" } });
  });

  it("refuses an address that was never offered", async () => {
    const id = await waitingRun();
    expect(
      await checkAnswer(signedIn, id, {
        choice: "candidate",
        url: "https://elsewhere.example",
      }),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a run that is not waiting, and a run that does not exist", async () => {
    const running = await waitingRun("running");
    const answer = { choice: "refine", query: "Bun runtime" };
    expect(await checkAnswer(signedIn, running, answer)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(
      await checkAnswer(signedIn, crypto.randomUUID(), answer),
    ).toMatchObject({ ok: false, status: 404 });
  });
});

describe("claimWaitingRun", () => {
  it("lets exactly one of two simultaneous answers resume the run", async () => {
    const id = await waitingRun();
    const results = await Promise.all([
      claimWaitingRun(service, id),
      claimWaitingRun(service, id),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);

    const { data } = await service
      .from("runs")
      .select("status")
      .eq("id", id)
      .single();
    expect(data?.status).toBe("running");
  });

  it("does nothing to a run that is not waiting", async () => {
    const id = await waitingRun("completed");
    expect(await claimWaitingRun(service, id)).toBe(false);
    const { data } = await service
      .from("runs")
      .select("status")
      .eq("id", id)
      .single();
    expect(data?.status).toBe("completed");
  });
});
