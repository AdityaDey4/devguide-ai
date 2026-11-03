import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunEvents } from "@/lib/agents/shared/events";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";

// The real event emitter against the real local database (no mocks): rows are saved in order,
// and a signed-in browser receives them live through Supabase Realtime.
// Everything is created under throwaway names and deleted at the end.

const db = createServiceClient();
const stamp = Date.now();
const user = {
  id: "",
  email: `events-${stamp}@guide-test.local`,
  password: crypto.randomUUID(),
};
let runCount = 0;

// Only one generation may be active per technology, so every run gets its own technology.
const newRun = async () => {
  const slug = `test-events-${stamp}-${++runCount}`;
  const tech = await db
    .from("technologies")
    .insert({ name: slug, slug })
    .select("id")
    .single();
  if (tech.error) throw tech.error;
  const { data, error } = await db
    .from("runs")
    .insert({
      type: "generate",
      technology_id: tech.data.id,
      status: "running",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
};

beforeAll(async () => {
  const created = await db.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  user.id = created.data.user.id;
});

afterAll(async () => {
  await db.from("technologies").delete().like("slug", `test-events-${stamp}-%`); // runs and events cascade
  if (user.id) await db.auth.admin.deleteUser(user.id);
});

describe("RunEvents (real database)", () => {
  it("saves events in order, with the payload the UI reads", async () => {
    const runId = await newRun();
    const events = new RunEvents(runId);

    await events.emit({ type: "docs_found", count: 31 });
    await events.emit({
      type: "section_started",
      key: "setup",
      title: "Setup",
    });
    await events.delta("setup", "Install ");
    await events.delta("setup", "the package.");
    await events.emit({ type: "section_done", key: "setup", citations: 2 });

    const { data } = await db
      .from("run_events")
      .select("id, type, payload")
      .eq("run_id", runId)
      .order("id");
    expect(data?.map((row) => row.type)).toEqual([
      "docs_found",
      "section_started",
      "section_delta",
      "section_delta",
      "section_done",
    ]);
    expect(data?.[0].payload).toEqual({ count: 31 });
    const text = data
      ?.filter((row) => row.type === "section_delta")
      .map((row) => (row.payload as { text: string }).text)
      .join("");
    expect(text).toBe("Install the package.");
  });

  it("lets a reconnecting client ask for only the events after the last id it saw", async () => {
    const runId = await newRun();
    const events = new RunEvents(runId);
    for (const count of [1, 2, 3])
      await events.emit({ type: "docs_found", count });

    const { data: all } = await db
      .from("run_events")
      .select("id")
      .eq("run_id", runId)
      .order("id");
    const { data: missed } = await db
      .from("run_events")
      .select("payload")
      .eq("run_id", runId)
      .gt("id", all![0].id)
      .order("id");
    expect(
      missed?.map((row) => (row.payload as { count: number }).count),
    ).toEqual([2, 3]);
  });

  it("is delivered live to a signed-in browser through Realtime", async () => {
    const runId = await newRun();
    const browser = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const signedIn = await browser.auth.signInWithPassword(user);
    if (signedIn.error) throw signedIn.error;
    await browser.realtime.setAuth(signedIn.data.session.access_token);

    const received: string[] = [];
    const channel = browser.channel(`run-${runId}`).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "run_events",
        filter: `run_id=eq.${runId}`,
      },
      (change) => received.push((change.new as { type: string }).type),
    );
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          reject(new Error(status));
      });
    });

    // "SUBSCRIBED" can arrive a moment before the server is really listening for changes.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await new RunEvents(runId).emit({
      type: "outline",
      sections: [{ key: "a", title: "A" }],
    });

    await expect.poll(() => received, { timeout: 5000 }).toEqual(["outline"]);
    await browser.removeChannel(channel);
  });
});
