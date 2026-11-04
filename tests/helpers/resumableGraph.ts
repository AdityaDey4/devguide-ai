import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

// A tiny three-step graph for testing checkpoints: first -> second -> third.
// Each step adds its name to `log`, which is saved with the checkpoint, so after a crash and a
// resume the log shows exactly which steps ran, and how many times.

const State = Annotation.Root({
  log: Annotation<string[]>({
    reducer: (all, added) => all.concat(added),
    default: () => [],
  }),
});

/** `beforeSecond` runs at the start of the second step: tests use it to crash the process. */
export function buildGraph(
  checkpointer: BaseCheckpointSaver,
  beforeSecond: () => void = () => {},
) {
  return new StateGraph(State)
    .addNode("first", () => ({ log: ["first"] }))
    .addNode("second", () => {
      beforeSecond();
      return { log: ["second"] };
    })
    .addNode("third", () => ({ log: ["third"] }))
    .addEdge(START, "first")
    .addEdge("first", "second")
    .addEdge("second", "third")
    .addEdge("third", END)
    .compile({ checkpointer });
}
