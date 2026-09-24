import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { replaceMock, searchParams } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchParams: new Map<string, string | null>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({
    get: (key: string) => searchParams.get(key) ?? null,
  }),
}));

import { CheckoutStart } from "@/components/checkout-start";

describe("CheckoutStart", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replaceMock.mockReset();
    searchParams.clear();
  });

  it("sends an unknown plan back to pricing", async () => {
    render(<CheckoutStart />);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/pricing");
    });
  });

  it("starts checkout for the plan and promo", async () => {
    searchParams.set("plan", "plus");
    searchParams.set("promo", "WELCOME20");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://checkout.stripe.com/pay" }), {
        status: 200,
      }),
    );
    const location = { href: "http://localhost/checkout/start" };
    vi.stubGlobal("location", location);

    render(<CheckoutStart />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "plus", interval: "month", promoCode: "WELCOME20" }),
      });
    });
    expect(location.href).toBe("https://checkout.stripe.com/pay");
  });

  it("shows the checkout error", async () => {
    searchParams.set("plan", "pro");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid or expired promo code." }), {
        status: 400,
      }),
    );

    render(<CheckoutStart />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid or expired promo code.",
    );
  });

  it("sends an anonymous checkout back to login with the plan", async () => {
    searchParams.set("plan", "plus");
    searchParams.set("promo", "WELCOME20");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    render(<CheckoutStart />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        "/login?plan=plus&promo=WELCOME20",
      );
    });
  });
});
