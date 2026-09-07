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
import { TIER_LIMITS, type Tier } from "@/lib/tiers";
import { Check } from "lucide-react";

interface PricingCardsProps {
  currentTier?: Tier;
  onSelectTier?: (tier: Tier) => void;
  loadingTier?: Tier | null;
}

const tierOrder: Tier[] = ["free", "plus", "pro", "enterprise"];

export function PricingCards({
  currentTier = "free",
  onSelectTier,
  loadingTier = null,
}: PricingCardsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {tierOrder.map((tier) => {
        const details = TIER_LIMITS[tier];
        const isCurrent = currentTier === tier;
        const isPopular = tier === "plus";
        const isEnterprise = tier === "enterprise";

        return (
          <Card
            key={tier}
            className={`relative flex flex-col ${isPopular ? "border-primary shadow-md" : ""}`}
          >
            {isPopular && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most popular</Badge>
            )}
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {details.label}
                {isCurrent && <Badge variant="secondary">Current</Badge>}
              </CardTitle>
              <CardDescription>{details.description}</CardDescription>
              <div className="pt-2">
                {details.priceMonthly == null ? (
                  <span className="text-4xl font-bold tracking-tight">Custom</span>
                ) : (
                  <>
                    <span className="text-4xl font-bold tracking-tight">
                      ${details.priceMonthly}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                  </>
                )}
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
                <Button className="w-full" variant="outline" disabled={isCurrent}>
                  {isCurrent ? "Included" : "Default plan"}
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
                  variant={isPopular ? "default" : "outline"}
                  disabled={isCurrent || loadingTier === tier}
                  onClick={() => onSelectTier?.(tier)}
                >
                  {loadingTier === tier
                    ? "Redirecting…"
                    : isCurrent
                      ? "Current plan"
                      : `Upgrade to ${details.label}`}
                </Button>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
