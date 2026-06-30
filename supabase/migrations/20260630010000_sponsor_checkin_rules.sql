-- Regras do desconto do parceiro (aparece na página de Parceiros).
alter table public.sponsors
  add column if not exists checkin_rules text;
