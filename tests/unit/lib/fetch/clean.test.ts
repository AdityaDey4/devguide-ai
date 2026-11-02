import { describe, expect, it } from "vitest";
import { cleanToMarkdown } from "@/lib/fetch/clean";

const URL_ = "https://docs.example.com/guide/start";
const html = (body: string, head = "<title>Start | Example Docs</title>") =>
  cleanToMarkdown({
    body: `<html><head>${head}</head><body>${body}</body></html>`,
    url: URL_,
    contentType: "text/html",
  });

describe("cleanToMarkdown: HTML pages", () => {
  it("keeps the article and drops menus, footers, scripts and buttons", () => {
    const { markdown } = html(`
      <nav>MENU-ITEM</nav>
      <main>
        <h1>Start</h1>
        <p>Install the package and import it.</p>
        <script>window.TRACKER = 1</script>
        <button>COPY-BUTTON</button>
      </main>
      <footer>FOOTER-TEXT</footer>`);
    expect(markdown).toContain("Install the package and import it.");
    expect(markdown).not.toContain("MENU-ITEM");
    expect(markdown).not.toContain("FOOTER-TEXT");
    expect(markdown).not.toContain("TRACKER");
    expect(markdown).not.toContain("COPY-BUTTON");
  });

  it("returns the page title without the site name, and puts it at the top as an h1", () => {
    const page = html(
      "<main><p>Some text that is long enough to be the content.</p></main>",
    );
    expect(page.title).toBe("Start");
    expect(page.markdown.startsWith("# Start")).toBe(true);
  });

  it("does not add a second h1 when the page already has one", () => {
    const { markdown } = html(
      "<main><h1>Start</h1><p>Body text of the page.</p></main>",
    );
    expect(markdown.match(/^# /gm)).toHaveLength(1);
  });

  it("turns a code block into a fenced block with its language, keeping lines and indentation", () => {
    const { markdown } = html(`<main><h1>Start</h1>
      <pre><code class="language-ts">const a = 1;\nif (a) {\n  run(a);\n}</code></pre></main>`);
    expect(markdown).toContain(
      "```ts\nconst a = 1;\nif (a) {\n  run(a);\n}\n```",
    );
  });

  it("keeps code that sits inside a list item as a code block", () => {
    const { markdown } = html(`<main><h1>Start</h1><ol><li>Run this:
      <pre><code class="language-bash">npm install zod</code></pre></li></ol></main>`);
    expect(markdown).toMatch(/^\s*```bash\n\s*npm install zod\n\s*```/m);
  });

  it("keeps tables as Markdown tables", () => {
    const { markdown } = html(`<main><h1>Start</h1>
      <table><thead><tr><th>Name</th><th>Type</th></tr></thead>
      <tbody><tr><td>id</td><td>string</td></tr></tbody></table></main>`);
    expect(markdown).toContain("| Name | Type |");
    expect(markdown).toContain("| id | string |");
  });

  it("turns relative links into absolute ones", () => {
    const { markdown } = html(
      `<main><h1>Start</h1><p><a href="../api/types">Types</a></p></main>`,
    );
    expect(markdown).toContain("(https://docs.example.com/api/types)");
  });

  it("never runs the page's scripts", () => {
    const body = `<main><h1>Start</h1><p>Hello</p></main>
      <script>document.body.innerHTML = "HACKED"</script>`;
    expect(html(body).markdown).not.toContain("HACKED");
  });

  it("collapses runs of blank lines and removes invisible characters", () => {
    const { markdown } = html(
      `<main><h1>Start</h1><p>One​ two</p><p></p><p></p><p>Three</p></main>`,
    );
    expect(markdown).not.toMatch(/\n{3,}/);
    expect(markdown).not.toContain("​");
  });
});

describe("cleanToMarkdown: text and Markdown pages", () => {
  it("only tidies a Markdown page and reports method 'plain'", () => {
    const page = cleanToMarkdown({
      body: "# Title\r\n\r\n\r\n\r\nText here.  \r\n",
      url: "https://docs.example.com/readme.md",
      contentType: "text/markdown",
    });
    expect(page.method).toBe("plain");
    expect(page.title).toBe("Title");
    expect(page.markdown).not.toContain("\r");
    expect(page.markdown).not.toMatch(/\n{3,}/);
  });

  it("keeps the content of a fenced block in a text page unchanged", () => {
    const body = "# T\n\n```py\ndef f():\n\n\n    return 1\n```\n";
    const { markdown } = cleanToMarkdown({
      body,
      url: "https://docs.example.com/a.txt",
      contentType: "text/plain",
    });
    expect(markdown).toContain("    return 1");
  });
});
