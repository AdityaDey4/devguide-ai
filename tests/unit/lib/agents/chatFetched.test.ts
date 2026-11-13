import { describe, expect, it } from "vitest";
import { askGuide } from "@/lib/agents/chat";
import { docsWorthKeeping } from "@/lib/agents/chat/fetched";
import { FRESH_PREFIX } from "@/lib/agents/chat/origin";
import type { ExternalDoc } from "@/lib/agents/chat/state";
import {
  chatStateWith,
  fakeChatDeps,
  longPage,
  ranked,
} from "../../../helpers/chatFakes";

// Which pages found while answering are kept for next time: only those the answer really used.

const doc = (url: string, over: Partial<ExternalDoc> = {}): ExternalDoc => ({
  url,
  title: url,
  type: "official",
  markdown: "text",
  ...over,
});
const fresh = (url: string) =>
  ranked({ id: `${FRESH_PREFIX}${url}#1`, sourceUrl: url });

describe("docsWorthKeeping", () => {
  it("keeps the pages some of whose text is among the chunks, and drops the rest", () => {
    const kept = docsWorthKeeping(
      [doc("https://a"), doc("https://b"), doc("https://c")],
      [fresh("https://a"), ranked({ id: "stored" }), fresh("https://c")],
      "fetched_now",
    );
    expect(kept.map((d) => d.url)).toEqual(["https://a", "https://c"]);
  });

  it("keeps a page once, even if several of its chunks were used or it was found twice", () => {
    const kept = docsWorthKeeping(
      [doc("https://a"), doc("https://a")],
      [fresh("https://a"), fresh("https://a")],
      "fetched_now",
    );
    expect(kept).toHaveLength(1);
  });

  it("keeps Context7 snippets too, as the type they came with", () => {
    const kept = docsWorthKeeping(
      [doc("https://s", { type: "context7" })],
      [fresh("https://s")],
      "fetched_now",
    );
    expect(kept[0].type).toBe("context7");
  });

  it("keeps nothing when no fresh text was used", () => {
    expect(
      docsWorthKeeping(
        [doc("https://a")],
        [ranked({ id: "stored" })],
        "stored_docs",
      ),
    ).toEqual([]);
  });

  it("keeps nothing for an answer that was not found, whatever was fetched", () => {
    expect(
      docsWorthKeeping([doc("https://a")], [fresh("https://a")], "not_found"),
    ).toEqual([]);
  });
});

describe("askGuide: what to store", () => {
  const input = {
    technology: chatStateWith().technology,
    guideId: "g1",
    history: [],
    question: "How do I validate a URL?",
  };

  it("hands back the pages the answer used", async () => {
    const f = fakeChatDeps({
      found: [ranked({ id: "s" })],
      grade: { verdict: "PARTIAL", missing: "z.url options" },
      hits: [{ title: "t", url: "https://zod.dev/api", content: "" }],
      pages: { "https://zod.dev/api": longPage("Defining schemas") },
      text: "From outside [2].",
    });
    const result = await askGuide(input, () => {}, f.deps);
    expect(result.origin).toBe("fetched_now");
    expect(result.toStore.map((d) => d.url)).toEqual(["https://zod.dev/api"]);
  });

  it("hands back nothing when stored text was enough", async () => {
    const f = fakeChatDeps({
      found: [ranked({ id: "s" })],
      text: "Stored [1].",
    });
    const result = await askGuide(input, () => {}, f.deps);
    expect(result.toStore).toEqual([]);
  });
});
