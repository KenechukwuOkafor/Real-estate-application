#!/usr/bin/env node
/**
 * Uploads placeholder objects for the seeded listing images and verification
 * documents.
 *
 * seed.sql can create rows but not storage objects — the bytes live in the
 * storage service, not Postgres, so a SQL-only seed produces metadata pointing
 * at nothing. That was tolerable while the bucket was public and the rows
 * carried Unsplash URLs; with a private bucket and signed reads, a path with
 * no object behind it yields a signed URL that 404s.
 *
 * Verification documents joined this for the same reason. The seeded verified
 * agent now has a real submission with a government ID behind it rather than a
 * bare 'verified' status, and an admin opening that submission has to get
 * bytes back from the signed URL rather than a 404.
 *
 * Idempotent: skips any object that already exists.
 *
 *   node scripts/seed-listing-media.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

/**
 * Each seeded table paired with the bucket its storage_path values live in.
 * Adding a third is a row here, not another copy of the upload loop.
 */
const SOURCES = [
  { bucket: "property-images", table: "listing_images" },
  { bucket: "verification-documents", table: "verification_documents" },
];

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

  for (const { bucket, table } of SOURCES) {
    const { data: rows, error } = await supabase
      .from(table)
      .select("storage_path")
      .order("storage_path");

    if (error) {
      console.error(`\nCould not read ${table}: ${error.message}\n`);
      process.exit(1);
    }

    if (!rows || rows.length === 0) {
      console.log(`No ${table} rows. Run \`supabase db reset\` first.`);
      continue;
    }

    let uploaded = 0;
    let skipped = 0;

    for (const row of rows) {
      const { error: uploadError } = await supabase.storage
        .from(bucket)
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

    console.log(`${bucket}: ${uploaded} uploaded, ${skipped} already present.`);
  }

  console.log("");
}

main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
