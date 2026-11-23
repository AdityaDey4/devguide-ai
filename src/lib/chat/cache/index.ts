import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { NOT_COVERED } from "../../agents/chat/config";
import type { ChatCitation } from "../../agents/chat";
import type { ChatScope } from "../scope";
import { embedTexts } from "../../rag/embedder";
import type { Database } from "../../supabase/database.types";
import {
  DUPLICATE_SIMILARITY,
  MAX_QUESTION_CHARS,
  MIN_SIMILARITY,
  TTL_DAYS,
} from "./config";

// The chat's answer cache (semantic cache, step 2). Not used by the chat yet.
//
//   const scope = await cacheScope(db, chatScope);          // null: this question is not cached
//   const hit = await lookupCachedAnswer(db, scope, "How do I install it on Windows?");
//   hit -> { answer, citations, origin, similarity }        // or null
//   await saveCachedAnswer(db, scope, { question, answer, citations, origin });
//
// The rules live here, so the chat only asks and tells:
//   - only the SHARED guide is cached (a person's edited copy answers from different text)
//   - a row belongs to one guide version: a new version finds nothing
//   - only a real, cited answer from text graded GOOD is saved: never a refusal, a direct reply,
//     an empty answer or one the grader found only partly supported
//   - a question that is already cached (very similar) is not saved twice
//   - rows expire after TTL_DAYS; expired rows are deleted whenever an answer is saved
//   - when the guide's current version changes, a database trigger deletes its rows
//     (supabase/migrations/20261123100000_chat_cache_invalidation.sql)
// The cache must never break a chat: a failure (database, embedding) is a miss, or a skipped save.
// Server only, with the service-role client.

type Db = SupabaseClient<Database>;

export type CacheScope = {
  technologyId: string;
  guideId: string;
  guideVersionId: string;
};

export type CacheableOrigin = "guide" | "stored_docs" | "fetched_now";

export type CachedAnswer = {
  id: string;
  question: string;
  answer: string;
  citations: ChatCitation[];
  origin: CacheableOrigin;
  similarity: number;
};

export type CacheDeps = {
  /** The vector for one question. */
  embed: (text: string) => Promise<number[]>;
  now: () => Date;
};

const realDeps: CacheDeps = {
  embed: async (text) => (await embedTexts([text])).embeddings[0],
  now: () => new Date(),
};

const citationsSchema = z.array(
  z.object({
    n: z.number(),
    title: z.string(),
    url: z.string().nullable(),
    kind: z.enum(["guide", "docs"]),
  }),
);

/** Whitespace squeezed, so "How  do I\ninstall?" and "How do I install?" are one question. */
export const normaliseQuestion = (question: string) =>
  question.replace(/\s+/g, " ").trim();

/**
 * Where this question would be cached, or null when it must not be: the person has an edited copy
 * (the chat searches their text too), or the guide is not the shared one, or has no version yet.
 */
export async function cacheScope(
  db: Db,
  scope: ChatScope,
): Promise<CacheScope | null> {
  try {
    if (scope.alsoGuideId) return null; // searching an edited copy as well as the shared guide
    const { data: guide } = await db
      .from("guides")
      .select("id, owner_id, technology_id, current_version_id")
      .eq("id", scope.guideId)
      .maybeSingle();
    if (!guide || guide.owner_id !== null || !guide.current_version_id) {
      return null;
    }
    return {
      technologyId: guide.technology_id,
      guideId: guide.id,
      guideVersionId: guide.current_version_id,
    };
  } catch (error) {
    console.error("chat cache scope failed:", error);
    return null;
  }
}

export async function lookupCachedAnswer(
  db: Db,
  scope: CacheScope,
  question: string,
  deps: CacheDeps = realDeps,
): Promise<CachedAnswer | null> {
  const text = normaliseQuestion(question);
  if (!text || text.length > MAX_QUESTION_CHARS) return null;
  try {
    const hit = await nearest(
      db,
      scope,
      await deps.embed(text),
      MIN_SIMILARITY,
    );
    if (hit) void recordHit(db, hit.id); // counted in the background: never slows the answer
    return hit;
  } catch (error) {
    console.error("chat cache lookup failed:", error);
    return null;
  }
}

