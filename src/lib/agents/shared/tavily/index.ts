import { serverSchema } from "../../../env.schema";

// Web search with Tavily, used to find a technology's official site (SRS FR-GEN-2, FR-SRCH-4).
//
//   const hits = await searchWeb("langgraph official documentation");
//   hits[0] -> { title: "LangGraph overview", url: "https://docs.langchain.com/...", content: "..." }
//
// Plain HTTPS to Tavily's search endpoint; no SDK. Server only: it sends TAVILY_API_KEY.

const ENDPOINT = "https://api.tavily.com/search";
const TIMEOUT_MS = 15_000;
const DEFAULT_RESULTS = 5;

export type SearchHit = { title: string; url: string; content: string };

export class TavilyError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "api",
  ) {
    super(message);
    this.name = "TavilyError";
  }
}

export type TavilyDeps = {
  fetch: typeof fetch;
  apiKey: () => string;
};

const realDeps: TavilyDeps = { fetch: (...args) => fetch(...args), apiKey };

function apiKey(): string {
  const key = serverSchema.pick({ TAVILY_API_KEY: true }).safeParse(process.env)
    .data?.TAVILY_API_KEY;
  if (!key) {
    throw new TavilyError(
      "TAVILY_API_KEY is required to find a technology's official site. Set it in .env.local.",
      "config",
    );
  }
  return key;
}

export async function searchWeb(
  query: string,
  options: {
    maxResults?: number;
    signal?: AbortSignal;
    /** Only return pages on these sites (host names, like "nodejs.org"). */
    includeDomains?: string[];
  } = {},
  deps: TavilyDeps = realDeps,
): Promise<SearchHit[]> {
  const key = deps.apiKey();
  let response: Response;
  try {
    response = await deps.fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        max_results: options.maxResults ?? DEFAULT_RESULTS,
        ...(options.includeDomains?.length && {
          include_domains: options.includeDomains,
        }),
      }),
      signal: options.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new TavilyError(
      `Tavily search failed: ${error instanceof Error ? error.message : String(error)}`,
      "api",
    );
  }
  if (!response.ok) {
    throw new TavilyError(
      `Tavily search failed (HTTP ${response.status})`,
      "api",
    );
  }

  const body = (await response.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  return (body.results ?? [])
    .filter((hit) => hit.url)
    .map((hit) => ({
      title: hit.title ?? hit.url!,
      url: hit.url!,
      content: hit.content ?? "",
    }));
}
