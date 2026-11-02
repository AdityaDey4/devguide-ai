import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: fast, offline, no database, no OpenAI. Run with `npm test`; CI runs them too.
export default defineConfig({
  resolve: {
    // "@/lib/..." means "src/lib/...", the same alias the app uses.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
