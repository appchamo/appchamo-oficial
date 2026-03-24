-- ============================================================
-- SISTEMA DE LEMBRETES DE CHAT
-- • Tabela chat_reminders: agenda lembretes futuros
-- • Trigger on chat_messages: cancela lembretes antigos,
--   agenda novos ao receber mensagem
-- • Função process_chat_reminders(): chamada pelo pg_cron
--   a cada 15 min — insere notification para cada lembrete vencido
-- • pg_cron: executa a cada 15 minutos
-- ============================================================

-- 1. Tabela de lembretes agendados
CREATE TABLE IF NOT EXISTS public.chat_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID  NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  target_user_id  UUID  NOT NULL,
  recipient_type  TEXT  NOT NULL CHECK (recipient_type IN ('professional', 'client')),
  reminder_index  INT   NOT NULL,   -- 0,1,2,3,4 = sequência de lembretes
  scheduled_at    TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  cancelled       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_reminders_due
  ON public.chat_reminders (scheduled_at)
  WHERE sent_at IS NULL AND cancelled = FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_reminders_request
  ON public.chat_reminders (request_id, target_user_id)
  WHERE sent_at IS NULL AND cancelled = FALSE;

-- RLS: só service_role acessa
ALTER TABLE public.chat_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_chat_reminders"
  ON public.chat_reminders
  USING (auth.role() = 'service_role');

-- 2. Trigger function: ao inserir mensagem, cancela lembretes
--    do remetente e agenda novos para o destinatário
CREATE OR REPLACE FUNCTION public.schedule_chat_reminders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req       RECORD;
  v_pro_uid   UUID;
  v_target    UUID;
  v_rtype     TEXT;
  v_delays    INTERVAL[];
  v_i         INT;
BEGIN
  -- Busca a service_request do chat
  SELECT sr.client_id, p.user_id AS pro_user_id
    INTO v_req
    FROM service_requests sr
    JOIN professionals p ON p.id = sr.professional_id
   WHERE sr.id = NEW.request_id
   LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  v_pro_uid := v_req.pro_user_id;

  -- Cancela todos os lembretes pendentes do remetente
  UPDATE chat_reminders
     SET cancelled = TRUE
   WHERE request_id = NEW.request_id
     AND target_user_id = NEW.sender_id
     AND sent_at IS NULL
     AND cancelled = FALSE;

  -- Define para quem agendar e quais delays
  IF NEW.sender_id = v_req.client_id THEN
    -- Cliente enviou → lembretes para o profissional
    v_target := v_pro_uid;
    v_rtype  := 'professional';
    v_delays := ARRAY[
      INTERVAL '30 minutes',
      INTERVAL '1 hour',
      INTERVAL '2 hours',
      INTERVAL '6 hours',
      INTERVAL '12 hours'
    ];
  ELSE
    -- Profissional enviou → lembretes para o cliente
    v_target := v_req.client_id;
    v_rtype  := 'client';
    v_delays := ARRAY[
      INTERVAL '30 minutes',
      INTERVAL '1 hour',
      INTERVAL '2 hours'
    ];
  END IF;

  -- Cancela lembretes anteriores pendentes para o mesmo destinatário
  UPDATE chat_reminders
     SET cancelled = TRUE
   WHERE request_id = NEW.request_id
     AND target_user_id = v_target
     AND sent_at IS NULL
     AND cancelled = FALSE;

  -- Agenda novos lembretes
  FOR v_i IN 1..array_length(v_delays, 1) LOOP
    INSERT INTO chat_reminders
      (request_id, target_user_id, recipient_type, reminder_index, scheduled_at)
    VALUES
      (NEW.request_id, v_target, v_rtype, v_i, now() + v_delays[v_i]);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_chat_reminders ON public.chat_messages;
CREATE TRIGGER trg_schedule_chat_reminders
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.schedule_chat_reminders();

-- 3. Função chamada pelo cron a cada 15 min
--    Insere notificações para lembretes vencidos
CREATE OR REPLACE FUNCTION public.process_chat_reminders()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rem   RECORD;
  v_count INT := 0;
  v_title TEXT;
  v_body  TEXT;
  v_link  TEXT;
BEGIN
  FOR v_rem IN
    SELECT cr.id, cr.request_id, cr.target_user_id, cr.recipient_type, cr.reminder_index
      FROM chat_reminders cr
      JOIN service_requests sr ON sr.id = cr.request_id
     WHERE cr.scheduled_at <= now()
       AND cr.sent_at IS NULL
       AND cr.cancelled = FALSE
       AND sr.status NOT IN ('completed', 'cancelled', 'closed')
     FOR UPDATE SKIP LOCKED
  LOOP
    -- Verifica se houve resposta depois do agendamento
    -- (se houve nova mensagem do destinatário, o trigger já cancelou — mas dupla verificação)
    IF EXISTS (
      SELECT 1 FROM chat_messages
       WHERE request_id = v_rem.request_id
         AND sender_id  = v_rem.target_user_id
         AND created_at > (
               SELECT cr2.created_at FROM chat_reminders cr2 WHERE cr2.id = v_rem.id
             )
    ) THEN
      UPDATE chat_reminders SET cancelled = TRUE WHERE id = v_rem.id;
      CONTINUE;
    END IF;

    -- Define textos do lembrete
    IF v_rem.recipient_type = 'professional' THEN
      v_title := '📩 Você tem uma mensagem aguardando';
      v_body  := CASE v_rem.reminder_index
        WHEN 1 THEN 'Um cliente está esperando sua resposta há 30 minutos.'
        WHEN 2 THEN 'Um cliente está esperando sua resposta há 1 hora.'
        WHEN 3 THEN 'Um cliente está esperando sua resposta há 2 horas.'
        WHEN 4 THEN 'Um cliente está aguardando há 6 horas — responda para não perdê-lo!'
        WHEN 5 THEN '⚠️ 12 horas sem resposta! O cliente pode encerrar o chat por demora.'
        ELSE 'Você tem uma mensagem não respondida.'
      END;
    ELSE
      v_title := '💬 O profissional respondeu você';
      v_body  := CASE v_rem.reminder_index
        WHEN 1 THEN 'O profissional enviou uma mensagem. Abra o chat para responder.'
        WHEN 2 THEN 'Você ainda não respondeu o profissional. Abra o chat!'
        WHEN 3 THEN 'Lembrete: o profissional está esperando sua resposta.'
        ELSE 'Você tem uma mensagem não lida.'
      END;
    END IF;

    v_link := '/messages/' || v_rem.request_id::TEXT;

    INSERT INTO notifications (user_id, title, message, read, type, link)
    VALUES (v_rem.target_user_id, v_title, v_body, FALSE, 'chat_reminder', v_link);

    UPDATE chat_reminders SET sent_at = now() WHERE id = v_rem.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 4. pg_cron: roda a cada 15 minutos
SELECT cron.schedule(
  'process-chat-reminders',
  '*/15 * * * *',
  $$SELECT public.process_chat_reminders();$$
);

NOTIFY pgrst, 'reload schema';
