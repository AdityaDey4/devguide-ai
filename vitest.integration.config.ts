import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests: need the local Supabase running (`npx supabase start`) and .env.local.
// Run with `npm run test:integration`. CI does not run these (it has no database).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 60_000,
    // One file at a time: they share one database.
    fileParallelism: false,
  },
});
