import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { pathnameMock, signOutMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/"),
  signOutMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signOut: signOutMock },
  }),
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders brand and primary nav links", async () => {
    const user = userEvent.setup();
    pathnameMock.mockReturnValue("/");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
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
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("shows Sign out instead of Log in when a session exists", async () => {
    pathnameMock.mockReturnValue("/dashboard");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "user-1", email: "a@b.com" } }), {
        status: 200,
      }),
    );

    render(<SiteHeader />);

    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Get started" })).not.toBeInTheDocument();
  });

  it("marks the current nav link", async () => {
    const user = userEvent.setup();
    pathnameMock.mockReturnValue("/pricing");
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
    render(<SiteHeader />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
