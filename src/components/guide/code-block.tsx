"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

// A code block with a copy button (M4). Copies exactly the text on screen.
export function CodeBlock({ children }: { children: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const code = preRef.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. an insecure page): the text can still be selected by hand.
    }
  }

  return (
    <div className="group bg-surface-2 relative my-4 rounded-lg border">
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="text-muted-foreground hover:text-foreground bg-surface absolute top-2 right-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
      >
        {copied ? (
          <CheckIcon className="size-3.5" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre
        ref={preRef}
        tabIndex={0}
        className="overflow-x-auto p-4 pr-20 font-mono text-sm leading-relaxed"
      >
        {children}
      </pre>
    </div>
  );
}
