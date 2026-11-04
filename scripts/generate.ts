import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  resumeGeneration,
  startGeneration,
  type RunOutcome,
} from "../src/lib/agents/generate/run";
import type { Candidate } from "../src/lib/agents/generate/state";
import { closeCheckpointer } from "../src/lib/agents/shared/checkpointer";
import { createServiceClient } from "../src/lib/supabase/service";

// Command line for the guide generator: from a technology name to a saved, cited guide.
//
//   npm run generate -- zod
//   npm run generate -- "next.js"
//   npm run generate -- --resume <runId>      carry on a run that was stopped or killed
//
// If the name could mean several technologies it asks you to choose. Needs OPENAI_API_KEY,
// TAVILY_API_KEY and the local Supabase running; CONTEXT7_API_KEY is optional.
// The logic lives in src/lib/agents/generate/run; this file only reads the arguments, asks the
// question and prints progress.

const USAGE = `Usage: npm run generate -- <technology name>
       npm run generate -- --resume <runId>`;

const started = Date.now();
const seconds = () =>
  `${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s`;
const onStep = (node: string) => console.log(`  ${seconds()}  ${node}`);

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      resume: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const query = positionals.join(" ").trim();
  if (values.help || (!query && !values.resume)) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }

  console.log(
    values.resume
      ? `Continuing run ${values.resume}`
      : `Generating a guide for "${query}"`,
  );
  let outcome: RunOutcome = values.resume
    ? await resumeGeneration(values.resume, undefined, { onStep })
    : await startGeneration(query, { onStep });

  // The name was ambiguous: ask, then carry on, as often as needed.
  while (outcome.status === "waiting_user") {
    const answer = await askWhich(outcome.candidates);
    if (!answer) {
      console.log(
        `\nThe run is waiting for your choice. Run: npm run generate -- --resume ${outcome.runId}`,
      );
      return 2;
    }
    outcome = await resumeGeneration(outcome.runId, answer, { onStep });
  }

  if (outcome.status === "failed") {
    console.error(`\nFAILED: ${outcome.reason}\nRun id: ${outcome.runId}`);
    return 1;
  }
  await printSummary(outcome.guideId, outcome.versionId, outcome.runId);
  return 0;
}

/** Shows the choices and returns the answer the graph expects, or null if nobody can answer. */
async function askWhich(candidates: Candidate[]) {
  console.log("\nThat name could mean several things:");
  candidates.forEach((c, i) =>
    console.log(`  ${i + 1}. ${c.name}: ${c.description}\n     ${c.url}`),
  );
  console.log("  0. None of these (type a better name)");
  if (!process.stdin.isTTY) return null;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const text = (await rl.question("Choose a number: ")).trim();
      const n = Number(text);
      if (n === 0 && text === "0") {
        const query = (await rl.question("Name: ")).trim();
        if (query.length >= 2) return { choice: "refine" as const, query };
      } else if (Number.isInteger(n) && n >= 1 && n <= candidates.length) {
        return { choice: "candidate" as const, url: candidates[n - 1].url };
      }
      console.log("Please type one of the numbers above.");
    }
  } finally {
    rl.close();
  }
}

async function printSummary(guideId: string, versionId: string, runId: string) {
  const db = createServiceClient();
  const { data: version } = await db
    .from("guide_versions")
    .select("version_no, sections")
    .eq("id", versionId)
    .single();
  const { data: guide } = await db
    .from("guides")
    .select("status")
    .eq("id", guideId)
    .single();

  console.log(
    `\nDone in ${seconds().trim()}. Guide is ${guide?.status}, version ${version?.version_no}.`,
  );
  const sections = (version?.sections ?? []) as {
    title: string;
    citations: unknown[];
    needs_review: boolean;
  }[];
  for (const section of sections) {
    const flag = section.needs_review ? "  <- needs review" : "";
    console.log(
      `  ${section.title.padEnd(32)} ${String(section.citations.length).padStart(2)} sources${flag}`,
    );
  }
  console.log(`\nGuide id: ${guideId}\nRun id:   ${runId}`);
}

main()
  .then(async (code) => {
    await closeCheckpointer();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closeCheckpointer().catch(() => {});
    process.exit(1);
  });
