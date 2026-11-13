import { buildChatGraph } from "../../src/lib/agents/chat/graph";
import type { ChatDeps } from "../../src/lib/agents/chat/deps";
import { realDeps } from "../../src/lib/agents/chat/realDeps";
import { findChatScope } from "../../src/lib/chat/scope";
import { createServiceClient } from "../../src/lib/supabase/service";
import type { Asked, ChatQuestion } from "./types";

// Asks one question the way the app does, with the real models, database, Context7 and web, and
// records what happened. It counts every outside call, so a question the stored text should answer
// can be checked for making none.
//
// It does NOT save what the chat fetches (the route does that after answering), so running the
// evals never changes what is stored.

const db = createServiceClient();

export async function askChat(question: ChatQuestion): Promise<Asked> {
  const started = Date.now();
  const calls = { context7: 0, search: 0, fetch: 0 };
  let firstTokenMs = 0;

  const deps: ChatDeps = {
    ...realDeps,
    codeSnippets: (name, topic) => {
      calls.context7++;
      return realDeps.codeSnippets(name, topic);
    },
    searchWeb: (query, options) => {
      calls.search++;
      return realDeps.searchWeb(query, options);
    },
    fetchPage: (url, options) => {
      calls.fetch++;
      return realDeps.fetchPage(url, options);
    },
  };

  try {
    const scope = await findChatScope(db, question.technology);
    if (!scope) throw new Error(`no guide for "${question.technology}"`);

    const graph = buildChatGraph(() => {
      firstTokenMs ||= Date.now() - started;
    }, deps);
    const state = await graph.invoke({
      technology: scope.technology,
      guideId: scope.guideId,
      history: [],
      question: question.question,
    });

    return {
      origin: state.origin,
      grade: state.grade?.verdict ?? null,
      reply: state.reply,
      cited: state.citations.map((c) => c.title),
      calls,
      firstTokenMs,
      totalMs: Date.now() - started,
    };
  } catch (error) {
    return {
      origin: "not_found",
      grade: null,
      reply: "",
      cited: [],
      calls,
      firstTokenMs,
      totalMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
