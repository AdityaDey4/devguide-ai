import { Client } from "langsmith";
import type { Example, Run } from "langsmith/schemas";
import { evaluate } from "langsmith/evaluation";
import { flushTraces } from "../../src/lib/agents/shared/tracing";
import { askChat } from "./ask";
import { loadChatQuestions } from "./load";
import { fromExample, scoreRun, toExample } from "./smith";
import type { Asked } from "./types";

// The chat evals, run as a LangSmith experiment.
//
//   npm run evals:langsmith
//
// 1. keeps the dataset "devguide-chat-evals" in step with evals/chat/questions.jsonl
//    (new questions are added, changed ones updated; nothing is deleted)
// 2. asks every question through the real chat graph (same as `npm run evals:chat`)
// 3. scores each answer and shows the experiment in LangSmith, where runs can be compared and each
//    answer opened down to the excerpts and prompts behind it
//
// Needs LANGSMITH_API_KEY. Calls OpenAI, Context7 and Tavily like evals:chat does, and sends the
// questions, the answers and the traces to LangSmith. It never saves what the chat fetches.

const DATASET = "devguide-chat-evals";
const QUESTIONS_FILE = "evals/chat/questions.jsonl";
const AT_A_TIME = 3;

async function syncDataset(client: Client) {
  const questions = loadChatQuestions(QUESTIONS_FILE);
  if (!(await client.hasDataset({ datasetName: DATASET }))) {
    await client.createDataset(DATASET, {
      description:
        "DevGuide AI chat questions and where each answer should come from",
    });
  }

  const existing = new Map<string, { id: string; question: string }>();
  for await (const example of client.listExamples({ datasetName: DATASET })) {
    existing.set(String(example.metadata?.id), {
      id: example.id,
      question: JSON.stringify([
        example.inputs,
        example.outputs,
        example.metadata,
      ]),
    });
  }

  let added = 0;
  let updated = 0;
  for (const q of questions) {
    const fields = toExample(q);
    const known = existing.get(q.id);
    const fingerprint = JSON.stringify([
      fields.inputs,
      fields.outputs,
      fields.metadata,
    ]);
    if (!known) {
      await client.createExample({ ...fields, dataset_name: DATASET });
      added++;
    } else if (known.question !== fingerprint) {
      await client.updateExample({ id: known.id, ...fields });
      updated++;
    }
  }
  console.log(
    `Dataset ${DATASET}: ${questions.length} questions (${added} added, ${updated} updated)`,
  );
}

async function main() {
  if (!process.env.LANGSMITH_API_KEY) {
    throw new Error("LANGSMITH_API_KEY is not set (see .env.example)");
  }
  const client = new Client();
  await syncDataset(client);

  const results = await evaluate(
    async (inputs: { technology: string; question: string }): Promise<Asked> =>
      askChat({ id: "", group: "stored", expected: [], ...inputs }),
    {
      data: DATASET,
      client,
      experimentPrefix: "chat",
      maxConcurrency: AT_A_TIME,
      metadata: { kind: "chat-evals" },
      evaluators: [
        (run: Run, example?: Example) =>
          scoreRun(fromExample(example!), run.outputs as unknown as Asked),
      ],
    },
  );

  await flushTraces();
  await client.awaitPendingTraceBatches();
  console.log(`\nExperiment: ${results.experimentName}`);
  console.log("Open it in LangSmith under Datasets & Experiments > " + DATASET);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
