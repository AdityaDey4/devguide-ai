import { afterEach, describe, expect, it, vi } from "vitest";
import type { GuideSection } from "@/lib/agents/generate/guide/saveGuide";
import { saveGuideEdit } from "@/lib/guide/client";
import { applyEdits } from "@/lib/guide/edit/applyEdits";
import {
  EditRequest,
  MAX_NOTE_CHARS,
  MAX_SECTION_CHARS,
} from "@/lib/guide/edit/request";

// Editing a guide (SRS FR-GUIDE-3): putting the edited text in, what a request may contain, and
// what the browser tells the person. No database.

const sections: GuideSection[] = [
  {
    key: "install",
    title: "Installation",
    markdown: "Run `npm i zod` [1].",
    citations: [{ n: 1, url: "https://zod.dev/", title: "Zod" }],
    needs_review: false,
  },
  {
    key: "gotchas",
    title: "Common mistakes",
    markdown: "Could not be written.",
    citations: [],
    needs_review: true,
  },
];

describe("applyEdits", () => {
  it("changes only the edited section's text and keeps its title, sources and flag", () => {
    const result = applyEdits(sections, [
      { key: "install", markdown: "Run `pnpm add zod` [1]." },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toEqual(["install"]);
    expect(result.sections[0]).toEqual({
      ...sections[0],
      markdown: "Run `pnpm add zod` [1].",
    });
    expect(result.sections[1]).toBe(sections[1]); // untouched
  });

  it("does not change the sections it was given", () => {
    applyEdits(sections, [{ key: "install", markdown: "New text" }]);
    expect(sections[0].markdown).toBe("Run `npm i zod` [1].");
  });

  it("can change several sections in one save", () => {
    const result = applyEdits(sections, [
      { key: "install", markdown: "A" },
      { key: "gotchas", markdown: "B" },
    ]);
    expect(result.ok && result.changed).toEqual(["install", "gotchas"]);
  });

  it("refuses a save that changes nothing, including text sent back as it was", () => {
    expect(
      applyEdits(sections, [
        { key: "install", markdown: sections[0].markdown },
      ]),
    ).toEqual({
      ok: false,
      error: "Nothing was changed",
    });
  });

  it("treats Windows line endings as the same text, so untouched sections do not look edited", () => {
    const multi = [{ ...sections[0], markdown: "Line one\nLine two" }];
    expect(
      applyEdits(multi, [{ key: "install", markdown: "Line one\r\nLine two" }])
        .ok,
    ).toBe(false);
    const edited = applyEdits(multi, [
      { key: "install", markdown: "Line one\r\nLine 2" },
    ]);
    expect(edited.ok && edited.sections[0].markdown).toBe("Line one\nLine 2");
  });

  it("refuses a section that does not exist, one sent twice, and one emptied", () => {
    expect(
      applyEdits(sections, [{ key: "nope", markdown: "x" }]),
    ).toMatchObject({ ok: false });
    expect(
      applyEdits(sections, [
        { key: "install", markdown: "a" },
        { key: "install", markdown: "b" },
      ]),
    ).toMatchObject({ ok: false, error: expect.stringContaining("twice") });
    expect(
      applyEdits(sections, [{ key: "install", markdown: "  \n " }]),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("cannot be empty"),
    });
  });
});

describe("EditRequest", () => {
  const ok = { sections: [{ key: "install", markdown: "x" }] };

  it("accepts sections with an optional note, and trims the note", () => {
    expect(EditRequest.safeParse(ok).success).toBe(true);
    const parsed = EditRequest.parse({ ...ok, note: "  Fixed it  " });
    expect(parsed.note).toBe("Fixed it");
  });

  it("refuses no sections, a section without text, too much text and a long note", () => {
    expect(EditRequest.safeParse({ sections: [] }).success).toBe(false);
    expect(EditRequest.safeParse({ sections: [{ key: "a" }] }).success).toBe(
      false,
    );
    expect(
      EditRequest.safeParse({
        sections: [{ key: "a", markdown: "x".repeat(MAX_SECTION_CHARS + 1) }],
      }).success,
    ).toBe(false);
    expect(
      EditRequest.safeParse({ ...ok, note: "x".repeat(MAX_NOTE_CHARS + 1) })
        .success,
    ).toBe(false);
  });

  it("does not let the sender set titles, sources or flags: only key and markdown count", () => {
    const parsed = EditRequest.parse({
      sections: [{ key: "a", markdown: "x", title: "Hacked", citations: [] }],
    });
    expect(parsed.sections[0]).toEqual({ key: "a", markdown: "x" });
  });
});

describe("saveGuideEdit (browser)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (status: number, body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );

  it("sends only what changed, to the guide's address, and says ok", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await saveGuideEdit(
      "g1",
      [{ key: "install", markdown: "New" }],
      " Fixed it ",
    );
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/guides/g1/versions");
    expect(JSON.parse(String(init.body))).toEqual({
      sections: [{ key: "install", markdown: "New" }],
      note: " Fixed it ",
    });
  });

  it("leaves the note out when it is empty", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await saveGuideEdit("g1", [{ key: "a", markdown: "x" }], "   ");
    const init = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("note");
  });

  it("shows the server's message for 400 and 409, a plain one for 401, and hides other errors", async () => {
    reply(400, { error: "Nothing was changed" });
    expect(await saveGuideEdit("g", [], "")).toEqual({
      ok: false,
      error: "Nothing was changed",
    });
    reply(409, { error: "This guide has no text to edit" });
    expect(await saveGuideEdit("g", [], "")).toMatchObject({
      ok: false,
      error: "This guide has no text to edit",
    });
    reply(401, { error: "Sign in first" });
    expect(await saveGuideEdit("g", [], "")).toEqual({
      ok: false,
      error: "Sign in again to save your changes.",
    });
    reply(500, { error: "relation guides does not exist" });
    const hidden = await saveGuideEdit("g", [], "");
    expect(hidden).toEqual({
      ok: false,
      error: "Could not save. Please try again.",
    });
  });

  it("says so when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await saveGuideEdit("g", [], "")).toEqual({
      ok: false,
      error: "Could not reach the server. Check your connection.",
    });
  });
});
