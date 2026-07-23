-- Permite source 'winback_coupon' na tabela de cupons (campanha de reativação).
alter table public.coupons drop constraint if exists coupons_source_check;
alter table public.coupons add constraint coupons_source_check
  check (source = any (array[
    'registration','payment','bonus','admin','admin_random',
    'admin_broadcast_all','admin_broadcast_pros','admin_broadcast_clients',
    'referral_signup','winback_coupon'
  ]));
