-- Allow authenticated users to insert their own coupons (for signup and payment rewards)
CREATE POLICY "Users can insert own coupons"
ON public.coupons
FOR INSERT
WITH CHECK (auth.uid() = user_id);
