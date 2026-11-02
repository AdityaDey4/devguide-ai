import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "@/lib/rag/chunker";
import { countTokens } from "@/lib/rag/chunker/tokens";
import {
  codeBlock,
  fenceLines,
  lastLine,
  paragraph,
  sizesAreValid,
} from "../../../helpers/markdown";

describe("chunkMarkdown: basics", () => {
  it("returns nothing for empty text", () => {
    expect(chunkMarkdown("")).toEqual([]);
    expect(chunkMarkdown("   \n\n  ")).toEqual([]);
  });

  it("keeps a short page as one chunk that starts with its heading", () => {
    const chunks = chunkMarkdown(
      "# Basic usage\n\nCall parse() with your data.",
      { title: "Basic usage" },
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("Call parse()");
    expect(chunks[0].headingPath).toBe("Basic usage");
    expect(chunks[0].tokens).toBe(countTokens(chunks[0].content));
  });

  it("records the heading path of each section", () => {
    const md = [
      "# Guide",
      "## Install",
      paragraph(600, "install"),
      "## Usage",
      "### Advanced",
      paragraph(600, "advanced"),
    ].join("\n\n");
    const paths = chunkMarkdown(md, { title: "Guide" }).map(
      (c) => c.headingPath,
    );
    expect(paths).toContain("Guide > Install");
    expect(paths).toContain("Guide > Usage > Advanced");
  });

  it("does not treat a # inside a code block as a heading", () => {
    const md = "# Guide\n\n```bash\n# install it\nnpm i zod\n```\n";
    const chunks = chunkMarkdown(md, { title: "Guide" });
    expect(chunks.every((c) => !c.headingPath.includes("install it"))).toBe(
      true,
    );
  });
});

describe("chunkMarkdown: size", () => {
  it("splits a long page into chunks of at most 800 tokens", () => {
    const md =
      "# Long\n\n" +
      Array.from({ length: 12 }, (_, i) => paragraph(300, `p${i}`)).join(
        "\n\n",
      );
    const chunks = chunkMarkdown(md, { title: "Long" });
    expect(chunks.length).toBeGreaterThan(3);
    expect(sizesAreValid(chunks)).toBe(true);
  });

  it("repeats the end of one chunk at the start of the next when a section is cut by size", () => {
    const md =
      "# Long\n\n" +
      Array.from({ length: 8 }, (_, i) => paragraph(300, `q${i}`)).join("\n\n");
    const chunks = chunkMarkdown(md, { title: "Long" });
    const tail = lastLine(chunks[0].content).slice(-40);
    expect(chunks[1].content).toContain(tail);
  });

  it("splits a paragraph that is bigger than a chunk", () => {
    const md = "# Big\n\n" + paragraph(2500, "huge");
    const chunks = chunkMarkdown(md, { title: "Big" });
    expect(chunks.length).toBeGreaterThan(2);
    expect(sizesAreValid(chunks)).toBe(true);
  });
});

describe("chunkMarkdown: code blocks are never cut", () => {
  it("keeps a code block of up to 2,000 tokens whole, even above 800", () => {
    const code = codeBlock(1500, "keep");
    const md = `# Code\n\n${paragraph(700, "before")}\n\n${code}\n\n${paragraph(700, "after")}`;
    const chunks = chunkMarkdown(md, { title: "Code" });
    const holder = chunks.filter((c) => c.content.includes("function keep0"));
    expect(holder).toHaveLength(1);
    expect(holder[0].content).toContain(code);
    expect(sizesAreValid(chunks)).toBe(true);
  });

  it("never leaves a fence open in any chunk, even for several code blocks", () => {
    const md =
      "# Many\n\n" +
      Array.from(
        { length: 6 },
        (_, i) => `${paragraph(250, `t${i}`)}\n\n${codeBlock(400, `c${i}x`)}`,
      ).join("\n\n");
    for (const chunk of chunkMarkdown(md, { title: "Many" })) {
      expect(fenceLines(chunk.content) % 2).toBe(0);
    }
  });

  it("keeps the intro line with its code block", () => {
    const md = `# Use\n\n${paragraph(480, "pad")}\n\nRun this command:\n\n${codeBlock(700, "cmd")}`;
    const chunks = chunkMarkdown(md, { title: "Use" });
    const holder = chunks.find((c) => c.content.includes("function cmd0"));
    expect(holder?.content).toContain("Run this command:");
  });

  it("splits a code block over 2,000 tokens into pieces that each stay fenced", () => {
    const md = `# Huge\n\n${codeBlock(5000, "huge")}`;
    const chunks = chunkMarkdown(md, { title: "Huge" });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(fenceLines(chunk.content) % 2).toBe(0);
      expect(chunk.tokens).toBeLessThanOrEqual(2000);
    }
  });

  it("keeps an indented code block inside a list whole", () => {
    const md = `# List\n\n1. Do this:\n\n   \`\`\`ts\n   const a = 1;\n   const b = 2;\n   \`\`\`\n\n2. Then that.`;
    const chunks = chunkMarkdown(md, { title: "List" });
    const holder = chunks.find((c) => c.content.includes("const a = 1;"));
    expect(holder?.content).toContain("const b = 2;");
    expect(fenceLines(holder?.content ?? "") % 2).toBe(0);
  });

  it("treats a longer fence as one block when it contains a shorter fence", () => {
    const md = "# Doc\n\n````md\n```ts\nconst a = 1;\n```\n````\n\nAfter.";
    const chunks = chunkMarkdown(md, { title: "Doc" });
    expect(chunks.map((c) => c.content).join("\n")).toContain(
      "```ts\nconst a = 1;\n```",
    );
  });
});
