# UI/UX Document

**Product:** DevGuide AI
**Document version:** 1.0
**Related:** 01-PRD.md, 02-SRS.md, 03-Architecture.md

Design direction: **calm, technical, readable.** The product is used for reading long-form technical content and code, so the design behaves like good documentation: generous line length limits, strong typography, quiet colours, and one clear action per screen. The "wow" moment is the live agent progress, so that gets the most visual care.

---

## 1. Design principles

1. **Reading first.** Guide content is the hero. Max 72 characters per line for prose; code blocks can be wider.
2. **Show the work.** Users trust the agent because they can see what it is doing and where every fact came from.
3. **One primary action per screen.** Search on Home, Read/Chat on Guide, Accept/Reject on proposals.
4. **Honest states.** Loading, partial, "needs review", "not found" are always explicit, never hidden.
5. **Keyboard friendly.** Developers expect shortcuts: `/` to search, `⌘/Ctrl + K` command menu, `Esc` to close panels.

---

## 2. Information architecture and navigation

```
Landing (public)
└─ Sign in
   └─ App
      ├─ Home / Search            (default after sign-in)
      ├─ Generating (run view)    (/g/[slug] while status = generating)
      ├─ Guide                    (/g/[slug])
      │   ├─ Chat panel (right side / bottom sheet on mobile)
      │   ├─ Edit mode
      │   ├─ Agent edit proposal (diff view)
      │   └─ Version history      (/g/[slug]/history)
      ├─ Library                  (all guides: mine + recently viewed + popular)
      └─ Settings                 (profile, usage limits, MCP API keys in v1.1)
```

**Top bar (all app screens):** logo (→ Home) · compact search field (`/` focuses it) · Library · avatar menu (Settings, Sign out). On mobile: logo, search icon, menu icon.

---

## 3. User journeys

### J1. First guide (core journey)
1. Home → types "LangGraph" → Enter.
2. No guide exists → navigates to `/g/langgraph` in **Generating** state.
3. Progress timeline fills in; outline appears with greyed sections; sections stream in.
4. "Guide ready" toast → page switches to Guide state; chat panel becomes available.
5. User asks a question in chat → gets a cited answer with an origin label.
6. Downloads PDF.

### J2. Existing guide
Home → types "langgraph" → opens `/g/langgraph` instantly (no generation). If older than 30 days: banner "Generated 41 days ago · Refresh" (Refresh enabled in v1.1).

### J3. Ambiguous name
Home → "Bun" → modal: "Which Bun do you mean?" with 2–3 cards (name, one-line description, domain) + "None of these, let me be more specific". Choosing resumes the run.

### J4. Improve the guide
Guide → "Ask agent to edit" → types "Add a section on streaming" → progress chip "Researching…" → **diff view** of proposed change → Accept (new version) or Reject.

### J5. Missing knowledge from chat
Chat answer with origin `not_found` → button "Research this and add to guide" → J4 flow from the diff step.

---

## 4. Screens

### 4.1 Landing (public)
- Hero: headline "Learn any technology from its official docs, in minutes." Sub-line explaining cited guides + chat.
- A looping, silent recording (or static illustration) of the progress panel filling in.
- Three short benefit blocks: *From official docs, not memory* · *Every fact cited* · *Chat that knows when it doesn't know*.
- CTA: "Sign in with GitHub" (primary), "Use email" (secondary).

### 4.2 Home / Search
- Centered, large search input (autofocus), placeholder: "Which technology do you want to learn? e.g. LangGraph, Supabase, Bun".
- Below: "Recently viewed" (up to 6 cards) and "Popular guides" (up to 6 cards).
- Guide card: technology name, version badge, last updated ("Updated 3 days ago"), status badge if partial/needs review.
- Typing shows suggestions from existing guides (fuzzy match on name + aliases); the first row is always "Generate a new guide for '…'" when no exact match.

### 4.3 Generating (run view)
Layout (desktop): two columns.

**Left (60%) – guide skeleton**
- Title + version once identified.
- Sections listed in outline order: each starts as a grey skeleton block with its title; when writing starts, text streams in with a subtle caret; when done, a check icon appears beside the heading.

**Right (40%) – progress timeline** (sticky)
```
✓ Identified LangGraph · v0.x · langchain-ai.github.io
✓ Found 184 documentation pages
✓ Planned 7 sections
⟳ Writing sections (4/7)
    ✓ What it is
    ✓ Installation
    ⟳ Core concepts
    ⟳ First example     · using Context7
○ Checking code examples
○ Done
```
- Each line can expand to show the source pages used (titles as links).
- Elapsed time shown at the bottom ("1m 12s").
- "You can leave this page; we'll keep working" note.

