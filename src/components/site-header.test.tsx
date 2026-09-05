import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { SiteHeader } from "@/components/site-header";

describe("SiteHeader", () => {
  it("renders brand and primary nav links", () => {
    pathnameMock.mockReturnValue("/");
    render(<SiteHeader />);
    expect(screen.getByText("NovaAI")).toBeInTheDocument();
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

  it("marks the current nav link", () => {
    pathnameMock.mockReturnValue("/pricing");
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Pricing" }).className).toMatch(
      /text-foreground/,
    );
  });
});
