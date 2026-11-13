import { judge } from "./judge";
import { askChat } from "./ask";
import { loadChatQuestions } from "./load";
import { buildChatReport, saveChatReport } from "./report";
import type { Judged } from "./types";

// Measures whether the chat answers from the right place and says "I don't know" when it should.
//
//   npm run evals:chat
//
// Runs every question in evals/chat/questions.jsonl through the real chat graph, prints a table,
// and saves it to evals/results/chat.md and chat.json. It calls OpenAI, Context7 and Tavily:
// 18 questions, a few cents, about 3 minutes. On demand only, not on every commit.
// It never saves what the chat fetches, so the stored knowledge is the same before and after.

const QUESTIONS_FILE = "evals/chat/questions.jsonl";
const RESULTS_FOLDER = "evals/results";
const AT_A_TIME = 3;

async function main() {
  const questions = loadChatQuestions(QUESTIONS_FILE);

  const judged: Judged[] = [];
  for (let i = 0; i < questions.length; i += AT_A_TIME) {
    const batch = questions.slice(i, i + AT_A_TIME).map(async (question) => {
      const asked = await askChat(question);
      return judge(question, asked);
    });
    judged.push(...(await Promise.all(batch)));
    console.log(`  ${judged.length}/${questions.length} questions done`);
  }

  const report = buildChatReport(judged, new Date().toISOString().slice(0, 10));
  saveChatReport(judged, report, RESULTS_FOLDER);
  console.log(`\n${report}\nSaved to ${RESULTS_FOLDER}/chat.md and chat.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
