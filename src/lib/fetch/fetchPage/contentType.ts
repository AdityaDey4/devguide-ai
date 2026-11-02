// Reading the Content-Type header and turning bytes into text.

const TEXTUAL_APPLICATION_TYPES = new Set([
  "application/xml",
  "application/xhtml+xml",
  "application/json",
  "application/rss+xml",
  "application/atom+xml",
]);

/** Only text-like content is accepted. PDFs, images and other binaries are refused. */
export function isTextual(mediaType: string): boolean {
  return (
    mediaType.startsWith("text/") ||
    TEXTUAL_APPLICATION_TYPES.has(mediaType) ||
    mediaType.endsWith("+xml") ||
    mediaType.endsWith("+json")
  );
}

/** "text/html; charset=utf-8" -> { mediaType: "text/html", charset: "utf-8" } */
export function parseContentType(header: string | undefined) {
  const [media = "", ...params] = (header ?? "").split(";");
  const charset = params
    .map((param) => param.trim().match(/^charset\s*=\s*"?([^";\s]+)"?$/i)?.[1])
    .find(Boolean);
  return { mediaType: media.trim().toLowerCase(), charset };
}

/** Bytes to text, using the page's declared charset (utf-8 if missing or unknown). */
export function decode(buffer: Buffer, charset: string | undefined): string {
  try {
    return new TextDecoder(charset ?? "utf-8").decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer); // unknown charset label
  }
}
