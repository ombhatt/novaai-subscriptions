import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tables read on each run. Supabase pauses a free project when it sees too
 * little user database activity over a week; a few real reads per day is the
 * amount their pausing guide says is enough to keep the project active.
 */
const KEEPALIVE_TABLES = ["subscriptions", "profiles", "usage_counters"] as const;

export interface KeepaliveResult {
  reads: number;
}

export async function recordDatabaseKeepalive(): Promise<KeepaliveResult> {
  const supabase = createAdminClient();

  for (const table of KEEPALIVE_TABLES) {
    const { error } = await supabase.from(table).select("id").limit(1);

    if (error) {
      throw new Error(`Failed to read ${table} for keepalive: ${error.message}`);
    }
  }

  return { reads: KEEPALIVE_TABLES.length };
}
