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

  it("grants agent, which is self-service", () => {
    expect(deriveRequestedRoles(["agent"])).toEqual(["agent"]);
  });

  it("grants student and agent together", () => {
    expect(deriveRequestedRoles(["student", "agent"])).toEqual([
      "student",
      "agent",
    ]);
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
  it("grants the agent role to a user who selects Agent", async () => {
    listUserRoles.mockResolvedValue([{ role: "agent" }]);

    const result = await syncCurrentUserToDatabase({
      requestedRoles: ["agent"],
    });

    expect(ensureUserRoles).toHaveBeenCalledWith({}, "user_1", ["agent"]);
    expect(result.roles).toEqual(["agent"]);
  });

  it("rejects an admin request instead of silently granting nothing", async () => {
    await expect(
      syncCurrentUserToDatabase({ requestedRoles: ["admin"] }),
    ).rejects.toMatchObject({ code: "ROLE_NOT_SELF_SERVICE", httpStatus: 403 });
  });

  it("never passes admin through to ensureUserRoles", async () => {
    await expect(
      syncCurrentUserToDatabase({ requestedRoles: ["student", "admin"] }),
    ).rejects.toThrow("cannot be self-assigned");

    expect(ensureUserRoles).not.toHaveBeenCalled();
  });

  it("does not call ensureUserRoles when nothing is grantable", async () => {
    await expect(
      syncCurrentUserToDatabase({ requestedRoles: ["admin"] }),
    ).rejects.toThrow();

    expect(ensureUserRoles).not.toHaveBeenCalled();
  });

  it("audits a denied role request", async () => {
    await expect(
      syncCurrentUserToDatabase({ requestedRoles: ["admin"] }),
    ).rejects.toThrow();

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

  it("still reports the denial when the denial audit write throws", async () => {
    writeAuditLog.mockRejectedValue(new Error("audit table unavailable"));

    await expect(
      syncCurrentUserToDatabase({ requestedRoles: ["admin"] }),
    ).rejects.toMatchObject({ code: "ROLE_NOT_SELF_SERVICE" });
  });

  it("rejects a request that would leave the user with no roles at all", async () => {
    listUserRoles.mockResolvedValue([]);

    await expect(
      syncCurrentUserToDatabase({ requestedRoles: [] }),
    ).rejects.toMatchObject({ code: "ROLE_REQUIRED", httpStatus: 422 });
  });
});
