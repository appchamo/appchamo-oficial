-- Imagens de push: PNGs estáticos no front (public/seals/push) + secret PUBLIC_APP_URL na edge send-push-notification.

COMMENT ON COLUMN public.professional_seal_definitions.push_image_url IS 'URL HTTPS absoluta OU caminho começando com / (ex.: /seals/push/seal_vip.png). Caminhos são resolvidos com PUBLIC_APP_URL na função send-push-notification.';

UPDATE public.professional_seal_definitions SET push_image_url = '/seals/push/seal_iniciante.png' WHERE slug = 'calls_iniciante';
UPDATE public.professional_seal_definitions SET push_image_url = '/seals/push/seal_pro.png' WHERE slug = 'calls_pro';
UPDATE public.professional_seal_definitions SET push_image_url = '/seals/push/seal_vip.png' WHERE slug = 'calls_vip';
UPDATE public.professional_seal_definitions SET push_image_url = '/seals/push/seal_business.png' WHERE slug = 'calls_business';
UPDATE public.professional_seal_definitions SET push_image_url = '/seals/push/seal_rating.png' WHERE slug = 'rating_elite';
UPDATE public.professional_seal_definitions SET push_image_url = '/seals/push/seal_time.png' WHERE slug = 'response_time';
UPDATE public.professional_seal_definitions SET push_image_url = '/seals/push/seal_start.png' WHERE slug = 'revenue_start';
UPDATE public.professional_seal_definitions SET push_image_url = '/seals/push/seal_lobo.png' WHERE slug = 'revenue_lobo';
UPDATE public.professional_seal_definitions SET push_image_url = '/seals/push/seal_chamo.png' WHERE slug = 'chamo_master';
UPDATE public.professional_seal_definitions SET push_image_url = '/seals/push/seal_star.png' WHERE slug = 'community_star';

NOTIFY pgrst, 'reload schema';
