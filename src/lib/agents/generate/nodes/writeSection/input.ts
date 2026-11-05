import { Annotation } from "@langchain/langgraph";
import {
  mergeBudget,
  newBudget,
  type Budget,
  type BudgetUpdate,
} from "../../../shared/budget";
import type { OutlineSection, TechnologyInfo } from "../../state";

// What ONE section writer receives. The graph sends one of these per section (the Send API), so
// each writer sees only its own section, not the whole state.

export const WriteInput = Annotation.Root({
  runId: Annotation<string>,
  technology: Annotation<TechnologyInfo>,
  section: Annotation<OutlineSection>,
  budget: Annotation<Budget, BudgetUpdate>({
    reducer: mergeBudget,
    default: () => newBudget(),
  }),
});

export type WriteInputType = typeof WriteInput.State;

/** A documentation page as the writer sees it: cleaned, numbered from 1 for citations. */
export type Material = {
  n: number;
  url: string;
  title: string;
  markdown: string;
};
