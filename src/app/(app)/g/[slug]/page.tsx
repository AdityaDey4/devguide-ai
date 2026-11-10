import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { GuideView } from "@/components/guide/guide-view";
import { RunProgress } from "@/components/guide/run-progress";
import { buttonVariants } from "@/components/ui/button";
import { loadGuide } from "@/lib/guide/load";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Guide" };

// /g/<slug>            a finished guide  -> read it
// /g/<slug>?run=<id>   a guide being written -> watch the run (reload-safe), then show the guide
// /g/<slug>            nothing there yet -> say so and point to search
//
// Route params and the session are request-time reads, so they sit behind Suspense.

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ run?: string | string[] }>;
};

export default function GuidePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<GuideSkeleton />}>
      <GuideOrProgress params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GuideOrProgress({ params, searchParams }: Props) {
  const { slug } = await params;
  const { run } = await searchParams;

  const guide = await loadGuide(await createClient(), slug);
  if (guide) return <GuideView guide={guide} />;

  const runId = z.uuid().safeParse(run);
  if (runId.success) return <RunProgress runId={runId.data} />;

  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold">No guide here yet</h1>
      <p className="text-muted-foreground mt-3">
        Search for the technology to create its guide.
      </p>
      <Link href="/search" className={buttonVariants({ className: "mt-6" })}>
        Go to search
      </Link>
    </main>
  );
}

function GuideSkeleton() {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="bg-surface-2 h-8 w-1/3 animate-pulse rounded" />
      <div className="bg-surface-2 mt-6 h-4 w-full animate-pulse rounded" />
      <div className="bg-surface-2 mt-3 h-4 w-5/6 animate-pulse rounded" />
    </main>
  );
}
