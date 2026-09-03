import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateRateLimit, secondsUntilNextUtcMinute } from "@/lib/rate-limit";
import { TIER_LIMITS } from "@/lib/tiers";

describe("evaluateRateLimit", () => {
  it("allows requests under the free per-minute limit", () => {
    const result = evaluateRateLimit("free", 9);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(TIER_LIMITS.free.rateLimitPerMinute);
    expect(result.remaining).toBe(1);
  });

  it("blocks when the window is full", () => {
    const result = evaluateRateLimit("free", 10);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.reason).toMatch(/10 requests per minute/);
  });

  it("uses plus and pro per-minute limits", () => {
    expect(evaluateRateLimit("plus", 99).allowed).toBe(true);
    expect(evaluateRateLimit("plus", 100).allowed).toBe(false);
    expect(evaluateRateLimit("pro", 999).allowed).toBe(true);
    expect(evaluateRateLimit("pro", 1000).allowed).toBe(false);
  });
});

describe("secondsUntilNextUtcMinute", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns seconds remaining in the current UTC minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T21:37:18.000Z"));
    expect(secondsUntilNextUtcMinute()).toBe(42);
  });

  it("returns 60 at the start of a minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T21:37:00.000Z"));
    expect(secondsUntilNextUtcMinute()).toBe(60);
  });
});
