"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TIER_LIMITS, compareTiers, isPaidTier, type Tier } from "@/lib/tiers";
import {
  discountedPriceCents,
  formatUsdFromCents,
  type PromoDiscount,
} from "@/lib/promo";
import { Check } from "lucide-react";

interface PricingCardsProps {
  currentTier?: Tier;
  onSelectTier?: (tier: Tier) => void;
  loadingTier?: Tier | null;
  promoDiscount?: PromoDiscount | null;
}

const tierOrder: Tier[] = ["free", "plus", "pro", "enterprise"];

function TierPrice({
  priceMonthly,
  promoDiscount,
}: {
  priceMonthly: number | null;
  promoDiscount?: PromoDiscount | null;
}) {
  if (priceMonthly == null) {
    return <span className="text-4xl font-bold tracking-tight">Custom</span>;
  }

  if (priceMonthly > 0 && promoDiscount) {
    const discountedCents = discountedPriceCents(priceMonthly * 100, promoDiscount);
    if (discountedCents !== priceMonthly * 100) {
      return (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-muted-foreground line-through">
              ${priceMonthly}
            </span>
            <span className="text-4xl font-bold tracking-tight">
              {formatUsdFromCents(discountedCents)}
            </span>
          </div>
          {promoDiscount.duration === "once" ? (
            <p className="text-sm text-muted-foreground">
              first invoice, then ${priceMonthly}/mo
            </p>
          ) : promoDiscount.duration === "repeating" ? (
            <p className="text-sm text-muted-foreground">
              {promoDiscount.durationInMonths
                ? `for ${promoDiscount.durationInMonths} months, then $${priceMonthly}/mo`
                : `limited time, then $${priceMonthly}/mo`}
            </p>
          ) : (
            <span className="text-muted-foreground">/month</span>
          )}
        </>
      );
    }
  }

  return (
    <>
      <span className="text-4xl font-bold tracking-tight">${priceMonthly}</span>
      <span className="text-muted-foreground">/month</span>
    </>
  );
}

export function PricingCards({
  currentTier = "free",
  onSelectTier,
  loadingTier = null,
  promoDiscount = null,
}: PricingCardsProps) {
  return (
    <div className="grid gap-6 pt-3 md:grid-cols-2 xl:grid-cols-4">
      {tierOrder.map((tier) => {
        const details = TIER_LIMITS[tier];
        const isCurrent = currentTier === tier;
        const isDowngrade = compareTiers(tier, currentTier) < 0;
        const isPopular = tier === "plus";
        const isEnterprise = tier === "enterprise";

        return (
          <div key={tier} className="relative">
            {isPopular && (
              <Badge className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                Most popular
              </Badge>
            )}
            <Card
              className={`flex h-full flex-col ${isPopular ? "border-primary shadow-md" : ""}`}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {details.label}
                  {isCurrent && <Badge variant="secondary">Current</Badge>}
                </CardTitle>
                <CardDescription>{details.description}</CardDescription>
                <div className="pt-2">
                  <TierPrice
                    priceMonthly={details.priceMonthly}
                    promoDiscount={promoDiscount}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3 text-sm">
                  {details.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {tier === "free" ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={isCurrent || loadingTier === "free"}
                    onClick={() => {
                      if (!isCurrent) onSelectTier?.(tier);
                    }}
                  >
                    {loadingTier === "free"
                      ? "Scheduling…"
                      : isCurrent
                        ? "Included"
                        : isPaidTier(currentTier)
                          ? "Cancel to Free"
                          : "Default plan"}
                  </Button>
                ) : isEnterprise ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => onSelectTier?.(tier)}
                  >
                    Contact sales
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isDowngrade || !isPopular ? "outline" : "default"}
                    disabled={isCurrent || loadingTier === tier}
                    onClick={() => onSelectTier?.(tier)}
                  >
                    {loadingTier === tier
                      ? "Redirecting…"
                      : isCurrent
                        ? "Current plan"
                        : isDowngrade
                          ? `Downgrade to ${details.label}`
                          : `Upgrade to ${details.label}`}
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
