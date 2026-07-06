-- #17: consome cupom no servidor, atomico e idempotente, quando pagamento vira 'completed'.
create or replace function public.consume_coupons_on_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare should boolean := false;
begin
  if TG_OP = 'INSERT' then should := (NEW.status = 'completed');
  else should := (NEW.status = 'completed' and coalesce(OLD.status,'') <> 'completed'); end if;
  if should and coalesce(NEW.coupons_consumed,false) = false then
    NEW.coupons_consumed := true;
    if NEW.app_coupon_id is not null then
      update public.coupons set used = true where id = NEW.app_coupon_id and used = false;
    end if;
    if NEW.pro_coupon_id is not null then
      perform public.increment_pro_coupon_usage(NEW.pro_coupon_id);
    end if;
  end if;
  return NEW;
end; $$;
drop trigger if exists consume_coupons_on_payment_trg on public.transactions;
create trigger consume_coupons_on_payment_trg
  before insert or update on public.transactions
  for each row execute function public.consume_coupons_on_payment();
