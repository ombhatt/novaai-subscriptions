export type Tier = "free" | "plus" | "pro" | "enterprise";
export type CheckoutTier = "plus" | "pro";
export type BillingInterval = "month" | "year";

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "trialing"
  | "incomplete";

export interface TierLimits {
  requestsPerMonth: number;
  rateLimitPerMinute: number;
  models: string[];
  label: string;
  priceMonthly: number | null;
  priceAnnual: number | null;
  description: string;
  features: string[];
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    label: "Free",
    priceMonthly: 0,
    priceAnnual: null,
    description: "Get started with basic AI access",
    requestsPerMonth: 1_000,
    rateLimitPerMinute: 10,
    models: ["basic"],
    features: [
      "1,000 requests per month",
      "Basic model access",
      "10 requests / minute",
      "Community support",
    ],
  },
  plus: {
    label: "Plus",
    priceMonthly: 20,
    priceAnnual: 200,
    description: "For builders shipping AI features",
    requestsPerMonth: 50_000,
    rateLimitPerMinute: 100,
    models: ["basic", "standard"],
    features: [
      "50,000 requests per month",
      "Standard model access",
      "100 requests / minute",
      "Email support",
    ],
  },
  pro: {
    label: "Pro",
    priceMonthly: 99,
    priceAnnual: 990,
    description: "For teams running AI at scale",
    requestsPerMonth: 500_000,
    rateLimitPerMinute: 1_000,
    models: ["basic", "standard", "advanced"],
    features: [
      "500,000 requests per month",
      "All models + priority queue",
      "1,000 requests / minute",
      "Priority support",
    ],
  },
  enterprise: {
    label: "Enterprise",
    priceMonthly: null,
    priceAnnual: null,
    description: "Custom packaging for procurement, invoicing, and dedicated support",
    requestsPerMonth: 0,
    rateLimitPerMinute: 0,
    models: ["basic", "standard", "advanced"],
    features: [
      "Custom request volume and rate limits",
      "Invoicing and procurement support",
      "Dedicated onboarding and support",
      "Security review on request",
    ],
  },
};

export function parseBillingInterval(
  value: string | null | undefined,
): BillingInterval {
  return value === "year" ? "year" : "month";
}

export function tierFromStripePriceId(priceId: string | null | undefined): Tier {
  if (!priceId) return "free";

  const plusPrices = [process.env.STRIPE_PRICE_PLUS, process.env.STRIPE_PRICE_PLUS_ANNUAL];
  const proPrices = [process.env.STRIPE_PRICE_PRO, process.env.STRIPE_PRICE_PRO_ANNUAL];

  if (proPrices.includes(priceId)) return "pro";
  if (plusPrices.includes(priceId)) return "plus";

  return "free";
}

export function billingIntervalFromStripePrice(
  price:
    | {
        id?: string | null;
        recurring?: { interval?: string | null } | null;
      }
    | null
    | undefined,
): BillingInterval {
  if (price?.recurring?.interval === "year") return "year";
  return billingIntervalFromPriceId(price?.id);
}

export function billingIntervalFromPriceId(
  priceId: string | null | undefined,
): BillingInterval {
  if (!priceId) return "month";
  if (
    priceId === process.env.STRIPE_PRICE_PLUS_ANNUAL ||
    priceId === process.env.STRIPE_PRICE_PRO_ANNUAL
  ) {
    return "year";
  }
  return "month";
}

export function isPaidTier(tier: Tier): boolean {
  return tier === "plus" || tier === "pro";
}

export function isCheckoutTier(tier: string | undefined): tier is CheckoutTier {
  return tier === "plus" || tier === "pro";
}

export function stripePriceIdForTier(
  tier: CheckoutTier,
  interval: BillingInterval = "month",
): string | undefined {
  if (interval === "year") {
    return tier === "plus"
      ? process.env.STRIPE_PRICE_PLUS_ANNUAL
      : process.env.STRIPE_PRICE_PRO_ANNUAL;
  }
  return tier === "plus" ? process.env.STRIPE_PRICE_PLUS : process.env.STRIPE_PRICE_PRO;
}

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  plus: 1,
  pro: 2,
  enterprise: 3,
};

/** Negative if `a` is a lower plan than `b`. */
export function compareTiers(a: Tier, b: Tier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}
