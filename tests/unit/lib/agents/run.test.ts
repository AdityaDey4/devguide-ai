import { MemorySaver } from "@langchain/langgraph";
import { describe, expect, it, vi } from "vitest";
import { buildGenerateGraph } from "@/lib/agents/generate/graph";
import { GenerateError } from "@/lib/agents/generate/errors";
import {
  describeFailure,
  resumeGeneration,
  startGeneration,
  type RunDeps,
  type RunStore,
} from "@/lib/agents/generate/run";
import { drive } from "@/lib/agents/generate/run/drive";
import { BudgetExceeded, newBudget } from "@/lib/agents/shared/budget";
import { fakeDeps, ZOD_ANSWER } from "../../../helpers/generateFakes";

/** A fake `runs` table that remembers every call, in order. */
function fakeStore(
  options: { claim?: "ok" | "already_running"; hasGuide?: boolean } = {},
) {
  const calls: string[] = [];
  const detail: Record<string, unknown[]> = {};
  const note = (name: string, ...args: unknown[]) => {
    calls.push(name);
    detail[name] = args;
  };
  const store: RunStore = {
    createRun: async (userId) => (note("createRun", userId), "run-1"),
    markRunning: async (id) => note("markRunning", id),
    setTechnology: async (id, tech) => (
      note("setTechnology", id, tech),
      options.claim ?? "ok"
    ),
    markWaiting: async (id, budget) => note("markWaiting", id, budget),
    markCompleted: async (id, budget) => note("markCompleted", id, budget),
    markFailed: async (id, reason, budget) =>
      note("markFailed", id, reason, budget),
    hasGuide: async (id) => (note("hasGuide", id), options.hasGuide ?? false),
  };
  return { store, calls, detail };
}

function setup(
  answers: Parameters<typeof fakeDeps>[0] = {},
  storeOptions: Parameters<typeof fakeStore>[0] = {},
  checkpointer = new MemorySaver(),
) {
  const fake = fakeDeps(answers);
  const run = fakeStore(storeOptions);
  const partialGuides: unknown[] = [];
  const partialIndexed: unknown[] = [];
  const deps: RunDeps = {
    store: run.store,
    graph: buildGenerateGraph(checkpointer, fake.deps),
    generate: {
      events: fake.deps.events,
      indexGuide: async (input) => {
        partialIndexed.push(input);
        return { inserted: 0, removed: 0 };
      },
      saveGuide: async (input) => {
        partialGuides.push(input);
        return {
          guideId: "partial-guide",
          versionId: "partial-version",
          versionNo: 1,
        };
      },
    },
  };
  return { ...fake, ...run, deps, partialGuides, partialIndexed, checkpointer };
}

const ambiguous = {
  ...ZOD_ANSWER,
  outcome: "ambiguous" as const,
  name: null,
  officialResult: null,
  candidates: [
    { name: "Zod", description: "Schema validation", result: 1 },
    { name: "Zod API", description: "Its API docs", result: 2 },
  ],
};

describe("describeFailure", () => {
  it("shows the messages we wrote ourselves as they are", () => {
    expect(describeFailure(new BudgetExceeded("steps", 60, 60))).toBe(
      "Stopped: the run reached its limit of 60 steps",
    );
    expect(
      describeFailure(
        new GenerateError(
          'Could not find the official documentation for "x"',
          "technology_not_found",
        ),
      ),
    ).toBe('Could not find the official documentation for "x"');
  });

  it("prefixes and shortens anything else", () => {
    const text = describeFailure(new TypeError("x is undefined"));
    expect(text).toBe("Something went wrong: x is undefined");
    expect(describeFailure(new Error("y".repeat(1000)))).toHaveLength(
      "Something went wrong: ".length + 300,
    );
    expect(describeFailure("a plain string")).toBe(
      "Something went wrong: a plain string",
    );
  });

  it("hides API keys, because the text is saved and shown", () => {
    const text = describeFailure(
      new Error(
        "401 Incorrect API key sk-proj-abcdef123456 / tvly-abcdef123456",
      ),
    );
    expect(text).not.toContain("abcdef123456");
    expect(text).toContain("sk-***");
    expect(text).toContain("tvly-***");
  });
});

