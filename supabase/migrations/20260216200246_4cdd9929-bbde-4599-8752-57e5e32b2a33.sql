
-- Allow authenticated users to insert notifications for any user (needed for service request notifications)
CREATE POLICY "Authenticated users can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
