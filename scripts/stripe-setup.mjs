#!/usr/bin/env node
/**
 * Creates Stripe products/prices for Plus and Pro tiers.
 * Usage: STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
 */
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.error("Set STRIPE_SECRET_KEY before running this script.");
  process.exit(1);
}

const stripe = new Stripe(secretKey);

const tiers = [
  {
    name: "NovaAI Plus",
    description: "50,000 requests/month with standard models",
    unitAmount: 2000,
    envKey: "STRIPE_PRICE_PLUS",
  },
  {
    name: "NovaAI Pro",
    description: "500,000 requests/month with all models and priority",
    unitAmount: 9900,
    envKey: "STRIPE_PRICE_PRO",
  },
];

console.log("Creating Stripe products and prices...\n");

for (const tier of tiers) {
  const product = await stripe.products.create({
    name: tier.name,
    description: tier.description,
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: tier.unitAmount,
    currency: "usd",
    recurring: { interval: "month" },
  });

  console.log(`${tier.name}`);
  console.log(`  Product ID: ${product.id}`);
  console.log(`  Price ID:   ${price.id}`);
  console.log(`  Add to .env.local: ${tier.envKey}=${price.id}\n`);
}

console.log("Done. Copy the price IDs into your .env.local file.");
