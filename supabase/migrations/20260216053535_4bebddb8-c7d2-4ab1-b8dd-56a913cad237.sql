-- Auto-create coupon on profile creation (bypasses RLS since it's a trigger)
CREATE OR REPLACE FUNCTION public.handle_new_profile_coupon()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.coupons (user_id, source)
  VALUES (NEW.user_id, 'registration');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_coupon
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile_coupon();
