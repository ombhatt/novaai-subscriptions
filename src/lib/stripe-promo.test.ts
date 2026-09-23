import { describe, expect, it, vi } from "vitest";
import {
  findActivePromotionCode,
  getLatestInvoiceSnapshot,
  getPromotionDiscount,
} from "@/lib/stripe-promo";

describe("stripe promo helpers", () => {
  it("returns the matching active promotion code", async () => {
    const list = vi.fn().mockResolvedValue({
      data: [{ id: "promo_welcome20", promotion: { coupon: "jrr_1" } }],
    });
    const stripe = { promotionCodes: { list } } as never;

    await expect(findActivePromotionCode(stripe, "WELCOME20")).resolves.toEqual({
      id: "promo_welcome20",
      promotion: { coupon: "jrr_1" },
    });
    expect(list).toHaveBeenCalledWith({
      code: "WELCOME20",
      active: true,
      limit: 1,
      expand: ["data.promotion.coupon"],
    });
  });

  it("reads percent-off from an expanded coupon", async () => {
    const stripe = {
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
    } as never;

    await expect(getPromotionDiscount(stripe, "WELCOME20")).resolves.toEqual({
      promotionCodeId: "promo_welcome20",
      percentOff: 20,
      amountOffCents: null,
      duration: "once",
    });
  });

  it("snapshots the latest invoice totals", async () => {
    const list = vi.fn().mockResolvedValue({
      data: [{ total: 1600, subtotal: 2000 }],
    });
    const stripe = { invoices: { list } } as never;

    await expect(getLatestInvoiceSnapshot(stripe, "cus_1")).resolves.toEqual({
      totalCents: 1600,
      subtotalCents: 2000,
    });
    expect(list).toHaveBeenCalledWith({ customer: "cus_1", limit: 1 });
  });
});
