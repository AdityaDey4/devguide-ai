import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeCheckpointer,
  getCheckpointer,
  runConfig,
} from "@/lib/agents/shared/checkpointer";
import { createServiceClient } from "@/lib/supabase/service";
import { buildGraph } from "../helpers/resumableGraph";

// The checkpointer against the real local database. The last test is the Definition of Done of
// M3: a process that is killed in the middle of a run is continued by another one, without
// repeating the work already done.

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const runIds: string[] = [];
const newRunId = () => {
  const id = `test-checkpoint-${Date.now()}-${runIds.length}`;
  runIds.push(id);
  return id;
};

beforeAll(async () => {
  await getCheckpointer(); // creates the schema and tables
});

afterAll(async () => {
  for (const table of [
    "checkpoints",
    "checkpoint_blobs",
    "checkpoint_writes",
  ]) {
    await pool.query(
      `delete from langgraph.${table} where thread_id = any($1)`,
      [runIds],
    );
  }
  await closeCheckpointer();
  await pool.end();
});

describe("setup (real database)", () => {
  it("creates LangGraph's tables in the langgraph schema", async () => {
    const { rows } = await pool.query(
      `select table_name from information_schema.tables
       where table_schema = 'langgraph' order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      "checkpoint_blobs",
      "checkpoint_migrations",
      "checkpoint_writes",
      "checkpoints",
    ]);
  });

  it("puts nothing in the public schema", async () => {
    const { rows } = await pool.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name like 'checkpoint%'`,
    );
    expect(rows).toEqual([]);
  });

  it("can be run again without error or duplicates", async () => {
    await closeCheckpointer();
    await getCheckpointer(); // runs setup() a second time
    const { rows } = await pool.query(
      "select count(*)::int as n from langgraph.checkpoint_migrations",
    );
    const { rows: again } = await pool.query(
      "select count(*)::int as n from langgraph.checkpoint_migrations",
    );
    expect(again[0].n).toBe(rows[0].n);
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("is not reachable through the Supabase web API", async () => {
    const db = createServiceClient();
    const { error } = await db
      .schema("langgraph" as never)
      .from("checkpoints" as never)
      .select("*");
    expect(error).toBeTruthy(); // schema not exposed, even to the service role
  });
});

describe("saving and resuming", () => {
  it("keeps the state after every step, readable later by run id", async () => {
    const runId = newRunId();
    const graph = buildGraph(await getCheckpointer());
    await graph.invoke({ log: [] }, runConfig(runId));

    const { values } = await graph.getState(runConfig(runId));
    expect(values.log).toEqual(["first", "second", "third"]);

    const history = [];
    for await (const state of graph.getStateHistory(runConfig(runId)))
      history.push(state);
    expect(history.length).toBeGreaterThanOrEqual(4); // start, then one per step
  });

  it("keeps different runs apart", async () => {
    const [a, b] = [newRunId(), newRunId()];
    const graph = buildGraph(await getCheckpointer());
    await graph.invoke({ log: ["from-a"] }, runConfig(a));
    await graph.invoke({ log: ["from-b"] }, runConfig(b));

    expect((await graph.getState(runConfig(a))).values.log[0]).toBe("from-a");
    expect((await graph.getState(runConfig(b))).values.log[0]).toBe("from-b");
  });

  it("continues a run that was killed, without repeating the steps already done", async () => {
    const runId = newRunId();

    // 1. Another process starts the run and dies at the start of step two.
    const child = spawnSync(
      process.execPath,
      [
        "--env-file=.env.local",
        "--import",
        "tsx",
        "tests/helpers/crashingRun.ts",
        runId,
      ],
      { encoding: "utf8", timeout: 60_000 },
    );
    expect(child.status).toBe(42); // it really was killed mid-run

    // 2. What the database kept: step one is done, step two is next.
    const graph = buildGraph(await getCheckpointer());
    const interrupted = await graph.getState(runConfig(runId));
    expect(interrupted.values.log).toEqual(["first"]);
    expect(interrupted.next).toEqual(["second"]);

    // 3. A new process carries on from there.
    await graph.invoke(null, runConfig(runId));
    const finished = await graph.getState(runConfig(runId));
    expect(finished.values.log).toEqual(["first", "second", "third"]); // "first" only once
    expect(finished.next).toEqual([]);
  }, 90_000);
});
