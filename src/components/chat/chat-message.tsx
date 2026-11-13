import type { ChatCitation, ChatOrigin } from "@/lib/agents/chat";
import { linkAnswer } from "@/lib/chat/markers";
import { Button } from "@/components/ui/button";
import { GuideMarkdown } from "@/components/guide/guide-markdown";
import { OriginLabel } from "./origin-label";

// One question and its answer in the chat panel (M6): the question on the right, the answer on
// the left as Markdown with its sources listed under it.

/** One question and what became of it. The page keeps these; nothing is saved (M6). */
export type Turn = {
  id: number;
  question: string;
  answer: string;
  citations: ChatCitation[];
  /** Where the answer came from; known once the answer is finished. */
  origin?: ChatOrigin;
  /** waiting: the answer is being written (it may already have some text). */
  status: "waiting" | "done" | "error";
  error?: string;
};

export function ChatMessage({
  turn,
  onRetry,
}: {
  turn: Turn;
  onRetry: () => void;
}) {
  return (
    <li className="space-y-3">
      <p className="bg-surface-2 ml-auto w-fit max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">
        {turn.question}
      </p>

      {turn.status === "waiting" && turn.answer === "" && (
        <p role="status" className="text-muted-foreground text-sm">
          Searching the guide and docs…
        </p>
      )}
      {turn.answer !== "" && (
        <div className="max-w-full text-sm [&_p]:my-2 [&_p]:leading-6">
          <GuideMarkdown>
            {linkAnswer(turn.answer, turn.citations)}
          </GuideMarkdown>
        </div>
      )}

      {turn.status === "done" && turn.origin && (
        <OriginLabel origin={turn.origin} />
      )}

      {turn.status === "done" && turn.citations.length > 0 && (
        <ul
          aria-label="Sources"
          className="text-muted-foreground space-y-0.5 text-xs"
        >
          {turn.citations.map((citation) => (
            <li key={citation.n} className="flex gap-1.5">
              <span className="w-5 shrink-0 text-right">{citation.n}.</span>
              {citation.url ? (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary break-words underline underline-offset-2"
                >
                  {citation.title}
                </a>
              ) : (
                <span>{citation.title} (this guide)</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {turn.status === "error" && (
        <p
          role="alert"
          className="text-destructive flex flex-wrap items-center gap-2 text-sm"
        >
          {turn.error ?? "Something went wrong."}
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </p>
      )}
    </li>
  );
}
