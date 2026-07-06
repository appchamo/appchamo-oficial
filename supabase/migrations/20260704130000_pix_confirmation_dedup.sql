-- #3: impede confirmacao de pagamento duplicada no chat (indice unico parcial).
create unique index if not exists uniq_payment_confirmed_per_request on public.chat_messages (request_id) where content like '✅ PAGAMENTO CONFIRMADO%';
-- #3: impede cupom-premio pos-pagamento duplicado (1 por chamada).
alter table public.coupons add column if not exists request_id uuid;
create unique index if not exists uniq_payment_reward_per_request on public.coupons (request_id) where source = 'payment' and request_id is not null;