describe("startGeneration", () => {
  it("runs to the end, updating the run record step by step", async () => {
    const t = setup();
    const outcome = await startGeneration("zod", {}, t.deps);

    expect(outcome).toEqual({
      status: "completed",
      runId: "run-1",
      guideId: "guide-1",
      versionId: "version-1",
    });
    expect(t.calls).toEqual([
      "createRun",
      "markRunning",
      "setTechnology",
      "markCompleted",
    ]);
    expect(t.detail.setTechnology).toEqual(["run-1", "tech-1"]);
  });

  it("saves the final budget on the run record", async () => {
    const t = setup();
    await startGeneration("zod", {}, t.deps);
    expect(t.detail.markCompleted[1]).toMatchObject({ steps: 12, fetches: 8 });
  });

  it("reports each graph step as it finishes", async () => {
    const t = setup();
    const steps: string[] = [];
    t.deps.onStep = (node) => steps.push(node);
    await startGeneration("zod", {}, t.deps);
    expect(steps[0]).toBe("identify");
    expect(steps).toContain("planOutline");
    expect(steps.at(-1)).toBe("assembleGuide");
    expect(steps.some((s) => s.startsWith("__"))).toBe(false);
  });

  it("passes the user id on to the run record", async () => {
    const t = setup();
    await startGeneration("zod", { userId: "user-9" }, t.deps);
    expect(t.detail.createRun).toEqual(["user-9"]);
  });
});

describe("a name that could mean several things", () => {
  it("stops as 'waiting', with the choices, and carries on when answered", async () => {
    let calls = 0;
    const t = setup({
      identify: () => (++calls === 1 ? ambiguous : ZOD_ANSWER),
    });

    const waiting = await startGeneration("zod", {}, t.deps);
    expect(waiting).toMatchObject({ status: "waiting_user", runId: "run-1" });
    expect((waiting as { candidates: unknown[] }).candidates).toHaveLength(2);
    expect(t.calls.at(-1)).toBe("markWaiting");
    expect(t.calls).not.toContain("markCompleted");

    const done = await resumeGeneration(
      "run-1",
      { choice: "candidate", url: "https://zod.dev/" },
      {},
      t.deps,
    );
    expect(done.status).toBe("completed");
    expect(t.calls.filter((c) => c === "markRunning")).toHaveLength(2); // running again after the answer
    expect(t.calls.at(-1)).toBe("markCompleted");
  });
});

