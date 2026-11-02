/** What went wrong while reranking. */
export type RerankErrorKind =
  | "config" //  the API key or model is missing
  | "api" //     OpenAI answered with an error (after retries)
  | "format" //  the answer was not the JSON we asked for
  | "aborted"; // the call was cancelled

export class RerankError extends Error {
  constructor(
    message: string,
    readonly kind: RerankErrorKind,
  ) {
    super(message);
    this.name = "RerankError";
  }
}
