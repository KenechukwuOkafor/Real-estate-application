import "server-only";

import type { Json } from "@/types/database";
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { createAuditLog } from "@/server/repositories/audit-repository";

/**
 * SERVICE ROLE, deliberately.
 *
 * BR-RLS-005: audit logs are append-only and no authenticated role holds
 * INSERT. That is the point — a user who could write their own audit rows
 * could forge the record of their own actions. The append is the system's.
 */
export async function writeAuditLog(input: {
  action: string;
  actorUserId?: string | null;
  afterData?: Json | null;
  beforeData?: Json | null;
  entityId: string;
  entityType: string;
  metadata?: Json;
}) {
  const adminClient = getSupabaseAdminClient();

  await createAuditLog(adminClient, input);
}
