import { describe, expect, it } from "vitest";

import { REDACTED, sanitize, sanitizeEvent } from "@/lib/observability/sanitize";

/**
 * Realistic shapes, not placeholders. A sanitiser tested against "secret123"
 * proves nothing about a JWT.
 */
const CLERK_JWT =
  "eyJhbGciOiJSUzI1NiIsImtpZCI6Imluc18yYWJjIn0" +
  ".eyJzdWIiOiJ1c2VyXzJhYmMiLCJleHAiOjE3NjcyMjU2MDB9" +
  ".QkxBSF9TSUdOQVRVUkVfQkxBSF9CTEFIX0JMQUg";

const SESSION_COOKIE = "__session=" + CLERK_JWT + "; Path=/; HttpOnly; Secure";

const SIGNED_URL =
  "https://abcdefgh.supabase.co/storage/v1/object/sign/listing-media/" +
  "3c71e0a2/cover.jpg?token=" +
  CLERK_JWT;

const DOCUMENT_REF = "verification/9f8e7d6c-1234-4567-89ab-cdef01234567/passport.pdf";

/**
 * Assembled at runtime rather than written as a literal.
 *
 * A literal provider key in source trips GitHub's push protection, which
 * cannot tell an invented fixture from a real one - correctly, since that is
 * exactly what it exists to catch. The sanitiser sees the identical string
 * either way; only the scanner's view of the file changes.
 *
 * Do not "tidy" this back into a literal. It will block the next push.
 */
const PROVIDER_SECRET_KEY = ["sk", "live", "abcdefghijklmnopqrstuvwx"].join("_");

/** Everything the brief says must never be transmitted, in one object. */
const KITCHEN_SINK = {
  authorization: `Bearer ${CLERK_JWT}`,
  cookie: SESSION_COOKIE,
  nested: {
    deeper: {
      // Innocent key name, secret value. This is the realistic accident.
      next: SIGNED_URL,
      storage_path: DOCUMENT_REF,
    },
  },
  jobPayload: { message: "hello", token: CLERK_JWT },
  listOfUrls: [SIGNED_URL, "https://ruvo.example/listings/abc"],
  serviceRoleKey: PROVIDER_SECRET_KEY,
  harmless: "listing 3c71e0a2 published",
};

/** Every literal that must not survive, checked against the serialised output. */
const FORBIDDEN = [CLERK_JWT, "__session=", PROVIDER_SECRET_KEY, "token="];

describe("sanitize", () => {
  it("removes every secret in a payload containing all of them", () => {
    const serialised = JSON.stringify(sanitize(KITCHEN_SINK));

    for (const secret of FORBIDDEN) {
      expect(serialised).not.toContain(secret);
    }

    // The document reference must not survive either.
    expect(serialised).not.toContain("passport.pdf");
  });

  it("redacts by key regardless of value", () => {
    const out = sanitize({ authorization: "anything at all" }) as Record<string, unknown>;

    expect(out.authorization).toBe(REDACTED);
  });

  it("redacts by value regardless of key", () => {
    // The key is innocent. Only value matching catches this.
    const out = sanitize({ next: SIGNED_URL }) as Record<string, unknown>;

    expect(String(out.next)).not.toContain(CLERK_JWT);
  });

  it("keeps a signed URL's origin and path so a report still says which endpoint", () => {
    const out = String((sanitize({ next: SIGNED_URL }) as Record<string, unknown>).next);

    expect(out).toContain("abcdefgh.supabase.co");
    expect(out).toContain("/storage/v1/object/sign/listing-media/");
    expect(out).toContain(REDACTED);
  });

  it("preserves non-secret content, so reports stay useful", () => {
    const out = sanitize(KITCHEN_SINK) as Record<string, unknown>;

    expect(out.harmless).toBe("listing 3c71e0a2 published");
  });

  it("redacts secrets inside arrays", () => {
    const out = sanitize({ listOfUrls: [SIGNED_URL] }) as { listOfUrls: string[] };

    expect(out.listOfUrls[0]).not.toContain(CLERK_JWT);
  });

  it("redacts a secret embedded in an Error message", () => {
    const out = sanitize(new Error(`request failed: ${SIGNED_URL}`)) as {
      message: string;
    };

    expect(out.message).not.toContain(CLERK_JWT);
  });

  it("fails closed on an unknown class instance rather than serialising it", () => {
    class Connection {
      secret = CLERK_JWT;
    }

    expect(JSON.stringify(sanitize(new Connection()))).not.toContain(CLERK_JWT);
  });

  it("fails closed past the depth limit", () => {
    let deep: unknown = CLERK_JWT;
    for (let i = 0; i < 12; i += 1) deep = { deep };

    expect(JSON.stringify(sanitize(deep))).not.toContain(CLERK_JWT);
  });
});

describe("sanitizeEvent", () => {
  it("drops headers, cookies and query strings from a request", () => {
    const event = sanitizeEvent({
      request: {
        cookies: { __session: CLERK_JWT },
        data: { token: CLERK_JWT },
        headers: { authorization: `Bearer ${CLERK_JWT}` },
        query_string: `token=${CLERK_JWT}`,
        url: SIGNED_URL,
      },
    });

    const serialised = JSON.stringify(event);

    expect(serialised).not.toContain(CLERK_JWT);
    // The path survives: knowing which route failed is the point of the report.
    expect(serialised).toContain("/storage/v1/object/sign/listing-media/");
  });

  it("reduces the user to an id, never an email or an IP", () => {
    const event = sanitizeEvent({
      user: { email: "seeker@example.com", id: "u-123", ip_address: "41.58.1.9" },
    }) as { user: Record<string, unknown> };

    expect(event.user).toEqual({ id: "u-123" });
  });

  it("sanitises breadcrumbs, extra, tags and contexts", () => {
    const event = sanitizeEvent({
      breadcrumbs: [{ data: { url: SIGNED_URL } }],
      contexts: { job: { payload: { token: CLERK_JWT } } },
      extra: { cookie: SESSION_COOKIE },
      tags: { document: DOCUMENT_REF },
    });

    expect(JSON.stringify(event)).not.toContain(CLERK_JWT);
  });
});
