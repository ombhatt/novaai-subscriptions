import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { usagePeriodStart, type Subscription } from "@/lib/entitlements";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { upsertSubscriptionFromStripe } from "@/lib/stripe-webhook-handler";
import {
  compareTiers,
  isCheckoutTier,
  isPaidTier,
  stripePriceIdForTier,
  TIER_LIMITS,
  type CheckoutTier,
} from "@/lib/tiers";

export type ChangePaidPlanResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function changePaidSubscriptionTier(
  subscription: Pick<
    Subscription,
    "user_id" | "tier" | "status" | "stripe_customer_id" | "stripe_subscription_id"
  >,
  tier: CheckoutTier,
  usageCount: number,
): Promise<ChangePaidPlanResult> {
  if (
    !isPaidTier(subscription.tier) ||
    !subscription.stripe_subscription_id ||
    !subscription.stripe_customer_id
  ) {
    return {
      ok: false,
      status: 400,
      error: "No paid subscription to change.",
    };
  }

  if (subscription.tier === tier) {
    return {
      ok: false,
      status: 400,
      error: "Already on this plan.",
    };
  }

  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return {
      ok: false,
      status: 409,
      error: "Resolve your outstanding billing issue before changing plans.",
    };
  }

  if (
    compareTiers(tier, subscription.tier) < 0 &&
    usageCount >= TIER_LIMITS[tier].requestsPerMonth
  ) {
    return {
      ok: false,
      status: 409,
      error: `You have already used the ${tier} plan's request allowance for this billing period. Try again after your next billing period begins.`,
    };
  }

  const priceId = stripePriceIdForTier(tier);
  if (!priceId) {
    return {
      ok: false,
      status: 503,
      error: `Stripe price for ${tier} is not configured.`,
    };
  }

  const stripe = getStripe();
  const current = (await stripe.subscriptions.retrieve(
    subscription.stripe_subscription_id,
  )) as Stripe.Subscription;
  const itemId = current.items.data[0]?.id;

  if (!itemId) {
    return {
      ok: false,
      status: 400,
      error: "No paid subscription to change.",
    };
  }

  const updated = (await stripe.subscriptions.update(
    subscription.stripe_subscription_id,
    {
      items: [{ id: itemId, price: priceId }],
      cancel_at_period_end: false,
      proration_behavior: "create_prorations",
    },
  )) as Stripe.Subscription;

  await upsertSubscriptionFromStripe(
    subscription.user_id,
    subscription.stripe_customer_id,
    updated,
  );

  return { ok: true };
}

export async function handleChangePaidPlanRequest(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured. Add keys to .env.local." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { tier?: unknown };
  const tier = typeof body.tier === "string" ? body.tier : undefined;

  if (!isCheckoutTier(tier)) {
    return NextResponse.json({ error: "Invalid tier for plan change." }, { status: 400 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json(
      { error: "No paid subscription to change." },
      { status: 400 },
    );
  }

  let usageCount = 0;
  if (
    (subscription.status === "active" || subscription.status === "trialing") &&
    compareTiers(tier, subscription.tier) < 0
  ) {
    const { data: usage, error: usageError } = await supabase
      .from("usage_counters")
      .select("request_count")
      .eq("user_id", user.id)
      .eq("period_start", usagePeriodStart(subscription as Subscription))
      .maybeSingle();

    if (usageError) {
      return NextResponse.json(
        { error: "Unable to verify usage before changing plans." },
        { status: 500 },
      );
    }

    usageCount = usage?.request_count ?? 0;
  }

  const result = await changePaidSubscriptionTier(
    subscription as Subscription,
    tier,
    usageCount,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:43123";
  return NextResponse.json({ url: `${appUrl}/dashboard` });
}
