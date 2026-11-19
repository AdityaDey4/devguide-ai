import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";

// What each LangSmith trace is called and tagged with, so one run or chat turn can be found
// (NFR-OBS-1). LangChain and LangGraph send the traces themselves when LANGSMITH_TRACING=true; this
// only adds a name, tags and metadata to the config passed to the graph.
//
//   graph.invoke(input, { ...traceConfig("chat", { technology: "zod", guideId }) })
//   ...then: await flushTraces()    // before the serverless function stops
//
// Metadata holds ids and names only, never the question or the answer text.

export type TraceKind = "generate" | "chat";

export function traceConfig(
  kind: TraceKind,
  metadata: Record<string, string | undefined>,
) {
  const clean = Object.fromEntries(
    Object.entries(metadata).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;
  return {
    runName: `devguide-${kind}`,
    tags: ["devguide-ai", kind],
    metadata: { kind, ...clean },
  };
}

/**
 * Sends the traces that are still being uploaded. Without it, a serverless function can stop
 * before they leave and they are lost. Never throws: tracing must not break an answer.
 */
export async function flushTraces(): Promise<void> {
  try {
    await awaitAllCallbacks();
  } catch (error) {
    console.error("trace upload failed:", error);
  }
}
