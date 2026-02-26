


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'super_admin',
    'finance_admin',
    'support_admin',
    'sponsor_admin',
    'moderator',
    'client',
    'professional',
    'company'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_device_limit"("p_user_id" "uuid", "p_device_id" "text", "p_device_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_plan_id TEXT;
    v_max_devices INT;
    v_current_devices INT;
    v_device_exists BOOLEAN;
    v_is_pro BOOLEAN;
BEGIN
    -- 1. VERIFICAÇÃO DE CLIENTE (A Via Rápida)
    -- Descobre se o usuário está cadastrado como profissional
    SELECT EXISTS(SELECT 1 FROM professionals WHERE user_id = p_user_id) INTO v_is_pro;

    -- Se NÃO for profissional (ou seja, é Cliente ou Admin), ignora as regras e deixa entrar!
    IF NOT v_is_pro THEN
        RETURN TRUE;
    END IF;

    -- ==========================================
    -- REGRAS APENAS PARA PROFISSIONAIS ABAIXO
    -- ==========================================

    -- 2. Descobrir o plano do profissional
    SELECT plan_id INTO v_plan_id
    FROM subscriptions
    WHERE user_id = p_user_id
    AND status = 'active'
    LIMIT 1;

    -- Se o profissional não tiver subscrição ativa, assume o plano free
    IF v_plan_id IS NULL THEN
        SELECT max_devices INTO v_max_devices FROM plans WHERE id = 'free';
    ELSE
        SELECT max_devices INTO v_max_devices FROM plans WHERE id = v_plan_id;
    END IF;

    -- 3. Verificar se este aparelho já está registado
    SELECT EXISTS (
        SELECT 1 FROM user_devices WHERE user_id = p_user_id AND device_id = p_device_id
    ) INTO v_device_exists;

    -- Se já estiver registado, atualiza a data e deixa entrar
    IF v_device_exists THEN
        UPDATE user_devices 
        SET last_active = NOW(), device_name = p_device_name 
        WHERE user_id = p_user_id AND device_id = p_device_id;
        RETURN TRUE;
    END IF;

    -- 4. Contar aparelhos do profissional
    SELECT COUNT(*) INTO v_current_devices FROM user_devices WHERE user_id = p_user_id;

    -- 5. Validar o limite
    IF v_current_devices >= COALESCE(v_max_devices, 1) THEN
        RETURN FALSE; -- Bloqueia a entrada do profissional!
    END IF;

    -- 6. Regista o aparelho novo do profissional
    INSERT INTO user_devices (user_id, device_id, device_name)
    VALUES (p_user_id, p_device_id, p_device_name);
    
    RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."check_device_limit"("p_user_id" "uuid", "p_device_id" "text", "p_device_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_email_exists"("user_email" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE email = user_email
  );
END;
$$;


ALTER FUNCTION "public"."check_email_exists"("user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_professional_call_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  pro_user_id uuid;
  pro_plan_id text;
  call_count integer;
  max_calls_allowed integer;
  bonus integer;
BEGIN
  SELECT user_id, bonus_calls INTO pro_user_id, bonus FROM professionals WHERE id = NEW.professional_id;
  IF pro_user_id IS NULL THEN RETURN NEW; END IF;
  
  SELECT plan_id INTO pro_plan_id FROM subscriptions WHERE user_id = pro_user_id;
  IF pro_plan_id IS NULL THEN pro_plan_id := 'free'; END IF;
  
  SELECT max_calls INTO max_calls_allowed FROM plans WHERE id = pro_plan_id;
  IF max_calls_allowed IS NULL OR max_calls_allowed = -1 THEN RETURN NEW; END IF;
  
  -- Add bonus calls to the limit
  max_calls_allowed := max_calls_allowed + COALESCE(bonus, 0);
  
  SELECT count(*) INTO call_count FROM service_requests WHERE professional_id = NEW.professional_id;
  
  IF call_count >= max_calls_allowed THEN
    UPDATE professionals SET availability_status = 'unavailable' WHERE id = NEW.professional_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_professional_call_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_protocol"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.protocol := 'CHM-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 99999 + 1)::TEXT, 5, '0');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_protocol"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_support_protocol"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.protocol := 'SUP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 99999 + 1)::TEXT, 5, '0');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_support_protocol"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pros_by_radius"("client_lat" double precision, "client_long" double precision, "radius_km" double precision) RETURNS TABLE("profile_id" "uuid", "dist_km" double precision)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    user_id as profile_id,
    -- Fórmula matemática para calcular distância em KM entre dois pontos (Haversine)
    (6371 * acos(
      cos(radians(client_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(client_long)) + 
      sin(radians(client_lat)) * sin(radians(latitude))
    )) AS dist_km
  FROM public.profiles
  WHERE 
    (6371 * acos(
      cos(radians(client_lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(client_long)) + 
      sin(radians(client_lat)) * sin(radians(latitude))
    )) <= radius_km
  ORDER BY dist_km;
END;
$$;


ALTER FUNCTION "public"."get_pros_by_radius"("client_lat" double precision, "client_long" double precision, "radius_km" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_transaction_summary"() RETURNS TABLE("total_volume" numeric, "total_fees" numeric, "transaction_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    COALESCE(SUM(total_amount), 0) as total_volume,
    COALESCE(SUM(platform_fee), 0) as total_fees,
    COUNT(*) as transaction_count
  FROM public.transactions;
$$;


ALTER FUNCTION "public"."get_transaction_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_profile_coupon"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.coupons (user_id, source)
  VALUES (NEW.user_id, 'registration');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_profile_coupon"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan_id)
  VALUES (NEW.user_id, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    full_name,
    user_type
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'client')
  );

  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_sponsor_clicks"("_sponsor_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.sponsors SET clicks = clicks + 1 WHERE id = _sponsor_id;
$$;


ALTER FUNCTION "public"."increment_sponsor_clicks"("_sponsor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin', 'finance_admin', 'support_admin', 'sponsor_admin', 'moderator')
  )
$$;


ALTER FUNCTION "public"."is_admin"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resurrect_chat"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Quando chega mensagem nova, desmarca o is_deleted e is_archived para todos nessa conversa
  UPDATE public.chat_read_status
  SET is_deleted = false, is_archived = false
  WHERE request_id = NEW.request_id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."resurrect_chat"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_review"("_request_id" "uuid", "_rating" integer, "_comment" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _pro_id uuid;
  _client_id uuid;
  _current_rating numeric;
  _current_reviews integer;
  _current_services integer;
  _new_reviews integer;
  _new_services integer;
  _new_rating numeric;
BEGIN
  SELECT client_id, professional_id INTO _client_id, _pro_id
  FROM service_requests WHERE id = _request_id;
  
  IF _client_id IS NULL OR _client_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Insert review record
  INSERT INTO public.reviews (request_id, professional_id, client_id, rating, comment)
  VALUES (_request_id, _pro_id, _client_id, _rating, _comment);

  -- Get current pro stats
  SELECT rating, total_reviews, total_services INTO _current_rating, _current_reviews, _current_services
  FROM professionals WHERE id = _pro_id;

  _new_reviews := COALESCE(_current_reviews, 0) + 1;
  _new_services := COALESCE(_current_services, 0) + 1;
  _new_rating := ROUND(((COALESCE(_current_rating, 0) * COALESCE(_current_reviews, 0)) + _rating) / _new_reviews, 1);

  UPDATE professionals SET
    rating = _new_rating,
    total_reviews = _new_reviews,
    total_services = _new_services
  WHERE id = _pro_id;

  UPDATE service_requests SET status = 'completed', updated_at = now()
  WHERE id = _request_id;
END;
$$;


ALTER FUNCTION "public"."submit_review"("_request_id" "uuid", "_rating" integer, "_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_user_id" "uuid",
    "action" "text" NOT NULL,
    "target_type" "text",
    "target_id" "text",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "image_url" "text" NOT NULL,
    "link_url" "text" DEFAULT '#'::"text",
    "position" "text" DEFAULT 'below_categories'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "width" "text" DEFAULT '100%'::"text" NOT NULL,
    "height" "text" DEFAULT '120px'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url_mobile" "text"
);


ALTER TABLE "public"."banners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "icon_name" "text" DEFAULT 'Briefcase'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "icon_url" "text"
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_urls" "jsonb" DEFAULT '[]'::"jsonb"
);

ALTER TABLE ONLY "public"."chat_messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_read_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_archived" boolean DEFAULT false,
    "is_deleted" boolean DEFAULT false,
    "manual_unread" boolean DEFAULT false
);


ALTER TABLE "public"."chat_read_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupon_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "discount_percent" integer NOT NULL,
    "total_quantity" integer NOT NULL,
    "used_quantity" integer DEFAULT 0,
    "min_purchase_value" numeric(10,2) DEFAULT 0,
    "max_purchase_value" numeric(10,2),
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."coupon_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'registration'::"text" NOT NULL,
    "used" boolean DEFAULT false NOT NULL,
    "raffle_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "coupon_type" "text" DEFAULT 'raffle'::"text" NOT NULL,
    "discount_percent" numeric DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone,
    CONSTRAINT "coupons_source_check" CHECK (("source" = ANY (ARRAY['registration'::"text", 'payment'::"text", 'bonus'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."coupons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enterprise_upgrade_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cnpj" "text" NOT NULL,
    "company_name" "text",
    "address_street" "text",
    "address_number" "text",
    "address_complement" "text",
    "address_neighborhood" "text",
    "address_city" "text",
    "address_state" "text",
    "address_zip" "text",
    "cadastral_status" "text",
    "asaas_customer_id" "text",
    "asaas_credit_card_token" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."enterprise_upgrade_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "resume_url" "text",
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_postings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "salary_range" "text",
    "requirements" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_postings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    "link" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price_monthly" numeric DEFAULT 0 NOT NULL,
    "max_calls" integer DEFAULT 3 NOT NULL,
    "max_devices" integer DEFAULT 1 NOT NULL,
    "has_verified_badge" boolean DEFAULT false NOT NULL,
    "has_featured" boolean DEFAULT false NOT NULL,
    "has_product_catalog" boolean DEFAULT false NOT NULL,
    "has_job_postings" boolean DEFAULT false NOT NULL,
    "has_in_app_support" boolean DEFAULT false NOT NULL,
    "has_vip_event" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "features" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "icon_name" "text" DEFAULT 'Briefcase'::"text" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "value_mode" "text" DEFAULT 'manual'::"text" NOT NULL,
    "manual_value" integer DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."platform_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" numeric DEFAULT 0 NOT NULL,
    "image_url" "text",
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_url" "text"
);


ALTER TABLE "public"."product_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professional_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'identity'::"text" NOT NULL,
    "file_url" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."professional_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professional_fiscal_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "payment_method" "text" DEFAULT 'pix'::"text" NOT NULL,
    "bank_name" "text",
    "bank_agency" "text",
    "bank_account" "text",
    "bank_account_type" "text" DEFAULT 'corrente'::"text",
    "pix_key" "text",
    "pix_key_type" "text",
    "fiscal_name" "text",
    "fiscal_document" "text",
    "fiscal_email" "text",
    "fiscal_address_street" "text",
    "fiscal_address_number" "text",
    "fiscal_address_complement" "text",
    "fiscal_address_neighborhood" "text",
    "fiscal_address_city" "text",
    "fiscal_address_state" "text",
    "fiscal_address_zip" "text",
    "charge_interest_to_client" boolean DEFAULT false NOT NULL,
    "anticipation_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."professional_fiscal_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professionals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "bio" "text",
    "verified" boolean DEFAULT false NOT NULL,
    "rating" numeric(2,1) DEFAULT 0 NOT NULL,
    "total_services" integer DEFAULT 0 NOT NULL,
    "total_reviews" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "availability_status" "text" DEFAULT 'available'::"text" NOT NULL,
    "profession_id" "uuid",
    "bonus_calls" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."professionals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."professions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_private" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "phone" "text",
    "cpf" "text",
    "cnpj" "text",
    "birth_date" "date",
    "address_street" "text",
    "address_number" "text",
    "address_complement" "text",
    "address_neighborhood" "text",
    "address_city" "text",
    "address_state" "text",
    "address_zip" "text",
    "address_country" "text" DEFAULT 'Brasil'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_private" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "avatar_url" "text",
    "user_type" "text" DEFAULT 'client'::"text" NOT NULL,
    "is_blocked" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" "text",
    "cpf" "text",
    "cnpj" "text",
    "accepted_terms_version" "text",
    "accepted_terms_at" timestamp with time zone,
    "address_street" "text",
    "address_number" "text",
    "address_complement" "text",
    "address_neighborhood" "text",
    "address_city" "text",
    "address_state" "text",
    "address_zip" "text",
    "birth_date" "date",
    "address_country" "text" DEFAULT 'Brasil'::"text",
    "asaas_customer_id" "text",
    "latitude" double precision,
    "longitude" double precision
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."profiles_public" AS
 SELECT "id",
    "user_id",
    "full_name",
    "avatar_url",
    "user_type"
   FROM "public"."profiles";


ALTER VIEW "public"."profiles_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."raffles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "draw_date" timestamp with time zone NOT NULL,
    "winner_user_id" "uuid",
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "raffles_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'drawn'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."raffles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "protocol" "text"
);


ALTER TABLE "public"."service_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsor_clicks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sponsor_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sponsor_clicks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sponsors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "niche" "text",
    "logo_url" "text",
    "link_url" "text" DEFAULT '#'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sponsors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "text" DEFAULT 'free'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asaas_subscription_id" "text",
    "asaas_customer_id" "text",
    "business_cnpj" "text",
    "business_address" "text",
    "business_proof_url" "text"
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "ticket_id" "uuid",
    "image_urls" "jsonb" DEFAULT '[]'::"jsonb"
);

ALTER TABLE ONLY "public"."support_messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."support_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_read_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "thread_user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."support_read_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "admin_reply" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "protocol" "text"
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "professional_id" "uuid",
    "total_amount" numeric(10,2) NOT NULL,
    "platform_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "professional_net" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asaas_payment_id" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "request_id" "uuid",
    "pix_qr_code" "text",
    "pix_copy_paste" "text",
    CONSTRAINT "transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'cancelled'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "device_id" "text" NOT NULL,
    "device_name" "text",
    "last_active" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);

ALTER TABLE ONLY "public"."user_devices" REPLICA IDENTITY FULL;


ALTER TABLE "public"."user_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_logs"
    ADD CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banners"
    ADD CONSTRAINT "banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_read_status"
    ADD CONSTRAINT "chat_read_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_read_status"
    ADD CONSTRAINT "chat_read_status_request_id_user_id_key" UNIQUE ("request_id", "user_id");



ALTER TABLE ONLY "public"."chat_reports"
    ADD CONSTRAINT "chat_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupon_campaigns"
    ADD CONSTRAINT "coupon_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_upgrade_requests"
    ADD CONSTRAINT "enterprise_upgrade_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_postings"
    ADD CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."platform_stats"
    ADD CONSTRAINT "platform_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_catalog"
    ADD CONSTRAINT "product_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_documents"
    ADD CONSTRAINT "professional_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_fiscal_data"
    ADD CONSTRAINT "professional_fiscal_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."professions"
    ADD CONSTRAINT "professions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_private"
    ADD CONSTRAINT "profile_private_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_private"
    ADD CONSTRAINT "profile_private_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."raffles"
    ADD CONSTRAINT "raffles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_requests"
    ADD CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsor_clicks"
    ADD CONSTRAINT "sponsor_clicks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sponsors"
    ADD CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_read_status"
    ADD CONSTRAINT "support_read_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_read_status"
    ADD CONSTRAINT "support_read_status_user_id_thread_user_id_key" UNIQUE ("user_id", "thread_user_id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_fiscal_data"
    ADD CONSTRAINT "unique_professional_fiscal" UNIQUE ("professional_id");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_user_id_device_id_key" UNIQUE ("user_id", "device_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



CREATE INDEX "idx_chat_messages_request_id" ON "public"."chat_messages" USING "btree" ("request_id");



CREATE INDEX "idx_chat_read_status_req" ON "public"."chat_read_status" USING "btree" ("request_id");



CREATE INDEX "idx_chat_read_status_user" ON "public"."chat_read_status" USING "btree" ("user_id");



CREATE INDEX "idx_chat_read_status_user_id" ON "public"."chat_read_status" USING "btree" ("user_id");



CREATE INDEX "idx_professionals_user_id" ON "public"."professionals" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_profiles_cnpj_unique" ON "public"."profiles" USING "btree" ("cnpj") WHERE (("cnpj" IS NOT NULL) AND ("cnpj" <> ''::"text"));



CREATE UNIQUE INDEX "idx_profiles_cpf_unique" ON "public"."profiles" USING "btree" ("cpf") WHERE (("cpf" IS NOT NULL) AND ("cpf" <> ''::"text"));



CREATE INDEX "idx_service_requests_client" ON "public"."service_requests" USING "btree" ("client_id");



CREATE INDEX "idx_service_requests_client_id" ON "public"."service_requests" USING "btree" ("client_id");



CREATE INDEX "idx_service_requests_pro" ON "public"."service_requests" USING "btree" ("professional_id");



CREATE INDEX "idx_service_requests_professional_id" ON "public"."service_requests" USING "btree" ("professional_id");



CREATE INDEX "idx_support_messages_ticket_id" ON "public"."support_messages" USING "btree" ("ticket_id");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE UNIQUE INDEX "profiles_cnpj_unique" ON "public"."profiles" USING "btree" ("cnpj") WHERE (("cnpj" IS NOT NULL) AND ("cnpj" <> ''::"text"));



CREATE UNIQUE INDEX "profiles_cpf_unique" ON "public"."profiles" USING "btree" ("cpf") WHERE (("cpf" IS NOT NULL) AND ("cpf" <> ''::"text"));



CREATE INDEX "profiles_geo_index" ON "public"."profiles" USING "btree" ("latitude", "longitude");



CREATE OR REPLACE TRIGGER "check_call_limit_after_request" AFTER INSERT ON "public"."service_requests" FOR EACH ROW EXECUTE FUNCTION "public"."check_professional_call_limit"();



CREATE OR REPLACE TRIGGER "on_new_message_resurrect_chat" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."resurrect_chat"();



CREATE OR REPLACE TRIGGER "on_profile_created_coupon" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_profile_coupon"();



CREATE OR REPLACE TRIGGER "on_profile_created_subscription" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_subscription"();



CREATE OR REPLACE TRIGGER "set_protocol_on_insert" BEFORE INSERT ON "public"."service_requests" FOR EACH ROW EXECUTE FUNCTION "public"."generate_protocol"();



CREATE OR REPLACE TRIGGER "set_support_protocol" BEFORE INSERT ON "public"."support_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."generate_support_protocol"();



CREATE OR REPLACE TRIGGER "update_banners_updated_at" BEFORE UPDATE ON "public"."banners" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_enterprise_upgrade_requests_updated_at" BEFORE UPDATE ON "public"."enterprise_upgrade_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_fiscal_data_updated_at" BEFORE UPDATE ON "public"."professional_fiscal_data" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_job_postings_updated_at" BEFORE UPDATE ON "public"."job_postings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_professionals_updated_at" BEFORE UPDATE ON "public"."professionals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profile_private_updated_at" BEFORE UPDATE ON "public"."profile_private" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_service_requests_updated_at" BEFORE UPDATE ON "public"."service_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_settings_updated_at" BEFORE UPDATE ON "public"."platform_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_sponsors_updated_at" BEFORE UPDATE ON "public"."sponsors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_support_tickets_updated_at" BEFORE UPDATE ON "public"."support_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admin_logs"
    ADD CONSTRAINT "admin_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_read_status"
    ADD CONSTRAINT "chat_read_status_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_reports"
    ADD CONSTRAINT "chat_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."job_postings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_postings"
    ADD CONSTRAINT "job_postings_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_catalog"
    ADD CONSTRAINT "product_catalog_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professional_documents"
    ADD CONSTRAINT "professional_documents_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professional_fiscal_data"
    ADD CONSTRAINT "professional_fiscal_data_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_profession_id_fkey" FOREIGN KEY ("profession_id") REFERENCES "public"."professions"("id");



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professionals"
    ADD CONSTRAINT "professionals_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professions"
    ADD CONSTRAINT "professions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_private"
    ADD CONSTRAINT "profile_private_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."raffles"
    ADD CONSTRAINT "raffles_winner_user_id_fkey" FOREIGN KEY ("winner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id");



ALTER TABLE ONLY "public"."service_requests"
    ADD CONSTRAINT "service_requests_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id");



ALTER TABLE ONLY "public"."sponsor_clicks"
    ADD CONSTRAINT "sponsor_clicks_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin roles can read private profiles" ON "public"."profile_private" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = ANY (ARRAY['finance_admin'::"public"."app_role", 'moderator'::"public"."app_role", 'sponsor_admin'::"public"."app_role", 'support_admin'::"public"."app_role"]))))));



