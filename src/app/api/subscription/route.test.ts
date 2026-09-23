import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, makeSubscription } from "@/test/mocks/supabase";
import { TIER_LIMITS } from "@/lib/tiers";

const { createClientMock, getStripeMock, isStripeConfiguredMock } = vi.hoisted(
  () => ({
    createClientMock: vi.fn(),
    getStripeMock: vi.fn(),
    isStripeConfiguredMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
  isStripeConfigured: isStripeConfiguredMock,
}));

import { GET } from "@/app/api/subscription/route";

describe("GET /api/subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns subscription usage and tier details", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: {
            data: makeSubscription({ tier: "plus", status: "active" }),
            error: null,
          },
          usage_counters: {
            data: { request_count: 42 },
            error: null,
          },
        },
      }),
    );

    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.tier).toBe("plus");
    expect(json.usage).toBe(42);
    expect(json.limit).toBe(TIER_LIMITS.plus.requestsPerMonth);
    expect(json.remaining).toBe(TIER_LIMITS.plus.requestsPerMonth - 42);
    expect(json.tierDetails).toEqual(TIER_LIMITS.plus);
    expect(json.lastInvoice).toBeNull();
    expect(getStripeMock).not.toHaveBeenCalled();
  });

  it("includes the latest Stripe invoice when a promo reduced Plus to $16", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    getStripeMock.mockReturnValue({
      invoices: {
        list: vi.fn().mockResolvedValue({
          data: [{ total: 1600, subtotal: 2000 }],
        }),
      },
    });
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: {
            data: makeSubscription({
              tier: "plus",
              status: "active",
              stripe_customer_id: "cus_plus",
            }),
            error: null,
          },
          usage_counters: { data: { request_count: 0 }, error: null },
        },
      }),
    );

    const json = await (await GET()).json();
    expect(json.lastInvoice).toEqual({ totalCents: 1600, subtotalCents: 2000 });
  });

  it("defaults to free when no subscription row exists", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: { data: null, error: null },
          usage_counters: { data: null, error: null },
        },
      }),
    );

    const response = await GET();
    const json = await response.json();
    expect(json.tier).toBe("free");
    expect(json.usage).toBe(0);
    expect(json.limit).toBe(TIER_LIMITS.free.requestsPerMonth);
  });
});
