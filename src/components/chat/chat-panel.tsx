"use client";

import { MessageCircleIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { askChat } from "@/lib/chat/client";
import { ChatInput } from "./chat-input";
import { ChatMessage, type Turn } from "./chat-message";

// Chat next to a guide (M6, docs/04-UI-UX.md section 4.5).
//
// The conversation lives in this component's state: reload the page and it is gone (saving it is
// a later task). Each question is sent with the earlier finished ones, so "and a URL?" can be
// understood. On a wide screen the panel sits beside the guide; on a narrow one it opens over the
// page from the "Ask" button.
//
//   types "How do I validate an email?" + Enter
//     -> a new turn appears, the answer grows as it streams in, then its sources are listed

const HISTORY_TURNS = 10; // 10 questions + 10 answers = the 20 messages the route accepts

export function ChatPanel({ slug, name }: { slug: string; name: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [open, setOpen] = useState(false); // narrow screens only
  const nextId = useRef(1);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const busy = turns.some((turn) => turn.status === "waiting");
  const lastDone = turns.findLast((turn) => turn.status === "done");

  // keep the newest text in view while the answer grows
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);
  // leaving the page stops a running answer
  useEffect(() => () => abort.current?.abort(), []);

  function update(id: number, change: Partial<Turn>) {
    setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...change } : t)));
  }

  async function ask(question: string, earlier: Turn[]) {
    const id = nextId.current++;
    setTurns([
      ...earlier,
      { id, question, answer: "", citations: [], status: "waiting" },
    ]);

    const history = earlier
      .filter((turn) => turn.status === "done")
      .slice(-HISTORY_TURNS)
      .flatMap((turn) => [
        { role: "user" as const, content: turn.question },
        { role: "assistant" as const, content: turn.answer },
      ]);

    abort.current = new AbortController();
    let text = "";
    const outcome = await askChat(
      { slug, question, history },
      {
        onText: (piece) => update(id, { answer: (text += piece) }),
        onCitations: (citations) => update(id, { citations }),
      },
      abort.current.signal,
    );
    if (abort.current.signal.aborted) return; // cleared or left: nothing to show
    update(
      id,
      outcome.ok
        ? { status: "done" }
        : { status: "error", error: outcome.error },
    );
  }

  function clear() {
    abort.current?.abort();
    setTurns([]);
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-30 h-11 rounded-full px-4 shadow-lg lg:hidden"
      >
        <MessageCircleIcon aria-hidden /> Ask
      </Button>

      <aside
        aria-label={`Ask about ${name}`}
        className={`bg-background flex-col ${open ? "fixed inset-0 z-50 flex" : "hidden"} lg:sticky lg:top-14 lg:z-auto lg:flex lg:h-[calc(100vh-3.5rem)] lg:w-96 lg:shrink-0 lg:border-l`}
      >
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="truncate font-semibold">Ask about {name}</h2>
          <div className="flex shrink-0 gap-1">
            {turns.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clear}
                aria-label="Clear chat"
              >
                <Trash2Icon aria-hidden />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="lg:hidden"
            >
              <XIcon aria-hidden />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {turns.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Ask anything about {name}. Answers come from this guide and the
              stored documentation, with their sources.
            </p>
          ) : (
            <ol className="space-y-6">
              {turns.map((turn) => (
                <ChatMessage
                  key={turn.id}
                  turn={turn}
                  onRetry={() =>
                    !busy &&
                    ask(
                      turn.question,
                      turns.filter((t) => t.id !== turn.id),
                    )
                  }
                />
              ))}
            </ol>
          )}
          <div ref={endRef} />
        </div>

        {/* a finished answer is read out once, not word by word */}
        <p aria-live="polite" className="sr-only">
          {lastDone?.answer}
        </p>

        <ChatInput busy={busy} onSend={(question) => ask(question, turns)} />
      </aside>
    </>
  );
}
