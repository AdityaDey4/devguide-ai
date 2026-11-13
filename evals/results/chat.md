# Chat evals

Run on 2026-11-13: 18 questions through the real graph (real models, Context7 and web). Nothing fetched is saved while running. "Mentions" is a keyword check, not a judge of correctness.

| Measure | Result |
| --- | --- |
| Passed (right origin, cited, uses an expected word) | 100% (18/18) |
| Origin as expected | 100% (18/18) |
| - Answered from stored text | 100% (7/7) |
| - Needed the outside lookup | 100% (6/6) |
| - Should be refused | 100% (5/5) |
| **Invented answers** (should be refused, was answered) | 0 of 5 |
| False refusals (answerable, but refused) | 0 of 13 |
| Stored-text questions that still went outside | 0 of 7 |
| Answers using an expected word | 100% (13/13) |
| Errors | 0 |
| First text after (median / 90th percentile) | 21.0 s / 25.8 s |
| Whole answer (median / 90th percentile) | 22.5 s / 29.9 s |

## Every question

| Id | Expected | Got | Grade | Outside calls | Cited | Time | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| stored-01 | guide / stored_docs | stored_docs | GOOD | 0 | 4 | 20.6 s | pass |
| stored-02 | guide / stored_docs | stored_docs | GOOD | 0 | 3 | 21.3 s | pass |
| stored-03 | guide / stored_docs | guide | GOOD | 0 | 2 | 21.0 s | pass |
| stored-04 | guide / stored_docs | stored_docs | GOOD | 0 | 2 | 16.7 s | pass |
| stored-05 | guide / stored_docs | stored_docs | GOOD | 0 | 4 | 15.2 s | pass |
| stored-06 | guide / stored_docs | stored_docs | GOOD | 0 | 1 | 18.0 s | pass |
| stored-07 | guide / stored_docs | stored_docs | GOOD | 0 | 4 | 13.6 s | pass |
| outside-01 | fetched_now | fetched_now | GOOD | 4 | 4 | 27.7 s | pass |
| outside-02 | fetched_now | fetched_now | GOOD | 4 | 3 | 23.4 s | pass |
| outside-03 | fetched_now | fetched_now | GOOD | 4 | 4 | 29.9 s | pass |
| outside-04 | fetched_now | fetched_now | GOOD | 4 | 2 | 27.0 s | pass |
| outside-05 | fetched_now | fetched_now | GOOD | 4 | 4 | 27.5 s | pass |
| outside-06 | fetched_now | fetched_now | GOOD | 4 | 1 | 22.9 s | pass |
| none-01 | not_found | not_found | BAD | 4 | 0 | 22.5 s | pass |
| none-02 | not_found | not_found | BAD | 4 | 0 | 23.0 s | pass |
| none-03 | not_found | not_found | BAD | 4 | 0 | 30.4 s | pass |
| none-04 | not_found | not_found | BAD | 4 | 0 | 21.0 s | pass |
| none-05 | not_found | not_found | BAD | 4 | 0 | 24.4 s | pass |

## Needs a look (0)

None.
