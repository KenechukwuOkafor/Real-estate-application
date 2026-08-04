import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureUserRoles = vi.fn();
const listUserRoles = vi.fn();
const upsertUserByClerkIdentity = vi.fn();
const writeAuditLog = vi.fn();

vi.mock("@/lib/auth/clerk", () => ({
  getCurrentClerkUser: vi.fn(async () => ({
    emailAddresses: [{ emailAddress: "seeker@ruvo.local", id: "email_1" }],
    firstName: "Ada",
    imageUrl: null,
    lastName: "Obi",
    phoneNumbers: [],
    primaryEmailAddressId: "email_1",
    primaryPhoneNumberId: null,
    username: "ada",
  })),
  requireAuthenticatedUser: vi.fn(async () => ({ userId: "clerk_user_1" })),
}));

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/server/repositories/users-repository", () => ({
  ensureUserRoles,
  getUserByClerkUserId: vi.fn(),
  listUserRoles,
  upsertUserByClerkIdentity,
}));

vi.mock("@/server/services/audit-service", () => ({ writeAuditLog }));

const { deriveRequestedRoles, syncCurrentUserToDatabase } = await import(
  "@/server/services/user-sync-service"
);

beforeEach(() => {
  vi.clearAllMocks();
  upsertUserByClerkIdentity.mockResolvedValue({ id: "user_1" });
  listUserRoles.mockResolvedValue([{ role: "student" }]);
  ensureUserRoles.mockResolvedValue([]);
  writeAuditLog.mockResolvedValue(undefined);
});

describe("deriveRequestedRoles", () => {
  it("never grants admin", () => {
    expect(deriveRequestedRoles(["admin"])).toEqual([]);
  });

  it("never grants agent", () => {
    expect(deriveRequestedRoles(["agent"])).toEqual([]);
  });

  it("keeps student and drops everything else", () => {
    expect(deriveRequestedRoles(["student", "admin"])).toEqual(["student"]);
  });

  it("returns an empty array for undefined input", () => {
    expect(deriveRequestedRoles(undefined)).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(deriveRequestedRoles([])).toEqual([]);
  });
});

describe("syncCurrentUserToDatabase", () => {
  it("never passes admin through to ensureUserRoles", async () => {
    await syncCurrentUserToDatabase({ requestedRoles: ["student", "admin"] });

    expect(ensureUserRoles).toHaveBeenCalledWith({}, "user_1", ["student"]);
  });

  it("does not call ensureUserRoles when nothing is grantable", async () => {
    await syncCurrentUserToDatabase({ requestedRoles: ["admin"] });

    expect(ensureUserRoles).not.toHaveBeenCalled();
  });

  it("audits a denied role request", async () => {
    await syncCurrentUserToDatabase({ requestedRoles: ["admin"] });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.role_request_denied",
        actorUserId: "user_1",
        entityId: "user_1",
        entityType: "user",
      }),
    );
  });

  it("does not audit when every requested role is grantable", async () => {
    await syncCurrentUserToDatabase({ requestedRoles: ["student"] });

    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("still succeeds when the denial audit write throws", async () => {
    writeAuditLog.mockRejectedValue(new Error("audit table unavailable"));

    await expect(
      syncCurrentUserToDatabase({ requestedRoles: ["admin"] }),
    ).resolves.toMatchObject({ roles: ["student"] });
  });
});
