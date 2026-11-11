# Development Plan

**Product:** DevGuide AI
**Document version:** 3.0
**Related:** 01-PRD.md, 02-SRS.md, 03-Architecture.md, 04-UI-UX.md

---

## Approach: YAGNI + KISS

From M4 onward, every milestone is **one feature a user can see and use**, and it contains **only what that feature needs to work**. Nothing is built "for later".

**Rules**
1. **Build it when a feature needs it, not before.** If the current milestone works without it, it waits.
2. **Simplest version first.** Polling before realtime, a plain link before a popover, browser print before a PDF server. Upgrade only when the simple version clearly isn't good enough.
3. **No abstraction until the second use.** Write it directly; extract a helper or interface when something actually needs it twice.
4. **Hardcode before configuring.** Constants in code until a real need to change them appears.
5. **Each milestone ends deployed and usable.**

The SRS, Architecture and UI/UX documents describe the **full target**. This plan decides **when** each part is built. If a milestone below says "not now", it's built only when a later milestone needs it.

Each milestone has:
- **Feature:** what the user can do at the end.
- **Build:** only the tasks needed.
- **Not now:** tempting extras deliberately left out.
- **Done when:** how you know it works.

---

## Milestone overview

| # | Feature | Status |
|---|---|---|
| M0 | Project setup | ✅ Done |
| M1 | Fetch & ingest pipeline | ✅ Done |
| M2 | Hybrid retrieval + evals | ✅ Done |
| M3 | Guide generation graph (backend) | ✅ Done |
| M4 | Search a technology and read its generated guide | Next |
| M5 | Reopen existing guides; handle ambiguous names and failures | |
| M6 | Chat with a guide | |
| M7 | Chat finds answers outside the guide | |
| M8 | Edit a guide and restore versions | |
| M9 | Download a guide as PDF | |
| M10 | Ask the agent to improve the guide | |
| M11 | Safe to share with other people | |
| M12 | Launch | |

---

# Completed milestones (unchanged)

## M0. Project setup (P0)

**Tasks**
- [x] Create Next.js app (App Router, TypeScript, ESLint, Prettier), Tailwind, shadcn/ui.
- [x] Create Supabase project; enable `vector` extension; set up migrations folder.
- [x] Supabase Auth: GitHub + email magic link; protected `(app)` routes via middleware.
- [x] `.env.example` with all variables from 03-Architecture §9; typed env loader (zod).
- [x] Base layout: top bar, theme tokens (light/dark), fonts.
- [x] Set up LangSmith and Sentry projects; keys in env.
- [ ] Deploy to Vercel (or Railway); confirm sign-in works in production.
- [x] GitHub repo with CI: typecheck + lint + test on PR.

**Definition of Done:** signed-in user sees an empty Home page on the deployed URL; CI passes.

---

## M1. Fetch & ingest pipeline (P0)

**Tasks**
- [x] Migration: `technologies`, `sources`, `chunks` (with `fts` generated column, HNSW + GIN indexes).
- [x] `lib/fetch/ssrfGuard.ts`: DNS resolve + block private/loopback/link-local/metadata IPs; http(s) only.
- [x] `lib/fetch/fetchPage.ts`: 10 s timeout, 2 MB cap, 3 redirects, 1 retry with backoff.
- [x] `lib/fetch/clean.ts`: Readability + Turndown → Markdown.
- [x] `lib/fetch/discover.ts`: `llms.txt` → `sitemap.xml` (incl. sitemap index) → nav-link crawl (depth 2, max 100).
- [x] `lib/rag/chunker.ts`: heading-aware, 500–800 tokens, 15% overlap, code blocks intact, `heading_path`.
- [x] `lib/rag/embedder.ts`: batched embeddings (≤ 100/call).
- [x] `lib/rag/store.ts`: hash dedupe, insert with `source_type`, `expires_at`.
- [x] CLI script `scripts/ingest.ts <docsUrl>` for testing.
- [x] Unit tests: chunker (code block never split), ssrfGuard (blocks 127.0.0.1, 10.x, 169.254.169.254), dedupe.

**Definition of Done:** running the script on 3 real docs sites (e.g. LangGraph, Supabase, Zod) stores clean chunks; re-running inserts zero duplicates.

