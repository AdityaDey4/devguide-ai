import type { Tables, TablesInsert } from "./database.types";

// Short names for the rows of each table, so code reads `Chunk` instead of
// `Database["public"]["Tables"]["chunks"]["Row"]`.
// database.types.ts is generated (npm run db:types): never edit it, add names here.

export type TechnologyRow = Tables<"technologies">;
export type SourceRow = Tables<"sources">;
export type ChunkRow = Tables<"chunks">;
export type ChunkInsert = TablesInsert<"chunks">;
