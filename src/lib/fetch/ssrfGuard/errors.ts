/** Why a URL was refused. */
export type SsrfReason =
  "protocol" | "credentials" | "port" | "hostname" | "address" | "dns";

export class SsrfBlockedError extends Error {
  constructor(
    message: string,
    readonly reason: SsrfReason,
  ) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

/** The error for an IP address that is not allowed. */
export function blockedAddressError(address: string): SsrfBlockedError {
  return new SsrfBlockedError(`address ${address} is not allowed`, "address");
}
