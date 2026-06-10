-- Check-in diário (programa de recompensas): streak até 30 dias.
-- Cupom em 10 (2%), 20 (5%), 30 (10% + sorteio). Reseta se pular um dia.

CREATE TABLE IF NOT EXISTS public.checkin_streaks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak int NOT NULL DEFAULT 0,
  last_checkin_date date,
  longest_streak int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checkin_streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_streak_read" ON public.checkin_streaks;
CREATE POLICY "own_streak_read" ON public.checkin_streaks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.daily_checkin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  rec public.checkin_streaks%ROWTYPE;
  new_streak int;
  reward text := NULL;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT * INTO rec FROM public.checkin_streaks WHERE user_id = uid;

  IF rec.user_id IS NOT NULL AND rec.last_checkin_date = today THEN
    RETURN jsonb_build_object('already', true, 'streak', rec.current_streak, 'reward', NULL);
  END IF;

  IF rec.user_id IS NULL THEN
    new_streak := 1;
  ELSIF rec.last_checkin_date = today - 1 THEN
    new_streak := rec.current_streak + 1;
  ELSE
    new_streak := 1;
  END IF;
  IF new_streak > 30 THEN new_streak := 1; END IF;

  IF new_streak = 10 THEN
    INSERT INTO public.coupons (user_id, source, coupon_type, discount_percent, expires_at)
    VALUES (uid, 'bonus', 'discount', 2, now() + interval '30 days');
    reward := 'discount_2';
  ELSIF new_streak = 20 THEN
    INSERT INTO public.coupons (user_id, source, coupon_type, discount_percent, expires_at)
    VALUES (uid, 'bonus', 'discount', 5, now() + interval '30 days');
    reward := 'discount_5';
  ELSIF new_streak = 30 THEN
    INSERT INTO public.coupons (user_id, source, coupon_type, discount_percent, expires_at)
    VALUES (uid, 'bonus', 'discount', 10, now() + interval '30 days');
    INSERT INTO public.coupons (user_id, source, coupon_type)
    VALUES (uid, 'bonus', 'raffle');
    reward := 'special_30';
  END IF;

  INSERT INTO public.checkin_streaks (user_id, current_streak, last_checkin_date, longest_streak, updated_at)
  VALUES (uid, new_streak, today, new_streak, now())
  ON CONFLICT (user_id) DO UPDATE SET
    current_streak = EXCLUDED.current_streak,
    last_checkin_date = EXCLUDED.last_checkin_date,
    longest_streak = GREATEST(public.checkin_streaks.longest_streak, EXCLUDED.current_streak),
    updated_at = now();

  RETURN jsonb_build_object('already', false, 'streak', new_streak, 'reward', reward);
END;
$$;

GRANT EXECUTE ON FUNCTION public.daily_checkin() TO authenticated;
