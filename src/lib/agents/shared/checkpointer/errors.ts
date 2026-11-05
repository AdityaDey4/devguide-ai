/** The checkpoint store could not be set up. The message never contains the connection string. */
export class CheckpointerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckpointerError";
  }
}
