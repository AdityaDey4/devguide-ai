import dns from "node:dns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFetchPage, FetchError } from "@/lib/fetch/fetchPage";
import { assertSafeUrl, SsrfBlockedError } from "@/lib/fetch/ssrfGuard";
import { startServer } from "../../../helpers/localServer";

// A real HTTP server on this machine. The guard is told to let that one port through;
// every other check (redirects, size, content type, timeout) runs for real.
let server: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  server = await startServer((req, res) => {
    const reply = (
      status: number,
      type: string,
      body: string,
      headers = {},
    ) => {
      res.writeHead(status, { "content-type": type, ...headers });
      res.end(body);
    };
    switch (req.url) {
      case "/ok":
        return reply(
          200,
          "text/html; charset=utf-8",
          "<html><body>hello</body></html>",
        );
      case "/text":
        return reply(200, "text/plain", "plain words");
      case "/image":
        return reply(200, "image/png", "not really a picture");
      case "/big":
        return reply(200, "text/plain", "x".repeat(6_000_000));
      case "/missing":
        return reply(404, "text/plain", "nope");
      case "/slow":
        return void setTimeout(() => reply(200, "text/plain", "late"), 2000);
      case "/hop1":
        return reply(302, "text/plain", "", { location: "/hop2" });
      case "/hop2":
        return reply(302, "text/plain", "", { location: "/ok" });
      case "/loop":
        return reply(302, "text/plain", "", { location: "/loop" });
      case "/to-metadata":
        return reply(302, "text/plain", "", {
          location: "http://169.254.169.254/latest/meta-data/",
        });
      default:
        return reply(404, "text/plain", "");
    }
  });
});

afterAll(() => server.close());

const fetchPage = createFetchPage({
  assertSafeUrl: async (raw) => {
    const url = new URL(raw);
    if (url.hostname === "127.0.0.1" && url.port === String(server.port)) {
      return { url };
    }
    return assertSafeUrl(raw);
  },
  // The real connect-time check would refuse 127.0.0.1, so use Node's normal lookup here.
  lookup: dns.lookup as never,
});

const noRetry = { retries: 0 };

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the fetch to fail");
}

async function kindOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await errorOf(promise);
  return error instanceof FetchError ? error.kind : undefined;
}

describe("fetchPage: successful fetches", () => {
  it("returns the body, final URL and media type of an HTML page", async () => {
    const page = await fetchPage(`${server.url}/ok`, noRetry);
    expect(page.status).toBe(200);
    expect(page.contentType).toBe("text/html");
    expect(page.body).toContain("hello");
    expect(page.url).toBe(`${server.url}/ok`);
    expect(page.redirects).toEqual([]);
  });

  it("accepts plain text", async () => {
    expect((await fetchPage(`${server.url}/text`, noRetry)).body).toBe(
      "plain words",
    );
  });

  it("follows redirects and reports each hop", async () => {
    const page = await fetchPage(`${server.url}/hop1`, noRetry);
    expect(page.url).toBe(`${server.url}/ok`);
    expect(page.requestedUrl).toBe(`${server.url}/hop1`);
    expect(page.redirects).toHaveLength(2);
  });
});

describe("fetchPage: refusals", () => {
  it("rejects a non-text content type", async () => {
    expect(await kindOf(fetchPage(`${server.url}/image`, noRetry))).toBe(
      "unsupported_content_type",
    );
  });

  it("rejects a page over the size limit", async () => {
    expect(await kindOf(fetchPage(`${server.url}/big`, noRetry))).toBe(
      "too_large",
    );
  });

  it("reports an HTTP error status and does not retry a 404", async () => {
    const error = await errorOf(fetchPage(`${server.url}/missing`));
    expect(error).toBeInstanceOf(FetchError);
    expect(error).toMatchObject({
      kind: "http_status",
      status: 404,
      retryable: false,
    });
  });

  it("gives up on a slow server", async () => {
    const started = Date.now();
    expect(
      await kindOf(
        fetchPage(`${server.url}/slow`, { timeoutMs: 300, retries: 0 }),
      ),
    ).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("stops after too many redirects", async () => {
    expect(await kindOf(fetchPage(`${server.url}/loop`, noRetry))).toBe(
      "too_many_redirects",
    );
  });

  it("refuses a redirect that points at a private address", async () => {
    expect(
      await errorOf(fetchPage(`${server.url}/to-metadata`, noRetry)),
    ).toBeInstanceOf(SsrfBlockedError);
  });

  it("refuses a private address given directly", async () => {
    expect(
      await errorOf(fetchPage("http://169.254.169.254/", noRetry)),
    ).toBeInstanceOf(SsrfBlockedError);
  });

  it("stops when the caller cancels", async () => {
    const controller = new AbortController();
    const promise = fetchPage(`${server.url}/slow`, {
      ...noRetry,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    expect(await kindOf(promise)).toBe("aborted");
  });
});
