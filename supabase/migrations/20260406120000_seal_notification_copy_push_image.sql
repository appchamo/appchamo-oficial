-- Frases únicas por selo, URL de imagem para push (FCM) e trigger atualizado.

ALTER TABLE public.professional_seal_definitions
  ADD COLUMN IF NOT EXISTS award_notification_title text,
  ADD COLUMN IF NOT EXISTS award_notification_message text,
  ADD COLUMN IF NOT EXISTS push_image_url text;

COMMENT ON COLUMN public.professional_seal_definitions.award_notification_title IS 'Título da notificação in-app/push ao conquistar o selo (vazio = padrão).';
COMMENT ON COLUMN public.professional_seal_definitions.award_notification_message IS 'Corpo da notificação (vazio = padrão com nome do selo).';
COMMENT ON COLUMN public.professional_seal_definitions.push_image_url IS 'URL HTTPS pública da imagem no push (ex.: PNG no storage ou CDN).';

CREATE OR REPLACE FUNCTION public.notify_professional_seal_awarded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_title text;
  v_slug text;
  v_icon text;
  v_raw_title text;
  v_raw_message text;
  v_raw_image text;
  v_notif_title text;
  v_notif_message text;
  v_image text;
BEGIN
  SELECT
    p.user_id,
    d.title,
    d.slug,
    d.icon_variant,
    d.award_notification_title,
    d.award_notification_message,
    d.push_image_url
  INTO
    v_user_id,
    v_title,
    v_slug,
    v_icon,
    v_raw_title,
    v_raw_message,
    v_raw_image
  FROM public.professionals p
  JOIN public.professional_seal_definitions d ON d.id = NEW.seal_id
  WHERE p.id = NEW.professional_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_notif_title := COALESCE(NULLIF(trim(v_raw_title), ''), 'Parabéns! Novo selo no Chamô');
  v_notif_message := COALESCE(
    NULLIF(trim(v_raw_message), ''),
    format(
      'Você recebeu o %s no Chamô. Continue crescendo — cada conquista conta!',
      v_title
    )
  );
  v_image := NULLIF(trim(v_raw_image), '');

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    read,
    link,
    image_url,
    metadata
  )
  VALUES (
    v_user_id,
    v_notif_title,
    v_notif_message,
    'seal_award',
    false,
    '/pro',
    v_image,
    jsonb_build_object(
      'seal_id', NEW.seal_id,
      'seal_title', v_title,
      'seal_slug', v_slug,
      'icon_variant', COALESCE(v_icon, 'seal_default')
    ) || CASE
      WHEN v_image IS NOT NULL AND length(v_image) > 0 THEN jsonb_build_object('push_image_url', v_image)
      ELSE '{}'::jsonb
    END
  );

  RETURN NEW;
END;
$$;

-- Frases distintas + imagens placeholder (substitua por PNGs próprios no storage/CDN quando quiser).
UPDATE public.professional_seal_definitions SET
  award_notification_title = 'Sua primeira conquista no Chamô!',
  award_notification_message = 'Parabéns! O Selo Iniciante é seu: a primeira chamada mostra que você está no jogo. Bora crescer!',
  push_image_url = 'https://placehold.co/640x360/78716c/ffffff/png?text=Selo+Iniciante'
WHERE slug = 'calls_iniciante';

UPDATE public.professional_seal_definitions SET
  award_notification_title = 'Dez chamadas e muita entrega!',
  award_notification_message = 'Parabéns! Você desbloqueou o Selo Pro — ritmo forte e presença real na plataforma.',
  push_image_url = 'https://placehold.co/640x360/0284c7/ffffff/png?text=Selo+Pro'
WHERE slug = 'calls_pro';

UPDATE public.professional_seal_definitions SET
  award_notification_title = 'Você entrou para o time VIP!',
  award_notification_message = 'Incrível! O Selo VIP celebra 50 chamadas — você é referência para clientes e para nós.',
  push_image_url = 'https://placehold.co/640x360/7c3aed/ffffff/png?text=Selo+VIP'
WHERE slug = 'calls_vip';

UPDATE public.professional_seal_definitions SET
  award_notification_title = 'Centena de oportunidades!',
  award_notification_message = 'Respeito total! O Selo Business marca 100 chamadas — impacto de verdade no Chamô.',
  push_image_url = 'https://placehold.co/640x360/b45309/ffffff/png?text=Selo+Business'
WHERE slug = 'calls_business';

UPDATE public.professional_seal_definitions SET
  award_notification_title = 'Avaliações de encher os olhos!',
  award_notification_message = 'Brilhou! O Selo Rating reconhece 30 dias com nota acima de 4,5. Clientes confiam em você.',
  push_image_url = 'https://placehold.co/640x360/be123c/ffffff/png?text=Selo+Rating'
WHERE slug = 'rating_elite';

UPDATE public.professional_seal_definitions SET
  award_notification_title = 'Resposta na velocidade da luz!',
  award_notification_message = 'Mandou bem! O Selo Time premia 30 dias com tempo médio de resposta abaixo de 30 minutos.',
  push_image_url = 'https://placehold.co/640x360/0e7490/ffffff/png?text=Selo+Time'
WHERE slug = 'response_time';

UPDATE public.professional_seal_definitions SET
  award_notification_title = 'As vendas decolaram!',
  award_notification_message = 'Sensacional! O Selo Start celebra mais de R$ 5 mil em vendas concluídas. Continue faturando!',
  push_image_url = 'https://placehold.co/640x360/15803d/ffffff/png?text=Selo+Start'
WHERE slug = 'revenue_start';

UPDATE public.professional_seal_definitions SET
  award_notification_title = 'Meta alta, resultado à altura!',
  award_notification_message = 'Impressionante! O Selo Lobo é para quem ultrapassa R$ 15 mil vendidos. Você é gigante!',
  push_image_url = 'https://placehold.co/640x360/1e293b/e2e8f0/png?text=Selo+Lobo'
WHERE slug = 'revenue_lobo';

UPDATE public.professional_seal_definitions SET
  award_notification_title = 'Você é o topo do Chamô!',
  award_notification_message = 'Histórico! O Selo Chamô une todos os selos e a meta mensal — placa, prêmio e destaque nas redes te esperam!',
  push_image_url = 'https://placehold.co/640x360/c026d3/ffffff/png?text=Selo+Chamo'
WHERE slug = 'chamo_master';

UPDATE public.professional_seal_definitions SET
  award_notification_title = 'Lenda viva na plataforma!',
  award_notification_message = 'É raro chegar aqui. O Selo Lenda marca um marco épico — trajetória de respeito no Chamô.',
  push_image_url = 'https://placehold.co/640x360/166534/ffffff/png?text=Selo+Lenda'
WHERE slug = 'community_star';

COMMENT ON FUNCTION public.notify_professional_seal_awarded() IS 'Notificação + image_url para push; textos por selo em professional_seal_definitions.';

NOTIFY pgrst, 'reload schema';
