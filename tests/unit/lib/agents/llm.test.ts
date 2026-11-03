import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getModel,
  largeModel,
  LlmConfigError,
  smallModel,
} from "@/lib/agents/shared/llm";
import {
  MAX_OUTPUT_TOKENS,
  MAX_RETRIES,
  readSettings,
} from "@/lib/agents/shared/llm/config";
import { createChatModel } from "@/lib/agents/shared/llm/providers";
import type { LlmDeps, LlmSettings } from "@/lib/agents/shared/llm/types";

afterEach(() => vi.unstubAllEnvs());

/** A clean environment: nothing set, so each test names what it needs. */
function env(values: Record<string, string>) {
  for (const key of [
    "LLM_PROVIDER",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "LLM_MODEL_LARGE",
    "LLM_MODEL_SMALL",
  ]) {
    vi.stubEnv(key, values[key]);
  }
}

describe("readSettings", () => {
  it("defaults to OpenAI: a strong model for writing, a small one for judging", () => {
    env({ OPENAI_API_KEY: "sk-test" });
    expect(readSettings("large")).toMatchObject({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o",
      temperature: 0.2,
    });
    expect(readSettings("small")).toMatchObject({
      model: "gpt-4o-mini",
      temperature: 0,
    });
  });

  it("uses the Claude models when LLM_PROVIDER=anthropic", () => {
    env({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "key-a" });
    expect(readSettings("large")).toMatchObject({
      provider: "anthropic",
      apiKey: "key-a",
      model: "claude-sonnet-5-5",
    });
    expect(readSettings("small").model).toBe("claude-haiku-5-5");
  });

  it("lets LLM_MODEL_LARGE and LLM_MODEL_SMALL override the names, each for its own size", () => {
    env({
      OPENAI_API_KEY: "sk-test",
      LLM_MODEL_LARGE: "my-big",
      LLM_MODEL_SMALL: "my-small",
    });
    expect(readSettings("large").model).toBe("my-big");
    expect(readSettings("small").model).toBe("my-small");
  });

  it("treats an empty override as not set", () => {
    env({ OPENAI_API_KEY: "sk-test", LLM_MODEL_LARGE: "" });
    expect(readSettings("large").model).toBe("gpt-4o");
  });

  it("sets the retry count and output limit for every model", () => {
    env({ OPENAI_API_KEY: "sk-test" });
    expect(readSettings("small")).toMatchObject({
      maxRetries: MAX_RETRIES,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
    expect(MAX_RETRIES).toBeGreaterThan(0);
  });

  it("names the missing key of the CHOSEN provider, not the other one", () => {
    env({ OPENAI_API_KEY: "sk-test", LLM_PROVIDER: "anthropic" });
    expect(() => readSettings("large")).toThrow(
      /ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic/,
    );
    env({ ANTHROPIC_API_KEY: "key-a" });
    expect(() => readSettings("large")).toThrow(/OPENAI_API_KEY is required/);
  });

  it("fails clearly for an unknown provider, without printing the keys", () => {
    env({ LLM_PROVIDER: "llama", OPENAI_API_KEY: "sk-secret-value" });
    const call = () => readSettings("large");
    expect(call).toThrow(LlmConfigError);
    expect(call).toThrow(/LLM_PROVIDER/);
    expect(call).not.toThrow(/sk-secret-value/);
  });
});

describe("createChatModel (the provider switch)", () => {
  const settings = (overrides: Partial<LlmSettings>): LlmSettings => ({
    provider: "openai",
    apiKey: "sk-test",
    model: "m",
    temperature: 0.2,
    timeoutMs: 1000,
    maxRetries: 3,
    maxOutputTokens: 100,
    ...overrides,
  });

  it("builds a ChatOpenAI for openai, with the model, temperature and retries", () => {
    const model = createChatModel(settings({ model: "gpt-x" }));
    expect(model).toBeInstanceOf(ChatOpenAI);
    expect(model).toMatchObject({
      model: "gpt-x",
      temperature: 0.2,
      timeout: 1000,
      caller: { maxRetries: 3 }, // where LangChain keeps the retry count
    });
  });

  it("builds a ChatAnthropic for anthropic", () => {
    const model = createChatModel(
      settings({ provider: "anthropic", model: "claude-x" }),
    );
    expect(model).toBeInstanceOf(ChatAnthropic);
    expect(model).toMatchObject({
      model: "claude-x",
      temperature: 0.2,
      clientOptions: { timeout: 1000 },
      caller: { maxRetries: 3 },
    });
  });

  it("returns models that share one interface, so nodes do not care which they got", () => {
    for (const provider of ["openai", "anthropic"] as const) {
      const model = createChatModel(settings({ provider }));
      expect(typeof model.invoke).toBe("function");
      expect(typeof model.withStructuredOutput).toBe("function");
    }
  });
});

describe("getModel / largeModel / smallModel", () => {
  const fakeModel = { fake: true } as unknown as BaseChatModel;
  function fakes() {
    const create = vi.fn(() => fakeModel);
    const settings = vi.fn(
      (size: string) => ({ model: `model-${size}` }) as unknown as LlmSettings,
    );
    return { create, settings, deps: { create, settings } as LlmDeps };
  }

  it("reads the settings for the size asked for and builds the model from them", () => {
    const { create, settings, deps } = fakes();
    expect(getModel("small", deps)).toBe(fakeModel);
    expect(settings).toHaveBeenCalledWith("small");
    expect(create).toHaveBeenCalledWith({ model: "model-small" });
  });

  it("largeModel and smallModel ask for their own size", () => {
    const { settings, deps } = fakes();
    largeModel(deps);
    smallModel(deps);
    expect(settings.mock.calls.map((call) => call[0])).toEqual([
      "large",
      "small",
    ]);
  });
});