describe("when a run fails", () => {
  it("ends as failed with a readable reason, and tells the UI", async () => {
    const t = setup({
      identify: () => ({
        ...ZOD_ANSWER,
        outcome: "unknown",
        name: null,
        officialResult: null,
      }),
    });
    const outcome = await startGeneration("asdf", {}, t.deps);

    expect(outcome).toEqual({
      status: "failed",
      runId: "run-1",
      reason: 'Could not find the official documentation for "asdf"',
    });
    expect(t.events.at(-1)).toEqual({
      type: "failed",
      reason: outcome.status === "failed" ? outcome.reason : "",
    });
    expect(t.detail.markFailed[1]).toBe(
      'Could not find the official documentation for "asdf"',
    );
    expect(t.calls).not.toContain("markCompleted");
  });

  it("ends as failed, not thrown, when a limit of the budget is reached (the real limit, through the real graph)", async () => {
    const t = setup();
    // 59 of the 60 allowed steps are already used: identify takes the last one, discoverDocs is refused.
    const nearlyOut = { ...newBudget(), steps: 59 };
    const outcome = await drive(
      "run-1",
      { runId: "run-1", query: "zod", budget: nearlyOut },
      t.deps,
    );

    expect(outcome).toEqual({
      status: "failed",
      runId: "run-1",
      reason: "Stopped: the run reached its limit of 60 steps",
    });
    expect(t.events.at(-1)).toMatchObject({ type: "failed" });
    expect(t.calls.at(-1)).toBe("markFailed");
  });

  it("records the budget used so far on the failed run", async () => {
    const t = setup();
    await drive(
      "run-1",
      { runId: "run-1", query: "zod", budget: { ...newBudget(), steps: 59 } },
      t.deps,
    );
    expect(t.detail.markFailed[2]).toMatchObject({ steps: 60 });
  });

  it("gives a plain reason for an unexpected error and never leaks a key", async () => {
    const t = setup();
    t.deps.graph = buildGenerateGraph(new MemorySaver(), {
      ...t.deps.generate,
      ...fakeDeps().deps,
      searchWeb: async () => {
        throw new Error("401 bad key sk-proj-secret123456");
      },
    });
    const outcome = await startGeneration("zod", {}, t.deps);
    expect(outcome.status).toBe("failed");
    expect(JSON.stringify(outcome)).not.toContain("secret123456");
  });

  it("refuses to run the same technology twice at the same time", async () => {
    const t = setup({}, { claim: "already_running" });
    const outcome = await startGeneration("zod", {}, t.deps);
    expect(outcome).toMatchObject({
      status: "failed",
      reason:
        "Another run is already generating a guide for Zod. Search for it again to follow that run.",
    });
    expect(t.fetched).toEqual([]); // it stopped before downloading anything
  });

  it("never throws, even when the bookkeeping itself fails", async () => {
    const t = setup({
      identify: () => ({
        ...ZOD_ANSWER,
        outcome: "unknown",
        name: null,
        officialResult: null,
      }),
    });
    t.deps.store.markFailed = async () => {
      throw new Error("database is down");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(startGeneration("asdf", {}, t.deps)).resolves.toMatchObject({
      status: "failed",
    });
  });
});

describe("a partial draft", () => {
  /** The graph's own save fails at the very end, after all 7 sections are written and checked. */
  function failAtTheEnd(hasGuide: boolean) {
    const t = setup({}, { hasGuide });
    const failing = fakeDeps();
    failing.deps.saveGuide = async () => {
      throw new Error("database is down");
    };
    t.deps.graph = buildGenerateGraph(new MemorySaver(), failing.deps);
    return t;
  }

  it("keeps the written sections, flagged, when a first run fails late", async () => {
    const t = failAtTheEnd(false);
    const outcome = await startGeneration("zod", {}, t.deps);

    expect(outcome.status).toBe("failed");
    expect(t.partialGuides).toHaveLength(1);
    const saved = t.partialGuides[0] as {
      status: string;
      sections: { key: string }[];
    };
    expect(saved.status).toBe("partial");
    expect(saved.sections).toHaveLength(7);
    expect(saved.sections.map((s) => s.key)[0]).toBe("what-it-is");
  });

  it("makes the partial draft searchable too, tied to the draft's guide", async () => {
    const t = failAtTheEnd(false);
    await startGeneration("zod", {}, t.deps);
    expect(t.partialIndexed).toHaveLength(1);
    expect(t.partialIndexed[0]).toMatchObject({
      guideId: "partial-guide",
      technology: { id: "tech-1" },
    });
  });

  it("keeps the draft even when making it searchable fails", async () => {
    const t = failAtTheEnd(false);
    t.deps.generate.indexGuide = async () => {
      throw new Error("embeddings are down");
    };
    const outcome = await startGeneration("zod", {}, t.deps);
    expect(outcome.status).toBe("failed");
    expect(t.partialGuides).toHaveLength(1);
  });

  it("never replaces a guide that already exists", async () => {
    const t = failAtTheEnd(true);
    await startGeneration("zod", {}, t.deps);
    expect(t.partialGuides).toEqual([]);
  });

  it("has nothing to keep when it fails before any section is written", async () => {
    const t = setup({
      identify: () => ({
        ...ZOD_ANSWER,
        outcome: "unknown",
        name: null,
        officialResult: null,
      }),
    });
    await startGeneration("asdf", {}, t.deps);
    expect(t.partialGuides).toEqual([]);
  });
});

describe("continuing a run that was interrupted", () => {
  it("picks up from the last saved step without redoing the earlier ones", async () => {
    const checkpointer = new MemorySaver();

    // First attempt: the writer fails on every call (say, the network drops during writing).
    const broken = setup({}, {}, checkpointer);
    broken.deps.graph = buildGenerateGraph(checkpointer, {
      ...broken.deps.generate,
      ...broken.deps,
      ...fakeDeps().deps,
      write: async () => {
        throw new Error("network dropped");
      },
    });
    const first = await startGeneration("zod", {}, broken.deps);
    expect(first.status).toBe("failed");

    // Second attempt: same run id, same checkpoints, a working writer, no new input.
    const healthy = setup({}, {}, checkpointer);
    const second = await resumeGeneration("run-1", undefined, {}, healthy.deps);

    expect(second.status).toBe("completed");
    expect(healthy.searches).toEqual([]); // identify did not run again
    expect(healthy.written.length).toBeGreaterThanOrEqual(7); // the sections were written now
  });
});
