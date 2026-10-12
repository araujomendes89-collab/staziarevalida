-- =============================================================================
-- Podcasts: o roteiro só é aprovado por revisor médico da área ou pelo administrador (P07, decisão do dono em 2026-10-11).
--
-- Antes: qualquer pessoa da equipe (editor inclusive, e quem gerou o roteiro) aprovava, bastando escrever 10 caracteres de nota
-- (20261003004700_podcasts.sql). Depois: aprova o ADMINISTRADOR ou o REVISOR MÉDICO cadastrado na ÁREA do episódio
-- (ch_reviewer_areas), a mesma regra do áudio conferido das Aulas (20261003009580, lesson_can_release). Editor comum NÃO aprova.
-- A regra é do BANCO (a tela só explica por que o botão está desligado).
--
--  * Quem entra na tela de Podcasts continua sendo a equipe (administrador ou editor): o revisor médico precisa também ser
--    editor para abrir a aba, como nas Aulas. Aqui só se decide QUEM APROVA.
--  * Episódio SEM grande área: só o administrador aprova (não há "revisor da área" a consultar).
--  * Aprovar de novo um roteiro já aprovado segue a mesma regra (um editor não troca a aprovação de um revisor).
--  * Editar o roteiro continua tirando a aprovação e o áudio (4700), então quem edita depois precisa de nova aprovação.
--  * A recusa de roteiro que cita fonte complementar (20261003009620, ch_podcast_script_check) CONTINUA: o invólucro
--    app_admin_podcast_approve da 9620 não é mexido. A regra nova entra na função interna ch_raw_app_admin_podcast_approve (o corpo
--    antigo da 4700, que a 9620 renomeou), por isso colar a 9620 de novo não desfaz esta regra.
--  * Publicar continua só do administrador (9620 -> app_admin_podcast_publish).
--
-- Funções e base: ch_raw_app_admin_podcast_approve parte da 20261003004700 (corpo original, renomeado pela 9620; ninguém mais o
-- redefiniu). Novas: podcast_can_approve, podcast_approve_block_text, ch_podcast_approver_check, app_admin_podcast_approval.
-- PRÉ-REQUISITO: a 20261003009620 já colada (ela cria o invólucro). Pode ser colada duas vezes e não muda nenhum dado.
-- =============================================================================

do $$
begin
  if to_regprocedure('public.ch_raw_app_admin_podcast_approve(uuid,text)') is null then
    raise exception 'Cole antes a migração 20261003009620 (Fontes complementares): ela prepara a função de aprovar o roteiro.';
  end if;
end
$$;

-- Quem aprova o roteiro de um episódio da área p_area: administrador, ou revisor médico cadastrado nessa área.
create or replace function public.podcast_can_approve(p_area public.med_area) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (public.is_admin() or (p_area is not null and public.ch_is_reviewer(public.guideline_area_code(p_area))))
$$;

-- A explicação, em português, de por que a pessoa não aprova (a mesma na tela e na recusa do banco).
create or replace function public.podcast_approve_block_text(p_area public.med_area) returns text
  language sql stable security definer set search_path = ''
as $$
  select case when p_area is null
    then 'Este episódio não tem grande área. Só o administrador aprova o roteiro de um episódio sem área: escolha a grande área no passo 1 (o revisor médico dela passa a poder aprovar) ou peça ao administrador.'
    else 'Só o administrador ou o revisor médico da área ' || public.area_label(p_area) || ' aprova o roteiro. Peça a um deles para conferir e aprovar.'
  end
$$;

-- Recusa (42501) quem não pode aprovar o episódio; episódio que não existe dá "não encontrado".
create or replace function public.ch_podcast_approver_check(p_id uuid) returns void
  language plpgsql stable security definer set search_path = ''
as $$
declare v_area public.med_area;
begin
  select area into v_area from public.podcasts where id = p_id;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  if not public.podcast_can_approve(v_area) then
    raise exception '%', public.podcast_approve_block_text(v_area) using errcode = '42501';
  end if;
end
$$;

-- Função interna da aprovação (corpo da 4700 + a regra nova logo depois de conferir a equipe). O invólucro da 9620 chama esta.
create or replace function public.ch_raw_app_admin_podcast_approve(p_id uuid, p_note text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare p public.podcasts;
begin
  perform public.assert_staff();
  perform public.ch_podcast_approver_check(p_id);
  select * into p from public.podcasts where id = p_id for update;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  if p.script is null or p.status not in ('script_ready', 'approved') then raise exception 'Gere ou edite o roteiro antes de aprovar.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Escreva o que foi conferido (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  update public.podcasts set approved_by = (select auth.uid()), approved_at = now(), approval_note = left(btrim(p_note), 600), status = 'approved', updated_at = now() where id = p_id;
  perform public.admin_log('podcast.approve', p_id::text, jsonb_build_object('note', left(btrim(p_note), 600)));
  return public.podcast_admin_view(p_id);
end
$$;

-- Para a tela: a pessoa pode aprovar este episódio? Se não, por quê (texto em português). Só a equipe consulta.
create or replace function public.app_admin_podcast_approval(p_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_area public.med_area;
begin
  perform public.assert_staff();
  select area into v_area from public.podcasts where id = p_id;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  return jsonb_build_object('can_approve', public.podcast_can_approve(v_area),
                            'reason', case when public.podcast_can_approve(v_area) then null else public.podcast_approve_block_text(v_area) end);
end
$$;

do $perm$
begin
  -- internas: só o banco chama
  revoke execute on function public.podcast_can_approve(public.med_area) from public, anon, authenticated;
  revoke execute on function public.podcast_approve_block_text(public.med_area) from public, anon, authenticated;
  revoke execute on function public.ch_podcast_approver_check(uuid) from public, anon, authenticated;
  revoke execute on function public.ch_raw_app_admin_podcast_approve(uuid, text) from public, anon, authenticated;
  -- tela: sem login ninguém chama
  revoke execute on function public.app_admin_podcast_approval(uuid) from public, anon;
  grant execute on function public.app_admin_podcast_approval(uuid) to authenticated;
end
$perm$;
