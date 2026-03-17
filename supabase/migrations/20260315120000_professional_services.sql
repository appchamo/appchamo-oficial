-- Serviços (fotos) para planos Pro e VIP – galeria no perfil do profissional
CREATE TABLE IF NOT EXISTS "public"."professional_services" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "professional_id" uuid NOT NULL,
  "image_url" text NOT NULL,
  "title" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "professional_services_professional_id_fkey"
    FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."professional_services" ENABLE ROW LEVEL SECURITY;

-- Ver: qualquer um pode ver serviços de profissional ativo e aprovado
DROP POLICY IF EXISTS "Anyone can view services of active professional" ON "public"."professional_services";
CREATE POLICY "Anyone can view services of active professional"
  ON "public"."professional_services" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "public"."professionals" p
      WHERE p.id = professional_services.professional_id
        AND p.active = true
        AND p.profile_status = 'approved'
    )
  );

-- Dono pode inserir
DROP POLICY IF EXISTS "Owner can insert services" ON "public"."professional_services";
CREATE POLICY "Owner can insert services"
  ON "public"."professional_services" FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."professionals" p
      WHERE p.id = professional_services.professional_id
        AND p.user_id = auth.uid()
    )
  );

-- Dono pode atualizar
DROP POLICY IF EXISTS "Owner can update own services" ON "public"."professional_services";
CREATE POLICY "Owner can update own services"
  ON "public"."professional_services" FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "public"."professionals" p
      WHERE p.id = professional_services.professional_id
        AND p.user_id = auth.uid()
    )
  );

-- Dono pode deletar
DROP POLICY IF EXISTS "Owner can delete own services" ON "public"."professional_services";
CREATE POLICY "Owner can delete own services"
  ON "public"."professional_services" FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "public"."professionals" p
      WHERE p.id = professional_services.professional_id
        AND p.user_id = auth.uid()
    )
  );

GRANT ALL ON TABLE "public"."professional_services" TO "anon";
GRANT ALL ON TABLE "public"."professional_services" TO "authenticated";
GRANT ALL ON TABLE "public"."professional_services" TO "service_role";
