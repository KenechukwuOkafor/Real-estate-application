import { beforeEach, describe, expect, it, vi } from "vitest";

const getAgentProfileByUserId = vi.fn();
const getCurrentAppUser = vi.fn();
const getInspectionRequestById = vi.fn();
const recordInspectionResponse = vi.fn();
const markInspectionRequestComplete = vi.fn();

vi.mock("@/lib/db/supabase", () => ({
  createSupabaseAuthenticatedClient: vi.fn(async () => ({})),
  getSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/server/repositories/inspection-repository", () => ({
  attachChatToInspectionRequest: vi.fn(),
  createInspectionRequestWithChat: vi.fn(),
  findActiveInspectionRequest: vi.fn(),
  getInspectableListingById: vi.fn(),
  getInspectionRequestById,
  markInspectionRequestComplete,
  recordInspectionResponse,
}));

vi.mock("@/server/repositories/agents-repository", () => ({
  getAgentProfileByUserId,
}));

vi.mock("@/server/services/audit-service", () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock("@/server/services/user-sync-service", () => ({ getCurrentAppUser }));

const { completeInspectionRequest, respondToInspectionRequest } = await import(
  "@/server/services/inspection-service"
);

/** Four days out, well clear of the wall clock these tests run against. */
const INSIDE_WINDOW = "2099-01-01T00:00:00.000Z";
/** Long past, likewise without needing to control the clock. */
const OUTSIDE_WINDOW = "2020-01-01T00:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentAppUser.mockResolvedValue({
    roles: ["agent"],
    user: { id: "user_1" },
  });
  getAgentProfileByUserId.mockResolvedValue({ id: "agent_profile_1" });
  getInspectionRequestById.mockResolvedValue({
    agent_profile_id: "agent_profile_1",
    id: "inspection_1",
    status: "requested",
  });
  recordInspectionResponse.mockImplementation(
    async (_client, id: string, decision: string) => ({
      completion_deadline: decision === "accepted" ? INSIDE_WINDOW : null,
      inspection_request_id: id,
      responded_at: "2026-08-17T00:00:00.000Z",
      status: decision,
    }),
  );
  markInspectionRequestComplete.mockImplementation(async (_client, id: string) => ({
    completed_at: "2026-08-18T00:00:00.000Z",
    inspection_request_id: id,
  }));
});

describe("respondToInspectionRequest", () => {
  it("accepts an explicit accept", async () => {
    await expect(
      respondToInspectionRequest({
        decision: "accepted",
        inspectionRequestId: "inspection_1",
      }),
    ).resolves.toMatchObject({ status: "accepted" });
  });

  it("declines an explicit decline", async () => {
    await expect(
      respondToInspectionRequest({
        decision: "declined",
        inspectionRequestId: "inspection_1",
      }),
    ).resolves.toMatchObject({ status: "declined" });
  });

  // Accepting is what commits the agent and opens the channel that will later
  // carry an exact address. It must never be the fallback for bad input.
  const malformed: Array<[string, unknown]> = [
    ["missing", undefined],
    ["null", null],
    ["empty string", ""],
    ["misspelled", "accept"],
    ["wrong case", "Accepted"],
    ["boolean", true],
    ["number", 1],
    ["object", { decision: "accepted" }],
    ["array", ["accepted"]],
  ];

  it.each(malformed)("422s on a %s decision instead of accepting", async (_label, value) => {
    await expect(
      respondToInspectionRequest({
        decision: value,
        inspectionRequestId: "inspection_1",
      }),
    ).rejects.toMatchObject({
      code: "INSPECTION_DECISION_INVALID",
      httpStatus: 422,
    });

    expect(recordInspectionResponse).not.toHaveBeenCalled();
  });

  it("rejects a malformed decision before any authorization work", async () => {
    // Validation is cheap and unauthenticated-safe, so it runs first. This
    // also means a bad payload cannot probe for request existence.
    await expect(
      respondToInspectionRequest({
        decision: "maybe",
        inspectionRequestId: "inspection_1",
      }),
    ).rejects.toThrow();

    expect(getCurrentAppUser).not.toHaveBeenCalled();
    expect(getInspectionRequestById).not.toHaveBeenCalled();
  });
});

