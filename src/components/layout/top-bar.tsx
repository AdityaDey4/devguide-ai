import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SearchField } from "./search-field";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

// Top bar for all signed-in screens (04-UI-UX §2):
// logo -> Home, compact search (`/` focuses it), Library, theme toggle, account menu.
// On small screens: logo, search icon, theme toggle, account menu (Library moves into the menu).
export function TopBar({ email }: { email: string }) {
  return (
    <header className="bg-surface sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4 sm:px-6">
      <Link
        href="/search"
        className="shrink-0 text-base font-semibold tracking-tight"
      >
        DevGuide AI
      </Link>

      <div className="flex flex-1 justify-center">
        <SearchField />
      </div>

      <nav aria-label="Main" className="flex items-center gap-1">
        <Link
          href="/library"
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "hidden h-11 px-3 md:inline-flex",
          )}
        >
          Library
        </Link>
        <Link
          href="/search"
          aria-label="Search"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "size-11 md:hidden",
          )}
        >
          <SearchIcon aria-hidden className="size-5" />
        </Link>
        <ThemeToggle />
        <UserMenu email={email} />
      </nav>
    </header>
  );
}
