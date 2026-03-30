-- Coluna para sinalizar que o admin solicitou reenvio de documentos ao profissional.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS doc_reupload_requested boolean NOT NULL DEFAULT false;
