"use client";

import { DownloadIcon, HistoryIcon, MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { pdfName } from "@/lib/guide/pdf";

// The "more" menu in a guide's header (M8, M9): the less used actions, so the header shows one
// button (Edit) and this menu.
//
//   Download PDF  opens the browser's print dialog, where "Save as PDF" makes the file (SRS FR-PDF-1).
//                 What is printed is the version on screen, shaped by the print rules in globals.css.
//                 The page title is set to the file name while the dialog is open, because the dialog
//                 proposes it as the name (FR-PDF-3).
//   History       opens the list of versions (M8).
export function GuideMenu({
  slug,
  versionNo,
}: {
  slug: string;
  versionNo: number;
}) {
  function print() {
    // Let the menu close first, so it is not on the page being printed.
    setTimeout(() => {
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
    }, 100);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More actions"
        className="hover:bg-muted flex size-9 items-center justify-center rounded-lg border"
      >
        <MoreHorizontalIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 print:hidden">
        <DropdownMenuItem onClick={print}>
          <DownloadIcon aria-hidden /> Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="?versions=1" />}>
          <HistoryIcon aria-hidden /> History
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
