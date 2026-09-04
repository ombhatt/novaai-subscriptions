import type { SubscriptionStatus } from "@/lib/tiers";

export const GRACE_PERIOD_DAYS = 7;

export function gracePeriodEndsAt(from = new Date()): Date {
  const end = new Date(from.getTime());
  end.setUTCDate(end.getUTCDate() + GRACE_PERIOD_DAYS);
  return end;
}

export function isWithinDunningGrace(
  subscription: {
    status: SubscriptionStatus;
    grace_period_ends_at: string | null;
  } | null,
  now = new Date(),
): boolean {
  if (!subscription || subscription.status !== "past_due") {
    return false;
  }

  if (!subscription.grace_period_ends_at) {
    return false;
  }

  return new Date(subscription.grace_period_ends_at).getTime() > now.getTime();
}

/** Preserve an existing grace deadline; start one on first past_due; clear on recovery. */
export function nextGracePeriodEndsAt(
  existing: string | null | undefined,
  status: SubscriptionStatus,
  now = new Date(),
): string | null {
  if (status === "active" || status === "trialing") {
    return null;
  }

  if (status === "past_due") {
    return existing ?? gracePeriodEndsAt(now).toISOString();
  }

  return existing ?? null;
}
