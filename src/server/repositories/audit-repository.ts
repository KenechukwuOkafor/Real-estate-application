import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

type DbClient = SupabaseClient<Database>;

export async function createAuditLog(
  client: DbClient,
  input: {
    action: string;
    actorUserId?: string | null;
    afterData?: Json | null;
    beforeData?: Json | null;
    entityId: string;
    entityType: string;
    metadata?: Json;
  },
) {
  const { error } = await client.from("audit_logs").insert({
    action: input.action,
    actor_user_id: input.actorUserId ?? null,
    after_data: input.afterData ?? null,
    before_data: input.beforeData ?? null,
    entity_id: input.entityId,
    entity_type: input.entityType,
    metadata: input.metadata ?? {},
  });

  if (error) {
    throw error;
  }
}
