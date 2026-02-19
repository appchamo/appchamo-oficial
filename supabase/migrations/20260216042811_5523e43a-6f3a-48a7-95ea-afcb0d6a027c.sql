-- Add availability status to professionals
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'available';

-- Allow authenticated users to insert their own professional record
CREATE POLICY "Users can insert own professional"
ON public.professionals FOR INSERT
WITH CHECK (auth.uid() = user_id);
