import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { appEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    appEnv.supabaseUrl(),
    appEnv.supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(items) {
          for (const item of items) {
            cookieStore.set(item.name, item.value, item.options);
          }
        },
      },
    },
  );
}
