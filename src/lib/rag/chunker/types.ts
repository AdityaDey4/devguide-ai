/** One searchable piece of a page. This is what gets embedded and stored. */
export type Chunk = {
  /** Markdown text of the piece. */
  content: string;
  /** Where it sits in the page, e.g. "Basic usage > Defining a schema". */
  headingPath: string;
  /** Exact token count of `content` (cl100k_base, the tokenizer of text-embedding-3-small). */
  tokens: number;
};

export type ChunkOptions = {
  /** Page title. Used as the heading path for text that comes before the first heading. */
  title?: string;
};

/** The page cut into its natural pieces: headings, fenced code blocks and plain text. */
export type Block =
  | { kind: "heading"; level: number; title: string; text: string }
  | { kind: "code"; text: string }
  | { kind: "text"; text: string };

/**
 * A "unit" is the smallest thing the packer moves around. It is one or more blocks that must
 * stay together: a heading with the text under it, or a sentence ending in ":" with its code.
 */
export type Unit = {
  /** Everything in the unit, joined by blank lines. */
  text: string;
  /** Text before the code block ("" if the unit has no code). */
  lead: string;
  /** The fenced code block, if the unit has one. */
  code?: string;
  tokens: number;
  /** Heading path at the end of the unit. */
  path: string[];
  /** True if the unit starts a new top-level section (a heading of level 1 or 2). */
  majorStart: boolean;
  /** True if the unit is repeated text copied from the previous chunk. */
  isOverlap?: boolean;
};
