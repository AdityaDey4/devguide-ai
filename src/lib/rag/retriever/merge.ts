import type { Candidate } from "./types";

// Joins the results of several searches into one list.
//
//   search for "validate email":  A 0.033, B 0.016
//   search for "z.email schema":  B 0.032, C 0.016
//   merged:                       B 0.032, A 0.033 ... -> A 0.033, B 0.032, C 0.016
//
// A chunk found by more than one search appears once, with its best score.

export function mergeCandidates(lists: Candidate[][]): Candidate[] {
  const best = new Map<string, Candidate>();

  for (const candidate of lists.flat()) {
    const known = best.get(candidate.id);
    if (!known || candidate.score > known.score) {
      best.set(candidate.id, candidate);
    }
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score);
}
