#!/usr/bin/env node
/**
 * Creates Stripe products/prices for Plus and Pro tiers, plus a sample
 * WELCOME20 promotion code (20% off the first invoice).
 *
 * Reuses STRIPE_PRICE_PLUS / STRIPE_PRICE_PRO when they are already set
 * in the environment or .env.local so re-runs do not mint new price IDs.
 *
 * Usage: node scripts/stripe-setup.mjs
 *        STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Stripe from "stripe";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function isConfiguredPriceId(value) {
  return Boolean(value) && value.startsWith("price_") && !value.includes("...");
}

loadEnvLocal();

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.error("Set STRIPE_SECRET_KEY in .env.local or the environment.");
  process.exit(1);
}

const stripe = new Stripe(secretKey);

const tiers = [
  {
    name: "NovaAI Plus",
    description: "50,000 requests/month with standard models",
    unitAmount: 2000,
    envKey: "STRIPE_PRICE_PLUS",
    annualUnitAmount: 20000,
    annualEnvKey: "STRIPE_PRICE_PLUS_ANNUAL",
  },
  {
    name: "NovaAI Pro",
    description: "500,000 requests/month with all models and priority",
    unitAmount: 9900,
    envKey: "STRIPE_PRICE_PRO",
    annualUnitAmount: 99000,
    annualEnvKey: "STRIPE_PRICE_PRO_ANNUAL",
  },
];

console.log("Creating Stripe products and prices...\n");

const createdPriceKeys = [];

for (const tier of tiers) {
  const existingPriceId = process.env[tier.envKey];
  let productId;

  if (isConfiguredPriceId(existingPriceId)) {
    console.log(`${tier.name}`);
    console.log(`  Already configured: ${tier.envKey}=${existingPriceId}`);
    const monthly = await stripe.prices.retrieve(existingPriceId);
    productId = typeof monthly.product === "string" ? monthly.product : monthly.product.id;
  } else {
    const product = await stripe.products.create({
      name: tier.name,
      description: tier.description,
    });
    productId = product.id;

    const price = await stripe.prices.create({
      product: productId,
      unit_amount: tier.unitAmount,
      currency: "usd",
      recurring: { interval: "month" },
    });

    createdPriceKeys.push(`${tier.envKey}=${price.id}`);

    console.log(`${tier.name}`);
    console.log(`  Product ID: ${product.id}`);
    console.log(`  Price ID:   ${price.id}`);
    console.log(`  Add to .env.local: ${tier.envKey}=${price.id}`);
  }

  const existingAnnualId = process.env[tier.annualEnvKey];
  if (isConfiguredPriceId(existingAnnualId)) {
    console.log(`  Already configured: ${tier.annualEnvKey}=${existingAnnualId}\n`);
    continue;
  }

  const annualPrice = await stripe.prices.create({
    product: productId,
    unit_amount: tier.annualUnitAmount,
    currency: "usd",
    recurring: { interval: "year" },
  });

  createdPriceKeys.push(`${tier.annualEnvKey}=${annualPrice.id}`);
  console.log(`  Annual price: ${annualPrice.id}`);
  console.log(`  Add to .env.local: ${tier.annualEnvKey}=${annualPrice.id}\n`);
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

if (createdPriceKeys.length > 0) {
  console.log("Done. Copy these price IDs into your .env.local file:");
  for (const line of createdPriceKeys) {
    console.log(`  ${line}`);
  }
} else {
  console.log("Done. Existing price IDs in .env.local were left unchanged.");
}
