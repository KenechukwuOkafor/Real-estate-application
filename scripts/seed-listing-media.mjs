#!/usr/bin/env node
/**
 * Uploads placeholder objects for the seeded listing images.
 *
 * seed.sql can create listing_images rows but not storage objects — the bytes
 * live in the storage service, not Postgres, so a SQL-only seed produces
 * metadata pointing at nothing. That was tolerable while the bucket was public
 * and the rows carried Unsplash URLs; with a private bucket and signed reads,
 * a path with no object behind it yields a signed URL that 404s.
 *
 * Idempotent: skips any object that already exists.
 *
 *   node scripts/seed-listing-media.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

const BUCKET = "property-images";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
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

/**
 * A 1x1 WEBP. Real bytes with a real WEBP header, so the bucket's
 * allowed_mime_types accepts it and a signed URL returns something a browser
 * will render rather than a zero-length file.
 */
const WEBP_1X1 = Buffer.from(
  "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
  "base64",
);

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      "\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n",
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from("listing_images")
    .select("storage_path")
    .order("storage_path");

  if (error) {
    console.error(`\nCould not read listing_images: ${error.message}\n`);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("No listing_images rows. Run `supabase db reset` first.");
    return;
  }

  let uploaded = 0;
  let skipped = 0;

  for (const row of rows) {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(row.storage_path, WEBP_1X1, {
        contentType: "image/webp",
        upsert: false,
      });

    if (uploadError) {
      if (/exists/i.test(uploadError.message)) {
        skipped += 1;
        continue;
      }
      console.error(`  ! ${row.storage_path}: ${uploadError.message}`);
      process.exitCode = 1;
      continue;
    }

    uploaded += 1;
  }

  console.log(`\n${BUCKET}: ${uploaded} uploaded, ${skipped} already present.\n`);
}

main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
