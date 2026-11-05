import {
  getCheckpointer,
  runConfig,
} from "../../src/lib/agents/shared/checkpointer";
import { buildGraph } from "./resumableGraph";

// Run as its own process by tests/integration/checkpointer.test.ts:
//   node --env-file=.env.local --import tsx tests/helpers/crashingRun.ts <runId>
// It starts the three-step graph and is killed abruptly at the start of step two (exit code 42),
// exactly like a server dying mid-run. Step one has already been saved by then.

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error("usage: crashingRun.ts <runId>");

  const graph = buildGraph(await getCheckpointer(), () => process.exit(42));
  await graph.invoke({ log: [] }, runConfig(runId));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
