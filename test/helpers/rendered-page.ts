/**
 * Render a protected page headlessly, as a known persona.
 *
 * This exists because there was no way to check an authenticated surface
 * without a browser. Admin and agent pages sit behind `clerkMiddleware` with
 * `auth.protect()`, so every check on them was a typecheck plus an assumption —
 * and the assumption was disclaimed in review each time, which is worse than
 * fixing it once.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 *
 * `Authorization: Bearer <session jwt>` is Clerk's MACHINE-REQUEST path. It is
 * not what a browser sends — a browser holds a `__session` cookie and goes
 * through Clerk's handshake, which this deliberately skips.
 *
 * So this verifies SERVER-RENDERED OUTPUT: the HTML the server produced for an
 * authenticated principal. That is what most portal surfaces are, and it is
 * enough to catch a field that is missing, a value read from the wrong column,
 * or a page that renders nothing at all.
 *
 * It CANNOT catch:
 *   - hydration mismatches, or anything that only goes wrong once React takes
 *     over on the client,
 *   - client-side redirects and guards,
 *   - anything requiring interaction — a click, a form submit, focus, scroll,
 *   - Clerk's browser handshake itself, which is bypassed here and is a real
 *     source of "works in tests, redirects in the browser".
 *
 * Anything genuinely interactive still needs a real browser. Do not read a
 * passing render test as evidence that a page works; read it as evidence that
 * the server sent the right HTML. Those are different claims and the gap
 * between them is where the bugs this cannot see will live.
 *
 * Verified empirically before this helper was written: the cookie forms return
 * 404 and only the bearer header returns 200. If that changes, this helper
 * stops working rather than silently degrading — a 404 is not mistakable for a
 * rendered page.
 * ---------------------------------------------------------------------------
 *
 * LOCAL ONLY, DELIBERATELY.
 *
 * These need a running application, which CI does not have. Rather than skip in
 * CI — the pipeline asserts zero skipped tests, and a suite that skips there
 * verifies nothing — they live outside the default `src/**` test include and
 * run only via `npm run test:rendered` against a local `npm run dev`.
 *
 * There is deliberately no CI job that builds and starts the app to run these.
 * That is a ~90 second build on every run for a class of bug that has not yet
 * escaped. If a rendering defect ever reaches main, that is the evidence for
 * adding one — not before.
 *
 * THE LEDGER. That bet has cost something once already: an assertion here went
 * stale when 5c552c5 made live listings changeable through review, and it sat
 * failing on main across a merge because CI cannot run it. A stale test rather
 * than a broken page — no user saw anything — but it is instance one.
 *
 * One instance is the tradeoff. A second is evidence: add the CI job. Record it
 * in the ledger under "The Rendered Suites Are Local-Only" in
 * docs/engineering-bible/Engineering/engineering-quality.md, because the count
 * is the argument.
 *
 * Until then the mitigation is procedural: RUN `npm run test:rendered` BEFORE
 * OPENING A PR THAT TOUCHES A RENDERED SURFACE.
 */
import { DEV_AUTH_USERS } from "@/lib/auth/dev-auth";

const CLERK_API = "https://api.clerk.com/v1";

export type PersonaLabel = (typeof DEV_AUTH_USERS)[number]["label"];

export type RenderedPage = {
  status: number;
  /** Raw HTML, for assertions that care about markup. */
  html: string;
  /**
   * Tags stripped and whitespace collapsed.
   *
   * Assert against this by default. Matching raw HTML couples a test to markup
   * it does not care about, so a class name change breaks an assertion about a
   * price.
   */
  text: string;
  /** Where a redirect pointed, when the server issued one. */
  location: string | null;
};

function baseUrl() {
  return (
    process.env.RENDER_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

function secret() {
  const key = process.env.CLERK_SECRET_KEY;

  if (!key) {
    throw new Error("CLERK_SECRET_KEY is required to render a page as a persona.");
  }

  return key;
}

async function clerk<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${CLERK_API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
    },
    method: body === undefined ? "GET" : "POST",
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Clerk ${path} -> ${response.status}: ${text.slice(0, 300)}`);
  }

  return (text ? JSON.parse(text) : null) as T;
}

function personaClerkUserId(label: PersonaLabel) {
  const persona = DEV_AUTH_USERS.find((user) => user.label === label);

  if (!persona) {
    throw new Error(`Unknown persona: ${label}`);
  }

  return persona.clerkUserId;
}

function toText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function get(path: string, headers: Record<string, string>): Promise<RenderedPage> {
  const response = await fetch(`${baseUrl()}${path}`, {
    headers,
    // Manual, so a redirect is an observable result rather than something the
    // helper silently follows into a different page than the one asked for.
    redirect: "manual",
  });

  const html = response.status === 200 ? await response.text() : "";

  return {
    html,
    location: response.headers.get("location"),
    status: response.status,
    text: toText(html),
  };
}

/**
 * Render a page as one of the four known personas.
 *
 * A fresh Clerk session is created per call and revoked afterwards, even when
 * the request throws. Sessions are cheap but they are real, and leaving them
 * active would accumulate live sessions on a shared Clerk instance for a
 * persona anyone else might also be using.
 */
export async function renderAsPersona(
  path: string,
  persona: PersonaLabel,
): Promise<RenderedPage> {
  const session = await clerk<{ id: string }>("/sessions", {
    user_id: personaClerkUserId(persona),
  });

  try {
    const { jwt } = await clerk<{ jwt: string }>(`/sessions/${session.id}/tokens`, {});

    return await get(path, { authorization: `Bearer ${jwt}` });
  } finally {
    // Best effort. A failure to revoke must not turn a passing assertion into a
    // failing test — the session expires on its own regardless.
    await clerk(`/sessions/${session.id}/revoke`, {}).catch(() => undefined);
  }
}

/** Render a public page with no session at all. Models an anonymous visitor. */
export async function renderAnonymously(path: string): Promise<RenderedPage> {
  return get(path, {});
}

/**
 * Throw unless a page can actually be rendered.
 *
 * Two preconditions fail for completely different reasons — no credentials, or
 * no server — and this reports which. An earlier version returned a bare
 * boolean and the caller printed one message covering both; the first time it
 * fired, the server was running fine and the message sent me looking at
 * credentials. A gate whose failure is ambiguous costs more than it saves.
 *
 * The timeout is generous on purpose. `next dev` compiles a route on first
 * request, so a cold server can take several seconds to answer its first hit —
 * which is exactly when this runs. A tight timeout here reports "no server" for
 * a server that is merely busy starting.
 */
export async function assertCanRenderPages() {
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error(
      "CLERK_SECRET_KEY is not set. Rendered-page suites mint a real Clerk " +
        "session; put it in .env.local.",
    );
  }

  try {
    await fetch(baseUrl(), { signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new Error(
      `No application answering at ${baseUrl()}. Start it with \`npm run dev\`. ` +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
}
