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

import { POST } from "@/app/api/subscription/change/route";

describe("POST /api/subscription/change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_PRICE_PLUS", "price_plus");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:43123");
    upsertMock.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    const response = await POST(
      new Request("http://localhost/api/subscription/change", {
        method: "POST",
        body: JSON.stringify({ tier: "pro" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("updates Plus to the Pro price and returns the dashboard URL", async () => {
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
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_1",
      items: { data: [{ id: "si_plus", price: { id: "price_plus" } }] },
    });
    const update = vi.fn().mockResolvedValue({
      id: "sub_1",
      items: { data: [{ id: "si_plus", price: { id: "price_pro" } }] },
    });
    getStripeMock.mockReturnValue({ subscriptions: { retrieve, update } });

    const response = await POST(
      new Request("http://localhost/api/subscription/change", {
        method: "POST",
        body: JSON.stringify({ tier: "pro" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "http://localhost:43123/dashboard",
    });
    expect(update).toHaveBeenCalledWith("sub_1", {
      items: [{ id: "si_plus", price: "price_pro" }],
      cancel_at_period_end: false,
      proration_behavior: "create_prorations",
    });
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty("flow_data");
  });
});
