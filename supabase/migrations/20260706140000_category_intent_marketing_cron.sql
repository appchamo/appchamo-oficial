-- Cron do marketing por intenção de categoria: roda a cada 6h.
-- Janela de 7 dias, 2+ sinais (visitas a perfil + buscas) por categoria.
-- Cadência (2x na 1ª semana, depois 1x/7d) e cupom são tratados na edge function.
select cron.schedule(
  'category-intent-marketing',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/functions/v1/category-intent-marketing',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-hook-secret', (select value from private.app_config where key='email_hook_secret')
    ),
    body := jsonb_build_object('window_days', 7, 'min_signals', 2)
  );
  $$
);
