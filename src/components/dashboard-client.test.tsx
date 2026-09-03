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
});
