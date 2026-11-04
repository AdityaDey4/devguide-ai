export type GenerateErrorKind =
  | "technology_not_found" // nothing in the search results looks like a technology
  | "no_docs"; // the docs site lists no pages at all

/**
 * The run cannot produce a guide. The runner ends it as `failed` with `message` as the reason
 * (SRS section 7), keeping anything already written.
 */
export class GenerateError extends Error {
  constructor(
    message: string,
    readonly kind: GenerateErrorKind,
  ) {
    super(message);
    this.name = "GenerateError";
  }
}
