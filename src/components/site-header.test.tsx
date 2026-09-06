import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { pathnameMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/"),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    "aria-current": ariaCurrent,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    "aria-current"?: "page";
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

import { SiteHeader } from "@/components/site-header";

describe("SiteHeader", () => {
  it("renders brand and primary nav links", async () => {
    const user = userEvent.setup();
    pathnameMock.mockReturnValue("/");
    render(<SiteHeader />);
    expect(screen.getByText("NovaAI")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute(
      "href",
      "/pricing",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("marks the current nav link", async () => {
    const user = userEvent.setup();
    pathnameMock.mockReturnValue("/pricing");
    render(<SiteHeader />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
