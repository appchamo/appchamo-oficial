-- Controle de idempotência da campanha de reativação com cupom (email + WhatsApp).
create table if not exists public.winback_coupon_blast_log (
  user_id uuid primary key,
  email_ok boolean not null default false,
  wa_ok boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.winback_coupon_blast_log enable row level security;
