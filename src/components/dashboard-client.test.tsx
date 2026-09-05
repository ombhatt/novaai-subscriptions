import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardClient } from "@/components/dashboard-client";

describe("DashboardClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading then plan/usage data", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subscription: {
            current_period_end: "2026-10-01T00:00:00.000Z",
          },
          usage: 12,
          limit: 1000,
          remaining: 988,
          tier: "free",
          status: "active",
        }),
        { status: 200 },
      ),
    );

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText("Current plan")).toBeInTheDocument();
    });

    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText(/You are on the Free plan/)).toBeInTheDocument();
    expect(screen.getByText(/12 \/ 1,000/)).toBeInTheDocument();
    expect(screen.getByText(/requests remaining this month/)).toBeInTheDocument();
  });

  it("describes remaining usage as a billing period when Stripe period dates exist", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subscription: {
            current_period_start: "2026-09-15T00:00:00.000Z",
            current_period_end: "2026-10-15T00:00:00.000Z",
          },
          usage: 12,
          limit: 50000,
          remaining: 49988,
          tier: "plus",
          status: "active",
        }),
        { status: 200 },
      ),
    );

    render(<DashboardClient />);

    expect(
      await screen.findByText(/requests remaining this billing period/),
    ).toBeInTheDocument();
  });

  it("shows an error state when subscription fetch fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("nope", { status: 500 }),
    );

    render(<DashboardClient />);

    expect(await screen.findByText("Unable to load dashboard")).toBeInTheDocument();
  });

  it("submits a chat prompt and shows the reply", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subscription: null,
            usage: 0,
            limit: 1000,
            remaining: 1000,
            tier: "free",
            status: "active",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            reply: "[basic model] Processed your request: \"hello\"",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subscription: null,
            usage: 1,
            limit: 1000,
            remaining: 999,
            tier: "free",
            status: "active",
          }),
          { status: 200 },
        ),
      );

    render(<DashboardClient />);
    await screen.findByText("Current plan");

    await user.type(
      screen.getByPlaceholderText(/Summarize our Q3 product roadmap/),
      "hello",
    );
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(
      await screen.findByText(/Processed your request: "hello"/),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows a dunning banner while past_due is still in grace", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subscription: {
            status: "past_due",
            grace_period_ends_at: "2099-01-15T00:00:00.000Z",
          },
          usage: 10,
          limit: 50000,
          remaining: 49990,
          tier: "plus",
          status: "past_due",
        }),
        { status: 200 },
      ),
    );

    render(<DashboardClient />);

    expect(await screen.findByTestId("dunning-banner")).toHaveTextContent(
      /Update your payment method/,
    );
    expect(screen.getByTestId("dunning-banner")).toHaveTextContent(/Plus/);
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument();
  });

  it("does not submit an empty chat prompt", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subscription: null,
          usage: 0,
          limit: 1000,
          remaining: 1000,
          tier: "free",
          status: "canceled",
        }),
        { status: 200 },
      ),
    );

    render(<DashboardClient />);
    await screen.findByText("Current plan");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("dashboard-status")).toHaveTextContent("canceled");
  });

  it("shows a chat error when the API fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subscription: null,
            usage: 0,
            limit: 1000,
            remaining: 1000,
            tier: "free",
            status: "active",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Monthly limit reached" }), {
          status: 429,
        }),
      );

    render(<DashboardClient />);
    await screen.findByText("Current plan");
    await user.type(
      screen.getByPlaceholderText(/Summarize our Q3 product roadmap/),
      "hello",
    );
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByTestId("chat-reply")).toHaveTextContent(
      "Monthly limit reached",
    );
  });

  it("opens the billing portal and reports portal errors", async () => {
    const user = userEvent.setup();
    const location = { href: "http://localhost/dashboard" };
    vi.stubGlobal("location", location);

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subscription: { current_period_end: "2026-10-01T00:00:00.000Z" },
            usage: 1,
            limit: 50000,
            remaining: 49999,
            tier: "plus",
            status: "active",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "No billing account" }), {
          status: 400,
        }),
      );

    render(<DashboardClient />);
    await screen.findByRole("button", { name: "Manage billing" });
    await user.click(screen.getByRole("button", { name: "Manage billing" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Manage billing" })).toBeEnabled();
    });
  });

  it("redirects to the Stripe portal URL", async () => {
    const user = userEvent.setup();
    const location = { href: "http://localhost/dashboard" };
    vi.stubGlobal("location", location);

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            subscription: null,
            usage: 0,
            limit: 50000,
            remaining: 50000,
            tier: "plus",
            status: "active",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://billing.stripe.com/p" }), {
          status: 200,
        }),
      );

    render(<DashboardClient />);
    await user.click(await screen.findByRole("button", { name: "Manage billing" }));

    await waitFor(() => {
      expect(location.href).toBe("https://billing.stripe.com/p");
    });
  });
});
