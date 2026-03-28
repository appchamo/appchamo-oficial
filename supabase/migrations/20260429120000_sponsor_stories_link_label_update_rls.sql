-- Texto do botão CTA por novidade (ex.: "Saiba mais"); null = usar default na app
ALTER TABLE public.sponsor_stories
  ADD COLUMN IF NOT EXISTS link_button_label TEXT;

-- Dono do patrocinador (sponsors.user_id = auth.uid()) pode atualizar as próprias stories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sponsor_stories' AND policyname = 'sponsor_stories_update_sponsor_owner'
  ) THEN
    CREATE POLICY "sponsor_stories_update_sponsor_owner" ON public.sponsor_stories
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.sponsors s
          WHERE s.id = sponsor_stories.sponsor_id
            AND s.user_id IS NOT NULL
            AND s.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.sponsors s
          WHERE s.id = sponsor_stories.sponsor_id
            AND s.user_id IS NOT NULL
            AND s.user_id = auth.uid()
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
