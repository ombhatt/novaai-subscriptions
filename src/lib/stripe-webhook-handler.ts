import type Stripe from "stripe";
import { isWithinDunningGrace, nextGracePeriodEndsAt } from "@/lib/dunning";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getInvoiceSubscriptionId,
  getSubscriptionPeriod,
} from "@/lib/stripe-subscription";
import {
  billingIntervalFromStripePrice,
  tierFromStripePriceId,
  type BillingInterval,
  type Tier,
} from "@/lib/tiers";
import type { SubscriptionStatus } from "@/lib/tiers";

async function pendingPlanColumns(
  userId: string,
  tier: Tier,
  billingInterval: BillingInterval,
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("pending_tier, pending_billing_interval")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up a scheduled plan change: ${error.message}`);
  }

  const waiting =
    data?.pending_tier &&
    (data.pending_tier !== tier || data.pending_billing_interval !== billingInterval);

  return waiting
    ? {
        pending_tier: data.pending_tier,
        pending_billing_interval: data.pending_billing_interval,
      }
    : { pending_tier: null, pending_billing_interval: null };
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    case "trialing":
      return "trialing";
    default:
      return "incomplete";
  }
}

async function recordWebhookEvent(eventId: string, eventType: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("stripe_webhook_events").insert({
    id: eventId,
    event_type: eventType,
    processed_at: null,
  });

  if (error?.code === "23505") {
    const { data, error: lookupError } = await supabase
      .from("stripe_webhook_events")
      .select("processed_at")
      .eq("id", eventId)
      .maybeSingle();

    if (lookupError) {
      throw new Error(`Failed to inspect webhook event: ${lookupError.message}`);
    }

    return data?.processed_at == null;
  }

  if (error) {
    throw new Error(`Failed to record webhook event: ${error.message}`);
  }

  return true;
}

async function completeWebhookEvent(eventId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) {
    throw new Error(`Failed to complete webhook event: ${error.message}`);
  }
}

async function releaseWebhookEvent(eventId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("stripe_webhook_events").delete().eq("id", eventId);

  if (error) {
    throw new Error(`Failed to release webhook event: ${error.message}`);
  }
}

async function findSubscriptionOwnerByCustomerId(
  customerId: string,
): Promise<{ userId: string; subscriptionId: string | null } | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("user_id, stripe_subscription_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up customer: ${error.message}`);
  }

  return data
    ? {
        userId: data.user_id,
        subscriptionId: data.stripe_subscription_id,
      }
    : null;
}

async function existingGracePeriodEndsAt(userId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("grace_period_ends_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up grace period: ${error.message}`);
  }

  return data?.grace_period_ends_at ?? null;
}

export async function upsertSubscriptionFromStripe(
  userId: string,
  customerId: string,
  subscription: Stripe.Subscription,
  expectedSubscriptionId?: string,
) {
  const supabase = createAdminClient();
  const price = subscription.items.data[0]?.price;
  const priceId = price?.id;
  const tier = tierFromStripePriceId(priceId);
  const billingInterval = billingIntervalFromStripePrice(price);
  const pending = await pendingPlanColumns(userId, tier, billingInterval);
  const { currentPeriodStart, currentPeriodEnd } = getSubscriptionPeriod(subscription);
  const status = mapStripeStatus(subscription.status);
  const gracePeriodEndsAt = nextGracePeriodEndsAt(
    await existingGracePeriodEndsAt(userId),
    status,
  );

  const values = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    tier,
    billing_interval: billingInterval,
    ...pending,
    status,
    current_period_start: currentPeriodStart
      ? new Date(currentPeriodStart * 1000).toISOString()
      : null,
    current_period_end: currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    grace_period_ends_at: gracePeriodEndsAt,
    updated_at: new Date().toISOString(),
  };
  const { error } = expectedSubscriptionId
    ? await supabase
        .from("subscriptions")
        .update(values)
        .eq("user_id", userId)
        .eq("stripe_subscription_id", expectedSubscriptionId)
    : await supabase.from("subscriptions").upsert(values, { onConflict: "user_id" });

  if (error) {
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }
}

