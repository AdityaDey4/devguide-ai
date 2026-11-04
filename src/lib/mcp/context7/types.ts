/** One code snippet from Context7, ready to be used as a numbered source. */
export type Snippet = {
  /** e.g. "Define and parse schemas with Zod". */
  title: string;
  /** The page it came from, so it can be cited like any other source. Always https. */
  url: string;
  /** The snippet as Markdown (a short description and a code block). */
  markdown: string;
};

/** A library Context7 knows, from `resolve-library-id`. */
export type Library = { id: string; title: string };

/** One open connection to Context7: call its tools, then close it. */
export type Session = {
  call: (tool: string, args: Record<string, string>) => Promise<string>;
  close: () => Promise<void>;
};

/** What fetchSnippets needs from the outside. Tests pass fakes here. */
export type Context7Deps = {
  open: () => Promise<Session>;
  /** Something went wrong and the snippets were skipped. The run goes on. */
  onError: (error: unknown) => void;
};
