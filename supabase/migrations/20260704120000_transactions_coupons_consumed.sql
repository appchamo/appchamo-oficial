-- #17: flag de idempotencia pro consumo de cupom.
alter table public.transactions add column if not exists coupons_consumed boolean not null default false;
