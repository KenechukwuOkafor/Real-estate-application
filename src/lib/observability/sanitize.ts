/**
 * Redaction for anything leaving the process — Sentry events and structured logs.
 *
 * BR-OBS-003 (Critical) and ADR-026 both say sensitive data is never
 * transmitted. This is the single place that decides what that means, so the
 * rule is enforced once rather than remembered at every call site.
 *
 * Two independent passes, because either alone leaks:
 *
 *  - By key. `{ authorization: "..." }` is a secret whatever it contains.
 *  - By value. A JWT or a signed URL is a secret whatever it is called — and it
 *    is usually called something innocent, like `url` or `next`.
 *
 * Value matching is what catches the realistic accident: nobody logs
 * `{ password }` on purpose, but plenty of code logs a whole request object
 * that happens to contain a signed URL.
 *
 * Deliberately fails closed. Anything that cannot be reasoned about — an
 * unknown class instance, a structure past the depth limit — is replaced rather
 * than passed through, because a redactor that emits what it does not
 * understand is not a redactor.
 */

export const REDACTED = "[redacted]";

/**
 * Keys that are secret regardless of value.
 *
 * `document` and `storage_path` are here because verification documents are
 * identity papers; ADR-026 names them explicitly and REB privacy rules list
 * them beside passwords.
 */
const SECRET_KEY_PATTERN =
  /(authorization|cookie|set-cookie|token|secret|password|passwd|api[-_]?key|apikey|credential|private[-_]?key|signature|session[-_]?id|dsn|storage[-_]?path|document|payload|clerk[-_]?secret|service[-_]?role)/i;

/** Values that are secret regardless of key. */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  // A JWT: three base64url segments. Clerk session tokens and Supabase keys.
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/,
  // Bearer credentials.
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  // Clerk and Supabase key prefixes.
  /\b(sk|pk)_(test|live)_[A-Za-z0-9]{8,}\b/,
  // A signed URL. Supabase storage signs with ?token=, S3 with X-Amz-Signature.
  /[?&](token|signature|x-amz-signature|x-amz-credential|sig)=/i,
  // Verification document object paths, which identify a person's ID papers.
  /\bverification\/[0-9a-f-]{8,}\//i,
];

const MAX_DEPTH = 6;
const MAX_STRING = 2_000;

function isSecretKey(key: string) {
  return SECRET_KEY_PATTERN.test(key);
}

function looksSecret(value: string) {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Redact a string, preserving enough to be useful.
 *
 * A URL keeps its origin and path so a report still says *which* endpoint was
 * involved; only the query string, where the signature lives, is dropped.
 */
export function sanitizeString(value: string): string {
  if (looksSecret(value)) {
    const url = tryParseUrl(value);

    if (url) {
      return `${url.origin}${url.pathname}?${REDACTED}`;
    }

    return REDACTED;
  }

  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
}

function tryParseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Recursively redact a value for transmission.
 *
 * Returns a structurally similar value with secrets replaced. Never throws:
 * a redactor that can fail would take the error report down with it, and the
 * report is the thing we are trying not to lose.
 */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > MAX_DEPTH) {
    return "[depth-limit]";
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  // A function's source can close over secrets, and it is never useful in a
  // report.
  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      message: sanitizeString(value.message),
      name: value.name,
      stack: value.stack ? sanitizeString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1));
  }

  if (value instanceof Map || value instanceof Set) {
    return sanitize(
      value instanceof Map ? Object.fromEntries(value) : Array.from(value),
      depth + 1,
    );
  }

  if (typeof value === "object") {
    // Only plain objects are walked. An unknown class may have getters with
    // side effects or hold a live connection; describing it is safer than
    // serialising it.
    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      return `[${value.constructor?.name ?? "object"}]`;
    }

    const out: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      out[key] = isSecretKey(key) ? REDACTED : sanitize(item, depth + 1);
    }

    return out;
  }

  return "[unserializable]";
}

/**
 * Redact a Sentry event in place-ish, returning the sanitized copy.
 *
 * Headers, cookies and query strings are dropped wholesale rather than
 * inspected. The request URL keeps its path — knowing which route failed is the
 * point of the report — but never its query string.
 */
export function sanitizeEvent<T extends Record<string, unknown>>(event: T): T {
  const next = { ...event } as Record<string, unknown>;

  const request = next.request as Record<string, unknown> | undefined;

  if (request) {
    const url = typeof request.url === "string" ? tryParseUrl(request.url) : null;

    next.request = {
      ...request,
      cookies: undefined,
      data: sanitize(request.data),
      headers: undefined,
      query_string: undefined,
      url: url ? `${url.origin}${url.pathname}` : sanitize(request.url),
    };
  }

  if (next.extra) {
    next.extra = sanitize(next.extra);
  }

  if (next.contexts) {
    next.contexts = sanitize(next.contexts);
  }

  if (next.tags) {
    next.tags = sanitize(next.tags);
  }

  if (Array.isArray(next.breadcrumbs)) {
    next.breadcrumbs = next.breadcrumbs.map((crumb) => sanitize(crumb));
  }

  // Never send the user's own identifiers beyond the app-level id. ADR-026
  // allows a user id; it does not allow an email or an IP.
  const user = next.user as Record<string, unknown> | undefined;

  if (user) {
    next.user = { id: user.id };
  }

  return next as T;
}
