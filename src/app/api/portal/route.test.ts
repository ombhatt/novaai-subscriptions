import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, makeSubscription } from "@/test/mocks/supabase";

const {
  createClientMock,
  getStripeMock,
  isStripeConfiguredMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getStripeMock: vi.fn(),
  isStripeConfiguredMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
  isStripeConfigured: isStripeConfiguredMock,
}));

import { POST } from "@/app/api/portal/route";

describe("POST /api/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:43123");
  });

  it("returns 503 when Stripe is not configured", async () => {
    isStripeConfiguredMock.mockReturnValue(false);
    const response = await POST();
    expect(response.status).toBe(503);
  });

  it("returns 401 when unauthenticated", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("returns 400 when no Stripe customer exists", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: {
            data: makeSubscription({ stripe_customer_id: null }),
            error: null,
          },
        },
      }),
    );

    const response = await POST();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/No billing account/),
    });
  });

  it("creates a billing portal session", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: {
            data: makeSubscription({ stripe_customer_id: "cus_123" }),
            error: null,
          },
        },
      }),
    );

    const createPortal = vi.fn().mockResolvedValue({
      url: "https://billing.stripe.com/session/test",
    });
    getStripeMock.mockReturnValue({
      billingPortal: { sessions: { create: createPortal } },
    });

    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://billing.stripe.com/session/test",
    });
    expect(createPortal).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "http://localhost:43123/dashboard",
    });
  });
});