CREATE POLICY "Admins can insert logs" ON "public"."admin_logs" FOR INSERT WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage applications" ON "public"."job_applications" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage banners" ON "public"."banners" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage categories" ON "public"."categories" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage coupons" ON "public"."coupons" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage documents" ON "public"."professional_documents" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage fiscal data" ON "public"."professional_fiscal_data" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage jobs" ON "public"."job_postings" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage notifications" ON "public"."notifications" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage plans" ON "public"."plans" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage private profiles" ON "public"."profile_private" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage products" ON "public"."product_catalog" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage professionals" ON "public"."professionals" TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage professions" ON "public"."professions" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage raffles" ON "public"."raffles" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage requests" ON "public"."enterprise_upgrade_requests" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage reviews" ON "public"."reviews" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage sponsors" ON "public"."sponsors" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage stats" ON "public"."platform_stats" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage subscriptions" ON "public"."subscriptions" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage support messages" ON "public"."support_messages" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage tickets" ON "public"."support_tickets" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can manage transactions" ON "public"."transactions" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can read fiscal data" ON "public"."professional_fiscal_data" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = ANY (ARRAY['finance_admin'::"public"."app_role", 'moderator'::"public"."app_role", 'sponsor_admin'::"public"."app_role", 'support_admin'::"public"."app_role"]))))));



