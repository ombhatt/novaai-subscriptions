import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { isCheckoutTier, type Tier } from "@/lib/tiers";

function isStripeInvalidRequestError(
  error: unknown,
): error is Stripe.errors.StripeInvalidRequestError {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error as { type: unknown }).type === "StripeInvalidRequestError"
  );
}

export async function POST(request: Request) {
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

  const { tier, promoCode: rawPromoCode } = (await request.json()) as {
    tier?: Tier;
    promoCode?: string;
  };

  if (!isCheckoutTier(tier)) {
    return NextResponse.json({ error: "Invalid tier for checkout." }, { status: 400 });
  }

  const priceId =
    tier === "plus" ? process.env.STRIPE_PRICE_PLUS : process.env.STRIPE_PRICE_PRO;

  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe price for ${tier} is not configured.` },
      { status: 503 },
    );
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:43123";

  if (subscription?.stripe_customer_id && subscription.stripe_subscription_id) {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${appUrl}/dashboard`,
    });
    return NextResponse.json({ url: portalSession.url });
  }

  let customerId = subscription?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;

    await supabase
      .from("subscriptions")
      .update({ stripe_customer_id: customerId })
      .eq("user_id", user.id);
  }

  const promoCode = rawPromoCode?.trim();
  let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;

  if (promoCode) {
    const { data: promotionCodes } = await stripe.promotionCodes.list({
      code: promoCode,
      active: true,
      limit: 1,
    });
    const promotionCode = promotionCodes[0];

    if (!promotionCode) {
      return NextResponse.json(
        { error: "Invalid or expired promo code." },
        { status: 400 },
      );
    }

    discounts = [{ promotion_code: promotionCode.id }];
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=canceled`,
    metadata: { user_id: user.id, tier },
    subscription_data: {
      metadata: { user_id: user.id, tier },
    },
  };

  if (discounts) {
    sessionParams.discounts = discounts;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (isStripeInvalidRequestError(error)) {
      return NextResponse.json(
        { error: "This promo code cannot be applied to this plan." },
        { status: 400 },
      );
    }
    throw error;
  }
}
