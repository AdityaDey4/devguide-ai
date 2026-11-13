import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  saveGuide,
  type GuideSection,
} from "@/lib/agents/generate/guide/saveGuide";
import { saveEdit } from "@/lib/guide/edit/saveEdit";
import { loadGuide } from "@/lib/guide/load";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";

// Editing a guide, against the real local database (docs/05 M8: "editing creates a fork without
// changing the shared guide"). The people are real signed-in users, so Row Level Security applies
// when the guide is read back. All rows are throwaway.

const db = createServiceClient();
const stamp = Date.now();
const slug = `test-guide-edit-${stamp}`;
let technologyId = "";
let sharedId = "";
let sharedVersionId = "";

const sections: GuideSection[] = [
  {
    key: "install",
    title: "Installation",
    markdown: "Run `npm i thing` [1].",
    citations: [{ n: 1, url: "https://example.test/a", title: "A" }],
    needs_review: false,
  },
  {
    key: "gotchas",
    title: "Common mistakes",
    markdown: "Watch out for X [1].",
    citations: [{ n: 1, url: "https://example.test/b", title: "B" }],
    needs_review: true,
  },
];

type Person = { id: string; email: string; password: string };
const people: Record<"ann" | "ben" | "cy", Person> = {
  ann: {
    id: "",
    email: `ann-${stamp}@edit-test.local`,
    password: crypto.randomUUID(),
  },
  ben: {
    id: "",
    email: `ben-${stamp}@edit-test.local`,
    password: crypto.randomUUID(),
  },
  cy: {
    id: "",
    email: `cy-${stamp}@edit-test.local`,
    password: crypto.randomUUID(),
  },
};

/** A client that is signed in as this person, like the app's own. */
async function asPerson(person: Person) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const login = await client.auth.signInWithPassword(person);
  if (login.error) throw login.error;
  return client;
}

const edit = (
  who: Person,
  guideId: string,
  edits: { key: string; markdown: string }[],
  note?: string,
) => saveEdit(db, { guideId, userId: who.id, edits, note });

const versionsOf = async (guideId: string) =>
  (
    await db
      .from("guide_versions")
      .select("id, version_no, author_type, author_id, change_note, sections")
      .eq("guide_id", guideId)
      .order("version_no")
  ).data ?? [];

const guidesOf = async () =>
  (
    await db
      .from("guides")
      .select("id, owner_id, forked_from, status, current_version_id")
      .eq("technology_id", technologyId)
  ).data ?? [];

beforeAll(async () => {
  for (const person of Object.values(people)) {
    const created = await db.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    person.id = created.data.user.id;
  }
  const { data, error } = await db
    .from("technologies")
    .insert({ name: slug, slug })
    .select("id")
    .single();
  if (error) throw error;
  technologyId = data.id;
  const saved = await saveGuide(db, {
    technologyId,
    sections,
    status: "ready",
  });
  sharedId = saved.guideId;
  sharedVersionId = saved.versionId;
});

afterAll(async () => {
  await db.from("technologies").delete().eq("slug", slug); // guides and versions cascade
  for (const person of Object.values(people)) {
    if (person.id) await db.auth.admin.deleteUser(person.id);
  }
});

describe("the first edit of a shared guide", () => {
  it("makes the person's own copy, with the shared text as its version 1 and the edit as version 2", async () => {
    const result = await edit(
      people.ann,
      sharedId,
      [{ key: "install", markdown: "Run `pnpm add thing` [1]." }],
      "Use pnpm",
    );
    expect(result).toMatchObject({ ok: true, versionNo: 2, forked: true });
    if (!result.ok) return;
    expect(result.guideId).not.toBe(sharedId);

    const fork = (await guidesOf()).find((g) => g.id === result.guideId)!;
    expect(fork).toMatchObject({
      owner_id: people.ann.id,
      forked_from: sharedId,
      status: "ready",
      current_version_id: result.versionId,
    });

    const [v1, v2] = await versionsOf(result.guideId);
    expect(v1).toMatchObject({
      version_no: 1,
      author_type: "agent",
      author_id: null,
      change_note: "Copy of the shared guide",
      sections,
    });
    expect(v2).toMatchObject({
      version_no: 2,
      author_type: "user",
      author_id: people.ann.id,
      change_note: "Use pnpm",
    });
    const edited = v2.sections as GuideSection[];
    expect(edited[0].markdown).toBe("Run `pnpm add thing` [1].");
    expect(edited[0].citations).toEqual(sections[0].citations); // sources untouched
    expect(edited[1]).toEqual(sections[1]); // the other section untouched
  });

  it("does not change the shared guide at all", async () => {
    const shared = (await guidesOf()).find((g) => g.id === sharedId)!;
    expect(shared.current_version_id).toBe(sharedVersionId);
    const versions = await versionsOf(sharedId);
    expect(versions).toHaveLength(1);
    expect(versions[0].sections).toEqual(sections);
  });
});

