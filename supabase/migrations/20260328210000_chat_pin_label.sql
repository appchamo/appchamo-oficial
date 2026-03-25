-- Pin e rótulo por conversa (por usuário), em chat_read_status

ALTER TABLE public.chat_read_status
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.chat_read_status
  ADD COLUMN IF NOT EXISTS label_color text;

ALTER TABLE public.chat_read_status
  ADD COLUMN IF NOT EXISTS label_text text;

ALTER TABLE public.chat_read_status
  DROP CONSTRAINT IF EXISTS chat_read_status_label_color_check;

ALTER TABLE public.chat_read_status
  ADD CONSTRAINT chat_read_status_label_color_check
  CHECK (label_color IS NULL OR label_color IN ('blue', 'green', 'orange', 'red'));

ALTER TABLE public.chat_read_status
  DROP CONSTRAINT IF EXISTS chat_read_status_label_text_len_check;

ALTER TABLE public.chat_read_status
  ADD CONSTRAINT chat_read_status_label_text_len_check
  CHECK (label_text IS NULL OR char_length(label_text) <= 15);

COMMENT ON COLUMN public.chat_read_status.is_pinned IS 'Usuário fixa até 3 conversas no topo (aplicado no app).';
COMMENT ON COLUMN public.chat_read_status.label_color IS 'Cor do rótulo: blue, green, orange, red.';
COMMENT ON COLUMN public.chat_read_status.label_text IS 'Texto do rótulo, máx. 15 caracteres.';
