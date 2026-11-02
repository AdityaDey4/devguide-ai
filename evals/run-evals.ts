import { createServiceClient } from "../src/lib/supabase/service";
import { embedTexts } from "../src/lib/rag/embedder";
import type { RetrieveDeps } from "../src/lib/rag/retriever/types";
import { evaluateQuestion } from "./evaluate";
import { loadQuestions } from "./load";
import { buildReport, saveReport } from "./report";
import type { QuestionResult } from "./types";

// Measures how well each way of searching finds the right documentation page.
//
//   npm run evals
//
// Runs every question in evals/retrieval.jsonl through vector-only, keyword-only, hybrid and
// hybrid + rerank, prints the comparison table, and saves it to evals/results/.
// It calls OpenAI (embeddings and the reranker): about 42 questions, a few cents, a few minutes.
// On demand only, not on every commit (docs/05-Development-Plan.md, testing strategy).

const QUESTIONS_FILE = "evals/retrieval.jsonl";
const RESULTS_FOLDER = "evals/results";
const AT_A_TIME = 4;

async function main() {
  const questions = loadQuestions(QUESTIONS_FILE);
  const db = createServiceClient();

  const { data: technologies, error } = await db
    .from("technologies")
    .select("id, slug");
  if (error) throw new Error(`Could not read technologies: ${error.message}`);
  const idOf = new Map(technologies.map((t) => [t.slug, t.id]));

  // Each question is embedded once and shared by the vector, keyword and hybrid searches.
  const embedded = new Map<string, ReturnType<typeof embedTexts>>();
  const deps: RetrieveDeps = {
    db: () => db,
    embed: (texts) => {
      const key = texts.join("\n");
      if (!embedded.has(key)) embedded.set(key, embedTexts(texts));
      return embedded.get(key)!;
    },
  };

  const results: QuestionResult[] = [];
  for (let i = 0; i < questions.length; i += AT_A_TIME) {
    const batch = questions.slice(i, i + AT_A_TIME).map((question) => {
      const technologyId = idOf.get(question.technology);
      if (!technologyId) {
        throw new Error(
          `${question.id}: unknown technology "${question.technology}"`,
        );
      }
      return evaluateQuestion(question, technologyId, deps);
    });
    results.push(...(await Promise.all(batch)));
    console.log(`  ${results.length}/${questions.length} questions done`);
  }

  const report = buildReport(results, new Date().toISOString().slice(0, 10));
  saveReport(results, report, RESULTS_FOLDER);
  console.log(
    `\n${report}\nSaved to ${RESULTS_FOLDER}/retrieval.md and retrieval.json`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
