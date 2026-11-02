import type http from "node:http";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { FetchError } from "./errors";

// Reads a response body: decompresses it (gzip, brotli, deflate) and enforces the size cap.
// The cap counts DECOMPRESSED bytes, so a tiny gzip "bomb" cannot expand past it.

export async function readBody(
  response: http.IncomingMessage,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const decoder = decoderFor(response);

  // Cheap early exit. Only trustworthy when nothing is compressed.
  const declared = Number(response.headers["content-length"]);
  if (!decoder && Number.isFinite(declared) && declared > maxBytes) {
    throw tooLarge(maxBytes);
  }

  const chunks: Buffer[] = [];
  let total = 0;
  const collector = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) return callback(tooLarge(maxBytes));
      chunks.push(chunk);
      callback();
    },
  });

  if (decoder) {
    await pipeline(response, decoder, collector, { signal });
  } else {
    await pipeline(response, collector, { signal });
  }
  return Buffer.concat(chunks);
}

/** The right decompressor for the Content-Encoding header, or undefined if not compressed. */
function decoderFor(response: http.IncomingMessage) {
  const encoding = String(response.headers["content-encoding"] ?? "identity")
    .trim()
    .toLowerCase();

  if (encoding === "gzip" || encoding === "x-gzip") return zlib.createGunzip();
  if (encoding === "br") return zlib.createBrotliDecompress();
  if (encoding === "deflate") return zlib.createInflate();
  if (encoding !== "identity" && encoding !== "") {
    throw new FetchError(
      `Unsupported content-encoding: ${encoding}`,
      "unsupported_encoding",
    );
  }
  return undefined;
}

function tooLarge(maxBytes: number): FetchError {
  return new FetchError(`Page is larger than ${maxBytes} bytes`, "too_large");
}
