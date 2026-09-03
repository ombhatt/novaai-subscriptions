"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { Subscription } from "@/lib/entitlements";
import { TIER_LIMITS, type Tier } from "@/lib/tiers";
import { AlertCircle, CreditCard, Loader2 } from "lucide-react";

interface DashboardData {
  subscription: Subscription | null;
  usage: number;
  limit: number;
  remaining: number;
  tier: Tier;
  status: string;
}

async function fetchDashboardData(): Promise<DashboardData> {
  const response = await fetch("/api/subscription");
  if (!response.ok) {
    throw new Error("Failed to load subscription data");
  }
  return response.json();
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      setData(await fetchDashboardData());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    fetchDashboardData()
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleChatSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;

    setChatLoading(true);
    setChatReply(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Request failed");
      }

      setChatReply(json.reply);
      setPrompt("");
      await loadDashboard();
    } catch (err) {
      setChatReply(err instanceof Error ? err.message : "Request failed");
    } finally {
      setChatLoading(false);
    }
  }

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const response = await fetch("/api/portal", { method: "POST" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Failed to open portal");
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal");
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Unable to load dashboard
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) return null;

  const tierDetails = TIER_LIMITS[data.tier];
  const usagePercent = Math.min(100, (data.usage / data.limit) * 100);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Current plan
            <Badge
              data-testid="dashboard-status"
              variant={data.status === "active" ? "default" : "destructive"}
            >
              {data.status}
            </Badge>
          </CardTitle>
          <CardDescription data-testid="dashboard-plan">
            You are on the {tierDetails.label} plan (${tierDetails.priceMonthly}/mo)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span>Monthly usage</span>
              <span className="font-medium" data-testid="dashboard-usage">
                {data.usage.toLocaleString()} / {data.limit.toLocaleString()}
              </span>
            </div>
            <Progress value={usagePercent} />
            <p className="mt-2 text-sm text-muted-foreground">
              {data.remaining.toLocaleString()} requests remaining this{" "}
              {data.subscription?.current_period_start ? "billing period" : "month"}
            </p>
          </div>

          {data.subscription?.current_period_end && (
            <p className="text-sm text-muted-foreground">
              Billing period ends{" "}
              {new Date(data.subscription.current_period_end).toLocaleDateString()}
            </p>
          )}

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Link href="/pricing" className={buttonVariants({ variant: "outline" })}>
              Change plan
            </Link>
            {data.tier !== "free" && (
              <Button
                variant="secondary"
                onClick={openBillingPortal}
                disabled={portalLoading}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                {portalLoading ? "Opening…" : "Manage billing"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Try the API</CardTitle>
          <CardDescription>
            Send a test prompt to verify tier limits and usage tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChatSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chat-prompt">Prompt</Label>
              <Input
                id="chat-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Summarize our Q3 product roadmap…"
                disabled={chatLoading}
              />
            </div>
            <Button type="submit" disabled={chatLoading || !prompt.trim()}>
              {chatLoading ? "Processing…" : "Send request"}
            </Button>
          </form>

          {chatReply && (
            <div
              data-testid="chat-reply"
              className="mt-4 rounded-lg border bg-muted/50 p-4 text-sm"
            >
              {chatReply}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
