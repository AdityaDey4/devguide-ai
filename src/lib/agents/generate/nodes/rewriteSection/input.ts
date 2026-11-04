import { Annotation } from "@langchain/langgraph";
import {
  mergeBudget,
  newBudget,
  type Budget,
  type BudgetUpdate,
} from "../../../shared/budget";
import type { OutlineSection, SectionDraft, TechnologyInfo } from "../../state";

// What ONE rewriter receives: the section, its failing draft (which carries the sources it was
// written from) and how many rewrites it has already had.

export const RewriteInput = Annotation.Root({
  runId: Annotation<string>,
  technology: Annotation<TechnologyInfo>,
  section: Annotation<OutlineSection>,
  draft: Annotation<SectionDraft>,
  attempts: Annotation<number>,
  budget: Annotation<Budget, BudgetUpdate>({
    reducer: mergeBudget,
    default: () => newBudget(),
  }),
});

export type RewriteInputType = typeof RewriteInput.State;
