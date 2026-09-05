import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GRACE_PERIOD_DAYS,
  gracePeriodEndsAt,
  isWithinDunningGrace,
  nextGracePeriodEndsAt,
} from "@/lib/dunning";

afterEach(() => {
  vi.useRealTimers();
});

describe("gracePeriodEndsAt", () => {
  it("adds 7 UTC days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));
    expect(GRACE_PERIOD_DAYS).toBe(7);
    expect(gracePeriodEndsAt().toISOString()).toBe("2026-09-11T12:00:00.000Z");
  });
});

describe("isWithinDunningGrace", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");

  it("is false without a past_due subscription or deadline", () => {
    expect(isWithinDunningGrace(null, now)).toBe(false);
    expect(
      isWithinDunningGrace(
        { status: "active", grace_period_ends_at: "2026-09-11T12:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isWithinDunningGrace({ status: "past_due", grace_period_ends_at: null }, now),
    ).toBe(false);
  });

  it("is true when past_due and the deadline is in the future", () => {
    expect(
      isWithinDunningGrace(
        { status: "past_due", grace_period_ends_at: "2026-09-11T12:00:00.000Z" },
        now,
      ),
    ).toBe(true);
  });

  it("is false when the deadline has elapsed", () => {
    expect(
      isWithinDunningGrace(
        { status: "past_due", grace_period_ends_at: "2026-09-04T11:59:59.000Z" },
        now,
      ),
    ).toBe(false);
  });
});

describe("nextGracePeriodEndsAt", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");

  it("starts a 7-day window on first past_due", () => {
    expect(nextGracePeriodEndsAt(null, "past_due", now)).toBe("2026-09-11T12:00:00.000Z");
  });

  it("does not extend an existing past_due deadline", () => {
    expect(nextGracePeriodEndsAt("2026-09-10T00:00:00.000Z", "past_due", now)).toBe(
      "2026-09-10T00:00:00.000Z",
    );
  });

  it("clears grace when the subscription is active or trialing", () => {
    expect(nextGracePeriodEndsAt("2026-09-11T12:00:00.000Z", "active", now)).toBeNull();
    expect(nextGracePeriodEndsAt("2026-09-11T12:00:00.000Z", "trialing", now)).toBeNull();
  });

  it("keeps an existing deadline for canceled or incomplete statuses", () => {
    expect(nextGracePeriodEndsAt("2026-09-11T12:00:00.000Z", "canceled", now)).toBe(
      "2026-09-11T12:00:00.000Z",
    );
    expect(nextGracePeriodEndsAt(null, "incomplete", now)).toBeNull();
  });
});
