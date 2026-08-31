import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import type { Tier } from "@/lib/tiers";

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

  const { tier } = (await request.json()) as { tier?: Tier };

  if (!tier || tier === "free") {
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
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:43123";

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

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=canceled`,
    metadata: { user_id: user.id, tier },
    subscription_data: {
      metadata: { user_id: user.id, tier },
    },
  });

  return NextResponse.json({ url: session.url });
}
