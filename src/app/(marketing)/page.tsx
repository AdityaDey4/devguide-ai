import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Placeholder landing page; real content comes in M8.
export default function LandingPage() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center gap-6 px-6"
    >
      <h1 className="text-4xl font-semibold tracking-tight">
        Learn any technology from its official docs, in minutes.
      </h1>
      <p className="text-muted-foreground text-lg">
        Cited guides, and a chat that knows when it doesn&apos;t know.
      </p>
      <Link href="/login" className={buttonVariants({ size: "lg" })}>
        Sign in
      </Link>
    </main>
  );
}
