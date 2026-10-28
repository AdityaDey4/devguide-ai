import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { createClient } from "@/lib/supabase/server";

// proxy.ts only does an optimistic redirect. The real check happens here, on the server,
// behind Suspense because reading the session is a request-time read.
async function AuthGate({ children }: { children: React.ReactNode }) {
  // Token-expiry checks read the clock, so opt in to request time explicitly.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <>
      <TopBar email={data.user.email ?? ""} />
      {children}
    </>
  );
}

// Same height as the real bar, so nothing jumps when the session resolves.
function TopBarFallback() {
  return (
    <header className="bg-surface sticky top-0 z-40 flex h-14 items-center border-b px-4 sm:px-6">
      <span className="text-base font-semibold tracking-tight">
        DevGuide AI
      </span>
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<TopBarFallback />}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}
