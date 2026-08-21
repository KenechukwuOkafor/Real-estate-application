/**
 * Storage paths for fixtures, in the shape production actually writes.
 *
 * Five suites built these with `crypto.randomUUID()`, which returns a UUID
 * **v4**. BR-MEDIA-004 requires **v7**, and `media-storage-rls.test.ts` asserts
 * it across every row in `listing_images` and `verification_documents` — not
 * just the ones it created.
 *
 * That combination produced a genuinely confusing failure. The offending
 * fixture belonged to a different suite, so the test that failed was one nobody
 * had touched, naming a `storage_path` from somewhere else entirely. It only
 * appeared when a suite failed partway and skipped its own teardown, leaving a
 * row behind for the next run to trip over — so it moved between runs and
 * between files.
 *
 * The lesson is the fixture-fidelity one: a fixture that writes a value
 * production cannot write is not a shortcut, it is a state under test that
 * does not exist. Use this rather than `crypto.randomUUID()` for anything that
 * lands in a storage path.
 *
 * Mirrors `uuidv7()` in listing-media-service, which cannot be imported here —
 * it is behind `server-only`, and pulling a service into a fixture helper to
 * borrow one function is a worse trade than eighteen lines.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);

  let timestamp = Date.now();
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }

  crypto.getRandomValues(bytes.subarray(6));

  // Version 7 in the high nibble of byte 6, variant 0b10 in the top bits of
  // byte 8. These are the two nibbles the assertion actually checks.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/** A listing image path: `listings/<listingId>/<uuidv7>.webp`. */
export function listingImagePath(listingId: string) {
  return `listings/${listingId}/${uuidv7()}.webp`;
}
