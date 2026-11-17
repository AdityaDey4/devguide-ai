import { describe, expect, it } from "vitest";
import { guideDate, pdfName } from "@/lib/guide/pdf";

// The PDF's file name (FR-PDF-3) and the date line printed on it (FR-PDF-2).

describe("pdfName", () => {
  it("is <technology>-guide-v<version>", () => {
    expect(pdfName("zod", 3)).toBe("zod-guide-v3");
  });

  it("keeps only letters, digits and single dashes, so it is a safe file name", () => {
    expect(pdfName("Node.js", 2)).toBe("node-js-guide-v2");
    expect(pdfName("../etc/Pass wd", 1)).toBe("etc-pass-wd-guide-v1");
  });

  it("still gives a name when the slug has nothing usable", () => {
    expect(pdfName("???", 1)).toBe("guide-guide-v1");
  });
});

describe("guideDate", () => {
  it("writes the day in UTC, the same on the server and in the browser", () => {
    expect(guideDate("2026-11-16T23:30:00Z")).toBe("16 Nov 2026");
  });

  it("writes nothing for a date it cannot read", () => {
    expect(guideDate("not a date")).toBe("");
  });
});
