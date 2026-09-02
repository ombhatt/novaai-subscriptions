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

    expect(await screen.findByText("Invalid login")).toBeInTheDocument();
  });
});
