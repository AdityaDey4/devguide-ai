import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSchema, serverSchema } from "../env.schema";
import type { Database } from "./database.types";

export type ServiceClient = SupabaseClient<Database>;

/**
 * A database client with the SERVICE ROLE key: it bypasses Row Level Security, so it can write
 * the shared tables (technologies, sources, chunks). Server code and scripts only; it must
 * never reach a browser. Reads the environment directly so it also works in scripts.
 */
export function createServiceClient(): ServiceClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "The service-role client must never be created in the browser",
    );
  }
  const { NEXT_PUBLIC_SUPABASE_URL } = publicSchema
    .pick({ NEXT_PUBLIC_SUPABASE_URL: true })
    .parse(process.env);
  const { SUPABASE_SERVICE_ROLE_KEY } = serverSchema
    .pick({ SUPABASE_SERVICE_ROLE_KEY: true })
    .parse(process.env);

  return createClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
