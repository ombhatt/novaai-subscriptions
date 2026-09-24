import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { usagePeriodStart, type Subscription } from "@/lib/entitlements";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { upsertSubscriptionFromStripe } from "@/lib/stripe-webhook-handler";
import {
  compareTiers,
  isCheckoutTier,
  isPaidTier,
  parseBillingInterval,
  stripePriceIdForTier,
  TIER_LIMITS,
  type BillingInterval,
  type CheckoutTier,
  type Tier,
} from "@/lib/tiers";

export type ChangePaidPlanResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

async function schedulePriceAtPeriodEnd(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  nextPriceId: string,
): Promise<boolean> {
  const item = subscription.items.data[0];
  const currentPriceId = item?.price.id;
  const periodEnd = item?.current_period_end;
  if (!item?.id || !currentPriceId || !periodEnd) return false;

  const existingScheduleId =
    typeof subscription.schedule === "string"
      ? subscription.schedule
      : subscription.schedule?.id ?? null;
  const schedule = existingScheduleId
    ? await stripe.subscriptionSchedules.retrieve(existingScheduleId)
    : await stripe.subscriptionSchedules.create({
        from_subscription: subscription.id,
      });
  const startDate = schedule.phases[0]?.start_date;
  if (!startDate) return false;

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        items: [{ price: currentPriceId, quantity: 1 }],
        start_date: startDate,
        end_date: periodEnd,
      },
      {
        items: [{ price: nextPriceId, quantity: 1 }],
      },
    ],
  });
  return true;
}

function changeWaitsUntilPeriodEnd(
  currentInterval: BillingInterval,
  currentTier: Tier,
  nextInterval: BillingInterval,
  nextTier: CheckoutTier,
): boolean {
  if (currentInterval === "year" && nextInterval === "month") return true;
  return currentInterval === "year" && compareTiers(nextTier, currentTier) < 0;
}

export async function changePaidSubscriptionTier(
  subscription: Pick<
    Subscription,
    | "user_id"
    | "tier"
    | "status"
    | "stripe_customer_id"
    | "stripe_subscription_id"
    | "billing_interval"
    | "pending_tier"
    | "cancel_at_period_end"
  >,
  tier: CheckoutTier,
  usageCount: number,
  interval: BillingInterval = "month",
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

  const currentInterval = parseBillingInterval(subscription.billing_interval);
  if (subscription.tier === tier && currentInterval === interval) {
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

  const priceId = stripePriceIdForTier(tier, interval);
  if (!priceId) {
    return {
      ok: false,
      status: 503,
      error: `Stripe price for ${tier} is not configured.`,
    };
  }

  if (
    changeWaitsUntilPeriodEnd(currentInterval, subscription.tier, interval, tier) &&
    subscription.cancel_at_period_end
  ) {
    return {
      ok: false,
      status: 409,
      error: "Resume your plan before switching off annual billing.",
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

  if (changeWaitsUntilPeriodEnd(currentInterval, subscription.tier, interval, tier)) {
    const scheduled = await schedulePriceAtPeriodEnd(
      stripe,
      current,
      priceId,
    );
    if (!scheduled) {
      return {
        ok: false,
        status: 409,
        error: "This plan change cannot be scheduled yet.",
      };
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("subscriptions")
      .update({
        pending_tier: tier,
        pending_billing_interval: interval,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", subscription.user_id);

    if (error) {
      return {
        ok: false,
        status: 500,
        error: "Unable to save the scheduled plan change.",
      };
    }

    return { ok: true };
  }

  const existingScheduleId =
    typeof current.schedule === "string" ? current.schedule : current.schedule?.id;
  if (existingScheduleId) {
    await stripe.subscriptionSchedules.release(existingScheduleId);
  }

  const isUpgrade =
    compareTiers(tier, subscription.tier) > 0 ||
    (currentInterval === "month" && interval === "year");
  const updateParams: Stripe.SubscriptionUpdateParams = {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: isUpgrade ? "always_invoice" : "create_prorations",
    ...(isUpgrade ? { payment_behavior: "error_if_incomplete" } : {}),
  };
  const updated = (await stripe.subscriptions.update(
    subscription.stripe_subscription_id,
    updateParams,
  )) as Stripe.Subscription;

  await upsertSubscriptionFromStripe(
    subscription.user_id,
    subscription.stripe_customer_id,
    updated,
  );

  if (existingScheduleId || subscription.pending_tier) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("subscriptions")
      .update({
        pending_tier: null,
        pending_billing_interval: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", subscription.user_id);

    if (error) {
      return {
        ok: false,
        status: 500,
        error: "Unable to clear the scheduled plan change.",
      };
    }
  }

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

  const body = (await request.json()) as { tier?: unknown; interval?: unknown };
  const tier = typeof body.tier === "string" ? body.tier : undefined;
  const interval = parseBillingInterval(
    typeof body.interval === "string" ? body.interval : undefined,
  );

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
    interval,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:43123";
  return NextResponse.json({ url: `${appUrl}/dashboard` });
}
