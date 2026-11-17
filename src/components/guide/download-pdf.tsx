"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pdfName } from "@/lib/guide/pdf";

// "Download PDF" (M9, SRS FR-PDF-1): opens the browser's print dialog, where "Save as PDF" makes the
// file. What is printed is the version on screen, shaped by the print rules in globals.css. The page
// title is set to the file name while the dialog is open, because the dialog proposes it as the name.
export function DownloadPdf({
  slug,
  versionNo,
}: {
  slug: string;
  versionNo: number;
}) {
  function print() {
    const title = document.title;
    document.title = pdfName(slug, versionNo);
    // Some browsers fire afterprint late or not at all, so the title is also put back on a timer.
    const restore = () => {
      document.title = title;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
    setTimeout(restore, 1000);
  }

  return (
    <Button type="button" variant="outline" onClick={print}>
      <DownloadIcon aria-hidden className="size-4" />
      Download PDF
    </Button>
  );
}
