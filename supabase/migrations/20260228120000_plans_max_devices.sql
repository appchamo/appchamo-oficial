-- Garante que cada plano tenha o limite correto de dispositivos simultâneos:
-- free: 1, pro: 2, vip: 10, business: 20

UPDATE public.plans SET max_devices = 1 WHERE id = 'free';
UPDATE public.plans SET max_devices = 2 WHERE id = 'pro';
UPDATE public.plans SET max_devices = 10 WHERE id = 'vip';
UPDATE public.plans SET max_devices = 20 WHERE id = 'business';
