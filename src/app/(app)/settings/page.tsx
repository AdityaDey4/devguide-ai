import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

// Placeholder. Profile and usage meters arrive in M7 (04-UI-UX §4.10).
export default function SettingsPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-muted-foreground mt-2">
        Profile and daily usage limits will appear here.
      </p>
    </main>
  );
}
