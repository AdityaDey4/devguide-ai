import { fetchPage } from "../../fetch/fetchPage";
import { fetchSnippets } from "../../mcp/context7";
import { rerank } from "../../rag/reranker";
import { retrieve } from "../../rag/retriever";
import { askStructured, streamText } from "../shared/llm";
import { searchWeb } from "../shared/tavily";
import type { ChatDeps } from "./deps";

// The real dependencies of the chat graph: the database, the reranker, the models, Context7, the
// web. Server only. Kept apart from deps.ts so the node tests never import any of this.

export const realDeps: ChatDeps = {
  ask: (size, schema, messages) => askStructured(size, schema, messages),
  retrieve: (input) => retrieve(input),
  rerank: (input) => rerank(input),
  codeSnippets: (technologyName, topic) =>
    fetchSnippets({ library: technologyName, topic }),
  searchWeb: (query, options) => searchWeb(query, options),
  fetchPage: (url, options) => fetchPage(url, options),
  write: (messages, onToken) => streamText("large", messages, onToken),
};
