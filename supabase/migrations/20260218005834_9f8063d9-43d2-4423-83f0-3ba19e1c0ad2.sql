
-- Allow anyone to read notification_sound_url setting
CREATE POLICY "Anyone can view notification sound"
ON public.platform_settings
FOR SELECT
USING (key = 'notification_sound_url');
