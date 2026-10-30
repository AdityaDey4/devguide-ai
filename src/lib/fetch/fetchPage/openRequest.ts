import http from "node:http";
import https from "node:https";
import { USER_AGENT } from "./config";
import type { FetchDeps } from "./types";

// Sends ONE GET request and resolves as soon as the response headers arrive.
// The body is read separately (readBody.ts).

export function openRequest(
  url: URL,
  deps: FetchDeps,
  signal: AbortSignal,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,text/markdown,text/plain,application/xml;q=0.9,*/*;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
        // The connect-time SSRF check (layer 2).
        lookup: deps.lookup,
        // A fresh connection every time, so a reused socket can never skip that check.
        agent: false,
        signal,
      },
      resolve,
    );
    request.on("error", reject);
    request.end();
  });
}