CREATE POLICY "Admins can read private profiles" ON "public"."profile_private" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE ("ur"."user_id" = "auth"."uid"()))));



CREATE POLICY "Admins can read professional documents" ON "public"."professional_documents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = ANY (ARRAY['finance_admin'::"public"."app_role", 'moderator'::"public"."app_role", 'sponsor_admin'::"public"."app_role", 'support_admin'::"public"."app_role"]))))));



CREATE POLICY "Admins can update any profile" ON "public"."profiles" FOR UPDATE USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all coupons" ON "public"."coupons" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all jobs" ON "public"."job_postings" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all professionals" ON "public"."professionals" FOR SELECT TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all sponsors" ON "public"."sponsors" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view all transactions" ON "public"."transactions" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view logs" ON "public"."admin_logs" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view roles" ON "public"."user_roles" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view settings" ON "public"."platform_settings" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins can view sponsor clicks" ON "public"."sponsor_clicks" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins manage messages" ON "public"."chat_messages" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Admins manage requests" ON "public"."service_requests" USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "Anyone can view active banners" ON "public"."banners" FOR SELECT USING (("active" = true));



CREATE POLICY "Anyone can view active categories" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "Anyone can view active jobs" ON "public"."job_postings" FOR SELECT USING (("active" = true));