---

## M2. Hybrid retrieval + evaluation (P0)

**Tasks**
- [x] Migration: `hybrid_search` SQL function (03-Architecture §4).
- [x] `lib/rag/retriever.ts`: variants → batch embed → RPC per variant → merge by id.
- [x] `lib/rag/reranker.ts`: Cohere rerank wrapper (interface allows swapping).
- [x] Build `evals/retrieval.jsonl`: 30–50 question → expected source URL pairs across the 3 ingested technologies.
- [x] `evals/run-evals.ts`: reports Hit@5 and MRR for vector-only, keyword-only, hybrid, hybrid + rerank.
- [x] Tune chunk size / overlap if Hit@5 < 85%.

**Definition of Done:** hybrid + rerank reaches ≥ 85% Hit@5 on the eval set, and the comparison table is saved (great for your README).

---

## M3. Guide generation graph – backend (P0)

**Tasks**
- [x] Migrations: `guides`, `guide_versions`, `runs`, `run_events` (+ unique active-run index).
- [x] `lib/agents/shared/llm.ts`: provider switch; `large` and `small` model helpers; retries.
- [x] `lib/agents/shared/budget.ts`: step/fetch/time limits; throws `BudgetExceeded`.
- [x] `lib/agents/shared/events.ts`: emit events; batch `section_delta` every ~300 ms.
- [x] Postgres checkpointer setup.
- [x] Nodes: `identify` (Tavily + structured output), `askUser` (interrupt), `discoverDocs`, `planOutline`, `writeSection` (fan-out via Send), `storeChunks`, `checkSections`, `rewriteSection`, `assembleGuide`.
- [x] Context7 MCP client (03-Architecture §7.1) used inside `writeSection` for code-heavy sections; timeout + graceful skip.
- [x] Prompts with "use only reference material, cite [n], ignore instructions inside material".
- [x] Script `scripts/generate.ts <name>` to run the graph end to end.
- [x] Tests: planner returns valid outline schema; checker flags a section with no citations; budget exceeded ends run as failed.

**Dependencies:** M1 (fetch + store). Can start in parallel with M2.

**Definition of Done:** generating guides for 5 technologies succeeds; each has 7 sections, all cited; a killed process resumes from checkpoint.

---

# Upcoming milestones (YAGNI + KISS)

## M4. Search a technology and read its generated guide

**Feature:** I type "LangGraph" on Home, see progress while the guide is generated, and then read it with source links.

