import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

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
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">DevGuide AI</span>
        <form action={signOut} className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            {data.user.email}
          </span>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </header>
      {children}
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}
