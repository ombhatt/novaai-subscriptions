import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSubscription } from "@/test/mocks/supabase";
import type { Subscription } from "@/lib/entitlements";

const { getStripeMock, upsertMock } = vi.hoisted(() => ({
  getStripeMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
}));

vi.mock("@/lib/stripe-webhook-handler", () => ({
  upsertSubscriptionFromStripe: upsertMock,
}));

import { setCancelAtPeriodEnd } from "@/lib/subscription-cancel";

describe("setCancelAtPeriodEnd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue(undefined);
  });

  it("rejects free plans without a Stripe subscription", async () => {
    const result = await setCancelAtPeriodEnd(
      makeSubscription() as Subscription,
      true,
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "No paid subscription to cancel.",
    });
    expect(getStripeMock).not.toHaveBeenCalled();
  });

  it("schedules cancellation at period end in Stripe and syncs the row", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      cancel_at_period_end: true,
    });
    getStripeMock.mockReturnValue({ subscriptions: { update } });

    const subscription = makeSubscription({
      tier: "plus",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_stripe",
    }) as Subscription;

    const result = await setCancelAtPeriodEnd(subscription, true);

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith("sub_stripe", {
      cancel_at_period_end: true,
    });
    expect(upsertMock).toHaveBeenCalledWith("user-1", "cus_1", {
      id: "sub_stripe",
      cancel_at_period_end: true,
    });
  });

  it("clears a scheduled cancellation to keep the paid plan", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      cancel_at_period_end: false,
    });
    getStripeMock.mockReturnValue({ subscriptions: { update } });

    const subscription = makeSubscription({
      tier: "pro",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_stripe",
      cancel_at_period_end: true,
    }) as Subscription;

    await expect(setCancelAtPeriodEnd(subscription, false)).resolves.toEqual({
      ok: true,
    });
    expect(update).toHaveBeenCalledWith("sub_stripe", {
      cancel_at_period_end: false,
    });
  });
});
