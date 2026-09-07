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

  it("marks the current tier", () => {
    render(<PricingCards currentTier="plus" />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
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

  it("shows redirecting state for loading tier", () => {
    render(<PricingCards currentTier="free" loadingTier="plus" />);
    expect(screen.getByRole("button", { name: "Redirecting…" })).toBeDisabled();
  });
});
