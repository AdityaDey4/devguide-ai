import Link from "next/link";
import { UserMenu } from "./user-menu";

// Top bar for all signed-in screens (04-UI-UX §2): the logo (-> Home) and the account menu
// (dark/light mode, Sign out). Search, Library and Settings are left out for now.
export function TopBar({ email }: { email: string }) {
  return (
    <header className="bg-surface sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b px-4 sm:px-6 print:hidden">
      <Link
        href="/search"
        className="shrink-0 text-base font-semibold tracking-tight"
      >
        DevGuide AI
      </Link>
      <UserMenu email={email} />
    </header>
  );
}