export async function downgradeToFree(
  userId: string,
  customerId?: string,
  expectedSubscriptionId?: string,
) {
  const supabase = createAdminClient();
  const { data: subscription, error: lookupError } = await supabase
    .from("subscriptions")
    .select("status, grace_period_ends_at, stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to check dunning grace: ${lookupError.message}`);
  }

  if (
    expectedSubscriptionId &&
    subscription?.stripe_subscription_id !== expectedSubscriptionId
  ) {
    return;
  }

  if (isWithinDunningGrace(subscription)) {
    return;
  }

  let update = supabase
    .from("subscriptions")
    .update({
      tier: "free",
      billing_interval: "month",
      pending_tier: null,
      pending_billing_interval: null,
      status: "active",
      stripe_subscription_id: null,
      cancel_at_period_end: false,
      current_period_start: null,
      current_period_end: null,
      grace_period_ends_at: null,
      updated_at: new Date().toISOString(),
      ...(customerId ? { stripe_customer_id: customerId } : {}),
    })
    .eq("user_id", userId);

  if (expectedSubscriptionId) {
    update = update.eq("stripe_subscription_id", expectedSubscriptionId);
  }

  const { error } = await update;

  if (error) {
    throw new Error(`Failed to downgrade subscription: ${error.message}`);
  }
}

async function processStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (!userId || !customerId || !subscriptionId) {
        throw new Error("Checkout session missing user_id, customer, or subscription.");
      }

      const stripe = await import("@/lib/stripe").then((m) => m.getStripe());
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await upsertSubscriptionFromStripe(userId, customerId, subscription);
      break;
    }

    case "customer.subscription.updated": {
      const eventSubscription = event.data.object as Stripe.Subscription;
      const stripe = await import("@/lib/stripe").then((m) => m.getStripe());
      const subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;

      const owner = await findSubscriptionOwnerByCustomerId(customerId);
      if (!owner) {
        throw new Error(`No user found for customer ${customerId}`);
      }

      if (subscription.status === "canceled") {
        await downgradeToFree(owner.userId, customerId, subscription.id);
      } else {
        if (owner.subscriptionId !== subscription.id) break;
        await upsertSubscriptionFromStripe(
          owner.userId,
          customerId,
          subscription,
          subscription.id,
        );
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;

      const owner = await findSubscriptionOwnerByCustomerId(customerId);
      if (!owner) {
        throw new Error(`No user found for customer ${customerId}`);
      }

      await downgradeToFree(owner.userId, customerId, subscription.id);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

      if (!customerId) break;

      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (!subscriptionId) break;

      const owner = await findSubscriptionOwnerByCustomerId(customerId);
      if (!owner || owner.subscriptionId !== subscriptionId) break;

      const gracePeriodEndsAt = nextGracePeriodEndsAt(
        await existingGracePeriodEndsAt(owner.userId),
        "past_due",
      );

      const supabase = createAdminClient();
      const { error } = await supabase
        .from("subscriptions")
        .update({
          status: "past_due",
          grace_period_ends_at: gracePeriodEndsAt,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", owner.userId)
        .eq("stripe_subscription_id", subscriptionId);

      if (error) {
        throw new Error(`Failed to mark subscription past_due: ${error.message}`);
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

      if (!customerId) break;

      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (!subscriptionId) break;

      const owner = await findSubscriptionOwnerByCustomerId(customerId);
      if (!owner || owner.subscriptionId !== subscriptionId) break;

      const stripe = await import("@/lib/stripe").then((m) => m.getStripe());
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await upsertSubscriptionFromStripe(
        owner.userId,
        customerId,
        subscription,
        subscriptionId,
      );
      break;
    }

    default:
      break;
  }
}

export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  const isNew = await recordWebhookEvent(event.id, event.type);
  if (!isNew) {
    return;
  }

  try {
    await processStripeWebhookEvent(event);
    await completeWebhookEvent(event.id);
  } catch (error) {
    try {
      await releaseWebhookEvent(event.id);
    } catch (releaseError) {
      console.error(releaseError);
    }
    throw error;
  }
}
