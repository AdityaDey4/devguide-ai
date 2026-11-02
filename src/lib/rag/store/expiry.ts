import { EXPIRY_DAYS } from "./config";
import type { SourceType } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a chunk stops being used, as an ISO date. `null` means never. */
export function expiresAt(sourceType: SourceType, from: Date): string | null {
  const days = EXPIRY_DAYS[sourceType];
  return days === null
    ? null
    : new Date(from.getTime() + days * DAY_MS).toISOString();
}
