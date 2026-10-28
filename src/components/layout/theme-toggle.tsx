"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

// Both icons are always rendered and CSS picks one by the `dark` class,
// so there is no hydration mismatch before the theme is known.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon aria-hidden className="size-5 dark:hidden" />
      <MoonIcon aria-hidden className="hidden size-5 dark:block" />
    </Button>
  );
}
