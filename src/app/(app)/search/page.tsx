import type { Metadata } from "next";
import { SearchForm } from "@/components/search/search-form";

export const metadata: Metadata = { title: "Search" };

// Home: one question, one box (04-UI-UX §4.2). Suggestions and recent guides come later.
export default function SearchPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="mb-6 text-2xl font-semibold">
        Which technology do you want to learn?
      </h1>
      <SearchForm />
    </main>
  );
}
