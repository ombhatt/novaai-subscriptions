export type Tier = "free" | "plus" | "pro" | "enterprise";
export type CheckoutTier = "plus" | "pro";

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
  description: string;
  features: string[];
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    label: "Free",
    priceMonthly: 0,
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

export function tierFromStripePriceId(priceId: string | null | undefined): Tier {
  if (!priceId) return "free";

  const plusPrice = process.env.STRIPE_PRICE_PLUS;
  const proPrice = process.env.STRIPE_PRICE_PRO;

  if (proPrice && priceId === proPrice) return "pro";
  if (plusPrice && priceId === plusPrice) return "plus";

  return "free";
}

export function isPaidTier(tier: Tier): boolean {
  return tier === "plus" || tier === "pro";
}

export function isCheckoutTier(tier: string | undefined): tier is CheckoutTier {
  return tier === "plus" || tier === "pro";
}
