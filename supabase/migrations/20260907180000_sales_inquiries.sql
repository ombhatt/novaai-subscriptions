create table public.sales_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text not null,
  company text,
  note text,
  source text not null default 'pricing_enterprise',
  promo_code text,
  created_at timestamptz not null default now()
);

create index sales_inquiries_created_at_idx on public.sales_inquiries (created_at desc);
create index sales_inquiries_user_id_idx on public.sales_inquiries (user_id);

alter table public.sales_inquiries enable row level security;
