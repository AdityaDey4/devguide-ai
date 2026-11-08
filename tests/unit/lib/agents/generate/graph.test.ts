import { Command, MemorySaver } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { buildGenerateGraph } from "@/lib/agents/generate/graph";
import { GenerateError } from "@/lib/agents/generate/errors";
import type { RunEvent } from "@/lib/agents/shared/events";
import { SECTION_KEYS } from "@/lib/agents/generate/sections";
import { fakeDeps, ZOD_ANSWER } from "../../../../helpers/generateFakes";

// The generation graph so far (identify -> discoverDocs -> planOutline), with fake dependencies
// and an in-memory checkpointer: no database, no model, no network.

const config = { configurable: { thread_id: "run-1" } };
const start = { runId: "run-1", query: "zod" };

const ambiguousAnswer = {
  ...ZOD_ANSWER,
  outcome: "ambiguous" as const,
  name: null,
  officialResult: null,
  candidates: [
    { name: "Zod", description: "Schema validation", result: 1 },
    { name: "Zod API", description: "Its API docs", result: 2 },
  ],
};

/** The run-level events, without the per-section ones (those are tested separately). */
const progress = (events: RunEvent[]) =>
  events.map((e) => e.type).filter((type) => !type.startsWith("section_"));

describe("generation graph", () => {
  it("goes from a name to an outline when the technology is clear", async () => {
    const { deps, events } = fakeDeps();
    const graph = buildGenerateGraph(new MemorySaver(), deps);

    const final = await graph.invoke(start, config);

    expect(final.technology?.name).toBe("Zod");
    expect(final.discoveredPages).toHaveLength(3);
    expect(final.outline).toHaveLength(7);
    expect(progress(events)).toEqual([
      "identified",
      "docs_found",
      "outline",
      "checking",
      "completed",
    ]);
    expect(final.budget.steps).toBe(12); // identify, discover, plan, 7 writers, check, assemble
  });

  it("stops to ask when the name is ambiguous, and says what the choices are", async () => {
    const { deps, events } = fakeDeps({ identify: () => ambiguousAnswer });
    const graph = buildGenerateGraph(new MemorySaver(), deps);

    await graph.invoke(start, config);

    const waiting = await graph.getState(config);
    expect(waiting.next).toEqual(["applyChoice"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "needs_choice" });
    expect((events[0] as { candidates: unknown[] }).candidates).toHaveLength(2);
    expect(waiting.values.outline).toEqual([]); // nothing past identify has run
  });

  it("does not count the time spent waiting for the person", async () => {
    let calls = 0;
    const { deps } = fakeDeps({
      identify: () => (++calls === 1 ? ambiguousAnswer : ZOD_ANSWER),
    });
    const graph = buildGenerateGraph(new MemorySaver(), deps);

    await graph.invoke(start, config);
    const waiting = await graph.getState(config);
    expect(waiting.values.budget.runningSince).toBeNull(); // the clock is stopped

    await graph.invoke(
      new Command({ resume: { choice: "candidate", url: "https://zod.dev/" } }),
      config,
    );
    const done = await graph.getState(config);
    expect(done.values.budget.runningSince).not.toBeNull(); // running again
  });

  it("carries on with the technology the person picked", async () => {
    let calls = 0;
    const { deps, events } = fakeDeps({
      identify: () => (++calls === 1 ? ambiguousAnswer : ZOD_ANSWER),
    });
    const graph = buildGenerateGraph(new MemorySaver(), deps);

    await graph.invoke(start, config);
    const final = await graph.invoke(
      new Command({ resume: { choice: "candidate", url: "https://zod.dev/" } }),
      config,
    );

    expect(final.technology?.name).toBe("Zod");
    expect(final.outline).toHaveLength(7);
    expect(final.candidates).toEqual([]);
    expect(progress(events)).toEqual([
      "needs_choice",
      "identified",
      "docs_found",
      "outline",
      "checking",
      "completed",
    ]);
  });

  describe("writing the sections", () => {
    async function runToTheEnd() {
      const fake = fakeDeps();
      const graph = buildGenerateGraph(new MemorySaver(), fake.deps);
      const final = await graph.invoke(start, config);
      return { ...fake, final };
    }

    it("writes all 7 sections, one draft per standard section", async () => {
      const { final } = await runToTheEnd();
      expect(Object.keys(final.sections).sort()).toEqual(
        [...SECTION_KEYS].sort(),
      );
      for (const draft of Object.values(final.sections)) {
        expect(draft.status).toBe("ok"); // written, then checked
        expect(draft.citations.length).toBeGreaterThan(0);
      }
    });

    it("starts and finishes every section, and streams text for each", async () => {
      const { events } = await runToTheEnd();
      const keysOf = (type: string) =>
        events
          .filter((e) => e.type === type)
          .map((e) => (e as { key: string }).key);
      expect(keysOf("section_started").sort()).toEqual(
        [...SECTION_KEYS].sort(),
      );
      expect(keysOf("section_done").sort()).toEqual([...SECTION_KEYS].sort());
      expect(new Set(keysOf("section_delta"))).toEqual(new Set(SECTION_KEYS));
    });

    it("adds up every writer's steps and fetches instead of overwriting them", async () => {
      const { final } = await runToTheEnd();
      // 1 discovery fetch + one fetch per assigned page (the fallback page: 1 per section)
      expect(final.budget.steps).toBe(12);
      expect(final.budget.fetches).toBe(1 + 7);
    });

    it("keeps a section's text apart from the others', each citing its own sources", async () => {
      const { final } = await runToTheEnd();
      const urls = Object.values(final.sections).flatMap((d) =>
        d.citations.map((c) => c.url),
      );
      expect(urls.every((url) => url.startsWith("https://zod.dev"))).toBe(true);
    });
  });

  it("searches again with the new name when the person says 'none of these'", async () => {
    let calls = 0;
    const { deps, searches } = fakeDeps({
      identify: () => (++calls === 1 ? ambiguousAnswer : ZOD_ANSWER),
    });
    const graph = buildGenerateGraph(new MemorySaver(), deps);

    await graph.invoke(start, config);
    await graph.invoke(
      new Command({
        resume: { choice: "refine", query: "zod validation library" },
      }),
      config,
    );

    expect(searches).toEqual([
      "zod official documentation",
      "zod validation library official documentation",
    ]);
  });

  it("rejects an answer that is neither a candidate nor a new name", async () => {
    const { deps } = fakeDeps({ identify: () => ambiguousAnswer });
    const graph = buildGenerateGraph(new MemorySaver(), deps);

    await graph.invoke(start, config);
    await expect(
      graph.invoke(new Command({ resume: { choice: "whatever" } }), config),
    ).rejects.toThrow();
  });

  it("ends with a readable error when the technology cannot be found", async () => {
    const { deps } = fakeDeps({
      identify: () => ({
        ...ZOD_ANSWER,
        outcome: "unknown",
        name: null,
        officialResult: null,
      }),
    });
    const graph = buildGenerateGraph(new MemorySaver(), deps);
    await expect(graph.invoke(start, config)).rejects.toBeInstanceOf(
      GenerateError,
    );
  });
});
