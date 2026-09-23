import type Stripe from "stripe";
import { NextResponse } from "next/server";
import type { Subscription } from "@/lib/entitlements";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { upsertSubscriptionFromStripe } from "@/lib/stripe-webhook-handler";
import { isPaidTier } from "@/lib/tiers";

export type CancelAtPeriodEndResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function setCancelAtPeriodEnd(
  subscription: Pick<
    Subscription,
    "user_id" | "tier" | "stripe_customer_id" | "stripe_subscription_id"
  >,
  cancelAtPeriodEnd: boolean,
): Promise<CancelAtPeriodEndResult> {
  if (
    !isPaidTier(subscription.tier) ||
    !subscription.stripe_subscription_id ||
    !subscription.stripe_customer_id
  ) {
    return {
      ok: false,
      status: 400,
      error: "No paid subscription to cancel.",
    };
  }

  const stripe = getStripe();
  const updated = (await stripe.subscriptions.update(
    subscription.stripe_subscription_id,
    { cancel_at_period_end: cancelAtPeriodEnd },
  )) as Stripe.Subscription;

  await upsertSubscriptionFromStripe(
    subscription.user_id,
    subscription.stripe_customer_id,
    updated,
  );

  return { ok: true };
}

export async function handleCancelAtPeriodEndRequest(cancelAtPeriodEnd: boolean) {
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

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json(
      { error: "No paid subscription to cancel." },
      { status: 400 },
    );
  }

  const result = await setCancelAtPeriodEnd(
    subscription as Subscription,
    cancelAtPeriodEnd,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ cancelAtPeriodEnd });
}
