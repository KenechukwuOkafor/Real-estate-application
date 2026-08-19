/**
 * Loads .env.local into process.env for tests that talk to real services.
 *
 * Unit tests do not need this — they mock the repositories. The RLS
 * integration suites do: they mint real Clerk tokens and query the local
 * Supabase. When the file is absent (CI), nothing is loaded and those suites
 * skip via rlsIntegrationEnabled() rather than failing.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const envPath = join(process.cwd(), ".env.local");

if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    // Never clobber a value the shell already set.
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
