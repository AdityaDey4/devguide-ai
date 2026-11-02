# Retrieval evals

Run on 2026-11-02: 42 questions. Hit@5 = a correct page is in the top 5 chunks. MRR = average of 1 / position of the first correct chunk.

| Method | Hit@5 | MRR |
| --- | --- | --- |
| vector | 97.6% | 0.955 |
| keyword | 92.9% | 0.766 |
| hybrid | 97.6% | 0.889 |
| hybrid+rerank | 97.6% | 0.935 |

## Hit@5 by technology

| Method | zod | langgraph | supabase |
| --- | --- | --- | --- |
| vector | 93.8% | 100.0% | 100.0% |
| keyword | 87.5% | 93.8% | 100.0% |
| hybrid | 93.8% | 100.0% | 100.0% |
| hybrid+rerank | 93.8% | 100.0% | 100.0% |

## Missed by hybrid + rerank (1)

- **zod-01** How do I get the TypeScript type from a Zod schema?
  expected https://zod.dev/basics; top result: https://zod.dev/library-authors
