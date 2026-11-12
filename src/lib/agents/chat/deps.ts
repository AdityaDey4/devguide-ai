import type { z } from "zod";
import type { BaseMessageLike } from "@langchain/core/messages";
import type { Candidate, RetrieveInput } from "../../rag/retriever";
import type { Ranked, RerankInput } from "../../rag/reranker";
import type { ModelSize } from "../shared/llm";

/**
 * Everything the chat nodes need from the outside world. The graph gets the real ones by default;
 * tests pass fakes, so no node ever needs a database or a model to be tested.
 */
export type ChatDeps = {
  /** Asks a model for an object that matches the schema. */
  ask: <S extends z.ZodType>(
    size: ModelSize,
    schema: S,
    messages: BaseMessageLike[],
  ) => Promise<z.infer<S>>;
  /** Hybrid search: up to 40 chunks that may help, best first. */
  retrieve: (input: RetrieveInput) => Promise<Candidate[]>;
  /** Picks the few chunks that really answer the question. */
  rerank: (input: RerankInput) => Promise<Ranked[]>;
  /** Asks the large model for text, calling `onToken` with each piece as it arrives. */
  write: (
    messages: BaseMessageLike[],
    onToken: (piece: string) => void | Promise<void>,
  ) => Promise<string>;
};
