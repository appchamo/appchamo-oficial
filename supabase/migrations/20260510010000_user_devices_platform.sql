-- Persiste explicitamente a plataforma do dispositivo (ios / android / web)
-- para que o painel admin não dependa só de heurística sobre device_name / push_token.

ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS platform text;

ALTER TABLE public.user_devices
  DROP CONSTRAINT IF EXISTS user_devices_platform_chk;

ALTER TABLE public.user_devices
  ADD CONSTRAINT user_devices_platform_chk
  CHECK (platform IS NULL OR platform IN ('ios', 'android', 'web'));

COMMENT ON COLUMN public.user_devices.platform IS
  'Plataforma do aparelho: ios | android | web. Preenchida pelo cliente nativo ao registar presença / push.';

-- Backfill: tenta inferir a plataforma para linhas antigas.
UPDATE public.user_devices
   SET platform = 'ios'
 WHERE platform IS NULL
   AND (
         lower(coalesce(device_name, '')) LIKE '%iphone%'
      OR lower(coalesce(device_name, '')) LIKE '%ipad%'
      OR lower(coalesce(device_name, '')) LIKE '%ipod%'
      OR lower(coalesce(device_name, '')) LIKE '%apple%'
      OR lower(coalesce(device_name, '')) LIKE '%ios%'
      OR (push_token IS NOT NULL AND length(push_token) = 64 AND push_token ~ '^[a-fA-F0-9]+$')
   );

UPDATE public.user_devices
   SET platform = 'android'
 WHERE platform IS NULL
   AND (
         lower(coalesce(device_name, '')) LIKE '%android%'
      OR lower(coalesce(device_name, '')) LIKE '%samsung%'
      OR lower(coalesce(device_name, '')) LIKE '%galaxy%'
      OR lower(coalesce(device_name, '')) LIKE '%pixel%'
      OR lower(coalesce(device_name, '')) LIKE '%xiaomi%'
      OR lower(coalesce(device_name, '')) LIKE '%redmi%'
      OR lower(coalesce(device_name, '')) LIKE '%poco%'
      OR lower(coalesce(device_name, '')) LIKE '%huawei%'
      OR lower(coalesce(device_name, '')) LIKE '%honor%'
      OR lower(coalesce(device_name, '')) LIKE '%oppo%'
      OR lower(coalesce(device_name, '')) LIKE '%realme%'
      OR lower(coalesce(device_name, '')) LIKE '%oneplus%'
      OR lower(coalesce(device_name, '')) LIKE '%motorola%'
      OR lower(coalesce(device_name, '')) LIKE '%moto %'
      OR lower(coalesce(device_name, '')) LIKE '%nokia%'
      OR lower(coalesce(device_name, '')) LIKE '%asus%'
      OR lower(coalesce(device_name, '')) LIKE '%zenfone%'
      OR lower(coalesce(device_name, '')) LIKE '%sony%'
      OR lower(coalesce(device_name, '')) LIKE '%xperia%'
      OR lower(coalesce(device_name, '')) LIKE '%vivo%'
      OR lower(coalesce(device_name, '')) LIKE '%nothing%'
      -- Token FCM típico: contém ':' e é longo, claramente não é APNs.
      OR (push_token IS NOT NULL AND (push_token LIKE '%:%' OR length(push_token) > 80))
   );

UPDATE public.user_devices
   SET platform = 'web'
 WHERE platform IS NULL
   AND (
         lower(coalesce(device_name, '')) LIKE '%web%'
      OR lower(coalesce(device_name, '')) LIKE '%desktop%'
      OR lower(coalesce(device_name, '')) LIKE '%pwa%'
      OR lower(coalesce(device_name, '')) LIKE '%chrome%'
      OR lower(coalesce(device_name, '')) LIKE '%firefox%'
      OR lower(coalesce(device_name, '')) LIKE '%safari%'
      OR lower(coalesce(device_name, '')) LIKE '%edge%'
   );
