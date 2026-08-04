import "server-only";

import type { Json } from "@/types/database";
import { getSupabaseAdminClient } from "@/lib/db/supabase";
import { createAuditLog } from "@/server/repositories/audit-repository";

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
