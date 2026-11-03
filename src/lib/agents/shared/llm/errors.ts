/** The model could not be set up (missing key, bad model name). Nothing was sent to a provider. */
export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmConfigError";
  }
}
