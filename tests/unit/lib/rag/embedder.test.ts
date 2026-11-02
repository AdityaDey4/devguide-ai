import { afterEach, describe, expect, it, vi } from "vitest";
import { embedTexts, EmbeddingError } from "@/lib/rag/embedder";
import { makeBatches } from "@/lib/rag/embedder/batches";
import { buildRequestBody } from "@/lib/rag/embedder/client";
import { readSettings } from "@/lib/rag/embedder/config";
import type { EmbedDeps, EmbeddingSettings } from "@/lib/rag/embedder/types";
import { sleep } from "../../../helpers/localServer";

const settings: EmbeddingSettings = {
  apiKey: "sk-test",
  model: "text-embedding-3-small",
  dimensions: 1536,
};
const vector = (seed: number) =>
  Array.from({ length: 1536 }, (_, i) => (i === 0 ? seed : 0));
const texts = (n: number) =>
  Array.from({ length: n }, (_, i) => `text number ${i}`);

/** A fake OpenAI: the vector of a text starts with its number, so order can be checked. */
function fakeApi() {
  const batchSizes: number[] = [];
  let active = 0;
  let peak = 0;
  const requestBatch = vi.fn(async (_s: EmbeddingSettings, batch: string[]) => {
    batchSizes.push(batch.length);
    active++;
    peak = Math.max(peak, active);
    await sleep(3);
    active--;
    return {
      vectors: batch.map((t) => vector(Number(t.split(" ").at(-1)))),
      tokens: batch.length * 3,
    };
  });
  return {
    requestBatch,
    batchSizes,
    get peak() {
      return peak;
    },
  };
}

/** embedTexts with fake settings and a fake API. */
const embedWith = (deps: EmbedDeps) => (texts: string[]) =>
  embedTexts(texts, {}, deps);

describe("embedTexts", () => {
  it("returns nothing, and calls nothing, for an empty list", async () => {
    const api = fakeApi();
    const embed = embedWith({
      settings: () => settings,
      requestBatch: api.requestBatch,
    });
    expect(await embed([])).toEqual({ embeddings: [], tokens: 0 });
    expect(api.requestBatch).not.toHaveBeenCalled();
  });

  it("sends 250 texts as batches of 100, 100 and 50, and keeps every vector at its text's position", async () => {
    const api = fakeApi();
    const embed = embedWith({
      settings: () => settings,
      requestBatch: api.requestBatch,
    });
    const { embeddings, tokens } = await embed(texts(250));

    expect([...api.batchSizes].sort((a, b) => b - a)).toEqual([100, 100, 50]);
    expect(embeddings.map((v) => v[0])).toEqual(
      Array.from({ length: 250 }, (_, i) => i),
    );
    expect(tokens).toBe(250 * 3);
    expect(api.peak).toBeLessThanOrEqual(3);
  });

  it("fails when the model returns vectors of the wrong length", async () => {
    const embed = embedWith({
      settings: () => settings,
      requestBatch: async (_s, batch) => ({
        vectors: batch.map(() => [1, 2, 3]),
        tokens: 1,
      }),
    });
    await expect(embed(["a"])).rejects.toMatchObject({
      name: "EmbeddingError",
      kind: "dimension",
    });
  });

  it("fails when the number of vectors does not match the number of texts", async () => {
    const embed = embedWith({
      settings: () => settings,
      requestBatch: async () => ({ vectors: [vector(1)], tokens: 1 }),
    });
    await expect(embed(["a", "b"])).rejects.toMatchObject({ kind: "api" });
  });

  it("refuses an empty text before anything is sent", async () => {
    const api = fakeApi();
    const embed = embedWith({
      settings: () => settings,
      requestBatch: api.requestBatch,
    });
    await expect(embed(["fine", "   "])).rejects.toMatchObject({
      kind: "input",
    });
    expect(api.requestBatch).not.toHaveBeenCalled();
  });
});

describe("makeBatches", () => {
  it("keeps a batch under the token limit even when it has fewer than 100 texts", () => {
    const big = "word ".repeat(6000); // ~6,000 tokens each
    const batches = makeBatches(Array.from({ length: 100 }, () => big));
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.every((b) => b.texts.length <= 41)).toBe(true);
  });

  it("refuses a text over the model's input limit", () => {
    expect(() => makeBatches(["word ".repeat(9000)])).toThrow(EmbeddingError);
  });

  it("records where each batch starts", () => {
    expect(makeBatches(texts(150)).map((b) => b.start)).toEqual([0, 100]);
  });
});

describe("buildRequestBody", () => {
  it("asks text-embedding-3 models for 1536 numbers", () => {
    expect(buildRequestBody(settings, ["a"])).toMatchObject({
      model: "text-embedding-3-small",
      input: ["a"],
      dimensions: 1536,
    });
  });

  it("leaves out dimensions for older models, which do not accept the option", () => {
    expect(
      buildRequestBody({ ...settings, model: "text-embedding-ada-002" }, ["a"]),
    ).not.toHaveProperty("dimensions");
  });
});

describe("readSettings", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads the key and model from the environment", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-abc");
    vi.stubEnv("EMBEDDING_MODEL", "text-embedding-3-large");
    expect(readSettings()).toEqual({
      apiKey: "sk-abc",
      model: "text-embedding-3-large",
      dimensions: 1536,
    });
  });

  it("fails with a clear message when the key is missing", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => readSettings()).toThrow(/OPENAI_API_KEY is required/);
  });
});