Mobile: progress timeline collapses to a sticky bar at the top ("Writing sections 4/7 ▾"), expandable.

### 4.4 Guide (read view)
Desktop layout: three regions.

| Left (220 px) | Centre (max 760 px) | Right (380 px, collapsible) |
|---|---|---|
| Table of contents, sticky, current section highlighted | Guide content | Chat panel |

**Guide header**
- Title, version badge, "Generated from official docs · 23 sources", last updated.
- Actions: **Chat** (toggles panel) · **Edit** · **Ask agent to edit** · **Download PDF** · overflow menu (Version history, Copy link, Refresh v1.1).

**Content**
- Section headings with anchor links.
- Inline citations as small superscript pill `[3]`; hover/focus shows a card: page title, domain, 2-line snippet, "Open page ↗".
- Code blocks: language label, copy button, horizontal scroll (no wrapping on screen).
- "Needs review" callout at top of a flagged section (amber).
- Sources list at the end of the guide, numbered.

### 4.5 Chat panel
- Header: "Ask about LangGraph" + clear chat button.
- Empty state: 3 suggested questions generated from the outline (e.g. "How do I add memory?").
- Message list:
  - User messages right aligned, subtle background.
  - Assistant messages left aligned, Markdown + code, citations as pills linking to sources.
  - **Origin label** under each assistant message:
    - `From your guide` (neutral)
    - `From stored docs` (neutral)
    - `Fetched from official docs just now` (blue, with lightning icon)
    - `Not covered in the docs` (amber) + button "Research and add to guide"
- While working: a compact status line under the pending message, changing as the graph moves: "Searching your knowledge…" → "Checking the answer…" → "Looking in official docs and Context7…" → "Writing answer…".
- Input: multiline, `Enter` to send, `Shift+Enter` new line, 2,000-char counter appears after 1,500.
- Mobile: chat opens as a full-height bottom sheet from a floating "Ask" button.

### 4.6 Edit mode
- Each section becomes editable in place (Markdown editor with preview toggle).
- Sticky bar at bottom: "Unsaved changes · Change note [input] · Cancel · Save as new version".
- Leaving with unsaved changes shows a confirm dialog.

### 4.7 Agent edit proposal (diff view)
- Modal or full-page panel showing the proposed change:
  - New section: shown with green left border.
  - Modified section: side-by-side (desktop) or stacked (mobile) diff, additions green, removals red strike-through.
- Sources used for the change listed below.
- Actions: **Accept** (primary) · **Reject** · "Ask for changes" (text input → regenerates proposal).

### 4.8 Version history
- List: version number, author (avatar / "Agent"), change note, timestamp.
- Selecting a version shows it read-only with a banner: "Viewing v3 · Restore this version".
- Restore asks for confirmation and creates a new version.

### 4.9 Library
- Tabs: My guides (forks) · Recently viewed · All guides.
- Grid of guide cards; search/filter by name; sort by updated date.

### 4.10 Settings
- Profile (name, avatar from provider).
- Usage today: generations x/5, messages x/100, edits x/20 with progress bars and reset time.
- MCP access (v1.1): create key (shown once, copy button), list keys with revoke, setup snippet for Claude Desktop / Cursor.

---

## 5. States (loading / empty / error)

| Screen / component | Loading | Empty | Error |
|---|---|---|---|
| Home suggestions | 3 skeleton rows | "No guide yet, generate one" row | Silent; search still works |
| Recently viewed | Skeleton cards | "Guides you open will appear here" | Hide section |
| Generating | Timeline + skeleton sections | — | Failed step turns red with reason; actions: "Retry", "Enter docs URL manually"; any completed sections kept as partial draft |
| Guide | Skeleton header + content | — | "Couldn't load guide" + Retry |
| Chat | Status line under pending message | Suggested questions | Inline error under message: "Something went wrong · Retry"; 429: "Daily chat limit reached · resets in 5h 20m" |
| Edit proposal | "Researching…" with timeline | — | "Couldn't create a proposal" + Retry |
| PDF | Button shows spinner "Preparing PDF…" | — | Toast: "PDF failed · Download Markdown instead" |
| Limits | — | — | Clear message with reset time, never a generic error |

Toasts appear bottom-right (desktop) / top (mobile), auto-dismiss after 5 s except errors.

---

## 6. Components

