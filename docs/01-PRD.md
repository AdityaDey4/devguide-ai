# Product Requirements Document (PRD)

**Product:** DevGuide AI *(working name, rename freely)*
**Type:** Web application (Next.js) with an AI research agent, RAG chat and MCP integration
**Document version:** 1.0
**Status:** Draft for build

---

## 1. Summary

DevGuide AI turns any technology name into a **current, source-backed learning guide** in about two minutes, and then lets the user **chat with that guide and the official documentation behind it**.

The user types a technology ("LangGraph", "Supabase", "Bun"). An agent finds the official documentation, reads it live, and writes a structured guide: what it is, why it exists, installation, core concepts, a first working example, common mistakes and next steps. Every fact links to the official page it came from. The guide can be edited, updated by asking the agent, refreshed when the docs change, and downloaded as a PDF.

A chat panel answers follow-up questions using **corrective, hybrid RAG**: it searches what the system already knows first, judges whether that is good enough, and only then goes to Context7 (via MCP) and the live official docs, in parallel. Anything new it learns is stored, so the knowledge base improves with use.

---

## 2. Problem

When developers explore a new technology today they:

1. Open the official website and click around the docs to find the overview, installation and a first example.
2. Or ask a general chatbot, which answers from training data that may be months or years old, often producing outdated APIs or invented functions.
3. Lose their notes, or keep them in scattered places, and repeat the process later.

**Core pain points**

| Pain | Effect |
|---|---|
| Docs are large and not organised for a first-time learner | Hours spent to reach a basic working setup |
| Chatbots answer from stale training data | Broken code, wasted debugging time, lost trust |
| No single place that holds "what I learned about X" | Repeated research, no reuse |
| Docs change with new versions | Notes and tutorials silently go out of date |

---

## 3. Target users

**Primary: Developers learning a new technology**
- Junior to mid-level developers, students, and experienced developers switching stacks.
- Need: a fast, correct starting point and a reliable way to ask follow-up questions.

**Secondary: Tech leads and architects evaluating tools**
- Need: a quick, accurate overview to compare options and decide what to adopt.

**Secondary: Developers using AI coding tools (Claude, Cursor)**
- Need: their coding assistant to use current, verified docs. Served by the DevGuide MCP server (post-MVP).

### Personas

- **Aarav, 2 years' experience:** has to add LangGraph to a project this week. Wants a guide plus the ability to ask "how do I add memory?" without wading through 180 doc pages.
- **Meera, tech lead:** evaluating three vector databases. Wants a consistent one-page overview of each, with sources, to share with her team.

---

## 4. Goals and non-goals

### Goals
1. Generate an accurate, cited guide for a technology from its **official docs**, not model memory.
2. Answer follow-up questions with citations, honestly saying when the docs do not cover something.
3. Get smarter with use: reuse stored knowledge before fetching again.
4. Let users keep guides current (edit, extend, refresh) and export them as PDF.
5. Demonstrate a production-quality architecture: LangGraph agent, hybrid + corrective RAG, MCP.

### Non-goals (for MVP)
- Teaching via video, quizzes or interactive courses.
- Covering non-technical topics.
- User PDF uploads (deferred for security reasons; see section 9).
- Team workspaces and sharing permissions.

---

## 5. Core features

### F1. Technology search and disambiguation
- Single search box.
- If a recent guide exists, open it instantly. If an old guide exists, open it with a "Refresh?" banner.
- If the name is ambiguous ("Bun", "Mercury"), ask the user to choose between 2–3 options.

### F2. Guide generation agent
- Finds the official site, the docs index (`llms.txt`, sitemap or navigation) and the current version.
- Plans an outline, assigns relevant doc pages to each section.
- Researches and writes sections **in parallel**, using only fetched sources plus Context7 code snippets.
- A checker step validates code examples and key claims against sources; at most two rewrites per section.
- Live progress shown to the user, sections streaming in as they are written.

**Standard guide sections**
1. What it is (one paragraph + "in one sentence")
2. Why use it / when not to use it
3. Installation and setup
4. Core concepts
5. First working example
6. Common mistakes and gotchas
7. Next steps and key doc links

### F3. Guide viewer and editor
- Read view with citations (hover preview of the source).
- Edit any section directly (Markdown editor).
- Ask the agent to change the guide: "add a section on streaming", "simplify the concepts section".
- Every change creates a new version; previous versions can be viewed and restored.

### F4. PDF export
- "Download PDF" generates a clean PDF from the current version at that moment.

### F5. Chat with the guide (corrective hybrid RAG)
- Chat panel beside the guide, scoped to that technology.
- Answers with citations and a label showing where the answer came from: *Your guide*, *Official docs (stored)*, *Fetched just now*.
- If nothing relevant exists anywhere, says so and offers to research and add a section.

### F6. Refresh
- Re-checks the official docs for changes, updates only affected sections, and shows what changed.

### F7. MCP integration
- **Consumes** Context7 via MCP for current code and API snippets (MVP).
- **Exposes** the user's guide library as an MCP server so Claude / Cursor can search it (post-MVP, v1.1).

