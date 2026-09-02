/** @vitest-environment node */

import { afterAll, describe, expect, it } from "vitest";
import { getCurrentPeriodStart } from "@/lib/entitlements";
import {
  adminClient,
  anonClient,
  createDbUser,
  deleteDbUser,
  isDbConfigured,
  signInUser,
} from "@/test/db";

const enabled = isDbConfigured();
const createdIds: string[] = [];

async function makeUser(fullName?: string) {
  const user = await createDbUser(fullName);
  createdIds.push(user.id);
  return user;
}

afterAll(async () => {
  await Promise.all(createdIds.map((id) => deleteDbUser(id).catch(() => undefined)));
});

describe.skipIf(!enabled)("signup trigger", () => {
  it("creates a profile and Free/active subscription for a new auth user", async () => {
    const user = await makeUser("Ada Lovelace");
    const admin = adminClient();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", user.id)
      .single();

    expect(profileError).toBeNull();
    expect(profile).toMatchObject({
      id: user.id,
      email: user.email,
      full_name: "Ada Lovelace",
    });

    const { data: subscription, error: subError } = await admin
      .from("subscriptions")
      .select("user_id, tier, status")
      .eq("user_id", user.id)
      .single();

    expect(subError).toBeNull();
    expect(subscription).toMatchObject({
      user_id: user.id,
      tier: "free",
      status: "active",
    });
  });
});

describe.skipIf(!enabled)("increment_usage", () => {
  it("upserts the UTC month counter and returns a monotonic count", async () => {
    const user = await makeUser();
    const admin = adminClient();
    const period = getCurrentPeriodStart();

    const first = await admin.rpc("increment_usage", { p_user_id: user.id });
    expect(first.error).toBeNull();
    expect(first.data).toBe(1);

    const second = await admin.rpc("increment_usage", { p_user_id: user.id });
    expect(second.error).toBeNull();
    expect(second.data).toBe(2);

    const { data: row, error } = await admin
      .from("usage_counters")
      .select("user_id, period_start, request_count")
      .eq("user_id", user.id)
      .single();

    expect(error).toBeNull();
    expect(row?.request_count).toBe(2);
    expect(String(row?.period_start).slice(0, 10)).toBe(period);
  });

  it("is not executable by an authenticated user", async () => {
    const user = await makeUser();
    const client = await signInUser(user.email, user.password);

    const { data, error } = await client.rpc("increment_usage", {
      p_user_id: user.id,
    });

    expect(data).not.toBe(1);
    expect(error).toBeTruthy();
  });
});

describe.skipIf(!enabled)("row level security", () => {
  it("lets a user read only their own profile, subscription, and usage", async () => {
    const alice = await makeUser("Alice");
    const bob = await makeUser("Bob");
    const admin = adminClient();
    await admin.rpc("increment_usage", { p_user_id: alice.id });
    await admin.rpc("increment_usage", { p_user_id: bob.id });

    const aliceClient = await signInUser(alice.email, alice.password);

    const { data: profiles } = await aliceClient.from("profiles").select("id");
    expect(profiles?.map((row) => row.id)).toEqual([alice.id]);

    const { data: subscriptions } = await aliceClient
      .from("subscriptions")
      .select("user_id, tier");
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions?.[0]).toMatchObject({ user_id: alice.id, tier: "free" });

    const { data: otherSub } = await aliceClient
      .from("subscriptions")
      .select("user_id")
      .eq("user_id", bob.id);
    expect(otherSub).toEqual([]);

    const { data: usage } = await aliceClient
      .from("usage_counters")
      .select("user_id, request_count");
    expect(usage).toHaveLength(1);
    expect(usage?.[0]).toMatchObject({ user_id: alice.id, request_count: 1 });

    const { data: otherUsage } = await aliceClient
      .from("usage_counters")
      .select("user_id")
      .eq("user_id", bob.id);
    expect(otherUsage).toEqual([]);
  });

  it("prevents a user from escalating their own tier", async () => {
    const user = await makeUser();
    const client = await signInUser(user.email, user.password);

    const { data } = await client
      .from("subscriptions")
      .update({ tier: "pro" })
      .eq("user_id", user.id)
      .select("tier");

    expect(data ?? []).toEqual([]);

    const { data: after } = await adminClient()
      .from("subscriptions")
      .select("tier")
      .eq("user_id", user.id)
      .single();
    expect(after?.tier).toBe("free");
  });

  it("prevents a user from inserting usage counters", async () => {
    const user = await makeUser();
    const client = await signInUser(user.email, user.password);

    const { error } = await client.from("usage_counters").insert({
      user_id: user.id,
      period_start: getCurrentPeriodStart(),
      request_count: 999,
    });

    expect(error).toBeTruthy();

    const { data } = await adminClient()
      .from("usage_counters")
      .select("id")
      .eq("user_id", user.id);
    expect(data).toEqual([]);
  });

  it("blocks authenticated access to stripe_webhook_events", async () => {
    const user = await makeUser();
    const client = await signInUser(user.email, user.password);
    const eventId = `evt_rls_${user.id}`;

    const insert = await client.from("stripe_webhook_events").insert({
      id: eventId,
      event_type: "test.event",
    });
    expect(insert.error).toBeTruthy();

    const select = await client.from("stripe_webhook_events").select("id");
    expect(select.data ?? []).toEqual([]);
  });

  it("hides subscriptions from anonymous clients", async () => {
    const user = await makeUser();
    const anon = anonClient();

    const { data } = await anon
      .from("subscriptions")
      .select("user_id")
      .eq("user_id", user.id);

    expect(data ?? []).toEqual([]);
  });
});
