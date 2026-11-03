import { describe, expect, it, vi } from "vitest";
import { RunEvents } from "@/lib/agents/shared/events";
import { toRow } from "@/lib/agents/shared/events/row";
import type { EventRow } from "@/lib/agents/shared/events";

/** A recorder standing in for the database, and a clock the test moves by hand. */
function setup(insert?: (row: EventRow) => Promise<void>) {
  const saved: EventRow[] = [];
  const clock = { now: 1_000 };
  const onError = vi.fn();
  const events = new RunEvents("run-1", {
    insert: insert ?? (async (row) => void saved.push(row)),
    now: () => clock.now,
    onError,
  });
  return { events, saved, clock, onError };
}
const texts = (rows: EventRow[]) =>
  rows
    .filter((row) => row.type === "section_delta")
    .map((row) => row.payload.text);

describe("toRow", () => {
  it("puts the type in its column and everything else in the payload", () => {
    expect(toRow("run-1", { type: "docs_found", count: 31 })).toEqual({
      run_id: "run-1",
      type: "docs_found",
      payload: { count: 31 },
    });
  });
});

describe("emit", () => {
  it("saves one row for the run, with the event's details as payload", async () => {
    const { events, saved } = setup();
    await events.emit({
      type: "section_started",
      key: "setup",
      title: "Setup",
    });
    expect(saved).toEqual([
      {
        run_id: "run-1",
        type: "section_started",
        payload: { key: "setup", title: "Setup" },
      },
    ]);
  });

  it("keeps the order events were emitted in, even when an earlier save is slower", async () => {
    const order: string[] = [];
    const { events } = setup(async (row) => {
      if (row.type === "docs_found")
        await new Promise((r) => setTimeout(r, 20));
      order.push(row.type);
    });
    await Promise.all([
      events.emit({ type: "docs_found", count: 3 }),
      events.emit({ type: "outline", sections: [] }),
      events.emit({ type: "completed", guideId: "g", versionId: "v" }),
    ]);
    expect(order).toEqual(["docs_found", "outline", "completed"]);
  });

  it("does not throw when a row cannot be saved, reports it, and carries on", async () => {
    let calls = 0;
    const { events, saved, onError } = setup(async (row) => {
      if (++calls === 1) throw new Error("database is down");
      saved.push(row);
    });
    await expect(
      events.emit({ type: "docs_found", count: 1 }),
    ).resolves.toBeUndefined();
    await events.emit({ type: "docs_found", count: 2 });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toMatchObject({ type: "docs_found" });
    expect(saved.map((row) => row.payload.count)).toEqual([2]);
  });
});

describe("delta (batching)", () => {
  it("saves the first text at once, so the UI starts moving immediately", async () => {
    const { events, saved } = setup();
    await events.delta("setup", "Install");
    expect(texts(saved)).toEqual(["Install"]);
  });

  it("gathers text arriving within 300 ms into one row", async () => {
    const { events, saved, clock } = setup();
    await events.delta("setup", "A"); // saved: first
    for (const token of ["B", "C", "D"]) {
      clock.now += 50;
      await events.delta("setup", token);
    }
    expect(texts(saved)).toEqual(["A"]); // B, C, D still waiting

    clock.now += 200; // 350 ms since the last save
    await events.delta("setup", "E");
    expect(texts(saved)).toEqual(["A", "BCDE"]);
  });

  it("saves far fewer rows than tokens: 100 tokens in one second is about 4 rows", async () => {
    const { events, saved, clock } = setup();
    for (let i = 0; i < 100; i++) {
      clock.now += 10;
      await events.delta("setup", "x");
    }
    await events.flush();
    expect(saved.length).toBeLessThanOrEqual(5);
    expect(texts(saved).join("")).toBe("x".repeat(100)); // nothing lost
  });

  it("batches each section separately, so parallel sections do not mix", async () => {
    const { events, saved, clock } = setup();
    await events.delta("setup", "s1 ");
    await events.delta("usage", "u1 ");
    clock.now += 100;
    await events.delta("setup", "s2");
    await events.delta("usage", "u2");
    await events.flush();

    const byKey = (key: string) =>
      saved
        .filter((row) => row.payload.key === key)
        .map((row) => row.payload.text)
        .join("");
    expect(byKey("setup")).toBe("s1 s2");
    expect(byKey("usage")).toBe("u1 u2");
  });

  it("saves waiting text before the next event, so section_done never overtakes it", async () => {
    const { events, saved, clock } = setup();
    await events.delta("setup", "first ");
    clock.now += 10;
    await events.delta("setup", "last words"); // waiting
    await events.emit({ type: "section_done", key: "setup", citations: 2 });

    expect(saved.map((row) => row.type)).toEqual([
      "section_delta",
      "section_delta",
      "section_done",
    ]);
    expect(texts(saved)).toEqual(["first ", "last words"]);
  });

  it("flush saves the leftover and resolves only when it is saved", async () => {
    const { events, saved, clock } = setup();
    await events.delta("setup", "a");
    clock.now += 10;
    await events.delta("setup", "b");
    expect(texts(saved)).toEqual(["a"]);
    await events.flush();
    expect(texts(saved)).toEqual(["a", "b"]);
  });

  it("does nothing when flush is called with nothing waiting", async () => {
    const { events, saved } = setup();
    await events.flush();
    expect(saved).toEqual([]);
  });
});
