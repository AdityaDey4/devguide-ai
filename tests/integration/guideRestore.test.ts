import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  saveGuide,
  type GuideSection,
} from "@/lib/agents/generate/guide/saveGuide";
import { restoreVersion } from "@/lib/guide/edit/restore";
import { saveEdit } from "@/lib/guide/edit/saveEdit";
import { listVersions } from "@/lib/guide/history";
import { loadGuide } from "@/lib/guide/load";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";

// The version history and Restore (docs/05 M8: "restoring v1 creates a new version with v1's
// content"), against the real local database. The people are real signed-in users, so Row Level
// Security applies to the reads. All rows are throwaway.

const db = createServiceClient();
const stamp = Date.now();
const slug = `test-guide-restore-${stamp}`;
let technologyId = "";
let sharedId = "";
let annCopyId = "";

const sections: GuideSection[] = [
  {
    key: "install",
    title: "Installation",
    markdown: "Run `npm i thing` [1].",
    citations: [{ n: 1, url: "https://example.test/a", title: "A" }],
    needs_review: false,
  },
];

type Person = { id: string; email: string; password: string };
const person = (name: string): Person => ({
  id: "",
  email: `${name}-${stamp}@restore-test.local`,
  password: crypto.randomUUID(),
});
const people = { ann: person("ann"), ben: person("ben") };

async function asPerson(who: Person) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const login = await client.auth.signInWithPassword(who);
  if (login.error) throw login.error;
  return client;
}

// Searchable text is not under test here, so indexing is a recorded no-op (no embedding cost).
const index = vi.fn(async () => undefined);
const edit = (who: Person, guideId: string, markdown: string, note?: string) =>
  saveEdit(
    db,
    {
      guideId,
      userId: who.id,
      edits: [{ key: "install", markdown }],
      note,
    },
    { index },
  );
const restore = (who: Person, guideId: string, versionNo: number) =>
  restoreVersion(db, { guideId, userId: who.id, versionNo }, { index });

beforeAll(async () => {
  for (const who of Object.values(people)) {
    const created = await db.auth.admin.createUser({
      email: who.email,
      password: who.password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    who.id = created.data.user.id;
  }
  const { data, error } = await db
    .from("technologies")
    .insert({ name: slug, slug })
    .select("id")
    .single();
  if (error) throw error;
  technologyId = data.id;
  sharedId = (await saveGuide(db, { technologyId, sections, status: "ready" }))
    .guideId;

  // Ann edits twice: her copy has v1 (the shared text), v2 and v3.
  const first = await edit(people.ann, sharedId, "Run `pnpm add` [1].", "Pnpm");
  if (!first.ok) throw new Error(first.error);
  annCopyId = first.guideId;
  await edit(people.ann, annCopyId, "Run `bun add` [1].", "Bun");
});

afterAll(async () => {
  await db.from("technologies").delete().eq("slug", slug); // guides and versions cascade
  for (const who of Object.values(people)) {
    if (who.id) await db.auth.admin.deleteUser(who.id);
  }
});

describe("the version list", () => {
  it("shows every version newest first, with number, date, author and note, and which is current", async () => {
    const list = await listVersions(await asPerson(people.ann), annCopyId);
    expect(list.map((v) => v.versionNo)).toEqual([3, 2, 1]);
    expect(list.map((v) => v.current)).toEqual([true, false, false]);
    expect(list.map((v) => v.note)).toEqual([
      "Bun",
      "Pnpm",
      "Copy of the shared guide",
    ]);
    expect(list.map((v) => v.author)).toEqual(["user", "user", "agent"]);
    expect(Number.isNaN(Date.parse(list[0].createdAt))).toBe(false);
  });

  it("lists the shared guide's versions for anyone, and nothing of someone else's copy", async () => {
    const asBen = await asPerson(people.ben);
    expect(
      (await listVersions(asBen, sharedId)).map((v) => v.versionNo),
    ).toEqual([1]);
    expect(await listVersions(asBen, annCopyId)).toEqual([]);
  });
});

describe("viewing an older version", () => {
  it("shows that version's text and says the current one is newer", async () => {
    const older = await loadGuide(await asPerson(people.ann), slug, {
      versionNo: 1,
    });
    expect(older).toMatchObject({
      mine: true,
      versionNo: 1,
      currentVersionNo: 3,
    });
    expect(older?.sections).toEqual(sections);
    expect(Number.isNaN(Date.parse(older!.createdAt))).toBe(false);
  });

  it("falls back to the current version for a number that does not exist", async () => {
    const guide = await loadGuide(await asPerson(people.ann), slug, {
      versionNo: 99,
    });
    expect(guide).toMatchObject({ versionNo: 3, currentVersionNo: 3 });
  });
});

describe("restoring", () => {
  it("is refused when nothing would change or nothing is there", async () => {
    expect(await restore(people.ann, annCopyId, 3)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await restore(people.ann, annCopyId, 42)).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("is refused on the shared guide and on someone else's copy", async () => {
    expect(await restore(people.ben, sharedId, 1)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await restore(people.ben, annCopyId, 1)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect((await listVersions(db, annCopyId)).length).toBe(3); // nothing was added
  });

  it("makes version 1's text the newest version, as a new version, and keeps the others", async () => {
    const restored = await restore(people.ann, annCopyId, 1);
    expect(restored).toMatchObject({ ok: true, versionNo: 4 });

    const list = await listVersions(await asPerson(people.ann), annCopyId);
    expect(list.map((v) => v.versionNo)).toEqual([4, 3, 2, 1]);
    expect(list[0]).toMatchObject({
      current: true,
      note: "Restored version 1",
      author: "user",
    });

    const now = await loadGuide(await asPerson(people.ann), slug);
    expect(now).toMatchObject({ versionNo: 4, currentVersionNo: 4 });
    expect(now?.sections).toEqual(sections);

    // v3 is still there, with its own text
    const v3 = await loadGuide(await asPerson(people.ann), slug, {
      versionNo: 3,
    });
    expect(v3?.sections[0].markdown).toBe("Run `bun add` [1].");
  });

  it("makes the restored text searchable for the chat, like an edit", async () => {
    index.mockClear();
    await restore(people.ann, annCopyId, 2);
    expect(index).toHaveBeenCalledTimes(1);
    expect(index.mock.calls[0]).toMatchObject([
      {
        guideId: annCopyId,
        sections: [{ markdown: "Run `pnpm add` [1]." }],
      },
    ]);
  });

  it("never changes the shared guide", async () => {
    expect((await listVersions(db, sharedId)).length).toBe(1);
    const shared = await loadGuide(await asPerson(people.ben), slug);
    expect(shared?.sections).toEqual(sections);
  });
});
