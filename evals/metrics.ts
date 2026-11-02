// The two scores. Both look at a ranked list of chunks, each chunk coming from some page.
//
//   firstHitRank(["/b", "/a", "/c"], ["/a"])  -> 2     (the first correct chunk is 2nd)
//   hitAtK(2, 5)                              -> true  (found within the top 5)
//   reciprocalRank(2)                         -> 0.5   (1/rank; 0 when nothing was found)
//   summarize([1, 2, null, 7])                -> { hitAt5: 0.5, mrr: (1 + 0.5 + 0 + 1/7) / 4 }
//
// Hit@5 = share of questions answered within the top 5. MRR = average of 1/rank: it rewards
// putting the right page first, not just somewhere in the list.

export const K = 5;

export function firstHitRank(
  urls: (string | null)[],
  expectedUrls: string[],
): number | null {
  const index = urls.findIndex(
    (url) => url !== null && expectedUrls.includes(url),
  );
  return index === -1 ? null : index + 1;
}

export function hitAtK(rank: number | null, k = K): boolean {
  return rank !== null && rank <= k;
}

export function reciprocalRank(rank: number | null): number {
  return rank === null ? 0 : 1 / rank;
}

export function summarize(ranks: (number | null)[]): {
  hitAt5: number;
  mrr: number;
} {
  if (ranks.length === 0) return { hitAt5: 0, mrr: 0 };
  const hits = ranks.filter((rank) => hitAtK(rank)).length;
  const reciprocal = ranks.reduce<number>(
    (sum, rank) => sum + reciprocalRank(rank),
    0,
  );
  return { hitAt5: hits / ranks.length, mrr: reciprocal / ranks.length };
}
