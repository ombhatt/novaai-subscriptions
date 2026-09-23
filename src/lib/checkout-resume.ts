import { isCheckoutTier, type CheckoutTier } from "@/lib/tiers";

export function checkoutTierFromPlan(
  plan: string | null | undefined,
): CheckoutTier | null {
  const tier = plan ?? undefined;
  return isCheckoutTier(tier) ? tier : null;
}

export function checkoutResumePath(
  plan: string | null | undefined,
  promo: string | null | undefined,
): string | null {
  const tier = checkoutTierFromPlan(plan);
  if (!tier) {
    return null;
  }

  const params = new URLSearchParams({ plan: tier });
  const trimmedPromo = promo?.trim();
  if (trimmedPromo) {
    params.set("promo", trimmedPromo);
  }

  return `/checkout/start?${params.toString()}`;
}
