import type { ChatOrigin } from "../../src/lib/agents/chat";

/** What kind of question it is, which is also what we expect to happen to it. */
export type Group = "stored" | "outside" | "not_found";

/** One line of questions.jsonl: a question, and where its answer should come from. */
export type ChatQuestion = {
  id: string;
  /** The slug of a technology that exists in the database (nodejs, java, ...). */
  technology: string;
  group: Group;
  question: string;
  /** Any of these origins counts as right (the guide and stored docs are both "already stored"). */
  expected: ChatOrigin[];
  /**
   * Words an answer should use: at least ONE of them must appear. A cheap stand-in for "correct";
   * it cannot tell a right answer from a wrong one that names the right function.
   */
  mentions?: string[];
};

/** What happened when the real chat graph answered one question. */
export type Asked = {
  origin: ChatOrigin;
  /** The final grade, or null if the question failed before grading. */
  grade: "GOOD" | "PARTIAL" | "BAD" | null;
  reply: string;
  /** Titles (or addresses) of the sources the answer cited. */
  cited: string[];
  /** Outside calls made while answering: all zero means the stored text was enough. */
  calls: { context7: number; search: number; fetch: number };
  firstTokenMs: number;
  totalMs: number;
  /** Set when the graph threw, instead of an answer. */
  error?: string;
};

/** A question, its answer and the verdict on it. */
export type Judged = {
  question: ChatQuestion;
  asked: Asked;
  originOk: boolean;
  /** null when there is nothing to check (no `mentions`, or the question should be refused). */
  mentionsOk: boolean | null;
  /** null when the answer should have no citations (a refusal). */
  citedOk: boolean | null;
  pass: boolean;
};
