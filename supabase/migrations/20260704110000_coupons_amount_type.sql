-- Cupom do app agora pode ser % ou R$ (valor fixo), com faixa de valor de servico.
alter table public.coupons add column if not exists discount_kind text not null default 'percent';
alter table public.coupons add column if not exists discount_amount numeric not null default 0;
alter table public.coupons add column if not exists min_service_value numeric;
alter table public.coupons add column if not exists max_service_value numeric;
