-- Allow anyone to read home_layout setting
CREATE POLICY "Anyone can view home layout"
ON public.platform_settings
FOR SELECT
USING (key = 'home_layout');