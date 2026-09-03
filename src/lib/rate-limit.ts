import type { Tier } from "@/lib/tiers";
import { TIER_LIMITS } from "@/lib/tiers";

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  reason?: string;
}

export function evaluateRateLimit(tier: Tier, usedInWindow: number): RateLimitResult {
  const limit = TIER_LIMITS[tier].rateLimitPerMinute;

  if (usedInWindow >= limit) {
    return {
      allowed: false,
      used: usedInWindow,
      limit,
      remaining: 0,
      reason: `Rate limit of ${limit.toLocaleString()} requests per minute reached. Wait a moment or upgrade your plan.`,
    };
  }

  return {
    allowed: true,
    used: usedInWindow,
    limit,
    remaining: limit - usedInWindow,
  };
}

export function secondsUntilNextUtcMinute(now = new Date()): number {
  const remaining = 60 - now.getUTCSeconds();
  return remaining === 0 ? 60 : remaining;
}
