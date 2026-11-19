import { describe, expect, it } from "vitest";
import { flushTraces, traceConfig } from "@/lib/agents/shared/tracing";

describe("traceConfig", () => {
  it("names and tags the trace and keeps the ids that were given", () => {
    expect(
      traceConfig("chat", { technology: "Zod", guideId: undefined }),
    ).toEqual({
      runName: "devguide-chat",
      tags: ["devguide-ai", "chat"],
      metadata: { kind: "chat", technology: "Zod" },
    });
  });
});

describe("flushTraces", () => {
  it("resolves without throwing", async () => {
    await expect(flushTraces()).resolves.toBeUndefined();
  });
});