CREATE POLICY "Anyone can view active plans" ON "public"."plans" FOR SELECT USING (("active" = true));



CREATE POLICY "Anyone can view active products" ON "public"."product_catalog" FOR SELECT USING ((("active" = true) AND (EXISTS ( SELECT 1
   FROM "public"."professionals" "p"
  WHERE (("p"."id" = "product_catalog"."professional_id") AND ("p"."active" = true))))));



CREATE POLICY "Anyone can view active professionals" ON "public"."professionals" FOR SELECT TO "authenticated" USING ((("active" = true) AND ("profile_status" = 'approved'::"text")));



CREATE POLICY "Anyone can view active professions" ON "public"."professions" FOR SELECT USING (true);



CREATE POLICY "Anyone can view active sponsors" ON "public"."sponsors" FOR SELECT USING (("active" = true));



CREATE POLICY "Anyone can view active stats" ON "public"."platform_stats" FOR SELECT USING (("active" = true));



CREATE POLICY "Anyone can view home layout" ON "public"."platform_settings" FOR SELECT USING (("key" = 'home_layout'::"text"));



CREATE POLICY "Anyone can view home tutorials" ON "public"."platform_settings" FOR SELECT USING (("key" = 'home_tutorials'::"text"));



CREATE POLICY "Anyone can view login and terms settings" ON "public"."platform_settings" FOR SELECT USING (("key" = ANY (ARRAY['login_bg_url'::"text", 'terms_of_use'::"text", 'privacy_policy'::"text", 'terms_version'::"text"])));



