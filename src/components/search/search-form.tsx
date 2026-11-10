"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The big search box on Home (M4): a plain input and a submit button, nothing else yet.
//
//   types "LangGraph", presses Enter
//     -> POST /api/search { q: "LangGraph" }          (the next M4 task builds this route)
//     -> { slug: "langgraph" }                 a guide exists: opens /g/langgraph
//     -> { slug: "hono", runId: "…" }          a new run:      opens /g/hono?run=…  (progress)
//                                              (the guide page is the next M4 task)
//
// The length rule (2 to 60 characters after trimming) is checked here for a quick message and
// again on the server, which is the check that counts.

const MIN_CHARS = 2;
const MAX_CHARS = 60;

function parseAnswer(body: unknown): { slug: string; runId?: string } | null {
  if (!body || typeof body !== "object" || !("slug" in body)) return null;
  const slug = String(body.slug);
  const runId = "runId" in body ? String(body.runId) : undefined;
  return { slug, runId };
}

export function SearchForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    if (q.length < MIN_CHARS || q.length > MAX_CHARS) {
      setError(`Type ${MIN_CHARS} to ${MAX_CHARS} characters.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q }),
      });
      const body: unknown = await response.json().catch(() => null);
      const answer = response.ok ? parseAnswer(body) : null;
      if (!answer) {
        setError("Could not start the search. Please try again.");
        setBusy(false);
        return;
      }
      router.push(
        answer.runId
          ? `/g/${answer.slug}?run=${answer.runId}`
          : `/g/${answer.slug}`,
      );
    } catch {
      setError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} role="search" className="w-full">
      <div className="flex gap-2">
        <Input
          name="q"
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
          autoComplete="off"
          maxLength={MAX_CHARS}
          disabled={busy}
          aria-label="Technology name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "search-error" : undefined}
          placeholder="e.g. LangGraph, Supabase, Bun"
          className="h-12 text-base"
        />
        <Button type="submit" size="lg" disabled={busy} className="h-12 px-5">
          {busy ? "Searching…" : "Search"}
        </Button>
      </div>
      {error && (
        <p
          id="search-error"
          role="alert"
          className="text-destructive mt-2 text-sm"
        >
          {error}
        </p>
      )}
    </form>
  );
}
