import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";

// The M3 tables (guides, guide_versions, runs, run_events) against the real local database:
// the rules the database itself enforces, and who may read what (Row Level Security).
// Everything is created under throwaway names and deleted at the end.

const db = createServiceClient();
const stamp = Date.now();
let technologyId = "";
const users: Record<
  "a" | "b",
  { id: string; email: string; password: string }
> = {
  a: {
    id: "",
    email: `a-${stamp}@guide-test.local`,
    password: crypto.randomUUID(),
  },
  b: {
    id: "",
    email: `b-${stamp}@guide-test.local`,
    password: crypto.randomUUID(),
  },
};

/** A client signed in as that user: it is subject to Row Level Security, like the browser. */
async function signedInAs(who: "a" | "b") {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword(users[who]);
  if (error) throw error;
  return client;
}

const newGuide = async (owner: string | null, technology = technologyId) =>
  db
    .from("guides")
    .insert({ technology_id: technology, owner_id: owner })
    .select("id")
    .single();

const newTechnology = async (suffix: string) => {
  const slug = `test-guide-${suffix}-${stamp}`;
  const { data, error } = await db
    .from("technologies")
    .insert({ name: slug, slug })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
};

beforeAll(async () => {
  technologyId = await newTechnology("main");
  for (const who of ["a", "b"] as const) {
    const { data, error } = await db.auth.admin.createUser({
      email: users[who].email,
      password: users[who].password,
      email_confirm: true,
    });
    if (error) throw error;
    users[who].id = data.user.id;
  }
});

afterAll(async () => {
  await db.from("technologies").delete().like("slug", `test-guide-%-${stamp}`);
  for (const who of ["a", "b"] as const) {
    if (users[who].id) await db.auth.admin.deleteUser(users[who].id);
  }
});

describe("guides", () => {
  it("allows only one canonical guide per technology, but forks for different users", async () => {
    const tech = await newTechnology("canon");
    expect((await newGuide(null, tech)).error).toBeNull();
    expect((await newGuide(null, tech)).error?.code).toBe("23505"); // second canonical

    expect((await newGuide(users.a.id, tech)).error).toBeNull();
    expect((await newGuide(users.b.id, tech)).error).toBeNull();
    expect((await newGuide(users.a.id, tech)).error?.code).toBe("23505"); // same user twice
  });

  it("starts as 'generating' and rejects an unknown status", async () => {
    const tech = await newTechnology("status");
    const { data } = await newGuide(null, tech);
    const { data: row } = await db
      .from("guides")
      .select("status")
      .eq("id", data!.id)
      .single();
    expect(row?.status).toBe("generating");

    const { error } = await db
      .from("guides")
      .update({ status: "done" })
      .eq("id", data!.id);
    expect(error?.code).toBe("23514"); // check violation
  });
});

describe("guide_versions", () => {
  const section = {
    key: "overview",
    title: "Overview",
    markdown: "x",
    citations: [],
  };

  it("numbers versions per guide, once each, and needs a list of sections", async () => {
    const tech = await newTechnology("versions");
    const { data: guide } = await newGuide(null, tech);
    const version = (n: number, sections: unknown = [section]) =>
      db.from("guide_versions").insert({
        guide_id: guide!.id,
        version_no: n,
        sections: sections as never,
        author_type: "agent",
      });

    expect((await version(1)).error).toBeNull();
    expect((await version(1)).error?.code).toBe("23505"); // repeated number
    expect((await version(0)).error?.code).toBe("23514"); // numbers start at 1
    expect((await version(2, { not: "a list" })).error?.code).toBe("23514");
  });

  it("clears a guide's current version when that version is deleted", async () => {
    const tech = await newTechnology("current");
    const { data: guide } = await newGuide(null, tech);
    const { data: version } = await db
      .from("guide_versions")
      .insert({
        guide_id: guide!.id,
        version_no: 1,
        sections: [],
        author_type: "agent",
      })
      .select("id")
      .single();
    await db
      .from("guides")
      .update({ current_version_id: version!.id })
      .eq("id", guide!.id);

    await db.from("guide_versions").delete().eq("id", version!.id);
    const { data } = await db
      .from("guides")
      .select("current_version_id")
      .eq("id", guide!.id)
      .single();
    expect(data?.current_version_id).toBeNull();
  });
});

