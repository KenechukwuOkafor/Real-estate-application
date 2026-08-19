/**
 * Clerk token minting for RLS integration tests.
 *
 * Clerk session tokens live 60 seconds. An expired token produces exactly the
 * same result as an RLS denial — HTTP 200 with an empty array — so a cached
 * token turns every policy test into an intermittent false failure that looks
 * like a policy bug. Nothing here caches. `mintFreshToken` hits Clerk on every
 * call, and callers must call it per request rather than per test.
 *
 * There is deliberately no `createProbeUser` here any more.
 *
 * Identity creation lives in test/global-setup.ts and happens once per run,
 * because doing it per suite meant nineteen users in fifteen seconds and an
 * HTTP 429 from Clerk's Backend API — intermittent, and landing in `beforeAll`
 * where it took whole suites down while reporting them as skipped. Removing the
 * helper rather than documenting the rule is the point: a suite cannot casually
 * reintroduce per-suite creation by calling a function that is not here.
 */

const CLERK_API = "https://api.clerk.com/v1";

function secret() {
  const key = process.env.CLERK_SECRET_KEY;

  if (!key) {
    throw new Error("CLERK_SECRET_KEY is required for RLS integration tests.");
  }

  return key;
}

export async function clerkRequest<T>(
  path: string,
  init?: { body?: unknown; method?: string },
): Promise<T> {
  const response = await fetch(`${CLERK_API}${path}`, {
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
    },
    method: init?.method ?? "GET",
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Clerk ${init?.method ?? "GET"} ${path} -> ${response.status}: ${text}`);
  }

  return (text ? JSON.parse(text) : null) as T;
}

/**
 * Mint a token valid for the next ~60 seconds. Never cache the result.
 */
export async function mintFreshToken(user: {
  sessionId: string;
}): Promise<string> {
  const { jwt } = await clerkRequest<{ jwt: string }>(
    `/sessions/${user.sessionId}/tokens`,
    { body: {}, method: "POST" },
  );

  return jwt;
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];

  return JSON.parse(
    Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    ),
  );
}
