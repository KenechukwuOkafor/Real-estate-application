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

/**
 * A deadline, because a call without one spends the whole test budget.
 *
 * A token mint that hung took a test to its 30s timeout and reported
 * `Test timed out in 30000ms` — which names the test rather than the network,
 * so it reads as a defect in whatever that test covers. It cost a run to trace
 * back to Clerk. Ten seconds is far longer than a healthy mint (~200ms) and far
 * shorter than the budget, so a hang now fails as a hang.
 */
const CLERK_TIMEOUT_MS = 10_000;

export async function clerkRequest<T>(
  path: string,
  init?: { body?: unknown; method?: string },
): Promise<T> {
  const method = init?.method ?? "GET";

  /**
   * One retry, and ONLY for a request that never got an answer.
   *
   * Deliberately not a retry on HTTP status. A 429 is Clerk telling us we are
   * asking too often, and retrying spends another call to survive having spent
   * too many — the shared cast in test/helpers/cast.ts is the fix for that, and
   * this must not quietly undo it. What is retried here is a connection that
   * timed out or failed outright, where no call was successfully made.
   */
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(`${CLERK_API}${path}`, {
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
        headers: {
          Authorization: `Bearer ${secret()}`,
          "Content-Type": "application/json",
        },
        method,
        signal: AbortSignal.timeout(CLERK_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt === 0) {
        continue;
      }

      throw new Error(
        `Clerk ${method} ${path} did not answer within ${CLERK_TIMEOUT_MS}ms, twice: ${String(error)}`,
      );
    }

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Clerk ${method} ${path} -> ${response.status}: ${text}`);
    }

    return (text ? JSON.parse(text) : null) as T;
  }

  throw new Error(`Clerk ${method} ${path}: unreachable`);
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
