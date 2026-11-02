import { describe, expect, it } from "vitest";
import { contentHash } from "@/lib/rag/store";
import { expiresAt } from "@/lib/rag/store/expiry";

// The database parts of the store (skipping known chunks, no duplicates) are in
// tests/integration/store.test.ts, because they need the real local database.

describe("contentHash (the dedupe fingerprint)", () => {
  it("is the same for the same text", () => {
    expect(contentHash("const a = 1;")).toBe(contentHash("const a = 1;"));
  });

  it("ignores Windows line endings, trailing spaces and surrounding blank space", () => {
    expect(contentHash("const a = 1;  \r\nrun();\r\n")).toBe(
      contentHash("const a = 1;\nrun();"),
    );
    expect(contentHash("\n\n  text\n\n")).toBe(contentHash("text"));
  });

  it("treats a change in indentation or wording as a different chunk", () => {
    expect(contentHash("if (x) {\n  y();\n}")).not.toBe(
      contentHash("if (x) {\ny();\n}"),
    );
    expect(contentHash("one")).not.toBe(contentHash("two"));
  });

  it("is a 64-character SHA-256 hex string", () => {
    expect(contentHash("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("expiresAt", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");

  it("expires official pages after 90 days", () => {
    expect(expiresAt("official", from)).toBe("2026-04-01T00:00:00.000Z");
  });

  it("expires context7 snippets after 30 days", () => {
    expect(expiresAt("context7", from)).toBe("2026-01-31T00:00:00.000Z");
  });

  it("never expires our own guides", () => {
    expect(expiresAt("guide", from)).toBeNull();
  });
});
