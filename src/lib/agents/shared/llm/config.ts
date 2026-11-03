import { serverSchema } from "../../../env.schema";
import { LlmConfigError } from "./errors";
import type { LlmSettings, ModelSize, Provider } from "./types";

// The choices behind "which model": change behaviour here (docs/03-Architecture.md section 5.2,
// "Models per node").

/** Used when LLM_MODEL_LARGE / LLM_MODEL_SMALL are not set. */
export const DEFAULT_MODELS: Record<Provider, Record<ModelSize, string>> = {
  openai: { large: "gpt-4o", small: "gpt-4o-mini" },
  anthropic: { large: "claude-sonnet-5-5", small: "claude-haiku-5-5" },
};

/** Judging must be repeatable (0); writing may vary a little (0.2). */
export const TEMPERATURE: Record<ModelSize, number> = { large: 0.2, small: 0 };

/** Per request: give up after this long. */
export const TIMEOUT_MS = 60_000;

/** Temporary errors (429, 5xx, dropped connection) are retried this many times, pausing longer each time. */
export const MAX_RETRIES = 3;

/** One answer never needs more than a guide section (Anthropic requires a limit to be set). */
export const MAX_OUTPUT_TOKENS = 8192;

const KEY_NAME = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
} as const;

/**
 * Reads the provider, key and model names from the environment at call time, straight from
 * process.env, so this works in the app, in scripts and in tests.
 */
export function readSettings(size: ModelSize): LlmSettings {
  const parsed = serverSchema
    .pick({
      LLM_PROVIDER: true,
      OPENAI_API_KEY: true,
      ANTHROPIC_API_KEY: true,
      LLM_MODEL_LARGE: true,
      LLM_MODEL_SMALL: true,
    })
    .safeParse(process.env);
  if (!parsed.success) {
    throw new LlmConfigError(
      'LLM_PROVIDER must be "openai" or "anthropic", and model names must not be empty',
    );
  }

  const env = parsed.data;
  const provider = env.LLM_PROVIDER;
  const apiKey = env[KEY_NAME[provider]];
  if (!apiKey) {
    throw new LlmConfigError(
      `${KEY_NAME[provider]} is required when LLM_PROVIDER=${provider}. Set it in .env.local.`,
    );
  }
  const override = size === "large" ? env.LLM_MODEL_LARGE : env.LLM_MODEL_SMALL;

  return {
    provider,
    apiKey,
    model: override ?? DEFAULT_MODELS[provider][size],
    temperature: TEMPERATURE[size],
    timeoutMs: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  };
}