CREATE POLICY "Anyone can view notification sound" ON "public"."platform_settings" FOR SELECT USING (("key" = 'notification_sound_url'::"text"));



CREATE POLICY "Anyone can view raffles" ON "public"."raffles" FOR SELECT USING (true);



CREATE POLICY "Anyone can view reviews" ON "public"."reviews" FOR SELECT USING (true);



CREATE POLICY "Applicants can view own applications" ON "public"."job_applications" FOR SELECT USING (("auth"."uid"() = "applicant_id"));



CREATE POLICY "Authenticated users can create notifications" ON "public"."notifications" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can insert clicks" ON "public"."sponsor_clicks" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view fee settings" ON "public"."platform_settings" FOR SELECT USING (("key" = ANY (ARRAY['pix_fee_pct'::"text", 'pix_fee_fixed'::"text", 'card_fee_pct'::"text", 'card_fee_fixed'::"text", 'card_installment_fee_pct'::"text", 'card_installment_fee_fixed'::"text", 'card_installment_increment'::"text", 'max_installments'::"text", 'installment_fee_2x'::"text", 'installment_fee_3x'::"text", 'installment_fee_4x'::"text", 'installment_fee_5x'::"text", 'installment_fee_6x'::"text", 'installment_fee_7x'::"text", 'installment_fee_8x'::"text", 'installment_fee_9x'::"text", 'installment_fee_10x'::"text", 'installment_fee_11x'::"text", 'installment_fee_12x'::"text", 'commission_pct'::"text", 'commission_percent'::"text", 'discount_coupon_percent'::"text", 'discount_coupon_validity_days'::"text", 'discount_coupon_type'::"text", 'transfer_period_pix_hours'::"text", 'transfer_period_card_days'::"text", 'transfer_period_card_anticipated_days'::"text", 'anticipation_fee_pct'::"text"])));



