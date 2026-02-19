
-- Add professional_documents table
CREATE TABLE IF NOT EXISTS public.professional_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'identity',
  file_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.professional_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage documents" ON public.professional_documents FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Professionals can view own documents" ON public.professional_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.professionals WHERE professionals.id = professional_documents.professional_id AND professionals.user_id = auth.uid())
);
CREATE POLICY "Professionals can insert own documents" ON public.professional_documents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.professionals WHERE professionals.id = professional_documents.professional_id AND professionals.user_id = auth.uid())
);

-- Add sponsor_clicks table
CREATE TABLE IF NOT EXISTS public.sponsor_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sponsor_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sponsor clicks" ON public.sponsor_clicks FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Anyone can insert clicks" ON public.sponsor_clicks FOR INSERT WITH CHECK (true);

-- Create storage bucket for uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true) ON CONFLICT DO NOTHING;

-- Storage policies for uploads bucket
CREATE POLICY "Admins can upload files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'uploads' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins can update files" ON storage.objects FOR UPDATE USING (bucket_id = 'uploads' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete files" ON storage.objects FOR DELETE USING (bucket_id = 'uploads' AND public.is_admin(auth.uid()));
CREATE POLICY "Public can view uploads" ON storage.objects FOR SELECT USING (bucket_id = 'uploads');
CREATE POLICY "Users can upload own files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'uploads' AND auth.uid() IS NOT NULL);
