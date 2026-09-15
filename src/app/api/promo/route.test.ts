import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStripeMock, isStripeConfiguredMock } = vi.hoisted(() => ({
  getStripeMock: vi.fn(),
  isStripeConfiguredMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
  isStripeConfigured: isStripeConfiguredMock,
}));

import { GET } from "@/app/api/promo/route";

describe("GET /api/promo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when Stripe is not configured", async () => {
    isStripeConfiguredMock.mockReturnValue(false);
    const response = await GET(new Request("http://localhost/api/promo?code=WELCOME20"));
    expect(response.status).toBe(503);
  });

  it("returns valid false for a blank code without listing promotions", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    const list = vi.fn();
    getStripeMock.mockReturnValue({ promotionCodes: { list } });

    const response = await GET(new Request("http://localhost/api/promo?code=%20"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
    expect(list).not.toHaveBeenCalled();
  });

  it("returns WELCOME20 as 20% off the first invoice", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    getStripeMock.mockReturnValue({
      promotionCodes: {
        list: vi.fn().mockResolvedValue({
          data: [
            {
              id: "promo_welcome20",
              promotion: {
                type: "coupon",
                coupon: {
                  object: "coupon",
                  percent_off: 20,
                  amount_off: null,
                  duration: "once",
                },
              },
            },
          ],
        }),
      },
    });

    const response = await GET(
      new Request("http://localhost/api/promo?code=WELCOME20"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      valid: true,
      percentOff: 20,
      amountOffCents: null,
      duration: "once",
    });
  });
});
