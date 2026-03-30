-- Admin: leitura de dispositivos para relatórios (Admin > Relatórios > Dispositivos)
CREATE POLICY "Admins can view all user devices"
  ON public.user_devices
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
