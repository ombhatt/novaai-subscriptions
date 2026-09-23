"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

type MeUser = { id: string; email?: string | null };

const navLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/dashboard", label: "Dashboard" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [user, setUser] = useState<MeUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const menuOpen = menuOpenFor === pathname;

  useEffect(() => {
    let cancelled = false;

    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data: { user?: MeUser | null }) => {
        if (!cancelled) setUser(data.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    try {
      await createClient().auth.signOut();
    } catch {
      // Still send the user home if the client is misconfigured.
    }
    window.location.assign("/");
  }

  return (
    <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          NovaAI
        </Link>

        <nav
          id="primary-navigation"
          aria-label="Primary"
          className={cn(
            "text-sm font-medium",
            menuOpen
              ? "absolute inset-x-0 top-16 z-50 flex flex-col gap-3 border-b bg-background px-4 py-3 sm:static sm:flex-row sm:items-center sm:gap-6 sm:border-0 sm:bg-transparent sm:p-0"
              : "hidden sm:flex sm:items-center sm:gap-6",
          )}
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={cn(
                "text-muted-foreground transition-colors hover:text-foreground",
                pathname === link.href && "text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="sm:hidden"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() =>
              setMenuOpenFor((current) => (current === pathname ? null : pathname))
            }
          >
            {menuOpen ? "Close menu" : "Open menu"}
          </Button>
          {authReady && user ? (
            <Button type="button" variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          ) : authReady ? (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Log in
              </Link>
              <Link href="/signup" className={buttonVariants({ size: "sm" })}>
                Get started
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
