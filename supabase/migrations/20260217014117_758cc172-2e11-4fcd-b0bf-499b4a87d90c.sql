
-- RPC for dashboard transaction summary (avoids 1000-row limit)
CREATE OR REPLACE FUNCTION public.get_transaction_summary()
RETURNS TABLE (
  total_volume NUMERIC,
  total_fees NUMERIC,
  transaction_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    COALESCE(SUM(total_amount), 0) as total_volume,
    COALESCE(SUM(platform_fee), 0) as total_fees,
    COUNT(*) as transaction_count
  FROM public.transactions;
$$;

-- Add discount_amount column to coupons for discount coupons
ALTER TABLE public.coupons
ADD COLUMN IF NOT EXISTS coupon_type text NOT NULL DEFAULT 'raffle',
ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

-- Add closed_at to support_messages tracking
ALTER TABLE public.support_messages
ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
