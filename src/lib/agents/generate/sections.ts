// The seven standard sections of every guide (PRD F2, SRS FR-GEN-4). The planner does not
// choose them: it only decides which documentation pages feed each one.

export type SectionDefinition = {
  key: string;
  title: string;
  /** What the section must answer; the writer is held to this. */
  goal: string;
  /** Sections that are mostly code get Context7 snippets as extra material. */
  codeHeavy: boolean;
};

export const SECTIONS: readonly SectionDefinition[] = [
  {
    key: "what-it-is",
    title: "What it is",
    goal: "Explain what the technology is in one paragraph, then give a one-sentence summary.",
    codeHeavy: false,
  },
  {
    key: "why-use-it",
    title: "Why use it, and when not to",
    goal: "Say what problems it solves, who it suits, and when something else is a better choice.",
    codeHeavy: false,
  },
  {
    key: "installation",
    title: "Installation and setup",
    goal: "Show how to install it and the minimal setup needed before writing code.",
    codeHeavy: true,
  },
  {
    key: "core-concepts",
    title: "Core concepts",
    goal: "Explain the few ideas a newcomer must understand, each with a small example.",
    codeHeavy: true,
  },
  {
    key: "first-example",
    title: "Your first working example",
    goal: "Walk through one small, complete, runnable example from start to finish.",
    codeHeavy: true,
  },
  {
    key: "gotchas",
    title: "Common mistakes and gotchas",
    goal: "List the mistakes beginners make and the surprises in how it behaves, with fixes.",
    codeHeavy: false,
  },
  {
    key: "next-steps",
    title: "Next steps and key links",
    goal: "Point to what to learn next and the most useful official documentation pages.",
    codeHeavy: false,
  },
];

export const SECTION_KEYS = SECTIONS.map((section) => section.key);

/** Every section is written from 1 to 4 documentation pages (SRS FR-GEN-4). */
export const MIN_PAGES_PER_SECTION = 1;
export const MAX_PAGES_PER_SECTION = 4;
