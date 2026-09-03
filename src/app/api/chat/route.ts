import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluateEntitlement,
  usagePeriodStart,
  type Subscription,
} from "@/lib/entitlements";
import { evaluateRateLimit, secondsUntilNextUtcMinute } from "@/lib/rate-limit";
import { TIER_LIMITS } from "@/lib/tiers";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { prompt?: string };
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
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

  if (!entitlement.allowed) {
    return NextResponse.json(
      {
        error: entitlement.reason,
        tier: entitlement.tier,
        status: entitlement.status,
        usage: entitlement.usage,
        limit: entitlement.limit,
      },
      { status: entitlement.status === "past_due" ? 402 : 429 },
    );
  }

  const admin = createAdminClient();
  const rateLimit = TIER_LIMITS[entitlement.tier].rateLimitPerMinute;
  const { data: rateCount, error: rateError } = await admin.rpc("consume_rate_limit", {
    p_user_id: user.id,
    p_limit: rateLimit,
  });

  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: 500 });
  }

  if (rateCount == null) {
    const limited = evaluateRateLimit(entitlement.tier, rateLimit);
    const retryAfter = secondsUntilNextUtcMinute();
    return NextResponse.json(
      {
        error: limited.reason,
        code: "rate_limited",
        tier: entitlement.tier,
        limit: limited.limit,
        retryAfterSeconds: retryAfter,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  const { data: newCount, error } = await admin.rpc("increment_usage", {
    p_user_id: user.id,
    p_period_start: periodStart,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tier = entitlement.tier;
  const models = TIER_LIMITS[tier].models;
  const model = models[models.length - 1];

  return NextResponse.json({
    reply: `[${model} model] Processed your request: "${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}"`,
    tier,
    model,
    usage: newCount,
    limit: entitlement.limit,
    remaining: entitlement.limit - (newCount ?? entitlement.usage + 1),
  });
}
