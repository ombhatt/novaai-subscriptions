import type Stripe from "stripe";
import type { InvoiceSnapshot, PromoDiscount } from "@/lib/promo";

export async function findActivePromotionCode(
  stripe: Stripe,
  code: string,
): Promise<Stripe.PromotionCode | null> {
  const { data } = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 1,
    expand: ["data.promotion.coupon"],
  });
  return data[0] ?? null;
}

function couponFromPromotion(promo: Stripe.PromotionCode): Stripe.Coupon | null {
  const coupon = promo.promotion.coupon;
  if (coupon && typeof coupon === "object" && coupon.object === "coupon") {
    return coupon;
  }
  return null;
}

function promoDuration(value: string): PromoDiscount["duration"] {
  if (value === "repeating" || value === "forever") return value;
  return "once";
}

export async function getPromotionDiscount(
  stripe: Stripe,
  code: string,
): Promise<(PromoDiscount & { promotionCodeId: string }) | null> {
  const promo = await findActivePromotionCode(stripe, code);
  if (!promo) return null;

  let coupon = couponFromPromotion(promo);
  if (!coupon && typeof promo.promotion.coupon === "string") {
    coupon = await stripe.coupons.retrieve(promo.promotion.coupon);
  }
  if (!coupon) return null;

  return {
    promotionCodeId: promo.id,
    percentOff: coupon.percent_off,
    amountOffCents: coupon.amount_off,
    duration: promoDuration(coupon.duration),
    durationInMonths: coupon.duration_in_months,
  };
}

const INVOICE_LOOKUP_TIMEOUT_MS = 2_000;

export async function getLatestInvoiceSnapshot(
  stripe: Stripe,
  customerId: string,
): Promise<InvoiceSnapshot | null> {
  const { data } = await stripe.invoices.list(
    {
      customer: customerId,
      limit: 1,
    },
    {
      maxNetworkRetries: 0,
      timeout: INVOICE_LOOKUP_TIMEOUT_MS,
    },
  );
  const invoice = data[0];
  if (!invoice) return null;
  return {
    totalCents: invoice.total,
    subtotalCents: invoice.subtotal,
  };
}