describe("later edits", () => {
  it("add versions to the same copy, never a second copy", async () => {
    const ann = (await guidesOf()).find((g) => g.owner_id === people.ann.id)!;
    const result = await edit(people.ann, ann.id, [
      { key: "gotchas", markdown: "Watch out for Y [1]." },
    ]);
    expect(result).toMatchObject({ ok: true, versionNo: 3, forked: false });
    expect(
      (await guidesOf()).filter((g) => g.owner_id === people.ann.id),
    ).toHaveLength(1);
  });

  it("go to the person's copy even when they were looking at the shared guide (a stale page)", async () => {
    const result = await edit(people.ann, sharedId, [
      { key: "gotchas", markdown: "Watch out for Z [1]." },
    ]);
    expect(result).toMatchObject({ ok: true, versionNo: 4, forked: false });
    expect(await versionsOf(sharedId)).toHaveLength(1);
  });

  it("use the default note, naming the section, when none is given", async () => {
    const ann = (await guidesOf()).find((g) => g.owner_id === people.ann.id)!;
    const versions = await versionsOf(ann.id);
    expect(versions.at(-1)?.change_note).toBe("Edited Common mistakes");
  });
});

describe("saves that are refused make nothing", () => {
  const benHasNothing = async () =>
    (await guidesOf()).filter((g) => g.owner_id === people.ben.id);

  it("a save that changes nothing creates no copy and no version", async () => {
    const result = await edit(people.ben, sharedId, [
      { key: "install", markdown: sections[0].markdown },
    ]);
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Nothing was changed",
    });
    expect(await benHasNothing()).toHaveLength(0);
  });

  it("an unknown section or an emptied one creates nothing", async () => {
    expect(
      await edit(people.ben, sharedId, [{ key: "nope", markdown: "x" }]),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await edit(people.ben, sharedId, [{ key: "install", markdown: "  " }]),
    ).toMatchObject({ ok: false, status: 400 });
    expect(await benHasNothing()).toHaveLength(0);
  });

  it("a guide that does not exist is not found", async () => {
    const result = await edit(people.ben, crypto.randomUUID(), [
      { key: "install", markdown: "x" },
    ]);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("someone else's copy is not found, and is not changed", async () => {
    const ann = (await guidesOf()).find((g) => g.owner_id === people.ann.id)!;
    const before = await versionsOf(ann.id);
    const result = await edit(people.ben, ann.id, [
      { key: "install", markdown: "Hacked" },
    ]);
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(await versionsOf(ann.id)).toHaveLength(before.length);
  });
});

describe("two people editing", () => {
  it("each get their own copy and never see the other's", async () => {
    const result = await edit(people.ben, sharedId, [
      { key: "install", markdown: "Ben's way [1]." },
    ]);
    expect(result).toMatchObject({ ok: true, forked: true, versionNo: 2 });

    const guides = await guidesOf();
    expect(guides.filter((g) => g.owner_id === people.ann.id)).toHaveLength(1);
    expect(guides.filter((g) => g.owner_id === people.ben.id)).toHaveLength(1);

    const asAnn = await loadGuide(await asPerson(people.ann), slug);
    const asBen = await loadGuide(await asPerson(people.ben), slug);
    expect(asAnn).toMatchObject({ mine: true, versionNo: 4 });
    expect(asAnn?.sections[0].markdown).toBe("Run `pnpm add thing` [1].");
    expect(asBen).toMatchObject({ mine: true, versionNo: 2 });
    expect(asBen?.sections[0].markdown).toBe("Ben's way [1].");
  });

  it("someone who has not edited still reads the shared guide", async () => {
    const asCy = await loadGuide(await asPerson(people.cy), slug);
    expect(asCy).toMatchObject({
      mine: false,
      guideId: sharedId,
      versionNo: 1,
    });
    expect(asCy?.sections).toEqual(sections);
  });

  it("two first edits at the same moment still make one copy, with distinct version numbers", async () => {
    const [one, two] = await Promise.all([
      edit(people.cy, sharedId, [{ key: "install", markdown: "First [1]." }]),
      edit(people.cy, sharedId, [{ key: "gotchas", markdown: "Second [1]." }]),
    ]);
    expect(one.ok).toBe(true);
    expect(two.ok).toBe(true);

    const copies = (await guidesOf()).filter(
      (g) => g.owner_id === people.cy.id,
    );
    expect(copies).toHaveLength(1);
    const numbers = (await versionsOf(copies[0].id)).map((v) => v.version_no);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.length).toBeGreaterThanOrEqual(3); // a copy of the shared text, and both edits
  });
});
