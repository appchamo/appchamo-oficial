-- Cupom de desconto do parceiro (alternativa ao QR do caixa).
alter table public.sponsors
  add column if not exists coupon_active boolean not null default false,
  add column if not exists coupon_code text,
  add column if not exists coupon_link text,
  add column if not exists coupon_discount_percent numeric,
  add column if not exists coupon_rules text;
