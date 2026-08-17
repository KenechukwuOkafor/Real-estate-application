export const DEV_AUTH_COOKIE_NAME = "ruvo_dev_user";

export const DEV_AUTH_USERS = [
  {
    clerkUserId: "seed_clerk_student_001",
    description: "Student test account for browsing listings and requesting inspections.",
    email: "student1@ruvo.local",
    fullName: "Ruvo Student One",
    label: "Student tester",
    roles: ["student"] as const,
  },
  {
    clerkUserId: "seed_clerk_agent_001",
    description:
      "Verified agent with 3 submission slots and the seeded public listings.",
    email: "agent1@ruvo.local",
    fullName: "Prime Homes Nsukka",
    label: "Agent tester (verified)",
    roles: ["agent"] as const,
  },
  {
    clerkUserId: "seed_clerk_agent_002",
    description:
      "Brand-new agent: unverified, no submission slots. Use this to exercise the gates a real signup hits first.",
    email: "agent2@ruvo.local",
    fullName: "Campus Keys Property",
    label: "Agent tester (unverified)",
    roles: ["agent"] as const,
  },
  {
    clerkUserId: "seed_clerk_admin_001",
    description: "Admin test account for moderation and verification queues.",
    email: "admin1@ruvo.local",
    fullName: "Ruvo Admin One",
    label: "Admin tester",
    roles: ["admin"] as const,
  },
] as const;

export type DevAuthUser = (typeof DEV_AUTH_USERS)[number];

export function isDevAuthEnabled() {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return process.env.ENABLE_DEV_AUTH === "true";
}

export function getDevAuthUserByClerkUserId(clerkUserId: string | null | undefined) {
  if (!clerkUserId) {
    return null;
  }

  return DEV_AUTH_USERS.find((user) => user.clerkUserId === clerkUserId) ?? null;
}
