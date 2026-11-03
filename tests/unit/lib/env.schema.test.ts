import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "@/lib/env.schema";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};

describe("server environment", () => {
  it("accepts the four required values and fills in defaults", () => {
    const env = parseServerEnv(base);
    expect(env.LLM_PROVIDER).toBe("openai");
    expect(env.EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(env.RERANK_FAST_PATH_THRESHOLD).toBe(0.85);
    expect(env.LANGSMITH_TRACING).toBe(false);
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.LLM_MODEL_LARGE).toBeUndefined(); // the per-provider default applies later
    expect(env.LLM_MODEL_SMALL).toBeUndefined();
  });

  it("treats an empty value (FOO=) as not set", () => {
    const env = parseServerEnv({
      ...base,
      OPENAI_API_KEY: "",
      SENTRY_DSN: "",
      LANGSMITH_TRACING: "",
      RERANK_FAST_PATH_THRESHOLD: "0.9",
    });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.LANGSMITH_TRACING).toBe(false);
    expect(env.RERANK_FAST_PATH_THRESHOLD).toBe(0.9);
  });

  it("reads true/false text as a real boolean", () => {
    expect(
      parseServerEnv({ ...base, LANGSMITH_TRACING: "true" }).LANGSMITH_TRACING,
    ).toBe(true);
  });

  it("names the missing variable", () => {
    expect(() =>
      parseServerEnv({ ...base, SUPABASE_SERVICE_ROLE_KEY: undefined }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY: missing/);
  });

  it("lists every invalid variable in one error, without echoing their values", () => {
    const call = () =>
      parseServerEnv({
        ...base,
        DATABASE_URL: "mysql://secret-host",
        LLM_PROVIDER: "gemini",
        RERANK_FAST_PATH_THRESHOLD: "5",
      });
    expect(call).toThrow(/DATABASE_URL/);
    expect(call).toThrow(/LLM_PROVIDER/);
    expect(call).toThrow(/RERANK_FAST_PATH_THRESHOLD/);
    expect(call).not.toThrow(/secret-host/);
  });
});

describe("public environment", () => {
  it("accepts a valid URL and key", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: base.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "k",
      }).NEXT_PUBLIC_SUPABASE_URL,
    ).toBe("http://127.0.0.1:54321");
  });

  it("rejects a bad URL and an empty key", () => {
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "nope",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
