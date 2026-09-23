export type PromoDuration = "once" | "repeating" | "forever";

export interface PromoDiscount {
  percentOff: number | null;
  amountOffCents: number | null;
  duration: PromoDuration;
}

export interface InvoiceSnapshot {
  totalCents: number;
  subtotalCents: number;
}

export function formatUsdFromCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function discountedPriceCents(
  listPriceCents: number,
  discount: PromoDiscount,
): number {
  if (discount.percentOff != null) {
    return Math.round(listPriceCents * (1 - discount.percentOff / 100));
  }
  if (discount.amountOffCents != null) {
    return Math.max(0, listPriceCents - discount.amountOffCents);
  }
  return listPriceCents;
}

export function invoiceHasPromo(invoice: InvoiceSnapshot): boolean {
  return invoice.totalCents < invoice.subtotalCents;
}