describe("chunks of a guide", () => {
  const chunk = (guideId: string, tech: string, hash: string) =>
    db.from("chunks").insert({
      technology_id: tech,
      guide_id: guideId,
      source_type: "guide",
      content: "from a guide",
      content_hash: hash,
    });

  it("refuses a guide id that does not exist", async () => {
    const { error } = await chunk(
      crypto.randomUUID(),
      technologyId,
      `x-${stamp}`,
    );
    expect(error?.code).toBe("23503"); // foreign key violation
  });

  it("are deleted together with their guide", async () => {
    const tech = await newTechnology("chunks");
    const { data: guide } = await newGuide(null, tech);
    expect((await chunk(guide!.id, tech, `y-${stamp}`)).error).toBeNull();

    await db.from("guides").delete().eq("id", guide!.id);
    const { count } = await db
      .from("chunks")
      .select("id", { count: "exact", head: true })
      .eq("technology_id", tech);
    expect(count).toBe(0);
  });
});

describe("runs and run_events", () => {
  const generate = (tech: string, status = "running") =>
    db
      .from("runs")
      .insert({ type: "generate", technology_id: tech, status })
      .select("id")
      .single();

  it("allows one active generation per technology, and a new one after it finishes", async () => {
    const tech = await newTechnology("active");
    const first = await generate(tech, "queued");
    expect(first.error).toBeNull();
    expect((await generate(tech, "waiting_user")).error?.code).toBe("23505");

    await db
      .from("runs")
      .update({ status: "completed" })
      .eq("id", first.data!.id);
    expect((await generate(tech)).error).toBeNull();
  });

  it("lets other kinds of run overlap, and other technologies run at the same time", async () => {
    const tech = await newTechnology("overlap");
    const edit = () =>
      db
        .from("runs")
        .insert({ type: "edit", technology_id: tech, status: "running" });
    expect((await edit()).error).toBeNull();
    expect((await edit()).error).toBeNull();
    expect((await generate(await newTechnology("other"))).error).toBeNull();
  });

  it("defaults to 'queued' and rejects unknown types", async () => {
    const tech = await newTechnology("defaults");
    const { data } = await db
      .from("runs")
      .insert({ type: "generate", technology_id: tech })
      .select("status")
      .single();
    expect(data?.status).toBe("queued");

    const { error } = await db
      .from("runs")
      .insert({ type: "dance", technology_id: tech });
    expect(error?.code).toBe("23514");
  });

  it("returns a run's events in order, after a given id, and removes them with the run", async () => {
    const tech = await newTechnology("events");
    const { data: run } = await generate(tech);
    for (const type of ["identified", "docs_found", "outline"]) {
      await db
        .from("run_events")
        .insert({ run_id: run!.id, type, payload: { type } });
    }
    const { data: all } = await db
      .from("run_events")
      .select("id, type")
      .eq("run_id", run!.id)
      .order("id");
    expect(all?.map((e) => e.type)).toEqual([
      "identified",
      "docs_found",
      "outline",
    ]);

    const { data: after } = await db
      .from("run_events")
      .select("type")
      .eq("run_id", run!.id)
      .gt("id", all![0].id)
      .order("id");
    expect(after?.map((e) => e.type)).toEqual(["docs_found", "outline"]);

    await db.from("runs").delete().eq("id", run!.id);
    const { count } = await db
      .from("run_events")
      .select("id", { count: "exact", head: true })
      .eq("run_id", run!.id);
    expect(count).toBe(0);
  });
});

