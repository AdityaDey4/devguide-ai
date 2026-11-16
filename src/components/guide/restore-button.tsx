"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { restoreGuideVersion } from "@/lib/guide/client";

// "Restore this version" on an older version of the person's own copy (M8). The restore is saved
// as a new version, so nothing is lost; the page then shows it.
export function RestoreButton({
  guideId,
  slug,
  versionNo,
}: {
  guideId: string;
  slug: string;
  versionNo: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setError(null);
    const result = await restoreGuideVersion(guideId, versionNo);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/g/${slug}`);
    router.refresh();
  }

  return (
    <div>
      <Button type="button" onClick={restore} disabled={busy}>
        {busy ? "Restoring…" : "Restore this version"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
