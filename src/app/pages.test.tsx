import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.spyOn(global, "fetch").mockResolvedValue(
  new Response(JSON.stringify({ tier: "free" }), { status: 200 }),
);

import RootLayout from "@/app/layout";
import HomePage from "@/app/page";
import LoginPage from "@/app/login/page";
import SignupPage from "@/app/signup/page";
import DashboardPage from "@/app/dashboard/page";
import PricingPage from "@/app/pricing/page";

describe("app pages", () => {
  it("renders the root layout", () => {
    render(
      <RootLayout params={Promise.resolve({})}>
        <div>child</div>
      </RootLayout>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("renders the home page hero", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", {
        name: /Ship AI products with simple, predictable pricing/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start for free/ })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("renders login and signup shells", () => {
    const { unmount } = render(<LoginPage />);
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    unmount();

    render(<SignupPage />);
    expect(screen.getByText("Create your account")).toBeInTheDocument();
  });

  it("renders the dashboard heading", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("renders the pricing page", () => {
    render(<PricingPage />);
    expect(
      screen.getByRole("heading", { name: /Simple pricing for every stage/ }),
    ).toBeInTheDocument();
  });
});
