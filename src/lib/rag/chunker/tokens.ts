import { Tiktoken } from "js-tiktoken/lite";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";

// Counts tokens the way the embedding model does. cl100k_base is the tokenizer of
// text-embedding-3-small, so "800 tokens" here means 800 tokens there.

const encoder = new Tiktoken(cl100k_base);

export function countTokens(text: string): number {
  // The two empty lists mean: treat text such as "<|endoftext|>" as ordinary text, not an error.
  return encoder.encode(text, [], []).length;
}
