"use client";

import { SendIcon } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { MAX_QUESTION_CHARS } from "@/lib/chat/request";

// The question box of the chat panel (M6): Enter sends, Shift+Enter starts a new line. The
// length limit is the server's; the counter shows near it.

const SHOW_COUNTER_FROM = 800;

export function ChatInput({
  busy,
  onSend,
}: {
  /** An answer is being written: one question at a time. */
  busy: boolean;
  onSend: (question: string) => void;
}) {
  const [value, setValue] = useState("");

  function send(event?: FormEvent) {
    event?.preventDefault();
    const question = value.trim();
    if (!question || busy) return;
    onSend(question);
    setValue("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: Enter that confirms a character (Japanese, Chinese...) must not send
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      send(event);
    }
  }

  return (
    <form onSubmit={send} className="border-t p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MAX_QUESTION_CHARS}
          aria-label="Your question"
          placeholder="Ask a question…"
          className="border-input focus-visible:ring-ring/50 max-h-40 min-h-12 w-full resize-y rounded-lg border bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:ring-3"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send"
          disabled={busy || value.trim() === ""}
        >
          <SendIcon aria-hidden />
        </Button>
      </div>
      {value.length >= SHOW_COUNTER_FROM && (
        <p className="text-muted-foreground mt-1 text-right text-xs">
          {value.length}/{MAX_QUESTION_CHARS}
        </p>
      )}
    </form>
  );
}