---

## 6. MVP scope

**In MVP**
- Sign-in (email / GitHub).
- F1 search + disambiguation.
- F2 guide generation with live progress.
- F3 viewer, manual edit, agent-requested edit, version history (view + restore).
- F4 PDF export.
- F5 chat with corrective hybrid RAG, including Context7 and live fetch in parallel, and background storage of new knowledge.
- Rate limits and cost guards.
- Basic tracing (LangSmith) and a small retrieval evaluation set.

**v1.1 (immediately after MVP)**
- F6 Refresh with change summary.
- F7 DevGuide MCP server.
- Semantic answer cache.

**Later (v2)**
- Secure PDF upload ("chat with my own docs").
- Comparing technologies side by side.
- Team sharing.

---

## 7. User stories

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-01 | developer | type a technology name and get a guide | I can start learning in minutes |
| US-02 | developer | be asked which tool I meant when a name is ambiguous | the guide is about the right thing |
| US-03 | developer | watch the agent's progress live | I know it is working and what it is doing |
| US-04 | developer | see a source link for each fact | I can verify and read further |
| US-05 | developer | open an existing guide instantly | I don't wait or pay for repeated work |
| US-06 | developer | edit a section | the guide fits my needs |
| US-07 | developer | ask the agent to add or change a section | I can extend the guide without writing it myself |
| US-08 | developer | restore an earlier version | I can undo a bad edit |
| US-09 | developer | download the guide as PDF | I can read it offline or share it |
| US-10 | developer | ask follow-up questions in chat | I get answers specific to my problem |
| US-11 | developer | see whether an answer came from my guide, stored docs or a fresh fetch | I know how much to trust it |
| US-12 | developer | be told honestly when the docs don't cover something | I am not misled by invented answers |
| US-13 | developer | have the agent research a missing topic and add it to the guide | my guide improves over time |
| US-14 | developer | refresh an old guide (v1.1) | my notes stay current |
| US-15 | developer using Cursor | search my guides from my editor via MCP (v1.1) | my coding assistant uses verified docs |

---

## 8. Success metrics

| Metric | Target (MVP) |
|---|---|
| Median time to complete a new guide | ≤ 3 minutes |
| Time to open an existing guide | ≤ 1 second |
| Guide sections with at least one citation | 100% |
| Chat answers with at least one citation (when an answer is given) | ≥ 95% |
| Retrieval quality on evaluation set (correct chunk in top 5) | ≥ 85% |
| Share of chat questions answered from stored knowledge (no external fetch) | ≥ 70% after first week of use |
| Code examples that run without modification (manual spot check, 10 guides) | ≥ 80% |
| Average LLM + API cost per new guide | tracked; target set after first 20 guides |

---

## 9. Assumptions

- Most popular technologies publish public docs with a sitemap or `llms.txt`.
- Context7 free/paid limits are sufficient for development and demo usage (free tier was 1,000 calls/month as of early 2026; verify current limits).
- Users accept a 1–3 minute wait for a new guide if progress is visible.
- An LLM with structured output and tool calling is available (Claude or OpenAI), configurable via environment variables.

---

## 10. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Model writes from memory instead of sources | Wrong or outdated content | "Only use the provided sources" prompts, citations required, checker node |
| Docs site blocks bots or needs JavaScript | Guide can't be generated | Fall back to Context7; optional headless browser later |
| Prompt injection inside fetched pages | Agent misbehaves | Treat fetched text as data in prompts; agent has no dangerous tools; output is text only |
| Cost spikes (LLM, embeddings, Context7) | Budget overrun | Per-user rate limits, step budgets per run, caching, reuse of stored knowledge |
| Long runs exceed serverless time limits | Failed generations | Persist progress and graph checkpoints; resumable runs; long-duration route config |
| Context7 terms or limits change | Feature degraded | Treat as optional source; own fetcher is primary; review terms before public launch |
| Stale stored knowledge | Outdated answers | `fetched_at` / expiry on chunks; version metadata; Refresh feature |

---

## 11. Out of scope (MVP)

- User file uploads of any kind.
- Team workspaces, sharing permissions, comments.
- Mobile app (web is responsive only).
- Paid billing / subscriptions.
- Non-English guides.
- Automatic scheduled refresh of all guides.

---

## 12. Acceptance criteria (MVP)

1. Searching a well-known technology produces a complete 7-section guide with citations in every section.
2. Searching an existing technology opens the stored guide without starting a new agent run.
3. An ambiguous name triggers a choice before generation starts.
4. Progress events stream to the UI and survive a page reload (the run continues and the UI reconnects).
5. Manual and agent edits create new versions; restoring a version works.
6. PDF download matches the current version, including code blocks and source links.
7. Chat answers include citations and a source-origin label.
8. A question not covered by stored knowledge triggers Context7 + live fetch in parallel, and the new material is searchable afterwards.
9. A question not covered anywhere returns an honest "not covered" response, not an invented answer.
10. Rate limits block abuse with a clear message.
