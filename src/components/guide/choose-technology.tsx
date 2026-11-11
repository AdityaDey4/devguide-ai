"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Candidate } from "@/lib/guide/progress";

// "Which one do you mean?" (M5, SRS FR-SRCH-4, FR-SRCH-5). Shown while a run waits because the
// name could mean 2 or 3 technologies. The answer goes to POST /api/runs/<id> and the run carries
// on; this dialog then closes by itself.
//
//   [ Bun (JavaScript runtime) ]   one button per candidate
//   [ Bun (build tool)         ]
//   None of these -> a box for a more specific name

export function ChooseTechnology({
  runId,
  candidates,
}: {
  runId: string;
  candidates: Candidate[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [refining, setRefining] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // A native modal dialog: it traps the keyboard focus and is announced by screen readers.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function answer(body: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${runId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setSent(true);
        return;
      }
      const failure: unknown = await response.json().catch(() => null);
      const message =
        failure && typeof failure === "object" && "error" in failure
          ? String(failure.error)
          : null;
      setError(message ?? "Could not send your choice. Please try again.");
    } catch {
      setError("Could not reach the server. Check your connection.");
    }
    setBusy(false);
  }

  function refine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    answer({ choice: "refine", query: name.trim() });
  }

  if (sent) {
    return (
      <p role="status" className="mt-4 text-sm">
        Thanks, continuing…
      </p>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      // Escape must not close it: the run is waiting for an answer.
      onCancel={(event) => event.preventDefault()}
      aria-labelledby="choose-title"
      className="bg-surface text-foreground m-auto w-full max-w-lg rounded-xl border p-6 shadow-lg backdrop:bg-black/50"
    >
      <h2 id="choose-title" className="text-lg font-semibold">
        Which one do you mean?
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        That name could be more than one technology.
      </p>

      <ul className="mt-4 space-y-2">
        {candidates.map((candidate) => (
          <li key={candidate.url}>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                answer({ choice: "candidate", url: candidate.url })
              }
              className="hover:bg-surface-2 focus-visible:ring-ring/50 w-full rounded-lg border p-3 text-left focus-visible:ring-3 disabled:opacity-50"
            >
              <span className="block font-medium">{candidate.name}</span>
              <span className="text-muted-foreground block text-sm">
                {candidate.description}
              </span>
              <span className="text-muted-foreground block text-xs break-all">
                {candidate.url}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {refining ? (
        <form onSubmit={refine} className="mt-4 flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            autoFocus
            disabled={busy}
            aria-label="A more specific name"
            placeholder="A more specific name"
          />
          <Button type="submit" disabled={busy || name.trim().length < 2}>
            Search again
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setRefining(true)}
          className="text-primary mt-4 text-sm underline underline-offset-2"
        >
          None of these
        </button>
      )}

      {error && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {error}
        </p>
      )}
    </dialog>
  );
}
