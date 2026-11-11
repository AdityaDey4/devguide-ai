import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { GuideView } from "@/components/guide/guide-view";
import { RunFailed } from "@/components/guide/run-failed";
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

const ACTIVE = ["queued", "running", "waiting_user"];

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ run?: string; q?: string }>;
};

export default function GuidePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<GuideSkeleton />}>
      <GuideOrProgress params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GuideOrProgress({ params, searchParams }: Props) {
  // The session check below reads the clock (token expiry): request time, on purpose.
  await connection();
  const { slug } = await params;
  const { run, q } = await searchParams;
  const supabase = await createClient();

  const guide = await loadGuide(supabase, slug);
  const runId = z.uuid().safeParse(run);
  const query = q?.trim() ? q : slug; // the name that was searched, for Retry

  // What the run in the address is doing decides first: a failed run shows why (and offers
  // Retry), a run still going is watched even if an older guide or draft exists.
  if (runId.success) {
    const { data: runRow } = await supabase
      .from("runs")
      .select("status, error, technology_id")
      .eq("id", runId.data)
      .maybeSingle();
    if (runRow?.status === "failed") {
      return (
        <RunFailed
          error={runRow.error ?? "Something went wrong."}
          query={query}
          draftHref={await draftLink(supabase, runRow.technology_id, slug)}
        />
      );
    }
    if (runRow && ACTIVE.includes(runRow.status)) {
      return <RunProgress key={runId.data} runId={runId.data} query={query} />;
    }
  }

  if (guide) return <GuideView guide={guide} />;
  if (runId.success) {
    return <RunProgress key={runId.data} runId={runId.data} query={query} />;
  }

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

/** A link to the draft the failed run left behind, if it left one. */
async function draftLink(
  supabase: Awaited<ReturnType<typeof createClient>>,
  technologyId: string | null,
  slug: string,
): Promise<string | undefined> {
  // The run may know the technology under its real slug, not the one in the address.
  const { data: technology } = technologyId
    ? await supabase
        .from("technologies")
        .select("slug")
        .eq("id", technologyId)
        .maybeSingle()
    : { data: null };
  const draftSlug = technology?.slug ?? slug;
  return (await loadGuide(supabase, draftSlug)) ? `/g/${draftSlug}` : undefined;
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
