"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

// Compact search in the top bar. `/` focuses it, `Esc` leaves it (04-UI-UX §1, §6).
// Submits to /search?q=...; the real search and suggestions arrive in M4.
export function SearchField() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");

      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      } else if (
        event.key === "Escape" &&
        document.activeElement === inputRef.current
      ) {
        inputRef.current?.blur();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <form
      action="/search"
      role="search"
      className="relative hidden w-full max-w-sm md:block"
    >
      <SearchIcon
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
      />
      <Input
        ref={inputRef}
        name="q"
        type="search"
        autoComplete="off"
        aria-label="Search technologies"
        aria-keyshortcuts="/"
        placeholder="Search technologies"
        className="h-9 pr-8 pl-8"
      />
      <kbd
        aria-hidden
        className="text-muted-foreground bg-surface-2 pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1.5 font-mono text-xs"
      >
        /
      </kbd>
    </form>
  );
}