export type AnswerToCache = {
  /** The standalone question (after the chat rewrote it), not the raw message. */
  question: string;
  answer: string;
  citations: ChatCitation[];
  origin: string;
  /** The grade of the text the answer was written from: only GOOD is kept. */
  grade: string | null;
};

/** Why an answer is not worth keeping, or null if it is. Pure. */
export function refuseToCache(toSave: AnswerToCache): string | null {
  const question = normaliseQuestion(toSave.question);
  if (!question || question.length > MAX_QUESTION_CHARS) return "question";
  if (!["guide", "stored_docs", "fetched_now"].includes(toSave.origin)) {
    return "origin"; // not_found and none are never cached
  }
  const answer = toSave.answer.trim();
  if (!answer || answer === NOT_COVERED) return "answer";
  if (toSave.citations.length === 0) return "no citations";
  if (toSave.grade !== "GOOD") return "grade"; // PARTIAL or BAD: the text did not clearly answer it
  return null;
}

/** Saves the answer unless a rule says no. Resolves to whether a row was added. */
export async function saveCachedAnswer(
  db: Db,
  scope: CacheScope,
  toSave: AnswerToCache,
  deps: CacheDeps = realDeps,
): Promise<boolean> {
  if (refuseToCache(toSave) !== null) return false;
  const question = normaliseQuestion(toSave.question);
  try {
    const embedding = await deps.embed(question);
    if (await nearest(db, scope, embedding, DUPLICATE_SIMILARITY)) return false;

    const expires = new Date(deps.now().getTime() + TTL_DAYS * 86_400_000);
    const { error } = await db.from("chat_cache").insert({
      technology_id: scope.technologyId,
      guide_id: scope.guideId,
      guide_version_id: scope.guideVersionId,
      question,
      question_embedding: toVector(embedding),
      answer: toSave.answer.trim(),
      citations: toSave.citations,
      origin: toSave.origin as CacheableOrigin,
      expires_at: expires.toISOString(),
    });
    if (error) throw error;
    await purgeExpired(db, deps.now()); // housekeeping: saving is the moment the table grows
    return true;
  } catch (error) {
    console.error("chat cache save failed:", error);
    return false;
  }
}

/** Adds one to the answer's hit count. A failure only loses a count. */
async function recordHit(db: Db, id: string): Promise<void> {
  try {
    const { error } = await db.rpc("record_chat_cache_hit", { p_id: id });
    if (error) throw error;
  } catch (error) {
    console.error("chat cache hit count failed:", error);
  }
}

/** Deletes the answers whose time is up (they are never served anyway). Resolves to how many. */
export async function purgeExpired(
  db: Db,
  now: Date = new Date(),
): Promise<number> {
  try {
    const { count, error } = await db
      .from("chat_cache")
      .delete({ count: "exact" })
      .lt("expires_at", now.toISOString());
    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    console.error("chat cache purge failed:", error);
    return 0;
  }
}

async function nearest(
  db: Db,
  scope: CacheScope,
  embedding: number[],
  minSimilarity: number,
): Promise<CachedAnswer | null> {
  const { data, error } = await db.rpc("match_chat_cache", {
    query_embedding: toVector(embedding),
    p_technology_id: scope.technologyId,
    p_guide_version_id: scope.guideVersionId,
    min_similarity: minSimilarity,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;

  const citations = citationsSchema.safeParse(row.citations);
  if (!citations.success) return null; // a damaged row is a miss, not an error
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    citations: citations.data,
    origin: row.origin as CacheableOrigin,
    similarity: row.similarity,
  };
}

/** pgvector's text form: "[0.1,0.2,...]". */
const toVector = (embedding: number[]) => `[${embedding.join(",")}]`;
