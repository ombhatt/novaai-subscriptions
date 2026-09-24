import { isWithinDunningGrace } from "@/lib/dunning";
import type { BillingInterval, Tier, SubscriptionStatus } from "@/lib/tiers";
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
  billing_interval: BillingInterval;
  pending_tier: Tier | null;
  pending_billing_interval: BillingInterval | null;
  cancel_at_period_end: boolean;
  grace_period_ends_at: string | null;
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

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function formatUtcDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Latest monthly anniversary of an annual subscription that is on or before `now`. */
export function annualUsagePeriodStart(anchorDate: string, now: Date): string {
  const [year, month, day] = anchorDate.split("-").map(Number);
  const anchorUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (todayUtc <= anchorUtc) return anchorDate;

  let cursorYear = now.getUTCFullYear();
  let cursorMonth = now.getUTCMonth();
  const clampedDay = (cursorYear: number, cursorMonth: number) =>
    Math.min(day, daysInUtcMonth(cursorYear, cursorMonth));

  if (clampedDay(cursorYear, cursorMonth) > now.getUTCDate()) {
    cursorMonth -= 1;
    if (cursorMonth < 0) {
      cursorMonth = 11;
      cursorYear -= 1;
    }
  }

  const cursorDay = clampedDay(cursorYear, cursorMonth);
  if (Date.UTC(cursorYear, cursorMonth, cursorDay) < anchorUtc) return anchorDate;
  return formatUtcDate(cursorYear, cursorMonth, cursorDay);
}

/** Monthly plans key usage by Stripe's billing period. Annual plans still reset every month. */
export function usagePeriodStart(
  subscription: Pick<Subscription, "current_period_start" | "billing_interval"> | null,
  now = new Date(),
): string {
  const fromStripe = subscription?.current_period_start?.slice(0, 10);
  const stripeDate =
    fromStripe && /^\d{4}-\d{2}-\d{2}$/.test(fromStripe) ? fromStripe : null;

  if (subscription?.billing_interval === "year") {
    return stripeDate ? annualUsagePeriodStart(stripeDate, now) : getCurrentPeriodStart(now);
  }

  return stripeDate ?? getCurrentPeriodStart(now);
}

export function evaluateEntitlement(
  subscription: Subscription | null,
  usageCount: number,
  now = new Date(),
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

  if (status === "past_due" && !isWithinDunningGrace(subscription, now)) {
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
