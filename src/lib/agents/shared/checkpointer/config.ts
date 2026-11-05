import { serverSchema } from "../../../env.schema";
import { CheckpointerError } from "./errors";

// Where and how the checkpoints are kept. Change behaviour here.

/**
 * The Postgres schema that holds LangGraph's tables (checkpoints, checkpoint_blobs,
 * checkpoint_writes, checkpoint_migrations). Not `public`: Supabase publishes `public` as a web
 * API and puts it in the generated types, and these tables are internal to the server.
 */
export const CHECKPOINT_SCHEMA = "langgraph";

/**
 * LangGraph stops a run after this many graph steps in a row (its default is 25). The longest
 * guide-generation path is about 13 steps (3 to find the technology, 1 to ask, 1 to write, up to
 * 3 checks and 2 rewrites, 1 to assemble); this leaves room. The run's own budget is the real limit.
 */
export const RECURSION_LIMIT = 50;

/** Connections kept open to the database. A run writes one checkpoint per graph step. */
export const POOL_SIZE = 5;

/** Read at call time from process.env, so it works in the app, in scripts and in tests. */
export function readConnectionString(): string {
  const parsed = serverSchema
    .pick({ DATABASE_URL: true })
    .safeParse(process.env);
  if (!parsed.success) {
    throw new CheckpointerError(
      "DATABASE_URL must be set to a postgres:// connection string (see .env.example)",
    );
  }
  return parsed.data.DATABASE_URL;
}
