import type { Candidate } from "../retriever";

/** A candidate with the reranker's opinion of it. */
export type Ranked = Candidate & {
  /** 0 to 1: how well the chunk answers the question. Not the same scale as `score`. */
  relevance: number;
};

export type RerankInput = {
  question: string;
  /** From the retriever, up to 40. */
  candidates: Candidate[];
  /** How many to keep. Default 5. */
  topK?: number;
  signal?: AbortSignal;
};

/**
 * The shape any reranker has. The LLM reranker is the one we use; a hosted reranker
 * or a local model can be swapped in by writing another function with this signature.
 */
export type Reranker = (input: RerankInput) => Promise<Ranked[]>;

export type RerankSettings = {
  apiKey: string;
  model: string;
};

/** One message sent to the model. */
export type Message = { role: "system" | "user"; content: string };

/** What the reranker needs from the outside. Tests pass a fake model here. */
export type RerankDeps = {
  settings: () => RerankSettings;
  /** Sends the messages and returns the model's JSON answer as text. */
  ask: (
    settings: RerankSettings,
    messages: Message[],
    signal?: AbortSignal,
  ) => Promise<string>;
};
