"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

export function LoginForm() {
  const params = useSearchParams();
  // Only allow same-site relative paths, never an external URL.
  const rawNext = params.get("next") ?? "/search";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/search";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(
    params.get("error")
      ? { kind: "error", message: "Sign-in failed. Please try again." }
      : { kind: "idle" },
  );

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWithGitHub() {
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: redirectTo() },
    });
    if (error) setStatus({ kind: "error", message: error.message });
  }

  async function signInWithEmail(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "sending" });
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setStatus(
      error ? { kind: "error", message: error.message } : { kind: "sent" },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" size="lg" onClick={signInWithGitHub}>
        Sign in with GitHub
      </Button>

      <div className="text-muted-foreground flex items-center gap-3 text-sm">
        <span className="bg-border h-px flex-1" />
        or
        <span className="bg-border h-px flex-1" />
      </div>

      <form onSubmit={signInWithEmail} className="flex flex-col gap-3">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby="login-status"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={status.kind === "sending"}
        >
          {status.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>

      <p id="login-status" aria-live="polite" className="min-h-5 text-sm">
        {status.kind === "sent" && "Check your email for the sign-in link."}
        {status.kind === "error" && (
          <span className="text-destructive">{status.message}</span>
        )}
      </p>
    </div>
  );
}
