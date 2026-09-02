import { describe, expect, it, vi, afterEach } from "vitest";
import {
  evaluateEntitlement,
  getCurrentPeriodStart,
  type Subscription,
} from "@/lib/entitlements";
import { TIER_LIMITS } from "@/lib/tiers";
import { makeSubscription } from "@/test/mocks/supabase";

describe("getCurrentPeriodStart", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the UTC first of the current month as YYYY-MM-01", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
    expect(getCurrentPeriodStart()).toBe("2026-09-01");
  });

  it("pads single-digit months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T00:00:00.000Z"));
    expect(getCurrentPeriodStart()).toBe("2026-03-01");
  });
});

describe("evaluateEntitlement", () => {
  it("defaults to free/active when subscription is null", () => {
    const result = evaluateEntitlement(null, 10);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe("free");
    expect(result.status).toBe("active");
    expect(result.limit).toBe(TIER_LIMITS.free.requestsPerMonth);
    expect(result.remaining).toBe(TIER_LIMITS.free.requestsPerMonth - 10);
  });

  it("allows requests under the monthly limit", () => {
    const sub = makeSubscription({ tier: "plus" }) as Subscription;
    const result = evaluateEntitlement(sub, 100);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(TIER_LIMITS.plus.requestsPerMonth - 100);
  });

  it("blocks when usage reaches the limit", () => {
    const sub = makeSubscription({ tier: "free" }) as Subscription;
    const result = evaluateEntitlement(sub, TIER_LIMITS.free.requestsPerMonth);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.reason).toMatch(/Monthly limit/);
  });

  it("blocks canceled subscriptions", () => {
    const sub = makeSubscription({ status: "canceled", tier: "plus" }) as Subscription;
    const result = evaluateEntitlement(sub, 0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not active/);
  });

  it("blocks incomplete subscriptions", () => {
    const sub = makeSubscription({ status: "incomplete" }) as Subscription;
    const result = evaluateEntitlement(sub, 0);
    expect(result.allowed).toBe(false);
  });

  it("blocks past_due with payment failure message", () => {
    const sub = makeSubscription({ status: "past_due", tier: "pro" }) as Subscription;
    const result = evaluateEntitlement(sub, 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Payment failed/);
  });

  it("allows trialing subscriptions under limit", () => {
    const sub = makeSubscription({ status: "trialing", tier: "plus" }) as Subscription;
    const result = evaluateEntitlement(sub, 1);
    expect(result.allowed).toBe(true);
  });

  it("uses pro limits for pro tier", () => {
    const sub = makeSubscription({ tier: "pro" }) as Subscription;
    const result = evaluateEntitlement(sub, 0);
    expect(result.limit).toBe(TIER_LIMITS.pro.requestsPerMonth);
  });
});