| Component | Notes |
|---|---|
| SearchInput (large + compact) | Suggestions dropdown, keyboard navigation, `/` shortcut |
| GuideCard | Name, version badge, updated time, status badge |
| ProgressTimeline | Steps with icons: done ✓, active spinner, pending ○, failed ✕; expandable details |
| SectionSkeleton / StreamingSection | Skeleton → streaming text → done |
| CitationPill + SourcePopover | Keyboard focusable; popover on hover/focus |
| CodeBlock | Language label, copy, line numbers optional |
| OriginLabel | 4 variants as in 4.5 |
| ChatMessage, ChatInput, ChatStatusLine | |
| MarkdownEditor | Edit/preview toggle |
| DiffView | Side-by-side / stacked responsive |
| VersionList | |
| DisambiguationDialog | Option cards + "None of these" |
| UsageMeter | Progress bar + reset time |
| Banner (info / warning) | Stale guide, needs review, viewing old version |
| Toast, Dialog, Tooltip, Tabs, Skeleton | from shadcn/ui |

---

## 7. Visual design

### Colour tokens (light / dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #FAFAF9 | #0E1012 | Page background |
| `--surface` | #FFFFFF | #16191C | Cards, panels |
| `--surface-2` | #F3F3F1 | #1D2125 | Code blocks, hover |
| `--border` | #E5E4E0 | #2A2F34 | Dividers |
| `--text` | #1A1A19 | #ECECEA | Body |
| `--text-muted` | #6B6A66 | #9A9C9E | Secondary |
| `--accent` | #2F5BEA | #6E8EFF | Primary actions, links, active step |
| `--success` | #1F8A4C | #3CC57A | Completed steps, additions |
| `--warning` | #B26B00 | #F0A93B | Needs review, not covered |
| `--danger` | #C23B32 | #F0675D | Errors, removals |
| `--fetched` | #0F7FA6 | #3BB7DE | "Fetched just now" label |

All text/background pairs meet WCAG AA (4.5:1 for body text). Dark mode follows system preference with a manual toggle.

### Typography
- **UI and body:** Inter (or Geist Sans), 16 px base, line-height 1.65 for guide prose, 1.5 for UI.
- **Code:** JetBrains Mono (or Geist Mono), 14 px, line-height 1.6.
- Scale: 12 · 14 · 16 · 18 · 22 · 28 · 36 px. Guide H1 28/36, H2 22, H3 18.
- Headings weight 600; body 400; avoid more than two weights per screen.

### Spacing and layout
- 4 px base unit; common steps 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 8 px (inputs, cards), 12 px (panels, dialogs), full (pills).
- Shadows: minimal; use borders for separation, shadow only on popovers/dialogs.
- Max content width 760 px for guide text.

### Motion
- 150–200 ms ease-out for hovers, panel open/close.
- Streaming text: no per-character animation, just append; a blinking caret at the end.
- Respect `prefers-reduced-motion` (disable caret blink and skeleton shimmer).

---

## 8. Responsive behaviour

| Breakpoint | Layout |
|---|---|
| ≥ 1280 px | TOC + content + chat (three regions) |
| 1024–1279 px | Content + chat; TOC as dropdown in header |
| 768–1023 px | Content full width; chat as right drawer (overlay) |
| < 768 px | Single column; TOC in a "Contents" sheet; chat as full-height bottom sheet via floating "Ask" button; generating view uses collapsible progress bar |

Touch targets ≥ 44 × 44 px. Code blocks scroll horizontally; the page never scrolls horizontally.

---

## 9. Accessibility

- Semantic landmarks: `header`, `nav` (TOC), `main` (guide), `aside` (chat).
- All interactive elements reachable by keyboard; visible focus ring (2 px `--accent`, 2 px offset).
- Progress timeline uses `aria-live="polite"` for step changes (not for every streamed token).
- Chat new answers announced via `aria-live="polite"` when complete.
- Citation pills have accessible names: "Source 3: LangGraph Persistence docs".
- Colour is never the only signal: origin labels and diff changes also use icons/text.
- Forms have labels; errors linked with `aria-describedby`.

---

## 10. Microcopy guidelines

- Plain and specific: "Found 184 documentation pages", not "Processing data…".
- Honest about limits: "The official docs don't cover this."
- Action buttons are verbs: "Download PDF", "Accept change", "Restore this version".
- Avoid AI hype words ("magic", "supercharge").

---

## 11. PDF layout

- A4, 20 mm margins.
- Cover block: title, version, "Generated from official documentation on <date>", source count.
- TOC on page 1 (if > 4 sections).
- Body typography as on screen (Inter 11 pt, code 9.5 pt), code blocks wrap within the page with a light background, never cut off.
- Citations rendered as `[n]`; full numbered source list with URLs at the end.
- Footer: page number and technology name.