/**
 * The completion half.
 *
 * Every refusal here is duplicated inside complete_inspection_request, and
 * these tests assert the SERVICE refuses without reaching the database — not
 * because the database would let it through, but because a refusal that has to
 * round-trip produces a worse sentence and a slower one.
 *
 * The four-day boundary is not tested by moving a clock. Deadlines far on
 * either side of any plausible wall-clock time say the same thing without
 * fake timers, which this repo does not use anywhere.
 */
describe("completeInspectionRequest", () => {
  beforeEach(() => {
    getInspectionRequestById.mockResolvedValue({
      agent_profile_id: "agent_profile_1",
      completion_deadline: INSIDE_WINDOW,
      expires_at: null,
      id: "inspection_1",
      status: "accepted",
    });
  });

  it("marks an accepted inspection complete inside the window", async () => {
    await expect(
      completeInspectionRequest({ inspectionRequestId: "inspection_1" }),
    ).resolves.toMatchObject({ id: "inspection_1", status: "completed" });

    expect(markInspectionRequestComplete).toHaveBeenCalledTimes(1);
  });

  it("refuses once the four days have passed, without asking the database", async () => {
    getInspectionRequestById.mockResolvedValue({
      agent_profile_id: "agent_profile_1",
      completion_deadline: OUTSIDE_WINDOW,
      expires_at: null,
      id: "inspection_1",
      status: "accepted",
    });

    await expect(
      completeInspectionRequest({ inspectionRequestId: "inspection_1" }),
    ).rejects.toMatchObject({ code: "INSPECTION_COMPLETION_WINDOW_CLOSED" });

    expect(markInspectionRequestComplete).not.toHaveBeenCalled();
  });

  it.each(["requested", "declined"])(
    "refuses to complete a %s inspection",
    async (status) => {
      getInspectionRequestById.mockResolvedValue({
        agent_profile_id: "agent_profile_1",
        completion_deadline: null,
        expires_at: null,
        id: "inspection_1",
        status,
      });

      await expect(
        completeInspectionRequest({ inspectionRequestId: "inspection_1" }),
      ).rejects.toMatchObject({ code: "INSPECTION_STATE_TRANSITION_INVALID" });

      expect(markInspectionRequestComplete).not.toHaveBeenCalled();
    },
  );

  it("reports another agent's inspection as missing rather than forbidden", async () => {
    // A distinguishable refusal would turn the id into an oracle for which
    // inspections exist. Same choice the respond path makes.
    getInspectionRequestById.mockResolvedValue({
      agent_profile_id: "agent_profile_2",
      completion_deadline: INSIDE_WINDOW,
      expires_at: null,
      id: "inspection_1",
      status: "accepted",
    });

    await expect(
      completeInspectionRequest({ inspectionRequestId: "inspection_1" }),
    ).rejects.toMatchObject({ code: "INSPECTION_NOT_FOUND" });

    expect(markInspectionRequestComplete).not.toHaveBeenCalled();
  });

  it("requires the agent role", async () => {
    getCurrentAppUser.mockResolvedValue({
      roles: ["student"],
      user: { id: "user_1" },
    });

    await expect(
      completeInspectionRequest({ inspectionRequestId: "inspection_1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("treats an inspection accepted before the window existed as still markable", async () => {
    // Rows accepted before 0030 carry no deadline. They must not be frozen:
    // unable to lapse and unable to be completed would be the worst of both.
    getInspectionRequestById.mockResolvedValue({
      agent_profile_id: "agent_profile_1",
      completion_deadline: null,
      expires_at: null,
      id: "inspection_1",
      status: "accepted",
    });

    await expect(
      completeInspectionRequest({ inspectionRequestId: "inspection_1" }),
    ).resolves.toMatchObject({ status: "completed" });
  });
});
