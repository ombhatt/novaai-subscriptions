import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, makeSubscription } from "@/test/mocks/supabase";

const {
  createClientMock,
  getStripeMock,
  isStripeConfiguredMock,
  upsertMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getStripeMock: vi.fn(),
  isStripeConfiguredMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
  isStripeConfigured: isStripeConfiguredMock,
}));

vi.mock("@/lib/stripe-webhook-handler", () => ({
  upsertSubscriptionFromStripe: upsertMock,
}));

import { POST as cancelSubscription } from "@/app/api/subscription/cancel/route";
import { POST as resumeSubscription } from "@/app/api/subscription/resume/route";

describe("subscription cancellation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    const response = await cancelSubscription();
    expect(response.status).toBe(401);
  });

  it("schedules Plus cancellation at period end", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: {
            data: makeSubscription({
              tier: "plus",
              stripe_customer_id: "cus_1",
              stripe_subscription_id: "sub_1",
            }),
            error: null,
          },
        },
      }),
    );
    const update = vi.fn().mockResolvedValue({
      id: "sub_1",
      cancel_at_period_end: true,
    });
    getStripeMock.mockReturnValue({ subscriptions: { update } });

    const response = await cancelSubscription();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cancelAtPeriodEnd: true });
    expect(update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
  });

  it("resumes a scheduled cancellation", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: {
            data: makeSubscription({
              tier: "pro",
              stripe_customer_id: "cus_1",
              stripe_subscription_id: "sub_1",
              cancel_at_period_end: true,
            }),
            error: null,
          },
        },
      }),
    );
    const update = vi.fn().mockResolvedValue({
      id: "sub_1",
      cancel_at_period_end: false,
    });
    getStripeMock.mockReturnValue({ subscriptions: { update } });

    const response = await resumeSubscription();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cancelAtPeriodEnd: false });
    expect(update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: false });
  });
});
