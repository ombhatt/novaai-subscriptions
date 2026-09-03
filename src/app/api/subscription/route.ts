import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  evaluateEntitlement,
  usagePeriodStart,
  type Subscription,
} from "@/lib/entitlements";
import { TIER_LIMITS } from "@/lib/tiers";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const periodStart = usagePeriodStart(subscription as Subscription | null);

  const { data: usage } = await supabase
    .from("usage_counters")
    .select("request_count")
    .eq("user_id", user.id)
    .eq("period_start", periodStart)
    .maybeSingle();

  const entitlement = evaluateEntitlement(
    subscription as Subscription | null,
    usage?.request_count ?? 0,
  );

  return NextResponse.json({
    subscription,
    usage: entitlement.usage,
    limit: entitlement.limit,
    remaining: entitlement.remaining,
    tier: entitlement.tier,
    status: entitlement.status,
    tierDetails: TIER_LIMITS[entitlement.tier],
  });
}
