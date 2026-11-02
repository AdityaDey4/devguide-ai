/** What went wrong while creating embeddings. */
export type EmbeddingErrorKind =
  | "config" //    the API key or model is missing or invalid
  | "input" //     a text is empty or too long: refused before anything is sent
  | "api" //       OpenAI answered with an error (after retries)
  | "dimension" // the vectors are not the length the database expects
  | "aborted"; //  the call was cancelled

export class EmbeddingError extends Error {
  constructor(
    message: string,
    readonly kind: EmbeddingErrorKind,
  ) {
    super(message);
    this.name = "EmbeddingError";
  }
}
