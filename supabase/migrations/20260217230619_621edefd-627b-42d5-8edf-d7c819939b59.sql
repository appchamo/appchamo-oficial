-- Fix the raffles FK to SET NULL on delete instead of blocking
ALTER TABLE public.raffles DROP CONSTRAINT IF EXISTS raffles_winner_user_id_fkey;
ALTER TABLE public.raffles ADD CONSTRAINT raffles_winner_user_id_fkey 
  FOREIGN KEY (winner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Also fix subscriptions FK if it exists
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;
