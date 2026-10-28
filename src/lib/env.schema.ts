import { z } from "zod";

// Pure schemas (no process.env access) so they can be unit tested.
// Variables list: docs/03-Architecture.md section 9.

// `FOO=` in a .env file arrives as "". Treat it as "not set".
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

// Safe for the browser. NEXT_PUBLIC_* values are inlined at build time.
export const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

// Server only. Needed from M0: Supabase service key and DATABASE_URL.
// Everything else is optional here and enforced with requireEnv() by the
// feature that needs it, so the app still runs before those keys exist.
export const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "must start with postgres://"),

  LLM_PROVIDER: z.enum(["anthropic", "openai"]).default("openai"),
  ANTHROPIC_API_KEY: optional(z.string().min(1)),
  OPENAI_API_KEY: optional(z.string().min(1)),

  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  RERANK_MODEL: z.string().min(1).default("gpt-4o-mini"),
  RERANK_FAST_PATH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),

  TAVILY_API_KEY: optional(z.string().min(1)),
  CONTEXT7_API_KEY: optional(z.string().min(1)),

  UPSTASH_REDIS_REST_URL: optional(z.url()),
  UPSTASH_REDIS_REST_TOKEN: optional(z.string().min(1)),

  LANGSMITH_API_KEY: optional(z.string().min(1)),
  LANGSMITH_TRACING: z.preprocess(
    emptyToUndefined,
    z.stringbool().default(false),
  ),

  SENTRY_DSN: optional(z.url()),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

// Throws one readable error that names every bad variable, never its value.
function parseWith<T extends z.ZodType>(
  schema: T,
  raw: unknown,
  label: string,
): z.infer<T> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const name = issue.path.join(".") || "(root)";
    const missing = issue.code === "invalid_type" && issue.input === undefined;
    return `  - ${name}: ${missing ? "missing" : issue.message}`;
  });
  throw new Error(
    `Invalid ${label} environment variables:\n${lines.join("\n")}\nSee .env.example.`,
  );
}

export const parsePublicEnv = (raw: unknown) =>
  parseWith(publicSchema, raw, "public");
export const parseServerEnv = (raw: unknown) =>
  parseWith(serverSchema, raw, "server");
