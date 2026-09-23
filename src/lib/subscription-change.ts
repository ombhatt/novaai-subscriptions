import type Stripe from "stripe";
import { NextResponse } from "next/server";
import type { Subscription } from "@/lib/entitlements";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { upsertSubscriptionFromStripe } from "@/lib/stripe-webhook-handler";
import {
  isCheckoutTier,
  isPaidTier,
  stripePriceIdForTier,
  type CheckoutTier,
} from "@/lib/tiers";

export type ChangePaidPlanResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function changePaidSubscriptionTier(
  subscription: Pick<
    Subscription,
    "user_id" | "tier" | "stripe_customer_id" | "stripe_subscription_id"
  >,
  tier: CheckoutTier,
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

  const result = await changePaidSubscriptionTier(
    subscription as Subscription,
    tier,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:43123";
  return NextResponse.json({ url: `${appUrl}/dashboard` });
}