describe("who can read what (Row Level Security)", () => {
  let canonical = "";
  let forkOfA = "";
  let forkOfB = "";
  let generateRun = "";
  let editRunOfB = "";

  beforeAll(async () => {
    const tech = await newTechnology("rls");
    canonical = (await newGuide(null, tech)).data!.id;
    forkOfA = (await newGuide(users.a.id, tech)).data!.id;
    forkOfB = (await newGuide(users.b.id, tech)).data!.id;

    for (const guide of [canonical, forkOfA, forkOfB]) {
      await db.from("guide_versions").insert({
        guide_id: guide,
        version_no: 1,
        sections: [],
        author_type: "agent",
      });
    }
    generateRun = (
      await db
        .from("runs")
        .insert({
          type: "generate",
          technology_id: tech,
          user_id: users.b.id,
          status: "running",
        })
        .select("id")
        .single()
    ).data!.id;
    editRunOfB = (
      await db
        .from("runs")
        .insert({
          type: "edit",
          technology_id: tech,
          user_id: users.b.id,
          status: "running",
        })
        .select("id")
        .single()
    ).data!.id;
    for (const run of [generateRun, editRunOfB]) {
      await db.from("run_events").insert({ run_id: run, type: "outline" });
    }
  });

  it("shows a user the canonical guide and their own fork, not someone else's", async () => {
    const asA = await signedInAs("a");
    const { data } = await asA.from("guides").select("id");
    const ids = data?.map((g) => g.id);
    expect(ids).toContain(canonical);
    expect(ids).toContain(forkOfA);
    expect(ids).not.toContain(forkOfB);
  });

  it("shows versions only of guides the user can read", async () => {
    const asA = await signedInAs("a");
    const { data } = await asA.from("guide_versions").select("guide_id");
    const ids = data?.map((v) => v.guide_id);
    expect(ids).toContain(canonical);
    expect(ids).toContain(forkOfA);
    expect(ids).not.toContain(forkOfB);
  });

  it("shows everyone the generation run, but only its owner an edit run", async () => {
    const asA = await signedInAs("a");
    const runsA = (await asA.from("runs").select("id")).data?.map((r) => r.id);
    expect(runsA).toContain(generateRun);
    expect(runsA).not.toContain(editRunOfB);

    const asB = await signedInAs("b");
    const runsB = (await asB.from("runs").select("id")).data?.map((r) => r.id);
    expect(runsB).toContain(editRunOfB);
  });

  it("shows events by the same rule as the run they belong to", async () => {
    const asA = await signedInAs("a");
    const runsOfEvents =
      // only these two runs: an unfiltered read stops at 1000 rows once real runs pile up
      (
        await asA
          .from("run_events")
          .select("run_id")
          .in("run_id", [generateRun, editRunOfB])
      ).data?.map((e) => e.run_id);
    expect(runsOfEvents).toContain(generateRun);
    expect(runsOfEvents).not.toContain(editRunOfB);
  });

  it("does not let a signed-in user write to any of them", async () => {
    const asA = await signedInAs("a");
    const tech = await newTechnology("nowrite");

    const guide = await asA
      .from("guides")
      .insert({ technology_id: tech, owner_id: users.a.id });
    const run = await asA
      .from("runs")
      .insert({ type: "generate", technology_id: tech });
    const event = await asA
      .from("run_events")
      .insert({ run_id: generateRun, type: "fake" });
    for (const result of [guide, run, event]) {
      expect(result.error?.code).toBe("42501"); // row-level security violation
    }

    // Updates and deletes find no row they are allowed to touch: nothing changes.
    await asA.from("guides").update({ status: "failed" }).eq("id", forkOfA);
    await asA.from("guides").delete().eq("id", forkOfA);
    const { data } = await db
      .from("guides")
      .select("status")
      .eq("id", forkOfA)
      .single();
    expect(data?.status).toBe("generating");
  });
});
