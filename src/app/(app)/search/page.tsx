import type { Metadata } from "next";

export const metadata: Metadata = { title: "Search" };

// Placeholder Home. The real search box arrives in M4.
export default function SearchPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold">
        Which technology do you want to learn?
      </h1>
      <p className="text-muted-foreground mt-2">
        You are signed in. Search comes in M4.
      </p>
    </main>
  );
}
