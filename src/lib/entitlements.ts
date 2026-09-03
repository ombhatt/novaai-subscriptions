import type { Tier, SubscriptionStatus } from "@/lib/tiers";
import { TIER_LIMITS } from "@/lib/tiers";

export interface Subscription {
  id: string;
  user_id: string;
  tier: Tier;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsageCounter {
  id: string;
  user_id: string;
  period_start: string;
  request_count: number;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
}

export interface EntitlementResult {
  allowed: boolean;
  tier: Tier;
  status: SubscriptionStatus;
  usage: number;
  limit: number;
  remaining: number;
  reason?: string;
}

export function getCurrentPeriodStart(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Paid plans key usage by Stripe's billing period; Free falls back to the UTC calendar month. */
export function usagePeriodStart(
  subscription: Pick<Subscription, "current_period_start"> | null,
  now = new Date(),
): string {
  const fromStripe = subscription?.current_period_start?.slice(0, 10);
  if (fromStripe && /^\d{4}-\d{2}-\d{2}$/.test(fromStripe)) {
    return fromStripe;
  }
  return getCurrentPeriodStart(now);
}

export function evaluateEntitlement(
  subscription: Subscription | null,
  usageCount: number,
): EntitlementResult {
  const tier = subscription?.tier ?? "free";
  const status = subscription?.status ?? "active";
  const limit = TIER_LIMITS[tier].requestsPerMonth;

  if (status === "canceled" || status === "incomplete") {
    return {
      allowed: false,
      tier,
      status,
      usage: usageCount,
      limit,
      remaining: 0,
      reason: "Subscription is not active. Please update your billing.",
    };
  }

  if (status === "past_due") {
    return {
      allowed: false,
      tier,
      status,
      usage: usageCount,
      limit,
      remaining: 0,
      reason: "Payment failed. Update your payment method to restore access.",
    };
  }

  if (usageCount >= limit) {
    return {
      allowed: false,
      tier,
      status,
      usage: usageCount,
      limit,
      remaining: 0,
      reason: `Monthly limit of ${limit.toLocaleString()} requests reached. Upgrade your plan for more capacity.`,
    };
  }

  return {
    allowed: true,
    tier,
    status,
    usage: usageCount,
    limit,
    remaining: limit - usageCount,
  };
}
