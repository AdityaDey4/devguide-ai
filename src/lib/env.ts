import "server-only";
import { publicEnv } from "./env.client";
import { parseServerEnv, type ServerEnv } from "./env.schema";

// All environment variables for server code. Never import this from a client component.
export const env = { ...publicEnv, ...parseServerEnv(process.env) };

// For keys that are optional at startup but required by a specific feature
// (OpenAI key for embeddings, Tavily for identify, ...). Fails with a clear message.
export function requireEnv<K extends keyof ServerEnv>(
  key: K,
): NonNullable<ServerEnv[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `${key} is required for this feature. Set it in .env.local.`,
    );
  }
  return value as NonNullable<ServerEnv[K]>;
}
