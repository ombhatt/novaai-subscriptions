import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const pricePlus = Deno.env.get("STRIPE_PRICE_PLUS");
const pricePro = Deno.env.get("STRIPE_PRICE_PRO");

if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing required environment variables for stripe-webhook.");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-02-24.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Tier = "free" | "plus" | "pro";
type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing" | "incomplete";

function tierFromPriceId(priceId: string | undefined): Tier {
  if (!priceId) return "free";
  if (pricePro && priceId === pricePro) return "pro";
  if (pricePlus && priceId === pricePlus) return "plus";
  return "free";
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "trialing":
      return "trialing";
    default:
      return "incomplete";
  }
}

async function recordEvent(eventId: string, eventType: string): Promise<boolean> {
  const { error } = await supabase.from("stripe_webhook_events").insert({
    id: eventId,
    event_type: eventType,
  });

  if (error?.code === "23505") return false;
  if (error) throw new Error(error.message);
  return true;
}

async function findUserId(customerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.user_id ?? null;
}

async function upsertSubscription(
  userId: string,
  customerId: string,
  subscription: Stripe.Subscription,
) {
  const priceId = subscription.items.data[0]?.price.id;
  const item = subscription.items.data[0];
  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      tier: tierFromPriceId(priceId),
      status: mapStripeStatus(subscription.status),
      current_period_start: item?.current_period_start
        ? new Date(item.current_period_start * 1000).toISOString()
        : null,
      current_period_end: item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw new Error(error.message);
}

async function downgradeToFree(userId: string, customerId?: string) {
  const { error } = await supabase
    .from("subscriptions")
    .update({
      tier: "free",
      status: "active",
      stripe_subscription_id: null,
      cancel_at_period_end: false,
      current_period_start: null,
      current_period_end: null,
      updated_at: new Date().toISOString(),
      ...(customerId ? { stripe_customer_id: customerId } : {}),
    })
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

async function handleEvent(event: Stripe.Event) {
  const isNew = await recordEvent(event.id, event.type);
  if (!isNew) return;

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
        throw new Error("Checkout session missing required fields.");
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await upsertSubscription(userId, customerId, subscription);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;

      const userId = await findUserId(customerId);
      if (!userId) throw new Error(`No user for customer ${customerId}`);

      if (subscription.status === "canceled") {
        await downgradeToFree(userId, customerId);
      } else {
        await upsertSubscription(userId, customerId, subscription);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;

      const userId = await findUserId(customerId);
      if (!userId) throw new Error(`No user for customer ${customerId}`);
      await downgradeToFree(userId, customerId);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;

      const userId = await findUserId(customerId);
      if (!userId) break;

      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "past_due", updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (error) throw new Error(error.message);
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;

      const userId = await findUserId(customerId);
      if (!userId) break;

      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (error) throw new Error(error.message);
      break;
    }
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  try {
    await handleEvent(event);
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook handler failed";
    console.error(message);
    return new Response(message, { status: 500 });
  }
});
