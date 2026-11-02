import { existsSync } from "node:fs";

// Integration tests talk to the real local database, so they need the keys from .env.local.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
