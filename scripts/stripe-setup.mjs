#!/usr/bin/env node
/**
 * Creates Stripe products/prices for Plus and Pro tiers, plus a sample
 * WELCOME20 promotion code (20% off the first invoice).
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

const SAMPLE_PROMO_CODE = "WELCOME20";

console.log("Creating sample coupon and promotion code...\n");

const existingCodes = await stripe.promotionCodes.list({
  code: SAMPLE_PROMO_CODE,
  limit: 1,
});

if (existingCodes.data[0]) {
  console.log(`Promotion code ${SAMPLE_PROMO_CODE} already exists`);
  console.log(`  Promotion code ID: ${existingCodes.data[0].id}\n`);
} else {
  const coupon = await stripe.coupons.create({
    percent_off: 20,
    duration: "once",
    name: "Welcome 20%",
  });

  const promotionCode = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code: SAMPLE_PROMO_CODE,
  });

  console.log(`Coupon ${coupon.name}`);
  console.log(`  Coupon ID:          ${coupon.id}`);
  console.log(`  Promotion code:     ${promotionCode.code}`);
  console.log(`  Promotion code ID:  ${promotionCode.id}`);
  console.log("  20% off the first invoice. Enter it on /pricing.\n");
}

console.log("Done. Copy the price IDs into your .env.local file.");
