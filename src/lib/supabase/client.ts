import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env.client";

// Browser client: only ever uses the public anon key (RLS applies).
export function createClient() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
