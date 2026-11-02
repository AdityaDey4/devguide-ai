import { FetchError, type FetchedPage } from "@/lib/fetch/fetchPage";
import { sleep } from "./localServer";

// A website that lives in memory: a map from URL to reply. Anything not listed answers 404.
// Lets discovery tests run without a network.

export type Reply = {
  body: string;
  /** Default "text/plain". */
  type?: string;
  status?: number;
  /** Pretend the page redirected here. */
  finalUrl?: string;
};

export function fakeSite(files: Record<string, Reply>) {
  const calls: string[] = [];
  let active = 0;
  let peak = 0;

  async function fetchPage(url: string): Promise<FetchedPage> {
    calls.push(url);
    active++;
    peak = Math.max(peak, active);
    try {
      await sleep(3); // lets several requests overlap, so concurrency can be measured
      const reply = files[url];
      const status = reply?.status ?? (reply ? 200 : 404);
      if (!reply || status >= 400) {
        throw new FetchError(`HTTP ${status}`, "http_status", { status });
      }
      return {
        requestedUrl: url,
        url: reply.finalUrl ?? url,
        status: 200,
        contentType: reply.type ?? "text/plain",
        body: reply.body,
        bytes: reply.body.length,
        redirects: [],
        fetchedAt: new Date(),
      };
    } finally {
      active--;
    }
  }

  return {
    fetchPage,
    calls,
    /** The most requests that were running at the same moment. */
    get peak() {
      return peak;
    },
  };
}

/** An HTML page with a title and some links. */
export function htmlPage(title: string, links: string[] = []): Reply {
  const anchors = links.map((href) => `<a href="${href}">link</a>`).join("");
  return {
    type: "text/html",
    body: `<html><head><title>${title} | Site</title></head><body><main><h1>${title}</h1>${anchors}</main></body></html>`,
  };
}
