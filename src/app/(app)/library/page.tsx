import type { Metadata } from "next";

export const metadata: Metadata = { title: "Library" };

// Placeholder. Guide cards and tabs arrive with the guide views (04-UI-UX §4.9).
export default function LibraryPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold">Library</h1>
      <p className="text-muted-foreground mt-2">
        Guides you open will appear here.
      </p>
    </main>
  );
}
