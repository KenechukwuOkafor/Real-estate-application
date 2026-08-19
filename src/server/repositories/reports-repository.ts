import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;
type ReportRow = Database["public"]["Tables"]["reports"]["Row"];

export async function createReport(
  client: DbClient,
  input: {
    reporterUserId: string;
    targetType: Database["public"]["Enums"]["report_target_type"];
    targetId: string;
    reason: string;
  },
): Promise<ReportRow> {
  const { data, error } = await client
    .from("reports")
    .insert({
      reason: input.reason.trim(),
      reporter_user_id: input.reporterUserId,
      target_id: input.targetId,
      target_type: input.targetType,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
