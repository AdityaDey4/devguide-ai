import { JSDOM, VirtualConsole } from "jsdom";
import { findTitle } from "../clean/title";
import type { Scope } from "./scope";

// Reads one HTML page for the crawl: its title, and the docs pages it links to.
//
//   <title>Basic usage | Zod</title> ... <a href="/api">API</a> <a href="https://other.com">x</a>
//   -> { title: "Basic usage", links: ["https://zod.dev/api"] }

export function readLinks(
  html: string,
  pageUrl: string,
  scope: Scope,
): { title: string; links: string[] } {
  const dom = new JSDOM(html, {
    url: pageUrl,
    contentType: "text/html",
    virtualConsole: new VirtualConsole(),
  });

  try {
    const doc = dom.window.document;
    const from = new URL(pageUrl);

    const links = new Set<string>();
    doc.querySelectorAll("a[href]").forEach((anchor) => {
      const url = scope.accept(anchor.getAttribute("href") ?? "", from);
      if (url) links.add(url);
    });

    // Headings often end with a "¶" or "#" permalink: not part of the title.
    const title = findTitle(doc, doc.body, "").replace(/[\s#¶§🔗​]+$/u, "");
    return { title, links: Array.from(links) };
  } finally {
    dom.window.close();
  }
}
