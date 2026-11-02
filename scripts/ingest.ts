import { parseArgs } from "node:util";
import { ingestSite, type PageOutcome } from "../src/lib/ingest";

// Command line for the ingest belt: reads a documentation site into the knowledge base.
//
//   npm run ingest -- https://zod.dev
//   npm run ingest -- https://docs.langchain.com/oss/python/langgraph --name LangGraph --slug langgraph
//   npm run ingest -- https://supabase.com/docs --max-pages 100
//
// Run it again for the same site: nothing new is inserted and nothing is sent to OpenAI.
// The logic lives in src/lib/ingest; this file only reads the arguments and prints progress.

const USAGE = `Usage: npm run ingest -- <docsUrl> [--name "Display name"] [--slug short-id] [--max-pages 40]`;

// text-embedding-3-small, USD per million tokens. Only used for the "about $" line.
const PRICE_PER_MILLION_TOKENS = 0.02;

const short = (text: string, length = 70) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

function describe(outcome: PageOutcome): string {
  if (outcome.status === "failed") {
    return `FAILED    ${short(outcome.reason ?? "unknown error", 60)}`;
  }
  if (outcome.status === "too_short") {
    return "skipped   (too short to be a real page)";
  }
  return `${String(outcome.inserted).padStart(3)} new  ${String(outcome.skipped).padStart(3)} repeated`;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: "string" },
      slug: { type: "string" },
      "max-pages": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  const docsUrl = positionals[0];
  if (values.help || !docsUrl) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }

  const maxPages = values["max-pages"]
    ? Number(values["max-pages"])
    : undefined;
  if (maxPages !== undefined && (!Number.isInteger(maxPages) || maxPages < 1)) {
    console.error(`--max-pages must be a whole number of 1 or more.\n${USAGE}`);
    return 1;
  }

  const started = Date.now();
  const result = await ingestSite(docsUrl, {
    name: values.name,
    slug: values.slug,
    maxPages,
    onPage: (outcome, { done, total }) => {
      const counter = `${String(done).padStart(String(total).length)}/${total}`;
      console.log(
        `  [${counter}] ${describe(outcome)}   ${short(outcome.url)}`,
      );
    },
  });

  const { technology, discovery, totals } = result;
  console.log(`\n${technology.name} (${technology.slug}) from ${docsUrl}`);

  if (discovery.source === null) {
    console.error("\nCould not find any documentation pages. What was tried:");
    for (const attempt of discovery.attempts) {
      console.error(
        `  ${attempt.source}: ${attempt.pages} pages${attempt.note ? `. ${attempt.note}` : ""}`,
      );
    }
    return 1;
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const cost = (totals.tokens / 1_000_000) * PRICE_PER_MILLION_TOKENS;
  console.log(
    `Found ${discovery.found} pages (${discovery.source})${discovery.cutByMaxPages ? `, read the first ${totals.pages}` : ""}. Done in ${seconds}s.`,
  );
  console.log(
    `  pages:   ${totals.pages} read: ${totals.stored} stored, ${totals.tooShort} too short, ${totals.failed} failed`,
  );
  console.log(`  chunks:  ${totals.inserted} new, ${totals.skipped} repeated`);
  console.log(
    `  OpenAI:  ${totals.tokens.toLocaleString("en-US")} tokens (about $${cost.toFixed(4)})`,
  );

  const failures = result.outcomes.filter(
    (outcome) => outcome.status === "failed",
  );
  if (failures.length > 0) {
    console.log(`\nFailed pages (${failures.length}):`);
    for (const outcome of failures.slice(0, 10)) {
      console.log(`  ${outcome.url}\n    ${outcome.reason}`);
    }
  }

  return totals.stored > 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    // Missing keys, an unreachable database, a bad URL: say what happened, not a stack trace.
    console.error(
      `\nIngest stopped: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  },
);
