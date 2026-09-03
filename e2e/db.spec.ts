import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { isDbConfigured, loadEnvLocal } from "../src/test/db";
import { signUpViaUi, uniqueCredentials } from "./helpers/auth";

loadEnvLocal();

test.describe("db + rls after signup", () => {
  test.skip(
    !isDbConfigured(),
    "Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY",
  );

  test("signup trigger provisions Free, chat increments usage, RLS blocks tier escalation", async ({
    page,
  }) => {
    const creds = uniqueCredentials();
    await signUpViaUi(page, creds);

    await expect(page.getByTestId("dashboard-plan")).toContainText("Free");
    await expect(page.getByTestId("dashboard-status")).toHaveText("active");
    await expect(page.getByTestId("dashboard-usage")).toHaveText("0 / 1,000");

    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: session, error: signInError } = await client.auth.signInWithPassword({
      email: creds.email,
      password: creds.password,
    });
    expect(signInError).toBeNull();
    const userId = session.user?.id;
    expect(userId).toBeTruthy();

    const { data: subscription } = await client
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", userId!)
      .single();
    expect(subscription).toMatchObject({ tier: "free", status: "active" });

    await page.getByLabel("Prompt").fill("increment usage via chat");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByTestId("chat-reply")).toContainText("increment usage via chat");
    await expect(page.getByTestId("dashboard-usage")).toHaveText("1 / 1,000");

    const { data: usage } = await client
      .from("usage_counters")
      .select("request_count")
      .eq("user_id", userId!);
    expect(usage).toHaveLength(1);
    expect(usage?.[0]?.request_count).toBe(1);

    const escalate = await client
      .from("subscriptions")
      .update({ tier: "pro" })
      .eq("user_id", userId!)
      .select("tier");
    expect(escalate.data ?? []).toEqual([]);

    const { data: after } = await client
      .from("subscriptions")
      .select("tier")
      .eq("user_id", userId!)
      .single();
    expect(after?.tier).toBe("free");
    await expect(page.getByTestId("dashboard-plan")).toContainText("Free");

    const rpc = await client.rpc("increment_usage", {
      p_user_id: userId,
      p_period_start: new Date().toISOString().slice(0, 10),
    });
    expect(rpc.error).toBeTruthy();
  });
});
