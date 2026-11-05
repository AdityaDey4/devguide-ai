import { Annotation } from "@langchain/langgraph";
import {
  mergeBudget,
  newBudget,
  type Budget,
  type BudgetUpdate,
} from "../shared/budget";

// What the generation graph remembers between steps (docs/03-Architecture.md section 5.1).
// It is saved with every checkpoint, so everything here is plain JSON.

export type TechnologyInfo = {
  id: string;
  name: string;
  slug: string;
  officialUrl: string;
  docsUrl: string;
  version: string | null;
};

/** A possible match when the name is ambiguous. */
export type Candidate = { name: string; description: string; url: string };

export type DocPage = { url: string; title: string };

export type OutlineSection = {
  key: string;
  title: string;
  goal: string;
  /** 1 to 4 pages from `discoveredPages` that feed this section. */
  pageUrls: string[];
  codeHeavy: boolean;
};

export type SectionDraft = {
  title: string;
  markdown: string;
  citations: { n: number; url: string; title: string }[];
  /**
   * The numbered pages the section was written from, as the writer saw them (cut to fit). Kept so
   * the checker and the rewriter need no new downloads, even after a restart. Not saved in the guide.
   */
  sources: { n: number; url: string; title: string; markdown: string }[];
  status: "draft" | "ok" | "needs_review";
  issues?: string[];
};

/** A value that is simply replaced by the newest one. */
const latest = <T>(initial: () => T) =>
  Annotation<T>({ reducer: (_old, value) => value, default: initial });

/** A record that parallel nodes add their own keys to without overwriting each other. */
const merged = <T>() =>
  Annotation<Record<string, T>>({
    reducer: (all, added) => ({ ...all, ...added }),
    default: () => ({}),
  });

export const GenerateState = Annotation.Root({
  runId: latest<string>(() => ""),
  /** What the person typed, or the refined name after "None of these". */
  query: latest<string>(() => ""),
  /** The page of the candidate the person picked, until identify has used it. */
  chosenUrl: latest<string | null>(() => null),
  technology: latest<TechnologyInfo | null>(() => null),
  candidates: latest<Candidate[]>(() => []),
  discoveredPages: latest<DocPage[]>(() => []),
  outline: latest<OutlineSection[]>(() => []),
  sections: merged<SectionDraft>(),
  checkAttempts: merged<number>(),
  /** Set when the finished guide is saved. */
  guideId: latest<string | null>(() => null),
  versionId: latest<string | null>(() => null),
  budget: Annotation<Budget, BudgetUpdate>({
    reducer: mergeBudget,
    default: () => newBudget(),
  }),
});

export type GenerateStateType = typeof GenerateState.State;
export type GenerateUpdate = typeof GenerateState.Update;
