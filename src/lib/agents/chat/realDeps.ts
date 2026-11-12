import { rerank } from "../../rag/reranker";
import { retrieve } from "../../rag/retriever";
import { askStructured, streamText } from "../shared/llm";
import type { ChatDeps } from "./deps";

// The real dependencies of the chat graph: the database, the reranker, the models.
// Server only. Kept apart from deps.ts so the node tests never import any of this.

export const realDeps: ChatDeps = {
  ask: (size, schema, messages) => askStructured(size, schema, messages),
  retrieve: (input) => retrieve(input),
  rerank: (input) => rerank(input),
  write: (messages, onToken) => streamText("large", messages, onToken),
};
