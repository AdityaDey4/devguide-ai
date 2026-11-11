"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { guideHref, startSearch } from "@/lib/search/client";

// What you see when a run failed (M5): the reason, and a way forward.
//
//   Retry               searches the same name again with `retry`, so a NEW run starts (or the
//                       run another person already restarted is joined)
//   Open partial draft  only when the failed run left a draft behind
//   Try another search  back to Home
export function RunFailed({
  error,
  query,
  draftHref,
}: {
  error: string;
  /** The name that was searched, to send again. */
  query: string;
  draftHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setProblem(null);
    const result = await startSearch(query, true);
    if (!result.ok) {
      setProblem(result.error);
      setBusy(false);
      return;
    }
    router.replace(guideHref(result.answer, query));
  }

  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold">We could not create this guide</h1>
      <p role="alert" className="text-muted-foreground mt-3">
        {error}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={retry} disabled={busy}>
          {busy ? "Retrying…" : "Retry"}
        </Button>
        {draftHref && (
          <Link
            href={draftHref}
            className={buttonVariants({ variant: "outline" })}
          >
            Open the partial draft
          </Link>
        )}
        <Link href="/search" className={buttonVariants({ variant: "ghost" })}>
          Try another search
        </Link>
      </div>

      {problem && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {problem}
        </p>
      )}
    </main>
  );
}
