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
    description: "Verified agent test account with seeded profile and listings.",
    email: "agent1@ruvo.local",
    fullName: "Prime Homes Nsukka",
    label: "Agent tester",
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
  return (
    process.env.ENABLE_DEV_AUTH === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH === "true"
  );
}

export function getDevAuthUserByClerkUserId(clerkUserId: string | null | undefined) {
  if (!clerkUserId) {
    return null;
  }

  return DEV_AUTH_USERS.find((user) => user.clerkUserId === clerkUserId) ?? null;
}
