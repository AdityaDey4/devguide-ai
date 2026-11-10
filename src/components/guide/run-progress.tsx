"use client";

import { CheckIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { z } from "zod";
import { buttonVariants } from "@/components/ui/button";
import { emptyProgress, foldEvents, type Progress } from "@/lib/guide/progress";
import { GuideMarkdown } from "./guide-markdown";

// The page you see while a guide is being written (M4).
//
// Asks GET /api/runs/<id>/events every 2 seconds, starting from event 0, so a reload simply
// replays the run and carries on. When the run is completed it moves to the finished guide; if
// it fails, it says why.

const POLL_MS = 2000;

const Answer = z.object({
  status: z.string(),
  error: z.string().nullable(),
  slug: z.string().nullable(),
  events: z.array(
    z.object({
      id: z.number(),
      type: z.string(),
      payload: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});

export function RunProgress({ runId }: { runId: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [status, setStatus] = useState("queued");
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<"ok" | "lost">("ok");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seen = emptyProgress;

    async function poll() {
      try {
        const response = await fetch(
          `/api/runs/${runId}/events?after=${seen.lastId}`,
        );
        if (!response.ok) throw new Error(String(response.status));
        const answer = Answer.parse(await response.json());
        if (stopped) return;

        seen = foldEvents(seen, answer.events);
        setProgress(seen);
        setStatus(answer.status);
        setError(answer.error);
        setConnection("ok");

        if (answer.status === "completed") {
          router.replace(answer.slug ? `/g/${answer.slug}` : "/search");
          return;
        }
        if (answer.status === "failed") return;
      } catch {
        if (!stopped) setConnection("lost");
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [runId, router]);

  if (status === "failed") {
    return (
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold">
          We could not create this guide
        </h1>
        <p role="alert" className="text-muted-foreground mt-3">
          {error ?? "Something went wrong."}
        </p>
        <Link href="/search" className={buttonVariants({ className: "mt-6" })}>
          Try another search
        </Link>
      </main>
    );
  }

  const written = progress.sections.filter((s) => s.status === "done").length;
  const total = progress.sections.length;
  const steps = [
    {
      done: progress.name !== null,
      text: progress.name
        ? `Identified ${progress.name}${progress.version ? ` · v${progress.version}` : ""}`
        : "Identifying the technology",
    },
    ...(progress.name
      ? [
          {
            done: progress.pages !== null,
            text:
              progress.pages !== null
                ? `Found ${progress.pages} documentation pages`
                : "Looking for the documentation",
          },
        ]
      : []),
    ...(total > 0
      ? [
          {
            done: written === total,
            text: `Writing sections (${written}/${total})`,
          },
        ]
      : []),
    ...(progress.checking
      ? [{ done: false, text: "Checking the sections against the sources" }]
      : []),
  ];
  const doneSections = progress.sections.filter((s) => s.status === "done");

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold">
        Writing your guide{progress.name ? `: ${progress.name}` : ""}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        This takes a few minutes. You can reload this page; it will pick up
        where it is.
      </p>

      <ol aria-live="polite" className="mt-6 space-y-2">
        {steps.map((step) => (
          <li key={step.text} className="flex items-center gap-2 text-sm">
            {step.done ? (
              <CheckIcon aria-hidden className="text-primary size-4" />
            ) : (
              <Loader2Icon aria-hidden className="size-4 animate-spin" />
            )}
            <span>{step.text}</span>
          </li>
        ))}
      </ol>

      {status === "waiting_user" && (
        <p role="status" className="mt-4 rounded-lg border p-3 text-sm">
          This name could mean more than one technology and needs a choice. That
          step is not built yet.
        </p>
      )}
      {connection === "lost" && (
        <p role="status" className="text-muted-foreground mt-4 text-sm">
          Connection lost. Trying again…
        </p>
      )}

      {doneSections.map((section) => (
        <section key={section.key} className="mt-8 border-t pt-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CheckIcon aria-hidden className="text-primary size-4" />
            {section.title}
          </h2>
          <GuideMarkdown>{section.text}</GuideMarkdown>
        </section>
      ))}
    </main>
  );
}
