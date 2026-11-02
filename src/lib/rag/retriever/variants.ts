import { MAX_VARIANTS } from "./config";

// Cleans the list of questions before searching.
//
//   ["How do I validate?", "  ", "how do i validate?", "email schema", "a", "b"]
//     -> ["How do I validate?", "email schema", "a"]     (blank and repeated ones dropped, max 3)

export function cleanVariants(queries: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const query of queries) {
    const text = query.trim();
    const key = text.toLowerCase();
    if (text === "" || seen.has(key)) continue;
    seen.add(key);
    kept.push(text);
  }
  return kept.slice(0, MAX_VARIANTS);
}
