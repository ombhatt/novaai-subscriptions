import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  TIER_LIMITS,
  isPaidTier,
  tierFromStripePriceId,
  type Tier,
} from "@/lib/tiers";

describe("TIER_LIMITS", () => {
  it("defines free, plus, and pro tiers", () => {
    expect(Object.keys(TIER_LIMITS)).toEqual(["free", "plus", "pro"]);
  });

  it("gives higher request limits for higher tiers", () => {
    expect(TIER_LIMITS.free.requestsPerMonth).toBeLessThan(
      TIER_LIMITS.plus.requestsPerMonth,
    );
    expect(TIER_LIMITS.plus.requestsPerMonth).toBeLessThan(
      TIER_LIMITS.pro.requestsPerMonth,
    );
  });

  it("prices free at $0, plus at $20, pro at $99", () => {
    expect(TIER_LIMITS.free.priceMonthly).toBe(0);
    expect(TIER_LIMITS.plus.priceMonthly).toBe(20);
    expect(TIER_LIMITS.pro.priceMonthly).toBe(99);
  });

  it("expands model access by tier", () => {
    expect(TIER_LIMITS.free.models).toEqual(["basic"]);
    expect(TIER_LIMITS.plus.models).toContain("standard");
    expect(TIER_LIMITS.pro.models).toContain("advanced");
  });

  it.each<[Tier, number]>([
    ["free", 10],
    ["plus", 100],
    ["pro", 1000],
  ])("%s rate limit is %i/min", (tier, rate) => {
    expect(TIER_LIMITS[tier].rateLimitPerMinute).toBe(rate);
  });
});

describe("isPaidTier", () => {
  it("returns false for free", () => {
    expect(isPaidTier("free")).toBe(false);
  });

  it("returns true for plus and pro", () => {
    expect(isPaidTier("plus")).toBe(true);
    expect(isPaidTier("pro")).toBe(true);
  });
});

describe("tierFromStripePriceId", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_PLUS", "price_plus_test");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns free for null/undefined/empty", () => {
    expect(tierFromStripePriceId(null)).toBe("free");
    expect(tierFromStripePriceId(undefined)).toBe("free");
    expect(tierFromStripePriceId("")).toBe("free");
  });

  it("maps plus and pro price IDs", () => {
    expect(tierFromStripePriceId("price_plus_test")).toBe("plus");
    expect(tierFromStripePriceId("price_pro_test")).toBe("pro");
  });

  it("returns free for unknown price IDs", () => {
    expect(tierFromStripePriceId("price_unknown")).toBe("free");
  });

  it("returns free when env price IDs are unset", () => {
    vi.unstubAllEnvs();
    expect(tierFromStripePriceId("price_plus_test")).toBe("free");
  });
});
