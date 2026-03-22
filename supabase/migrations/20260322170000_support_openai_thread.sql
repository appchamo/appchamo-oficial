-- Persiste o thread_id da OpenAI Assistants API por ticket de suporte
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS openai_thread_id TEXT;
