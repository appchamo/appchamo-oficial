-- Destinatários dos alertas de admin (cadastro, chamada, pagamento, assinatura).
-- A função edge `notify-admins` lê esta tabela e dispara nos 3 canais
-- (app via notifications.user_id, e-mail via email, WhatsApp via phone).
CREATE TABLE IF NOT EXISTS public.admin_notify_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,                 -- WhatsApp (qualquer formato; a função normaliza p/ 55DDDxx, etc.)
  email text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- opcional: notificação no app
  notify_inapp boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  notify_whatsapp boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notify_recipients ENABLE ROW LEVEL SECURITY;

-- Apenas o admin principal gerencia (edge functions usam service role e ignoram RLS).
DROP POLICY IF EXISTS admin_notify_recipients_admin_all ON public.admin_notify_recipients;
CREATE POLICY admin_notify_recipients_admin_all
  ON public.admin_notify_recipients FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.email IN ('admin@appchamo.com','suporte@appchamo.com')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.email IN ('admin@appchamo.com','suporte@appchamo.com')));
