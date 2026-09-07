import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 320;
const MAX_COMPANY = 200;
const MAX_NOTE = 2_000;
const MAX_PROMO = 64;

function trimToNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    company?: string;
    note?: string;
    source?: string;
    promoCode?: string;
  };

  const email = trimToNull(body.email, MAX_EMAIL);
  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "A valid work email is required." }, { status: 400 });
  }

  const source = trimToNull(body.source, 64) ?? "pricing_enterprise";
  const company = trimToNull(body.company, MAX_COMPANY);
  const note = trimToNull(body.note, MAX_NOTE);
  const promoCode = trimToNull(body.promoCode, MAX_PROMO);

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("sales_inquiries").insert({
      user_id: userId,
      email,
      company,
      note,
      source,
      promo_code: promoCode,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sales inquiry storage is not configured.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
