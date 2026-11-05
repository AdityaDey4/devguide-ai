import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeCheckpointer,
  getCheckpointer,
  runConfig,
} from "@/lib/agents/shared/checkpointer";
import {
  CHECKPOINT_SCHEMA,
  readConnectionString,
} from "@/lib/agents/shared/checkpointer/config";
import type { CheckpointerDeps } from "@/lib/agents/shared/checkpointer/types";

afterEach(async () => {
  await closeCheckpointer();
  vi.unstubAllEnvs();
});

/** A stand-in for PostgresSaver that records what is done to it. */
function fakes(setup: () => Promise<void> = async () => {}) {
  const savers: {
    setup: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  }[] = [];
  const deps: CheckpointerDeps = {
    connectionString: () => "postgres://fake",
    create: () => {
      const saver = { setup: vi.fn(setup), end: vi.fn(async () => {}) };
      savers.push(saver);
      return saver as unknown as PostgresSaver;
    },
  };
  return { deps, savers };
}

describe("getCheckpointer", () => {
  it("creates the checkpointer and sets it up once, then hands out the same one", async () => {
    const { deps, savers } = fakes();
    const first = await getCheckpointer(deps);
    const second = await getCheckpointer(deps);
    expect(second).toBe(first);
    expect(savers).toHaveLength(1);
    expect(savers[0].setup).toHaveBeenCalledTimes(1);
  });

  it("shares one setup between callers that ask at the same moment", async () => {
    const { deps, savers } = fakes(() => new Promise((r) => setTimeout(r, 10)));
    const [a, b, c] = await Promise.all([
      getCheckpointer(deps),
      getCheckpointer(deps),
      getCheckpointer(deps),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(savers).toHaveLength(1);
  });

  it("closes the connections and tries again next time when setup fails", async () => {
    let attempts = 0;
    const { deps, savers } = fakes(async () => {
      if (++attempts === 1) throw new Error("database is down");
    });
    await expect(getCheckpointer(deps)).rejects.toThrow("database is down");
    expect(savers[0].end).toHaveBeenCalledTimes(1); // no connection left open

    await expect(getCheckpointer(deps)).resolves.toBeDefined();
    expect(savers).toHaveLength(2);
  });
});

describe("closeCheckpointer", () => {
  it("closes the connections, and the next call starts fresh", async () => {
    const { deps, savers } = fakes();
    await getCheckpointer(deps);
    await closeCheckpointer();
    expect(savers[0].end).toHaveBeenCalledTimes(1);

    await getCheckpointer(deps);
    expect(savers).toHaveLength(2);
  });

  it("does nothing when there is no checkpointer", async () => {
    await expect(closeCheckpointer()).resolves.toBeUndefined();
  });
});

describe("runConfig", () => {
  it("uses the run id as LangGraph's thread id", () => {
    expect(runConfig("run-123").configurable).toEqual({
      thread_id: "run-123",
    });
  });

  it("saves every checkpoint before the next step starts, so a killed run loses nothing", () => {
    expect(runConfig("run-123").durability).toBe("sync");
  });
});

describe("configuration", () => {
  it("keeps LangGraph's tables out of the public schema, which Supabase publishes", () => {
    expect(CHECKPOINT_SCHEMA).toBe("langgraph");
  });

  it("reads DATABASE_URL, and a bad one is reported without printing it", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@127.0.0.1:5432/db");
    expect(readConnectionString()).toBe("postgresql://u:p@127.0.0.1:5432/db");

    vi.stubEnv("DATABASE_URL", "mysql://user:secret-pass@host/db");
    const call = () => readConnectionString();
    expect(call).toThrow(/DATABASE_URL must be set/);
    expect(call).not.toThrow(/secret-pass/);
  });
});
