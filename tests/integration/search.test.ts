import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveGuide } from "@/lib/agents/generate/guide/saveGuide";
import { resolveSearch } from "@/lib/search";
import { findExisting } from "@/lib/search/find";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";

// What search finds for a name, against the real local database, asked the way the route asks:
// as a signed-in person, so Row Level Security applies. All rows are throwaway.

const service = createServiceClient();
const stamp = Date.now();
const user = {
  id: "",
  email: `search-${stamp}@guide-test.local`,
  password: crypto.randomUUID(),
};
let signedIn = createClient<Database>("http://unused", "unused");

const slugOf = (name: string) => `test-search-${name}-${stamp}`;
const lookupOf = (name: string) => ({
  display: `Test ${name} ${stamp}`,
  slugs: [slugOf(name)],
});

/** A technology; with `guide` it also gets a shared guide that has content. */
async function technology(
  name: string,
  options: { displayName?: string; guide?: boolean } = {},
) {
  const { data, error } = await service
    .from("technologies")
    .insert({
      name: options.displayName ?? `Test ${name} ${stamp}`,
      slug: slugOf(name),
    })
    .select("id")
    .single();
  if (error) throw error;
  if (options.guide) {
    await saveGuide(service, {
      technologyId: data.id,
      sections: [],
      status: "ready",
    });
  }
  return data.id;
}

async function run(technologyId: string, type: string, status: string) {
  const { data, error } = await service
    .from("runs")
    .insert({ type, status, technology_id: technologyId })
    .select("id")
    .single();
  if (error) throw error;
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
  await service
    .from("technologies")
    .delete()
    .like("slug", `test-search-%-${stamp}`);
  if (user.id) await service.auth.admin.deleteUser(user.id);
});

describe("an existing guide is found (FR-SRCH-2)", () => {
  it("by slug, and by the spellings of a name", async () => {
    await technology("byslug", { guide: true });
    const slug = slugOf("byslug");

    expect(
      await findExisting(signedIn, { display: "x", slugs: [slug] }),
    ).toEqual({ kind: "guide", slug });
    // typed with spaces, dots, capitals or underscores: same technology
    for (const typed of [
      `Test Search Byslug ${stamp}`,
      `test.search.byslug.${stamp}`,
      `TEST_SEARCH_BYSLUG_${stamp}`,
    ]) {
      expect(await resolveSearch(signedIn, typed)).toEqual({
        kind: "guide",
        slug,
      });
    }
  });

  it("by name when the slug is different, whatever the case (Apache Kafka vs kafka)", async () => {
    await technology("kafka", {
      displayName: `Apache Kafka ${stamp}`,
      guide: true,
    });
    expect(await resolveSearch(signedIn, `  apache KAFKA ${stamp} `)).toEqual({
      kind: "guide",
      slug: slugOf("kafka"),
    });
  });

  it("treats _ and % in the typed name as plain characters, not wildcards", async () => {
    await technology("wild", {
      displayName: `Wild Name ${stamp}`,
      guide: true,
    });
    // "_" would match any letter if it were a wildcard
    expect((await resolveSearch(signedIn, `Wild_Name ${stamp}`)).kind).toBe(
      "new",
    );
    expect(
      await findExisting(signedIn, { display: "Wild%", slugs: ["nope"] }),
    ).toBeNull();
  });
});

describe("a run in progress is joined, not started again (FR-GEN-12, BR-1)", () => {
  it.each(["queued", "running", "waiting_user"])(
    "a %s run is found",
    async (status) => {
      const name = `join-${status.replace("_", "")}`;
      const id = await technology(name);
      const runId = await run(id, "generate", status);

      expect(await findExisting(signedIn, lookupOf(name))).toEqual({
        kind: "run",
        slug: slugOf(name),
        runId,
      });
      expect(await resolveSearch(signedIn, `Test ${name} ${stamp}`)).toEqual({
        kind: "join",
        slug: slugOf(name),
        runId,
      });
    },
  );

  it("ignores runs that are over and runs of another kind", async () => {
    const id = await technology("over");
    await run(id, "generate", "completed");
    await run(id, "generate", "failed");
    await run(id, "edit", "running");
    expect(await findExisting(signedIn, lookupOf("over"))).toBeNull();
    expect((await resolveSearch(signedIn, `Test over ${stamp}`)).kind).toBe(
      "new",
    );
  });

  it("the database itself refuses a second active run for the same technology", async () => {
    const id = await technology("twice");
    await run(id, "generate", "running");
    const second = await service
      .from("runs")
      .insert({ type: "generate", status: "queued", technology_id: id });
    expect(second.error?.code).toBe("23505");
  });

  it("opens the guide, not the run, when both exist (a refresh must not hide the guide)", async () => {
    const id = await technology("both", { guide: true });
    await run(id, "generate", "running");
    expect(await resolveSearch(signedIn, `Test both ${stamp}`)).toEqual({
      kind: "guide",
      slug: slugOf("both"),
    });
  });
});

describe("retry after a failure: a partial draft is not a guide to open", () => {
  /** A technology whose shared guide is partial (what a failed run leaves behind). */
  async function partialTechnology(name: string) {
    const id = await technology(name);
    await saveGuide(service, {
      technologyId: id,
      sections: [],
      status: "partial",
    });
    return id;
  }

  it("a partial draft is opened by a normal search but not by a retry", async () => {
    await partialTechnology("draft");
    expect(await findExisting(signedIn, lookupOf("draft"))).toEqual({
      kind: "guide",
      slug: slugOf("draft"),
    });
    expect(
      await findExisting(signedIn, lookupOf("draft"), { retry: true }),
    ).toBeNull();
    expect(
      (await resolveSearch(signedIn, `Test draft ${stamp}`, { retry: true }))
        .kind,
    ).toBe("new");
  });

  it("a finished guide is still opened by a retry", async () => {
    await technology("done", { guide: true });
    expect(
      await findExisting(signedIn, lookupOf("done"), { retry: true }),
    ).toEqual({ kind: "guide", slug: slugOf("done") });
  });

  it("a retry joins the run someone else already restarted", async () => {
    const id = await partialTechnology("restarted");
    const runId = await run(id, "generate", "running");
    expect(
      await findExisting(signedIn, lookupOf("restarted"), { retry: true }),
    ).toEqual({ kind: "run", slug: slugOf("restarted"), runId });
  });
});

describe("nothing to open or join: a new run is the right answer", () => {
  it("for a name nobody has", async () => {
    expect(await resolveSearch(signedIn, `nobody ${stamp}`)).toMatchObject({
      kind: "new",
    });
  });

  it("for a technology whose guide has no content yet and no run", async () => {
    const id = await technology("empty");
    await service.from("guides").insert({ technology_id: id, owner_id: null });
    expect(await findExisting(signedIn, lookupOf("empty"))).toBeNull();
  });

  it("for a technology that only has someone's personal copy", async () => {
    const id = await technology("fork");
    await service
      .from("guides")
      .insert({ technology_id: id, owner_id: user.id });
    expect(await findExisting(signedIn, lookupOf("fork"))).toBeNull();
  });

  it("for someone who is not signed in", async () => {
    const id = await technology("private", { guide: true });
    await run(id, "generate", "running");
    const anonymous = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    expect(await findExisting(anonymous, lookupOf("private"))).toBeNull();
  });
});
