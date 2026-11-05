import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

/** What getCheckpointer needs from the outside. Tests pass fakes here. */
export type CheckpointerDeps = {
  connectionString: () => string;
  create: (connectionString: string) => PostgresSaver;
};
