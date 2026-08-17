import "server-only";

import { AppError } from "@/lib/api/errors";
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import {
  attachChatToInspectionRequest,
  createInspectionChat,
  createInspectionRequest,
  findActiveInspectionRequest,
  getInspectionRequestById,
  getInspectableListingById,
  updateInspectionRequestStatus,
} from "@/server/repositories/inspection-repository";
import { getAgentProfileByUserId } from "@/server/repositories/agents-repository";
import { writeAuditLog } from "@/server/services/audit-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

function assertInspectionMessage(message: string) {
  if (!message.trim()) {
    throw new Error("Inspection message is required.");
  }

  if (message.trim().length > 500) {
    throw new Error("Inspection message must be 500 characters or fewer.");
  }
}

export async function requestInspection(input: {
  listingId: string;
  message: string;
}) {
  assertInspectionMessage(input.message);

  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  const adminClient = getSupabaseAdminClient();
  const listing = await getInspectableListingById(adminClient, input.listingId);

  if (!listing || listing.deleted_at || listing.status !== "approved") {
    throw new Error("Listing not found.");
  }

  if (listing.agent_profiles?.user_id === appUser.user.id) {
    throw new Error("You cannot request an inspection for your own listing.");
  }

  const activeRequest = await findActiveInspectionRequest(
    adminClient,
    listing.id,
    appUser.user.id,
  );

  if (activeRequest) {
    throw new Error("An active inspection request already exists for this listing.");
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const inspectionRequest = await createInspectionRequest(adminClient, {
    agentProfileId: listing.agent_profile_id,
    expiresAt,
    listingId: listing.id,
    message: input.message.trim(),
    requesterUserId: appUser.user.id,
  });

  const chat = await createInspectionChat(adminClient, {
    agentProfileId: listing.agent_profile_id,
    inspectionRequestId: inspectionRequest.id,
    listingId: listing.id,
    studentUserId: appUser.user.id,
  });

  const updatedRequest = await attachChatToInspectionRequest(
    adminClient,
    inspectionRequest.id,
    chat.id,
  );

  await writeAuditLog({
    action: "inspection_request.created",
    actorUserId: appUser.user.id,
    afterData: {
      expires_at: updatedRequest.expires_at,
      listing_id: updatedRequest.listing_id,
      status: updatedRequest.status,
    },
    entityId: updatedRequest.id,
    entityType: "inspection_request",
    metadata: {
      chatId: chat.id,
    },
  });

  return {
    chat,
    inspectionRequest: updatedRequest,
  };
}

type InspectionDecision = "accepted" | "declined";

/**
 * Parse an agent's response to an inspection request.
 *
 * The route previously coerced with `=== "declined" ? "declined" : "accepted"`,
 * so a missing, misspelled, or malformed decision silently ACCEPTED. Accepting
 * is the consequential branch — it is what commits the agent to an inspection
 * and opens the channel that will later carry an exact address — so it must
 * never be reachable by default. Anything that is not exactly one of the two
 * literals is rejected.
 *
 * Validation lives here rather than in the route because the service is the
 * enforcement boundary (REB-DOM-003: "Authorization MUST always be enforced by
 * backend services"). The parameter is `unknown` so no caller can bypass it by
 * asserting a type at the edge.
 */
function parseInspectionDecision(value: unknown): InspectionDecision {
  if (value === "accepted" || value === "declined") {
    return value;
  }

  throw new AppError(
    "INSPECTION_DECISION_INVALID",
    'Decision must be exactly "accepted" or "declined".',
    422,
  );
}

export async function respondToInspectionRequest(input: {
  decision: unknown;
  inspectionRequestId: string;
}) {
  const decision = parseInspectionDecision(input.decision);
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  if (!appUser.roles.includes("agent")) {
    throw new Error("Agent role is required.");
  }

  const adminClient = getSupabaseAdminClient();
  const agentProfile = await getAgentProfileByUserId(adminClient, appUser.user.id);

  if (!agentProfile) {
    throw new Error("Agent profile not found.");
  }

  const inspectionRequest = await getInspectionRequestById(
    adminClient,
    input.inspectionRequestId,
  );

  if (!inspectionRequest) {
    throw new Error("Inspection request not found.");
  }

  if (inspectionRequest.agent_profile_id !== agentProfile.id) {
    throw new Error("Inspection request does not belong to this agent.");
  }

  if (inspectionRequest.status !== "requested") {
    throw new Error(
      `Inspection request cannot be responded to from status ${inspectionRequest.status}.`,
    );
  }

  const now = new Date().toISOString();
  const updated = await updateInspectionRequestStatus(
    adminClient,
    inspectionRequest.id,
    decision,
    {
      responded_at: now,
    },
  );

  await writeAuditLog({
    action:
      decision === "accepted"
        ? "inspection_request.accepted"
        : "inspection_request.declined",
    actorUserId: appUser.user.id,
    afterData: {
      responded_at: updated.responded_at,
      status: updated.status,
    },
    entityId: updated.id,
    entityType: "inspection_request",
  });

  return updated;
}
