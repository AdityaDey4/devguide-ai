import { createServiceClient } from "../../../supabase/service";
import type { Json } from "../../../supabase/database.types";
import type { EventRow } from "./types";

// The real way to save an event: one insert into `run_events` with the service role (the
// browser may only read this table). Supabase Realtime then pushes the row to anyone watching.

export async function insertEvent(row: EventRow): Promise<void> {
  const { error } = await createServiceClient()
    .from("run_events")
    .insert({ ...row, payload: row.payload as Json });
  if (error)
    throw new Error(`Could not save a ${row.type} event: ${error.message}`);
}
