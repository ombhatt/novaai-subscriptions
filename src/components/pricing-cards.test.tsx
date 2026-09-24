import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PricingCards } from "@/components/pricing-cards";

describe("PricingCards", () => {
  it("renders self-serve tiers and an enterprise sales card", () => {
    render(<PricingCards />);

    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Plus")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText("$20")).toBeInTheDocument();
    expect(screen.getByText("$99")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.getByText("Most popular")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contact sales" })).toBeInTheDocument();
  });

  it("keeps the Most popular badge outside the Plus card so overflow does not clip it", () => {
    render(<PricingCards />);
    expect(screen.getByText("Most popular").closest("[data-slot=card]")).toBeNull();
  });

  it("previews a first-invoice promo on Plus and Pro without changing the monthly rate", () => {
    render(
      <PricingCards
        promoDiscount={{
          percentOff: 20,
          amountOffCents: null,
          duration: "once",
          durationInMonths: null,
        }}
      />,
    );

    expect(screen.getByText("$16")).toBeInTheDocument();
    expect(screen.getByText("$79.20")).toBeInTheDocument();
    expect(screen.getByText("$20")).toBeInTheDocument();
    expect(screen.getByText("$99")).toBeInTheDocument();
    expect(screen.getAllByText(/first invoice/i)).toHaveLength(2);
  });

  it("shows when a repeating promo expires", () => {
    render(
      <PricingCards
        promoDiscount={{
          percentOff: 20,
          amountOffCents: null,
          duration: "repeating",
          durationInMonths: 3,
        }}
      />,
    );

    expect(screen.getAllByText(/for 3 months, then/i)).toHaveLength(2);
  });

  it("does not advertise checkout promos on paid plan changes", () => {
    render(
      <PricingCards
        currentTier="plus"
        promoDiscount={{
          percentOff: 20,
          amountOffCents: null,
          duration: "once",
          durationInMonths: null,
        }}
      />,
    );

    expect(screen.queryByText("$16")).not.toBeInTheDocument();
    expect(screen.queryByText("$79.20")).not.toBeInTheDocument();
    expect(screen.queryByText(/first invoice/i)).not.toBeInTheDocument();
    expect(screen.getByText("$20")).toBeInTheDocument();
    expect(screen.getByText("$99")).toBeInTheDocument();
  });

  it("marks the current tier", () => {
    render(<PricingCards currentTier="plus" />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
  });

  it("labels Plus as a downgrade when the current plan is Pro", () => {
    render(<PricingCards currentTier="pro" />);

    expect(screen.getByRole("button", { name: "Downgrade to Plus" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Upgrade to Plus" })).not.toBeInTheDocument();
  });

  it("offers Cancel to Free on the Free card for paid plans", () => {
    render(<PricingCards currentTier="plus" />);
    expect(screen.getByRole("button", { name: "Cancel to Free" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Default plan" })).not.toBeInTheDocument();
  });

  it("keeps Included on Free when that is the current plan", () => {
    render(<PricingCards currentTier="free" />);
    expect(screen.getByRole("button", { name: "Included" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cancel to Free" })).not.toBeInTheDocument();
  });

  it("calls onSelectTier when upgrading", async () => {
    const user = userEvent.setup();
    const onSelectTier = vi.fn();
    render(<PricingCards currentTier="free" onSelectTier={onSelectTier} />);

    await user.click(screen.getByRole("button", { name: "Upgrade to Plus" }));
    expect(onSelectTier).toHaveBeenCalledWith("plus");

    await user.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    expect(onSelectTier).toHaveBeenCalledWith("pro");

    await user.click(screen.getByRole("button", { name: "Contact sales" }));
    expect(onSelectTier).toHaveBeenCalledWith("enterprise");
  });

  it("calls onSelectTier with free when a paid customer cancels to Free", async () => {
    const user = userEvent.setup();
    const onSelectTier = vi.fn();
    render(<PricingCards currentTier="pro" onSelectTier={onSelectTier} />);

    await user.click(screen.getByRole("button", { name: "Cancel to Free" }));
    expect(onSelectTier).toHaveBeenCalledWith("free");
  });

  it("shows redirecting state for loading tier", () => {
    render(<PricingCards currentTier="free" loadingTier="plus" />);
    expect(screen.getByRole("button", { name: "Redirecting…" })).toBeDisabled();
  });

  it("shows the yearly charge and monthly equivalent when annual is selected", () => {
    render(<PricingCards selectedInterval="year" />);

    expect(screen.getByText("$200")).toBeInTheDocument();
    expect(screen.getByText("$990")).toBeInTheDocument();
    expect(screen.getByText("about $16.67/mo")).toBeInTheDocument();
    expect(screen.getByText("about $82.50/mo")).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
  });

  it("labels a same-tier interval change without calling it an upgrade", () => {
    render(
      <PricingCards currentTier="plus" billingInterval="month" selectedInterval="year" />,
    );

    expect(screen.getByRole("button", { name: "Switch to annual" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Current plan" })).not.toBeInTheDocument();
  });

  it("describes a once promo against the yearly price", () => {
    render(
      <PricingCards
        selectedInterval="year"
        promoDiscount={{
          percentOff: 20,
          amountOffCents: null,
          duration: "once",
          durationInMonths: null,
        }}
      />,
    );

    expect(screen.getByText("first invoice, then $200/year")).toBeInTheDocument();
    expect(screen.getByText("$160")).toBeInTheDocument();
  });
});
