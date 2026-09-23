import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getPromotionDiscount } from "@/lib/stripe-promo";

export async function GET(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured. Add keys to .env.local." },
      { status: 503 },
    );
  }

  const code = new URL(request.url).searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ valid: false });
  }

  const discount = await getPromotionDiscount(getStripe(), code);
  if (!discount) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({
    valid: true,
    percentOff: discount.percentOff,
    amountOffCents: discount.amountOffCents,
    duration: discount.duration,
    durationInMonths: discount.durationInMonths,
  });
}
