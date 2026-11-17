// Naming the PDF (SRS FR-PDF-3): `<technology>-guide-v<version>.pdf`.
//
//   pdfName("zod", 3)       -> "zod-guide-v3"
//   pdfName("Node.js", 2)   -> "node-js-guide-v2"
//
// "Download PDF" is the browser's print dialog, and the dialog proposes the page title plus ".pdf"
// as the file name, so the button sets the page title to this while printing. `guideDate` is the
// "Generated 16 Nov 2026" line shown on paper only (FR-PDF-2); UTC, so the server and the browser
// write the same text.

export function pdfName(slug: string, versionNo: number): string {
  const safe = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "guide"}-guide-v${versionNo}`;
}

export function guideDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
