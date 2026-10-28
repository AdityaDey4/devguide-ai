import { parsePublicEnv } from "./env.schema";

// Public variables only; safe to import from client and server code.
// Each NEXT_PUBLIC_* must be referenced by its full name so Next can inline it.
export const publicEnv = parsePublicEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
