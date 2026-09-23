import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  pushMock,
  refreshMock,
  createClientMock,
  isSupabaseConfiguredMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  createClientMock: vi.fn(),
  isSupabaseConfiguredMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
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

vi.mock("@/lib/config", () => ({
  isSupabaseConfigured: isSupabaseConfiguredMock,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: createClientMock,
}));

import { AuthForm } from "@/components/auth-form";

describe("AuthForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfiguredMock.mockReturnValue(true);
  });

  it("renders login copy without full name field", () => {
    render(<AuthForm mode="login" />);
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });

  it("renders signup with full name field", () => {
    render(<AuthForm mode="signup" />);
    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });

  it("shows config error when Supabase is not configured", async () => {
    const user = userEvent.setup();
    isSupabaseConfiguredMock.mockReturnValue(false);
    render(<AuthForm mode="login" />);

    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText(/Supabase is not configured/),
    ).toBeInTheDocument();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("signs in and redirects to dashboard", async () => {
    const user = userEvent.setup();
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue({
      auth: { signInWithPassword, signUp: vi.fn() },
    });

    render(<AuthForm mode="login" />);
    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "a@b.com",
        password: "password1",
      });
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("signs up with full name metadata", async () => {
    const user = userEvent.setup();
    const signUp = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue({
      auth: { signInWithPassword: vi.fn(), signUp },
    });

    render(<AuthForm mode="signup" />);
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "password1",
        options: { data: { full_name: "Ada Lovelace" } },
      });
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("continues signup to checkout for the chosen plan and promo", async () => {
    const user = userEvent.setup();
    const signUp = vi.fn().mockResolvedValue({
      data: { session: { access_token: "session" } },
      error: null,
    });
    createClientMock.mockReturnValue({
      auth: { signInWithPassword: vi.fn(), signUp },
    });

    render(<AuthForm mode="signup" plan="plus" promo="WELCOME20" />);
    expect(
      screen.getByText("Create your account to continue to Plus checkout."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?plan=plus&promo=WELCOME20",
    );

    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "password1",
        options: {
          data: { full_name: "Ada Lovelace" },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/checkout/start?plan=plus&promo=WELCOME20")}`,
        },
      });
      expect(pushMock).toHaveBeenCalledWith(
        "/checkout/start?plan=plus&promo=WELCOME20",
      );
    });
  });

  it("asks the user to confirm email before checkout when signup has no session", async () => {
    const user = userEvent.setup();
    const signUp = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    createClientMock.mockReturnValue({
      auth: { signInWithPassword: vi.fn(), signUp },
    });

    render(<AuthForm mode="signup" plan="pro" />);
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check your email to continue to checkout.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("continues sign-in to checkout for the chosen plan", async () => {
    const user = userEvent.setup();
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue({
      auth: { signInWithPassword, signUp: vi.fn() },
    });

    render(<AuthForm mode="login" plan="pro" promo=" SAVE20 " />);
    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/checkout/start?plan=pro&promo=SAVE20");
    });
  });

  it("surfaces auth errors", async () => {
    const user = userEvent.setup();
    createClientMock.mockReturnValue({
      auth: {
        signInWithPassword: vi
          .fn()
          .mockResolvedValue({ error: new Error("Invalid login") }),
        signUp: vi.fn(),
      },
    });

    render(<AuthForm mode="login" />);
    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });
});
