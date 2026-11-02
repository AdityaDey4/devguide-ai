import { describe, expect, it } from "vitest";
import { discoverDocs as discover } from "@/lib/fetch/discover";
import type { DiscoverOptions } from "@/lib/fetch/discover";
import { fakeSite, htmlPage } from "../../../helpers/fakeSite";

const ROOT = "https://docs.example.com";

function discoverWith(files: Parameters<typeof fakeSite>[0]) {
  const site = fakeSite(files);
  return {
    site,
    discoverDocs: (url: string, options?: DiscoverOptions) =>
      discover(url, options, { fetchPage: site.fetchPage }),
  };
}

const llms = (n: number, prefix = ROOT) =>
  Array.from(
    { length: n },
    (_, i) => `- [Page ${i}](${prefix}/page-${i}): about ${i}`,
  ).join("\n");

const sitemap = (urls: string[]) =>
  `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;

describe("discoverDocs: llms.txt first", () => {
  it("uses llms.txt when it lists enough pages, with titles", async () => {
    const { discoverDocs, site } = discoverWith({
      [`${ROOT}/llms.txt`]: { body: `# Example\n\n${llms(6)}` },
    });
    const result = await discoverDocs(ROOT);
    expect(result.source).toBe("llms.txt");
    expect(result.pages).toHaveLength(6);
    expect(result.pages[0]).toEqual({ url: `${ROOT}/page-0`, title: "Page 0" });
    expect(site.calls).not.toContain(`${ROOT}/sitemap.xml`);
  });

  it("ignores links to other sites and non-documentation files", async () => {
    const body = [
      llms(5),
      `- [Elsewhere](https://other.com/x)`,
      `- [Logo](${ROOT}/logo.png)`,
    ].join("\n");
    const { discoverDocs } = discoverWith({ [`${ROOT}/llms.txt`]: { body } });
    const urls = (await discoverDocs(ROOT)).pages.map((p) => p.url);
    expect(urls).toHaveLength(5);
    expect(urls.every((u) => u.startsWith(ROOT) && !u.endsWith(".png"))).toBe(
      true,
    );
  });
});

describe("discoverDocs: falling back", () => {
  it("uses the sitemap when llms.txt is missing", async () => {
    const urls = Array.from({ length: 6 }, (_, i) => `${ROOT}/s-${i}`);
    const { discoverDocs } = discoverWith({
      [`${ROOT}/sitemap.xml`]: { body: sitemap(urls), type: "application/xml" },
      ...Object.fromEntries(urls.map((u, i) => [u, htmlPage(`Sitemap ${i}`)])),
    });
    const result = await discoverDocs(ROOT);
    expect(result.source).toBe("sitemap");
    expect(result.pages.map((p) => p.url)).toEqual(urls);
  });

  it("crawls links when there is neither llms.txt nor a sitemap", async () => {
    const { discoverDocs } = discoverWith({
      [`${ROOT}/`]: htmlPage("Home", [`${ROOT}/a`, `${ROOT}/b`]),
      [`${ROOT}/a`]: htmlPage("A", [`${ROOT}/b`]),
      [`${ROOT}/b`]: htmlPage("B"),
    });
    const result = await discoverDocs(ROOT);
    expect(result.source).toBe("crawl");
    expect(result.pages.map((p) => p.url).sort()).toEqual(
      [`${ROOT}/`, `${ROOT}/a`, `${ROOT}/b`].sort(),
    );
  });

  it("lists a page once even when it is reached by a redirect", async () => {
    const { discoverDocs } = discoverWith({
      [`${ROOT}/`]: htmlPage("Home", [`${ROOT}/old`, `${ROOT}/new`]),
      [`${ROOT}/old`]: { ...htmlPage("New"), finalUrl: `${ROOT}/new` },
      [`${ROOT}/new`]: htmlPage("New"),
    });
    const urls = (await discoverDocs(ROOT)).pages.map((p) => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("returns no pages and explains each attempt when the site has nothing", async () => {
    const { discoverDocs } = discoverWith({});
    const result = await discoverDocs(ROOT);
    expect(result.source).toBeNull();
    expect(result.pages).toEqual([]);
    expect(result.attempts.map((a) => a.source)).toEqual([
      "llms.txt",
      "sitemap",
      "crawl",
    ]);
  });
});

describe("discoverDocs: limits and input", () => {
  it("cuts the list at maxPages and says so", async () => {
    const { discoverDocs } = discoverWith({
      [`${ROOT}/llms.txt`]: { body: llms(12) },
    });
    const result = await discoverDocs(ROOT, { maxPages: 5 });
    expect(result.pages).toHaveLength(5);
    expect(result.truncated).toBe(true);
  });

  it("refuses a URL that is not https", async () => {
    const { discoverDocs } = discoverWith({});
    await expect(discoverDocs("http://docs.example.com")).rejects.toThrow();
  });
});
