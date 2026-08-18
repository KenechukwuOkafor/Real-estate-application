#!/usr/bin/env node
/**
 * Idempotent setup for the four local development personas.
 *
 * Creates each persona in Clerk if absent, skips it if present, and prints the
 * real user_... id for each. Safe to re-run; safe to point at a brand new Clerk
 * instance, which is the point — standing up a fresh instance should be one
 * command rather than four trips through the dashboard.
 *
 *   node scripts/setup-clerk-personas.mjs          # create or report
 *   node scripts/setup-clerk-personas.mjs --json   # machine-readable output
 *
 * Requires CLERK_SECRET_KEY and CLERK_DEV_PERSONA_PASSWORD. Both are read from
 * the environment or .env.local. The password is never defaulted and never
 * written here: if it is missing the script fails rather than inventing one,
 * because a predictable password on a real Clerk instance is a real account.
 *
 * On email domains: Clerk rejects addresses at TLDs that do not resolve, so
 * ruvo.local and ruvo.test are both refused with "Email address must be a
 * valid email address". These use Clerk's +clerk_test convention on
 * example.com, which development instances accept, which bypasses email
 * verification, and which can never deliver mail to a real inbox.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CLERK_API = "https://api.clerk.com/v1";

export const PERSONAS = [
  {
    email: "ruvo_student+clerk_test@example.com",
    firstName: "Ruvo",
    key: "student",
    lastName: "Student",
    note: "Seeker: browses listings, saves, requests inspections.",
  },
  {
    email: "ruvo_agent_verified+clerk_test@example.com",
    firstName: "Prime Homes",
    key: "agentVerified",
    lastName: "Nsukka",
    note: "Verified agent with submission slots and the public listings.",
  },
  {
    email: "ruvo_agent_new+clerk_test@example.com",
    firstName: "Campus Keys",
    key: "agentUnverified",
    lastName: "Property",
    note: "Brand-new agent: unverified, no slots.",
  },
  {
    email: "ruvo_admin+clerk_test@example.com",
    firstName: "Ruvo",
    key: "admin",
    lastName: "Admin",
    note: "Admin: moderation and verification review.",
  },
];

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");

  if (!existsSync(path)) {
    return;
  }

  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function requireEnv(key, hint) {
  const value = process.env[key];

  if (!value) {
    console.error(`\nMissing ${key}.\n\n${hint}\n`);
    process.exit(1);
  }

  return value;
}

async function clerk(secret, path, init) {
  const response = await fetch(`${CLERK_API}${path}`, {
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    method: init?.method ?? "GET",
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail =
      parsed?.errors?.[0]?.long_message ?? parsed?.errors?.[0]?.message ?? text;
    throw new Error(`Clerk ${init?.method ?? "GET"} ${path} -> ${response.status}: ${detail}`);
  }

  return parsed;
}

async function findByEmail(secret, email) {
  const results = await clerk(
    secret,
    `/users?email_address=${encodeURIComponent(email)}&limit=1`,
  );

  return Array.isArray(results) && results.length > 0 ? results[0] : null;
}

export async function setupPersonas({ log = console.log } = {}) {
  loadEnvLocal();

  const secret = requireEnv(
    "CLERK_SECRET_KEY",
    "Add it to .env.local. Clerk Dashboard -> Configure -> API keys.",
  );
  const password = requireEnv(
    "CLERK_DEV_PERSONA_PASSWORD",
    [
      "Set a strong value in .env.local, for example:",
      "",
      "  CLERK_DEV_PERSONA_PASSWORD=$(openssl rand -base64 24)",
      "",
      "It is deliberately not defaulted. These are real accounts on a real",
      "Clerk instance, and a predictable password is a real way in.",
    ].join("\n"),
  );

  const resolved = {};

  for (const persona of PERSONAS) {
    const existing = await findByEmail(secret, persona.email);

    if (existing) {
      resolved[persona.key] = existing.id;
      log(`  = ${persona.key.padEnd(16)} ${existing.id}  (exists)`);
      continue;
    }

    const created = await clerk(secret, "/users", {
      body: {
        email_address: [persona.email],
        first_name: persona.firstName,
        last_name: persona.lastName,
        password,
        skip_password_checks: true,
      },
      method: "POST",
    });

    resolved[persona.key] = created.id;
    log(`  + ${persona.key.padEnd(16)} ${created.id}  (created)`);
  }

  return resolved;
}

const isDirectRun =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());

if (isDirectRun) {
  const asJson = process.argv.includes("--json");

  setupPersonas({ log: asJson ? () => {} : console.log })
    .then((resolved) => {
      if (asJson) {
        console.log(JSON.stringify(resolved, null, 2));
        return;
      }

      console.log("\nPersona ids (these belong in supabase/seed.sql):\n");
      for (const persona of PERSONAS) {
        console.log(`  ${persona.key.padEnd(16)} ${resolved[persona.key]}`);
        console.log(`  ${" ".repeat(16)} ${persona.email}`);
        console.log(`  ${" ".repeat(16)} ${persona.note}\n`);
      }
    })
    .catch((error) => {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    });
}
