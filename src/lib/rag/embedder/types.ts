/** Which model to call and with what key. Read from the environment (see config.ts). */
export type EmbeddingSettings = {
  apiKey: string;
  model: string;
  /** Length of every vector. The database column is vector(1536), so this must be 1536. */
  dimensions: number;
};

/** What the API returned for one batch of texts. */
export type BatchResult = {
  /** One vector per text, in the same order as the texts sent. */
  vectors: number[][];
  /** Tokens OpenAI counted (this is what is billed). */
  tokens: number;
};

export type EmbedResult = {
  /** embeddings[i] is the vector of texts[i]. */
  embeddings: number[][];
  /** Total tokens used by the call. */
  tokens: number;
};

export type EmbedOptions = {
  /** Cancels the call (used by run budgets). */
  signal?: AbortSignal;
};

/** What the embedder needs from the outside. Tests pass a fake API here. */
export type EmbedDeps = {
  settings: () => EmbeddingSettings;
  requestBatch: (
    settings: EmbeddingSettings,
    texts: string[],
    signal?: AbortSignal,
  ) => Promise<BatchResult>;
};
