import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("explains that a promo is applied automatically to the first invoice", () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ tier: "free" }), { status: 200 }),
    );

    render(<PricingPageClient />);

    expect(
      screen.getByText(
        "Optional. We'll apply a valid code automatically at checkout. First-invoice discounts show on the cards; the monthly rate stays the same.",
      ),
    ).toBeInTheDocument();
  });

  it("prefills the promo field from ?promo=", () => {
    searchParamsGet.mockReturnValue("WELCOME20");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ tier: "free" }), { status: 200 }),
    );

    render(<PricingPageClient />);

    expect(screen.getByTestId("promo-code")).toHaveValue("WELCOME20");
  });

  it("previews WELCOME20 as $16 on the Plus card", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/subscription")) {
        return Promise.resolve(
          new Response(JSON.stringify({ tier: "free" }), { status: 200 }),
        );
      }
      if (url.includes("/api/promo")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              valid: true,
              percentOff: 20,
              amountOffCents: null,
              duration: "once",
              durationInMonths: null,
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    render(<PricingPageClient />);
    await user.type(screen.getByTestId("promo-code"), "WELCOME20");

    expect(await screen.findByText("$16", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("$20")).toBeInTheDocument();
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
        interval: "month",
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
        interval: "month",
      });
    });
  });

  it("opens the enterprise inquiry form instead of checkout or signup", async () => {
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
          new Response(JSON.stringify({ user: null }), { status: 200 }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    render(<PricingPageClient />);
    await user.click(screen.getByRole("button", { name: "Contact sales" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Talk to sales");
    expect(within(dialog).getByTestId("enterprise-inquiry-form")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/checkout")),
    ).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("changes an existing Plus subscription to Pro instead of opening checkout or the portal", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/subscription") && !url.includes("/api/subscription/change")) {
        return Promise.resolve(
          new Response(JSON.stringify({ tier: "plus" }), { status: 200 }),
        );
      }
      if (url.includes("/api/me")) {
        return Promise.resolve(
          new Response(JSON.stringify({ user: { id: "user-1" } }), {
            status: 200,
          }),
        );
      }
      if (url.includes("/api/subscription/change")) {
        return Promise.resolve(
          new Response(JSON.stringify({ url: "http://localhost/dashboard" }), {
            status: 200,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const location = { href: "http://localhost/pricing" };
    vi.stubGlobal("location", location);

    render(<PricingPageClient />);
    await screen.findByRole("button", { name: "Current plan" });
    await user.click(screen.getByRole("button", { name: "Upgrade to Pro" }));

    await waitFor(() => {
      expect(location.href).toBe("http://localhost/dashboard");
    });

    const changeCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/api/subscription/change") && init?.method === "POST",
    );
    expect(JSON.parse(String(changeCall?.[1]?.body))).toEqual({
      tier: "pro",
      interval: "month",
    });
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/portal")),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/checkout")),
    ).toBe(false);
  });

  it("changes an existing Pro subscription to Plus instead of opening the billing portal", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/subscription") && !url.includes("/api/subscription/change")) {
        return Promise.resolve(
          new Response(JSON.stringify({ tier: "pro" }), { status: 200 }),
        );
      }
      if (url.includes("/api/me")) {
        return Promise.resolve(
          new Response(JSON.stringify({ user: { id: "user-1" } }), {
            status: 200,
          }),
        );
      }
      if (url.includes("/api/subscription/change")) {
        return Promise.resolve(
          new Response(JSON.stringify({ url: "http://localhost/dashboard" }), {
            status: 200,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const location = { href: "http://localhost/pricing" };
    vi.stubGlobal("location", location);

    render(<PricingPageClient />);
    await screen.findByRole("button", { name: "Current plan" });
    await user.click(screen.getByRole("button", { name: "Downgrade to Plus" }));

    await waitFor(() => {
      expect(location.href).toBe("http://localhost/dashboard");
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/api/subscription/change") && init?.method === "POST",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/portal")),
    ).toBe(false);
  });

  it("lets a customer cancel a pending change by keeping the current plan", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/subscription") && !url.includes("/api/subscription/change")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              tier: "plus",
              subscription: {
                billing_interval: "year",
                pending_tier: "plus",
                pending_billing_interval: "month",
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/me")) {
        return Promise.resolve(
          new Response(JSON.stringify({ user: { id: "user-1" } }), {
            status: 200,
          }),
        );
      }
      if (url.includes("/api/subscription/change")) {
        return Promise.resolve(
          new Response(JSON.stringify({ url: "http://localhost/dashboard" }), {
            status: 200,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const location = { href: "http://localhost/pricing" };
    vi.stubGlobal("location", location);

    render(<PricingPageClient />);
    await user.click(await screen.findByRole("button", { name: "Keep current plan" }));

    await waitFor(() => {
      expect(location.href).toBe("http://localhost/dashboard");
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/api/subscription/change") && init?.method === "POST",
      ),
    ).toBe(true);
  });

  it("schedules cancel-at-period-end when a Plus customer chooses Cancel to Free", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/subscription") && !url.includes("/api/subscription/cancel")) {
        return Promise.resolve(
          new Response(JSON.stringify({ tier: "plus" }), { status: 200 }),
        );
      }
      if (url.includes("/api/subscription/cancel")) {
        return Promise.resolve(
          new Response(JSON.stringify({ cancelAtPeriodEnd: true }), { status: 200 }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const location = { href: "http://localhost/pricing" };
    vi.stubGlobal("location", location);

    render(<PricingPageClient />);
    await screen.findByRole("button", { name: "Current plan" });
    await user.click(screen.getByRole("button", { name: "Cancel to Free" }));

    await waitFor(() => {
      expect(location.href).toBe("/dashboard");
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/api/subscription/cancel") && init?.method === "POST",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/checkout")),
    ).toBe(false);
  });
});