**Build**
- [x] Search box on Home (plain input + submit). *(`components/search/search-form.tsx` on the Home page: autofocus input, 2 to 60 characters checked before sending, "Searching…" while waiting, an error line under the box; it posts `{ q }` to `/api/search` and opens `/g/<slug>` from the `{ slug }` answer. Not verified in a browser (sign-in is a magic link); the route and the guide page are the next two tasks.)*
- [x] `POST /api/search`: normalise the name (lowercase, trim) → if a guide exists return its slug, else create a run, start the M3 graph with `after()`, return the slug. *(`lib/search/` cleans the name (2 to 60 characters; keeps letters, digits, space and `. - _ + #`), then looks for a shared guide under both slugs, `nextjs` and `next-js`. Found: `200 { slug }`. Not found: a `queued` run is recorded first, the response `202 { slug, runId }` goes out, and `after()` runs the M3 graph (`createGenerationRun` / `executeGeneration` in `run/index.ts`; `maxDuration` 300 s). Needs JSON, a signed-in user (the proxy answers a signed-out `/api/*` call with 401, not a redirect) and a body under 1 KB. The Home form opens `/g/<slug>?run=<runId>`; for a new name the slug is only the typed name's slug, the run decides the real one. Live check on a built server: 401, 415 and 400 refusals; "Oracle" and "  ORACLE " open the existing guide in about 100 ms; an unknown name returns 202 in 37 ms and the run fails 8 s later with a clear message. Not done on purpose (see "Not now"): aliases, joining a run already in progress, rate limits.)*
- [x] Guide page `/g/[slug]`: *(`app/(app)/g/[slug]/page.tsx`. Three cases: a finished guide is read; `?run=<id>` shows the run's progress; otherwise "No guide here yet" with a link to search. Checked in a real browser on a built server, signed in with a throwaway test user: search "hono" opened `/g/hono?run=…`, steps and tick marks appeared, a reload in the middle of the run restored the same state, and at the end the page moved to `/g/hono` by itself. The existing Java guide shows 13 code blocks, 38 citation links and one numbered source list.)*
  - [x] While generating: list of progress steps from `run_events`, **polled every 2 s** (`GET /api/runs/:id/events?after=<id>`). Sections appear when each one is done.
  - [x] When complete: render the guide Markdown (sanitised), code blocks with a copy button, citations as superscript links, numbered sources list at the end.
- [x] Simple failure message if the run fails. *(built with the progress view, which has to stop on a failed run anyway: "We could not create this guide", the reason, and a "Try another search" button; seen in the browser with a failed run row.)*

**Not now**
- Supabase Realtime and token-by-token streaming (polling is enough to show progress).
- Citation hover popovers, table of contents, recent/popular guides, search suggestions.
- Aliases ("nextjs" vs "next.js"), disambiguation, retry buttons.

**Done when:** on the deployed app, searching a new technology shows progress and ends on a readable, cited guide; reloading mid-run still shows progress.

---

## M5. Reopen existing guides; handle ambiguous names and failures

**Feature:** searching a technology that already has a guide opens it instantly; ambiguous names ask me to choose; failures give me a way forward.

**Build**
- [x] Existing guide → open directly (no new run). Already partly covered by M4; verify and fix. *(Verified and fixed. Gap found: search matched only the slug, so typing a technology's name when its slug differs ("Apache Kafka" for `kafka`) would have started a second run and a duplicate guide. `find.ts` now also matches the name, ignoring case; `_` and `%` in the typed text are plain characters, not search wildcards. Covered by 8 integration tests on the real database (slug, spellings, name, wildcards, no content yet, someone's personal copy, signed out, a guide wins over a run still marked running). Live check on a built server: "java", "Java", "  JAVA  " and "LANGCHAIN" all returned `{ slug }` in about 35 ms and the number of runs stayed at 6.)*
- [x] If a run for the same technology is already active, show that run instead of starting another (use the existing unique index). *(`findExisting` in `lib/search/find.ts` now answers "guide", else "the run that is writing it", else nothing. If a technology has an active generate run (queued, running or waiting for a choice), `POST /api/search` returns `200 { slug, runId }` and the page watches that run; no second run is created. A guide still wins over a run. 8 more integration tests on the real database (each active status, finished/failed/other-type runs ignored, the unique index itself refuses a second active run, guide beats run). Live check, two searches for a brand-new "hono" back to back plus a third 14 s later: the third joined the run that was active. **Known limit:** two searches in the same few seconds, before the technology is saved (about 5 s), both start a run; the one whose `identify` finishes second fails with "Another run is already generating a guide for hono. Search for it again to follow that run." and the "Retry" button of the next task makes that one click.)*
- [x] Disambiguation: when `identify` returns candidates, show a simple dialog with the options; `POST /api/runs/:id` resumes the interrupted graph with the choice. *(Built. The progress page shows a modal dialog "Which one do you mean?" with one button per candidate (name, description, address) and "None of these", which opens a box for a more specific name. `POST /api/runs/:id` takes `{ choice: "candidate", url }` or `{ choice: "refine", query }`. It checks that the address is one the run itself offered (it goes into a model prompt), cleans a new name like a search, claims the run in one database step so only the first answer resumes it (a second click gets 409), answers 202, and resumes the graph in `after()`. The dialog survives a reload (the `needs_choice` event is replayed) and closes by itself when the run goes on. Tests: unit for the answer checks, the route and the progress state; 5 integration tests on the real database, including two simultaneous answers resolving to exactly one. **Live, built server, real model:** "mercury" offered Mercury (API), Mercury (Programming Language) and Mercury (Product Documentation); choosing one closed the dialog and the run went on to write sections; by API: refusals (401, 415, unknown address 400, short name 400, bad id 400), "None of these" resumed the run, two clicks gave 202 and 409, a late answer gave 409. That run later failed with "Something went wrong: terminated" during the rewrite stage, a dropped network stream rather than anything in this task; the "Retry" button is the next task. Also fixed in the guide page: the session read now sits behind `await connection()`.)*
- [x] Failure state: show the reason and a "Retry" button (starts a new run). *(Built. A failed run shows "We could not create this guide", the reason, **Retry**, "Try another search", and "Open the partial draft" when the failed run left one. Retry sends the same name to `POST /api/search` with `retry: true`: that tells search that a partial draft is what failed, not a guide to reopen, so a new run starts (a finished guide is still opened, and a run someone else already restarted is joined). The typed name travels in the address as `?q=`, because the run itself does not store it. The page now decides by the run in the address first: failed shows the failure, a run still going is watched even if an older guide or draft exists, otherwise the guide is shown. When a run fails while the page is open, the view shows the failure at once and refreshes from the server to add the draft link. Shared browser code for Home and Retry: `lib/search/client.ts`. Tests: unit (the retry option through `resolveSearch` and the route, the browser helper) and 3 integration tests on the real database (a partial draft is opened by a normal search but not by a retry, a finished guide still is, a retry joins a restarted run). **Browser check, built server:** a failed run with a partial draft showed the reason, Retry and the draft link; Retry started a new run and showed its live progress (not the old draft); a run failed from the database while its page was open flipped to the failure view with Retry on its own. Note for testing in the in-app browser: the page only hydrates and polls while the pane is rendering, so a screenshot call may be needed to wake it.)*

**Not now**
- "Stale guide / Refresh" banner (no refresh feature yet).
- "Enter docs URL manually" (add only if real failures show it's needed).
- Alias table (add only when duplicate technologies actually appear).

**Done when:** an existing guide opens with no new run; "Bun" shows a choice and continues after choosing; a forced failure shows the reason and Retry works.

---

## M6. Chat with a guide

**Feature:** next to a guide, I ask a question and get an answer with citations, based on what's already stored.

**Build**
- [ ] When a guide is saved, chunk its sections and store them as `source_type='guide'` (reuse M1 chunker/store).
- [ ] Chat graph, minimal: `understand` (rewrite question using the last few messages) → `retrieve` (M2 retriever, filtered by technology) → `answer` (cite sources, say so if the material doesn't contain the answer).
- [ ] `POST /api/chat`: streams the answer text, then sends citations.
- [ ] Chat panel UI: message list, input, citations as links. Conversation kept in page state.

**Not now**
- Grading, fast path, Context7 / live-fetch fallback, origin labels (that's M7).
- Saving chat history to the database (`chats`, `messages` tables).
- Suggested questions, status line.

**Done when:** for 10 questions answered in a guide, the chat returns correct, cited answers; for a question not in the guide, it says it doesn't know instead of inventing.

---

## M7. Chat finds answers outside the guide

**Feature:** when the guide and stored docs aren't enough, the chat looks in the official docs and Context7, tells me where the answer came from, and remembers what it found.

**Build**
- [ ] `grade` node: structured output `{verdict, missing}`.
- [ ] On PARTIAL/BAD: run Context7 (existing M3 client) and live fetch (existing M1 fetcher) **in parallel**, targeted by `missing`; merge, rerank, grade once more.
- [ ] Answer or honest "not covered" fallback.
- [ ] Origin label on each answer: guide / stored docs / fetched now / not covered.
- [ ] After answering, store new chunks with `after()` (M1 store: dedupe + expiry).
- [ ] A small eval: 15–20 questions with expected origin.

**Not now**
- Fast path that skips grading (add only if answers feel slow).
- "Research and add to guide" button (M10).
- Semantic answer cache.

**Done when:** a question answered only in the official docs returns origin "fetched now"; asking it again returns "stored docs" with no external calls; an uncovered question returns "not covered" with no invented APIs.

---

## M8. Edit a guide and restore versions

**Feature:** I can edit a section, save it as a new version, and restore an older version.

**Build**
- [ ] Edit mode: a textarea per section (Markdown) + Save with an optional note.
- [ ] First edit of a shared guide creates my personal copy (fork); later saves create new versions of my copy.
- [ ] Re-chunk guide sections on save (reuse M6 step) so chat uses my edits.
- [ ] Version list (number, date, note) → view a version → Restore (creates a new version).

**Not now**
- Rich Markdown editor with live preview.
- Diff view between versions.
- Unsaved-changes warning (add if it becomes annoying).

**Done when:** editing creates a fork without changing the shared guide; chat reflects my edit; restoring v1 creates a new version with v1's content.

---

## M9. Download a guide as PDF

**Feature:** I click "Download PDF" and get a clean PDF of the version I'm viewing.

**Build**
- [ ] Print stylesheet for the guide page (hide app chrome, readable code blocks, sources list).
- [ ] "Download PDF" button that opens the browser's print dialog (Save as PDF).

**Not now**
- Server-side PDF generation with Puppeteer. Add only if browser print quality isn't good enough (e.g. code blocks cut off).

**Done when:** the saved PDF contains all sections, readable code blocks and the sources list.

---

## M10. Ask the agent to improve the guide

**Feature:** I type "add a section on streaming" (or click "Research and add to guide" on a "not covered" chat answer), see the proposed section, and accept or reject it.

**Build**
- [ ] Edit graph: take the instruction → reuse M3 section-writing nodes to research and write → pause (interrupt) with the proposal.
- [ ] Show the proposed section in full with Accept / Reject.
- [ ] Accept → new version (M8) + re-chunk (M6).
- [ ] "Research and add to guide" button on "not covered" answers, using the question as the instruction.

**Not now**
- Side-by-side diff view.
- "Ask for changes" loop (user can reject and type a new instruction).
- Modifying existing sections via the agent (only adding new sections for now).

**Done when:** an accepted section appears in the guide and the chat can answer from it.

---

## M11. Safe to share with other people

**Feature:** I can give the link to others without risking my costs, their privacy, or the app breaking.

**Build**
- [ ] Daily limits per user: generations, chat messages, agent edits (simple counters table) with a clear "limit reached, resets in…" message.
- [ ] Row Level Security on user-owned tables (forks, versions); test with two accounts.
- [ ] Check SSRF protection and prompt-injection behaviour (AC-11, AC-12).
- [ ] Friendly error messages for the failures seen so far (Context7 down, fetch failures, LLM timeouts).

**Not now**
- Global concurrency queue, per-IP Upstash limits (add if abuse actually happens).
- Admin dashboard (use Supabase table view + LangSmith).
- Usage meters in Settings.

**Done when:** a 6th generation in a day is blocked with a clear message; user B can't see user A's forks; AC-11 and AC-12 pass.

---

## M12. Launch

**Feature:** the app is public, and a visitor understands what it does and sees it work.

**Build**
- [ ] Simple landing page (headline, one screenshot or short clip, sign-in).
- [ ] Pre-generate 10 popular guides.
- [ ] One Playwright test of the main journey: search → read → chat.
- [ ] Quick keyboard and mobile check of the main screens.
- [ ] README: problem, architecture diagram, retrieval eval results, design decisions (YAGNI choices, why PDF upload is deferred).
- [ ] Check Context7 terms and current limits.
- [ ] 2-minute demo video.

**Done when:** a new visitor can sign in, open a guide, generate a new one and chat, on the public URL.

---

## After launch: only if needed

These are **ideas, not tasks**. Each becomes a milestone only when real use shows a need.

- Refresh a guide when docs change.
- Expose guides as an MCP server for Claude / Cursor.
- Natural-language search ("Give me setup of Supabase" → open at the right section).
- Realtime progress and token streaming.
- Saved chat history.
- Fast path, answer cache.
- Diff views, rich editor, server-side PDF.
- Secure PDF upload, technology comparison, team sharing.

---

## Testing approach

- Write tests for what each milestone builds, inside that milestone.
- Unit tests for logic with clear inputs/outputs (normalising names, merging results, limits).
- Mock the LLM in tests; use real models only in the small evals (run manually).
- One end-to-end test of the main journey at launch; add more only when something breaks twice.

---

## Starting the next chat

Upload all five files and start with:

> "Here are the PRD, SRS, Architecture, UI/UX and Development Plan for DevGuide AI. M0–M3 are done. Let's build M4, following the plan's YAGNI and KISS rules: only what M4 needs."
