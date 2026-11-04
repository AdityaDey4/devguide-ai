import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { END, Send, START, StateGraph } from "@langchain/langgraph";
import type { GenerateDeps } from "./deps";
import { assembleGuide } from "./nodes/assembleGuide";
import { applyChoice, askUser } from "./nodes/askUser";
import { checkSections } from "./nodes/checkSections";
import { discoverDocs } from "./nodes/discoverDocs";
import { identify } from "./nodes/identify";
import { planOutline } from "./nodes/planOutline";
import {
  RewriteInput,
  type RewriteInputType,
} from "./nodes/rewriteSection/input";
import { rewriteSection } from "./nodes/rewriteSection";
import { writeSection } from "./nodes/writeSection";
import { WriteInput, type WriteInputType } from "./nodes/writeSection/input";
import { realDeps } from "./realDeps";
import { GenerateState, type GenerateStateType } from "./state";

// The guide generation graph (docs/03-Architecture.md section 5.1).
//
//   START -> identify --one technology--> discoverDocs -> planOutline
//               |  ^                                          |
//        several|  | the person's choice                      v  one writer per section, all at once
//               v  |                                    writeSection x7
//             askUser -> applyChoice (waits here)             |
//                                                             v
//                                  +-------------------> checkSections
//                                  |                          |
//                         rewriteSection x(failing) <--failing| (at most 2 rewrites each)
//                                                             | all pass, or out of rewrites
//                                                             v
//                                                       assembleGuide -> END
//
// Nodes are plain functions `node(state, deps)`; the arrows below only hand them their deps.

export function buildGenerateGraph(
  checkpointer: BaseCheckpointSaver,
  deps: GenerateDeps = realDeps,
) {
  return (
    new StateGraph(GenerateState)
      .addNode("identify", (state) => identify(state, deps))
      .addNode("askUser", (state) => askUser(state, deps))
      .addNode("applyChoice", (state) => applyChoice(state))
      .addNode("discoverDocs", (state) => discoverDocs(state, deps))
      .addNode("planOutline", (state) => planOutline(state, deps))
      // Writers and rewriters get only their own section (see their input.ts files).
      .addNode(
        "writeSection",
        (input: WriteInputType) => writeSection(input, deps),
        { input: WriteInput },
      )
      .addNode("checkSections", (state) => checkSections(state, deps))
      .addNode(
        "rewriteSection",
        (input: RewriteInputType) => rewriteSection(input, deps),
        { input: RewriteInput },
      )
      .addNode("assembleGuide", (state) => assembleGuide(state, deps))
      .addEdge(START, "identify")
      .addConditionalEdges("identify", afterIdentify, [
        "askUser",
        "discoverDocs",
      ])
      .addEdge("askUser", "applyChoice")
      .addEdge("applyChoice", "identify")
      .addEdge("discoverDocs", "planOutline")
      .addConditionalEdges("planOutline", fanOutWriters, ["writeSection"])
      .addEdge("writeSection", "checkSections")
      .addConditionalEdges("checkSections", afterCheck, [
        "rewriteSection",
        "assembleGuide",
      ])
      .addEdge("rewriteSection", "checkSections")
      .addEdge("assembleGuide", END)
      .compile({ checkpointer })
  );
}

/** One technology found: go on. Several candidates: ask the person. */
function afterIdentify(state: GenerateStateType): "discoverDocs" | "askUser" {
  return state.technology ? "discoverDocs" : "askUser";
}

/** One writer per section, all started together; the graph waits until every one is done. */
function fanOutWriters(state: GenerateStateType): Send[] {
  return state.outline.map(
    (section) =>
      new Send("writeSection", {
        runId: state.runId,
        technology: state.technology,
        section,
        budget: state.budget,
      }),
  );
}

/**
 * Sections still marked "draft" after checking failed and have rewrites left: rewrite those (all
 * at once), then check again. When none are left, the guide is finished.
 */
function afterCheck(state: GenerateStateType): Send[] | "assembleGuide" {
  const failing = state.outline.filter(
    (section) => state.sections[section.key]?.status === "draft",
  );
  if (failing.length === 0) return "assembleGuide";

  return failing.map(
    (section) =>
      new Send("rewriteSection", {
        runId: state.runId,
        technology: state.technology,
        section,
        draft: state.sections[section.key],
        attempts: state.checkAttempts[section.key] ?? 0,
        budget: state.budget,
      }),
  );
}