CREATE POLICY "Client can create service request" ON "public"."service_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "Clients can create requests" ON "public"."service_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "Job owner can update applications" ON "public"."job_applications" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."job_postings" "jp"
     JOIN "public"."professionals" "p" ON (("p"."id" = "jp"."professional_id")))
  WHERE (("jp"."id" = "job_applications"."job_id") AND ("jp"."active" = true) AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Job owner can view applications" ON "public"."job_applications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."job_postings" "jp"
     JOIN "public"."professionals" "p" ON (("p"."id" = "jp"."professional_id")))
  WHERE (("jp"."id" = "job_applications"."job_id") AND ("jp"."active" = true) AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Owner can delete own jobs" ON "public"."job_postings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."professionals" "p"
  WHERE (("p"."id" = "job_postings"."professional_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Owner can delete own products" ON "public"."product_catalog" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."professionals" "p"
  WHERE (("p"."id" = "product_catalog"."professional_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Owner can insert jobs" ON "public"."job_postings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."professionals" "p"
  WHERE (("p"."id" = "job_postings"."professional_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Owner can insert products" ON "public"."product_catalog" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."professionals" "p"
  WHERE (("p"."id" = "product_catalog"."professional_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Owner can update own jobs" ON "public"."job_postings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."professionals" "p"
  WHERE (("p"."id" = "job_postings"."professional_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Owner can update own products" ON "public"."product_catalog" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."professionals" "p"
  WHERE (("p"."id" = "product_catalog"."professional_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Participants can send messages" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."service_requests" "sr"
  WHERE (("sr"."id" = "chat_messages"."request_id") AND (("sr"."client_id" = "auth"."uid"()) OR ("sr"."professional_id" IN ( SELECT "p"."id"
           FROM "public"."professionals" "p"
          WHERE ("p"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Participants can view messages" ON "public"."chat_messages" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR (EXISTS ( SELECT 1
   FROM "public"."service_requests" "sr"
  WHERE (("sr"."id" = "chat_messages"."request_id") AND (("sr"."client_id" = "auth"."uid"()) OR ("sr"."professional_id" IN ( SELECT "p"."id"
           FROM "public"."professionals" "p"
          WHERE ("p"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Parties can update request" ON "public"."service_requests" FOR UPDATE USING ((("auth"."uid"() = "client_id") OR ("auth"."uid"() IN ( SELECT "professionals"."user_id"
   FROM "public"."professionals"
  WHERE ("professionals"."id" = "service_requests"."professional_id")))));



CREATE POLICY "Permitir alteracao de campanhas" ON "public"."coupon_campaigns" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir atualizacao de denuncias" ON "public"."chat_reports" FOR UPDATE USING (true);



CREATE POLICY "Permitir atualizar meu status do chat" ON "public"."chat_read_status" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Permitir insercao de cupons pelo usuario" ON "public"."coupons" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Permitir insercao de notificacoes" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Permitir inserção de denúncias" ON "public"."chat_reports" FOR INSERT WITH CHECK (("auth"."uid"() = "reporter_id"));



CREATE POLICY "Permitir leitura de campanhas" ON "public"."coupon_campaigns" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir leitura de denuncias" ON "public"."chat_reports" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura publica de perfis" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura publica de produtos" ON "public"."product_catalog" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura publica de profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Permitir tudo para admins em platform_settings" ON "public"."platform_settings" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir update de cupons pelo usuario" ON "public"."coupons" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Professionals can insert own documents" ON "public"."professional_documents" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."professionals"
  WHERE (("professionals"."id" = "professional_documents"."professional_id") AND ("professionals"."user_id" = "auth"."uid"())))));



CREATE POLICY "Professionals can insert own fiscal data" ON "public"."professional_fiscal_data" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."professionals" "p"
  WHERE (("p"."id" = "professional_fiscal_data"."professional_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Professionals can update own" ON "public"."professionals" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Professionals can update own fiscal data" ON "public"."professional_fiscal_data" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."professionals" "p"
  WHERE (("p"."id" = "professional_fiscal_data"."professional_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Professionals can view own documents" ON "public"."professional_documents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."professionals"
  WHERE (("professionals"."id" = "professional_documents"."professional_id") AND ("professionals"."user_id" = "auth"."uid"())))));



CREATE POLICY "Professionals can view own fiscal data" ON "public"."professional_fiscal_data" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."professionals" "p"
  WHERE (("p"."id" = "professional_fiscal_data"."professional_id") AND ("p"."user_id" = "auth"."uid"())))));



CREATE POLICY "Service role inserts reviews" ON "public"."reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "Super admins can manage roles" ON "public"."user_roles" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage settings" ON "public"."platform_settings" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Users can apply to jobs" ON "public"."job_applications" FOR INSERT WITH CHECK (("auth"."uid"() = "applicant_id"));



CREATE POLICY "Users can insert own professional" ON "public"."professionals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own requests" ON "public"."enterprise_upgrade_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own subscription" ON "public"."subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own tickets" ON "public"."support_tickets" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert support messages" ON "public"."support_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND (("auth"."uid"() = "user_id") OR "public"."is_admin"("auth"."uid"()))));



CREATE POLICY "Users can manage own support read status" ON "public"."support_read_status" USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"("auth"."uid"())));



CREATE POLICY "Users can send message in their requests" ON "public"."chat_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."service_requests" "sr"
  WHERE (("sr"."id" = "chat_messages"."request_id") AND (("sr"."client_id" = "auth"."uid"()) OR ("sr"."professional_id" = "auth"."uid"()))))));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own read status" ON "public"."chat_read_status" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own subscription" ON "public"."subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own service requests" ON "public"."service_requests" FOR UPDATE USING ((("auth"."uid"() = "client_id") OR ("auth"."uid"() = "professional_id")));



CREATE POLICY "Users can upsert own read status" ON "public"."chat_read_status" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view chat messages of their requests" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."service_requests" "sr"
  WHERE (("sr"."id" = "chat_messages"."request_id") AND (("sr"."client_id" = "auth"."uid"()) OR ("sr"."professional_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view messages for their requests" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."service_requests"
  WHERE (("service_requests"."id" = "chat_messages"."request_id") AND (("service_requests"."client_id" = "auth"."uid"()) OR ("service_requests"."professional_id" IN ( SELECT "professionals"."id"
           FROM "public"."professionals"
          WHERE ("professionals"."user_id" = "auth"."uid"()))))))));



CREATE POLICY "Users can view own coupons" ON "public"."coupons" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own read status" ON "public"."chat_read_status" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own requests" ON "public"."enterprise_upgrade_requests" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own requests" ON "public"."service_requests" FOR SELECT USING ((("auth"."uid"() = "client_id") OR ("auth"."uid"() IN ( SELECT "professionals"."user_id"
   FROM "public"."professionals"
  WHERE ("professionals"."id" = "service_requests"."professional_id")))));



CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own subscription" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own support messages" ON "public"."support_messages" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"("auth"."uid"())));



CREATE POLICY "Users can view own tickets" ON "public"."support_tickets" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own transactions" ON "public"."transactions" FOR SELECT USING ((("auth"."uid"() = "client_id") OR ("auth"."uid"() = "professional_id")));



CREATE POLICY "Users can view their own service requests" ON "public"."service_requests" FOR SELECT USING ((("auth"."uid"() = "client_id") OR ("auth"."uid"() = "professional_id")));



CREATE POLICY "Utilizadores podem gerir os seus aparelhos" ON "public"."user_devices" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Utilizadores podem ver os seus aparelhos" ON "public"."user_devices" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."admin_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."banners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_read_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coupon_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enterprise_upgrade_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_postings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."professional_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."professional_fiscal_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."professionals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."professions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_private" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."raffles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsor_clicks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sponsors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_read_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."professionals";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."service_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."support_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."transactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_devices";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


















































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































GRANT ALL ON FUNCTION "public"."check_device_limit"("p_user_id" "uuid", "p_device_id" "text", "p_device_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_device_limit"("p_user_id" "uuid", "p_device_id" "text", "p_device_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_device_limit"("p_user_id" "uuid", "p_device_id" "text", "p_device_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_email_exists"("user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_email_exists"("user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_email_exists"("user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_professional_call_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_professional_call_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_professional_call_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_protocol"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_protocol"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_protocol"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_support_protocol"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_support_protocol"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_support_protocol"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pros_by_radius"("client_lat" double precision, "client_long" double precision, "radius_km" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pros_by_radius"("client_lat" double precision, "client_long" double precision, "radius_km" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pros_by_radius"("client_lat" double precision, "client_long" double precision, "radius_km" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_transaction_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_transaction_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transaction_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_profile_coupon"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_profile_coupon"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_profile_coupon"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_subscription"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_subscription"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_subscription"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_sponsor_clicks"("_sponsor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_sponsor_clicks"("_sponsor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_sponsor_clicks"("_sponsor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resurrect_chat"() TO "anon";
GRANT ALL ON FUNCTION "public"."resurrect_chat"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."resurrect_chat"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_review"("_request_id" "uuid", "_rating" integer, "_comment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_review"("_request_id" "uuid", "_rating" integer, "_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_review"("_request_id" "uuid", "_rating" integer, "_comment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

















































































GRANT ALL ON TABLE "public"."admin_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_logs" TO "service_role";



GRANT ALL ON TABLE "public"."banners" TO "anon";
GRANT ALL ON TABLE "public"."banners" TO "authenticated";
GRANT ALL ON TABLE "public"."banners" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_read_status" TO "anon";
GRANT ALL ON TABLE "public"."chat_read_status" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_read_status" TO "service_role";



GRANT ALL ON TABLE "public"."chat_reports" TO "anon";
GRANT ALL ON TABLE "public"."chat_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_reports" TO "service_role";



GRANT ALL ON TABLE "public"."coupon_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."coupon_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."coupons" TO "anon";
GRANT ALL ON TABLE "public"."coupons" TO "authenticated";
GRANT ALL ON TABLE "public"."coupons" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_upgrade_requests" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_upgrade_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_upgrade_requests" TO "service_role";



GRANT ALL ON TABLE "public"."job_applications" TO "anon";
GRANT ALL ON TABLE "public"."job_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."job_applications" TO "service_role";



GRANT ALL ON TABLE "public"."job_postings" TO "anon";
GRANT ALL ON TABLE "public"."job_postings" TO "authenticated";
GRANT ALL ON TABLE "public"."job_postings" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "anon";
GRANT ALL ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT ALL ON TABLE "public"."platform_stats" TO "anon";
GRANT ALL ON TABLE "public"."platform_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_stats" TO "service_role";



GRANT ALL ON TABLE "public"."product_catalog" TO "anon";
GRANT ALL ON TABLE "public"."product_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."product_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."professional_documents" TO "anon";
GRANT ALL ON TABLE "public"."professional_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."professional_documents" TO "service_role";



GRANT ALL ON TABLE "public"."professional_fiscal_data" TO "anon";
GRANT ALL ON TABLE "public"."professional_fiscal_data" TO "authenticated";
GRANT ALL ON TABLE "public"."professional_fiscal_data" TO "service_role";



GRANT ALL ON TABLE "public"."professionals" TO "anon";
GRANT ALL ON TABLE "public"."professionals" TO "authenticated";
GRANT ALL ON TABLE "public"."professionals" TO "service_role";



GRANT ALL ON TABLE "public"."professions" TO "anon";
GRANT ALL ON TABLE "public"."professions" TO "authenticated";
GRANT ALL ON TABLE "public"."professions" TO "service_role";



GRANT ALL ON TABLE "public"."profile_private" TO "anon";
GRANT ALL ON TABLE "public"."profile_private" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_private" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profiles_public" TO "anon";
GRANT ALL ON TABLE "public"."profiles_public" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles_public" TO "service_role";



GRANT ALL ON TABLE "public"."raffles" TO "anon";
GRANT ALL ON TABLE "public"."raffles" TO "authenticated";
GRANT ALL ON TABLE "public"."raffles" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."service_requests" TO "anon";
GRANT ALL ON TABLE "public"."service_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."service_requests" TO "service_role";



GRANT ALL ON TABLE "public"."sponsor_clicks" TO "anon";
GRANT ALL ON TABLE "public"."sponsor_clicks" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsor_clicks" TO "service_role";



GRANT ALL ON TABLE "public"."sponsors" TO "anon";
GRANT ALL ON TABLE "public"."sponsors" TO "authenticated";
GRANT ALL ON TABLE "public"."sponsors" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."support_messages" TO "anon";
GRANT ALL ON TABLE "public"."support_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."support_messages" TO "service_role";



GRANT ALL ON TABLE "public"."support_read_status" TO "anon";
GRANT ALL ON TABLE "public"."support_read_status" TO "authenticated";
GRANT ALL ON TABLE "public"."support_read_status" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."user_devices" TO "anon";
GRANT ALL ON TABLE "public"."user_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."user_devices" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































