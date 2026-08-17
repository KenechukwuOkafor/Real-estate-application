/**
 * Clerk token minting for RLS integration tests.
 *
 * Clerk session tokens live 60 seconds. An expired token produces exactly the
 * same result as an RLS denial — HTTP 200 with an empty array — so a cached
 * token turns every policy test into an intermittent false failure that looks
 * like a policy bug. Nothing here caches. `mintFreshToken` hits Clerk on every
 * call, and callers must call it per request rather than per test.
 */

const CLERK_API = "https://api.clerk.com/v1";

function secret() {
  const key = process.env.CLERK_SECRET_KEY;

  if (!key) {
    throw new Error("CLERK_SECRET_KEY is required for RLS integration tests.");
  }

  return key;
}

async function clerk<T>(
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

export type ProbeUser = {
  clerkUserId: string;
  email: string;
  sessionId: string;
};

/**
 * Create a throwaway Clerk user plus an active session.
 *
 * `+clerk_test` addresses bypass verification on development instances. The
 * `.local` TLD is rejected by Clerk, which is why these use example.com.
 */
export async function createProbeUser(label: string): Promise<ProbeUser> {
  const email = `rls_${label}_${Date.now()}+clerk_test@example.com`;

  const user = await clerk<{ id: string }>("/users", {
    body: {
      email_address: [email],
      password: `Pr0be-${label}-${Math.random().toString(36).slice(2, 10)}!Aa1`,
      skip_password_checks: true,
    },
    method: "POST",
  });

  const session = await clerk<{ id: string }>("/sessions", {
    body: { user_id: user.id },
    method: "POST",
  });

  return { clerkUserId: user.id, email, sessionId: session.id };
}

export async function deleteProbeUser(user: ProbeUser) {
  await clerk(`/users/${user.clerkUserId}`, { method: "DELETE" });
}

/**
 * Mint a token valid for the next ~60 seconds. Never cache the result.
 */
export async function mintFreshToken(user: ProbeUser): Promise<string> {
  const { jwt } = await clerk<{ jwt: string }>(
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
