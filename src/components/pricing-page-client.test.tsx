import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { pushMock, searchParamsGet } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  searchParamsGet: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => ({ get: searchParamsGet }),
}));

import { PricingPageClient } from "@/components/pricing-page-client";

describe("PricingPageClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pushMock.mockReset();
    searchParamsGet.mockReturnValue(null);
  });

  it("prefills the promo field from ?promo=", () => {
    searchParamsGet.mockReturnValue("WELCOME20");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ tier: "free" }), { status: 200 }),
    );

    render(<PricingPageClient />);

    expect(screen.getByTestId("promo-code")).toHaveValue("WELCOME20");
  });

  it("includes promoCode in the checkout request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/subscription")) {
        return Promise.resolve(
          new Response(JSON.stringify({ tier: "free" }), { status: 200 }),
        );
      }
      if (url.includes("/api/me")) {
        return Promise.resolve(
          new Response(JSON.stringify({ user: { id: "user-1" } }), {
            status: 200,
          }),
        );
      }
      if (url.includes("/api/checkout")) {
        return Promise.resolve(
          new Response(JSON.stringify({ url: "https://checkout.stripe.com/x" }), {
            status: 200,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const location = { href: "http://localhost/pricing" };
    vi.stubGlobal("location", location);

    render(<PricingPageClient />);

    await user.type(screen.getByTestId("promo-code"), "WELCOME20");
    await user.click(screen.getByRole("button", { name: "Upgrade to Plus" }));

    await waitFor(() => {
      const checkoutCall = fetchMock.mock.calls.find(([url, init]) => {
        return String(url).includes("/api/checkout") && init?.method === "POST";
      });
      expect(checkoutCall).toBeDefined();
      expect(JSON.parse(String(checkoutCall?.[1]?.body))).toEqual({
        tier: "plus",
        promoCode: "WELCOME20",
      });
    });
    expect(location.href).toBe("https://checkout.stripe.com/x");
  });

  it("shows the error banner on an invalid promo and keeps the code", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/subscription")) {
        return Promise.resolve(
          new Response(JSON.stringify({ tier: "free" }), { status: 200 }),
        );
      }
      if (url.includes("/api/me")) {
        return Promise.resolve(
          new Response(JSON.stringify({ user: { id: "user-1" } }), {
            status: 200,
          }),
        );
      }
      if (url.includes("/api/checkout")) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Invalid or expired promo code." }), {
            status: 400,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    render(<PricingPageClient />);

    await user.type(screen.getByTestId("promo-code"), "NOPE");
    await user.click(screen.getByRole("button", { name: "Upgrade to Plus" }));

    expect(await screen.findByTestId("checkout-error")).toHaveTextContent(
      "Invalid or expired promo code.",
    );
    expect(screen.getByTestId("promo-code")).toHaveValue("NOPE");
  });

  it("sends guests to signup with plan and promo query params", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/subscription")) {
        return Promise.resolve(
          new Response(JSON.stringify({ tier: "free" }), { status: 200 }),
        );
      }
      if (url.includes("/api/me")) {
        return Promise.resolve(
          new Response(JSON.stringify({ user: null }), { status: 200 }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    render(<PricingPageClient />);
    await user.type(screen.getByTestId("promo-code"), "WELCOME20");
    await user.click(screen.getByRole("button", { name: "Upgrade to Plus" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/signup?plan=plus&promo=WELCOME20");
    });
  });

  it("omits promoCode when the field is empty", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/subscription")) {
        return Promise.resolve(
          new Response(JSON.stringify({ tier: "free" }), { status: 200 }),
        );
      }
      if (url.includes("/api/me")) {
        return Promise.resolve(
          new Response(JSON.stringify({ user: { id: "user-1" } }), {
            status: 200,
          }),
        );
      }
      if (url.includes("/api/checkout")) {
        return Promise.resolve(
          new Response(JSON.stringify({ url: "https://checkout.stripe.com/x" }), {
            status: 200,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const location = { href: "http://localhost/pricing" };
    vi.stubGlobal("location", location);

    render(<PricingPageClient />);
    await user.click(screen.getByRole("button", { name: "Upgrade to Plus" }));

    await waitFor(() => {
      const checkoutCall = fetchMock.mock.calls.find(([url, init]) => {
        return String(url).includes("/api/checkout") && init?.method === "POST";
      });
      expect(JSON.parse(String(checkoutCall?.[1]?.body))).toEqual({
        tier: "plus",
      });
    });
  });
});
