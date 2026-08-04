import "server-only";

import type { Database } from "@/types/database";
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { createReport } from "@/server/repositories/reports-repository";
import { writeAuditLog } from "@/server/services/audit-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

const VALID_TARGET_TYPES = new Set<string>(["listing", "agent", "message"]);

export async function reportTarget(input: {
  reason: string;
  targetId: string;
  targetType: string;
}) {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  if (!VALID_TARGET_TYPES.has(input.targetType)) {
    throw new Error("Invalid target type. Must be listing, agent, or message.");
  }

  if (!input.reason.trim()) {
    throw new Error("Reason is required.");
  }

  if (!input.targetId?.trim()) {
    throw new Error("Target ID is required.");
  }

  const adminClient = getSupabaseAdminClient();

  const report = await createReport(adminClient, {
    reason: input.reason,
    reporterUserId: appUser.user.id,
    targetId: input.targetId,
    targetType: input.targetType as Database["public"]["Enums"]["report_target_type"],
  });

  await writeAuditLog({
    action: "report.created",
    actorUserId: appUser.user.id,
    afterData: {
      status: report.status,
      target_id: report.target_id,
      target_type: report.target_type,
    },
    entityId: report.id,
    entityType: "report",
  });

  return report;
}
