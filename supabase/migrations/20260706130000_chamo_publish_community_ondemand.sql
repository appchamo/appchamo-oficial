-- Publicação sob demanda de post COM IMAGEM na Comunidade, como o perfil oficial Chamô.
-- Uso: suba a arte no bucket community-feed (painel do Supabase) e chame:
--   select public.chamo_publish_community('caminho-ou-url', 'legenda...');
-- Passe p_dry_run => true para só ver a URL resolvida, sem postar.
create or replace function public.chamo_publish_community(
  p_image   text,
  p_body    text,
  p_dry_run boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author  uuid := 'f0e03e07-fb41-4338-931a-ef7ac7ecc698';  -- perfil oficial Chamô Tecnologia
  v_base    text := 'https://wfxeiuqxzrlnvlopcrwd.supabase.co/storage/v1/object/public/';
  v_img     text := btrim(coalesce(p_image, ''));
  v_url     text;
  v_id      uuid;
begin
  -- Segurança: no app (com sessão), só admin publica. No SQL editor (service role, auth.uid() null) é liberado.
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    raise exception 'Sem permissão: apenas admin pode publicar na comunidade.';
  end if;

  if v_img = '' then
    raise exception 'Imagem obrigatória (caminho no bucket community-feed ou URL completa).';
  end if;
  if btrim(coalesce(p_body, '')) = '' then
    raise exception 'Legenda obrigatória.';
  end if;

  -- Resolve a URL pública a partir do que foi passado.
  if v_img ~* '^https?://' then
    v_url := v_img;
  elsif v_img like 'community-feed/%' then
    v_url := v_base || v_img;
  else
    v_url := v_base || 'community-feed/' || ltrim(v_img, '/');
  end if;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'author_id', v_author, 'image_url', v_url, 'body', p_body);
  end if;

  insert into public.community_posts (author_id, body, image_url, audience)
  values (v_author, p_body, v_url, 'public')
  returning id into v_id;

  return jsonb_build_object('dry_run', false, 'post_id', v_id, 'author_id', v_author, 'image_url', v_url);
end;
$$;

comment on function public.chamo_publish_community(text, text, boolean) is
  'Publica post com imagem na Comunidade como o perfil oficial Chamô. Suba a arte no bucket community-feed e chame com o caminho/URL + legenda. p_dry_run=true só resolve a URL.';

grant execute on function public.chamo_publish_community(text, text, boolean) to authenticated, service_role;
