import { describe, expect, it, vi } from "vitest";
import { askStructured } from "@/lib/agents/shared/llm";
import { searchWeb, TavilyError } from "@/lib/agents/shared/tavily";
import { z } from "zod";
import type { LlmDeps } from "@/lib/agents/shared/llm/types";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const deps = (response: () => Response | Promise<Response>) => {
  const fetchFake = vi.fn(async () => response());
  return {
    fetchFake,
    deps: {
      fetch: fetchFake as unknown as typeof fetch,
      apiKey: () => "tvly-secret-key",
    },
  };
};

describe("searchWeb (Tavily)", () => {
  it("sends the query with the key in a header, never in the address", async () => {
    const { deps: d, fetchFake } = deps(() => reply({ results: [] }));
    await searchWeb("zod docs", { maxResults: 3 }, d);

    const [url, init] = fetchFake.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.tavily.com/search");
    expect(url).not.toContain("tvly");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tvly-secret-key",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      query: "zod docs",
      max_results: 3,
    });
  });

  it("can be limited to some sites, and says nothing about sites when none are given", async () => {
    const { deps: d, fetchFake } = deps(() => reply({ results: [] }));
    await searchWeb("write a file", { includeDomains: ["nodejs.org"] }, d);
    await searchWeb("write a file", { includeDomains: [] }, d);

    const bodies = fetchFake.mock.calls.map(
      (call) =>
        JSON.parse(
          (call as unknown as [string, RequestInit])[1].body as string,
        ) as object,
    );
    expect(bodies[0]).toMatchObject({ include_domains: ["nodejs.org"] });
    expect(bodies[1]).not.toHaveProperty("include_domains");
  });

  it("returns title, url and content, skipping results without an address", async () => {
    const { deps: d } = deps(() =>
      reply({
        results: [
          {
            title: "Zod",
            url: "https://zod.dev",
            content: "schemas",
            score: 0.9,
          },
          { title: "No address", content: "x" },
          { url: "https://a.dev" },
        ],
      }),
    );
    expect(await searchWeb("zod", {}, d)).toEqual([
      { title: "Zod", url: "https://zod.dev", content: "schemas" },
      { title: "https://a.dev", url: "https://a.dev", content: "" },
    ]);
  });

  it("reports an HTTP error and a network error as TavilyError, without the key", async () => {
    const http = deps(() => reply({}, 429));
    await expect(searchWeb("x", {}, http.deps)).rejects.toThrow(/HTTP 429/);

    const network = deps(() => {
      throw new Error("connect ECONNRESET");
    });
    const error = await searchWeb("x", {}, network.deps).catch((e) => e);
    expect(error).toBeInstanceOf(TavilyError);
    expect(error.message).not.toContain("tvly-secret-key");
  });
});

describe("askStructured", () => {
  it("asks the model of the requested size and returns the checked object", async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const create = vi.fn(() => ({ withStructuredOutput: () => ({ invoke }) }));
    const settings = vi.fn((size: string) => ({ model: size }));

    const answer = await askStructured(
      "small",
      z.object({ ok: z.boolean() }),
      [{ role: "user", content: "hi" }],
      { create, settings } as unknown as LlmDeps,
    );

    expect(answer).toEqual({ ok: true });
    expect(settings).toHaveBeenCalledWith("small");
    expect(invoke).toHaveBeenCalledWith([{ role: "user", content: "hi" }]);
  });

  it("caps the answer length, so a model stuck on one field fails fast instead of running on", async () => {
    const create = vi.fn(() => ({
      withStructuredOutput: () => ({ invoke: async () => ({}) }),
    }));
    const ask = (maxOutputTokens: number) =>
      askStructured("small", z.object({}), [], {
        create,
        settings: () => ({ model: "m", maxOutputTokens }),
      } as unknown as LlmDeps);

    await ask(8192);
    await ask(500);
    const sent = create.mock.calls.map(
      (call) =>
        (call as unknown as [{ maxOutputTokens: number }])[0].maxOutputTokens,
    );
    expect(sent).toEqual([2048, 500]); // never raised above what was configured
  });
});
