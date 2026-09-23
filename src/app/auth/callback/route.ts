import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeRedirectUrl(origin: string, next: string | null) {
  const fallback = new URL("/dashboard", origin);

  if (!next?.startsWith("/")) {
    return fallback;
  }

  const redirect = new URL(next, origin);
  return redirect.origin === fallback.origin ? redirect : fallback;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(safeRedirectUrl(origin, next));
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
