/** The search in the database failed. */
export class RetrieveError extends Error {
  constructor(cause: { message: string }) {
    super(`Could not search the knowledge base: ${cause.message}`);
    this.name = "RetrieveError";
  }
}
