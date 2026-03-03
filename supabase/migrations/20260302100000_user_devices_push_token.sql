-- Coluna push_token em user_devices (FCM/APNs) para envio de push
ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS push_token text;

COMMENT ON COLUMN public.user_devices.push_token IS 'FCM token (Android) ou APNs device token (iOS) para envio de push';
