/** The database refused or failed a write or lookup. */
export class StoreError extends Error {
  constructor(action: string, cause: { message: string }) {
    super(`Could not ${action}: ${cause.message}`);
    this.name = "StoreError";
  }
}
