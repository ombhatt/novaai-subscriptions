import { describe, expect, it } from "vitest";
import {
  discountedPriceCents,
  formatUsdFromCents,
  invoiceHasPromo,
} from "@/lib/promo";

describe("promo pricing", () => {
  it("turns WELCOME20 into $16 on a $20 Plus invoice", () => {
    expect(
      discountedPriceCents(2000, {
        percentOff: 20,
        amountOffCents: null,
        duration: "once",
      }),
    ).toBe(1600);
    expect(formatUsdFromCents(1600)).toBe("$16");
  });

  it("treats a lower invoice total than subtotal as a promo", () => {
    expect(invoiceHasPromo({ totalCents: 1600, subtotalCents: 2000 })).toBe(true);
    expect(invoiceHasPromo({ totalCents: 2000, subtotalCents: 2000 })).toBe(false);
  });
});
