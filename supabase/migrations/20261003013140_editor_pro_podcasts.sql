-- =============================================================================
-- Editor profissional, expansão: PODCASTS (16/10/2026). A "Fala" vai para a voz (TTS), então o editor entra só como texto (sem
-- formatação; nada muda no banco nem no TTS). Aqui só a correção P1 do plano:
--   * app_admin_podcast_save_script (corpo da 20261003004700, a única definição): salvar o roteiro SEM mudar as falas não derruba
--     mais a aprovação nem o áudio (antes, todo salvar derrubava). "Mudar as falas" = mudar, em alguma fala, quem fala, o texto
--     (depois do btrim), o jeito de falar (até 80 caracteres) ou os trechos citados; ou a ordem/quantidade de falas; ou a lista do
--     que as fontes não esclarecem. Comparação feita com o roteiro gravado normalizado do mesmo jeito (o da IA pode ter chaves a
--     mais ou "style" vazio). Igual → nada é gravado (status, aprovação, áudio e avisos da conferência ficam como estão).
--     Diferente → exatamente a regra de hoje (tira a aprovação e o áudio; volta a "roteiro pronto").
--   * podcast_roteiro_normalizado(script): função interna da comparação.
-- Pode ser colada duas vezes. Conferir: /Volumes/StaziaMed/.tmp-aulas/editor-pro/sql/013140-conferir.sql · desfazer: 013140-desfazer.sql
-- =============================================================================

-- O roteiro como o salvar grava (falas com quem fala, texto aparado, jeito de falar e trechos; e a lista do que falta).
create or replace function public.podcast_roteiro_normalizado(p_script jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('speaker', l ->> 'speaker', 'text', btrim(coalesce(l ->> 'text', '')), 'style', left(coalesce(l ->> 'style', ''), 80),
                                                           'sources', coalesce(l -> 'sources', '[]'::jsonb)) order by o), '[]'::jsonb)
                from jsonb_array_elements(case when jsonb_typeof(p_script -> 'lines') = 'array' then p_script -> 'lines' else '[]'::jsonb end) with ordinality as x (l, o)),
    'missing', coalesce(p_script -> 'missing', '[]'::jsonb))
$$;
revoke execute on function public.podcast_roteiro_normalizado(jsonb) from public, anon, authenticated;

-- Roteiro editado pela equipe: valida a forma; mudar as falas tira a aprovação e o áudio (precisa conferir e gerar de novo).
-- Corpo da 20261003004700 + "sem mudança nas falas = nada muda".
create or replace function public.app_admin_podcast_save_script(p_id uuid, p_script jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  p public.podcasts;
  v_lines jsonb := p_script -> 'lines';
  v_script jsonb;
begin
  perform public.assert_staff();
  select * into p from public.podcasts where id = p_id for update;
  if not found then raise exception 'Episódio não encontrado.' using errcode = 'P0002'; end if;
  if p.status = 'published' then raise exception 'Despublique o episódio antes de editar o roteiro.' using errcode = '22023'; end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) not between 2 and 260 then raise exception 'O roteiro precisa de 2 a 260 falas.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(v_lines) l
             where coalesce(l ->> 'speaker', '') not in ('ANA', 'BRUNO') or char_length(btrim(coalesce(l ->> 'text', ''))) not between 1 and 700
                or jsonb_typeof(coalesce(l -> 'sources', '[]'::jsonb)) <> 'array') then
    raise exception 'Cada fala precisa de quem fala (ANA ou BRUNO) e de 1 a 700 caracteres.' using errcode = '22023';
  end if;
  v_script := jsonb_build_object('lines', (select jsonb_agg(jsonb_build_object('speaker', l ->> 'speaker', 'text', btrim(l ->> 'text'), 'style', left(coalesce(l ->> 'style', ''), 80),
                                                                               'sources', coalesce(l -> 'sources', '[]'::jsonb)) order by o)
                                          from jsonb_array_elements(v_lines) with ordinality as x (l, o)),
                                 'missing', coalesce(p_script -> 'missing', p.script -> 'missing', '[]'::jsonb));
  -- 013140: as falas não mudaram de fato (ex.: salvar sem mexer, ou só espaço nas pontas) → nada muda: aprovação e áudio ficam
  if p.script is not null and public.podcast_roteiro_normalizado(v_script) = public.podcast_roteiro_normalizado(p.script) then
    return public.podcast_admin_view(p_id);
  end if;
  update public.podcasts set
    script = v_script,
    -- os avisos da conferência eram das falas antigas: saem (a tela confere de novo pelo servidor)
    script_meta = (p.script_meta - 'warnings') || jsonb_build_object('edited_by', (select auth.uid()), 'edited_at', now()),
    approved_by = null, approved_at = null, approval_note = null, audio_path = null, audio_bytes = null, audio_seconds = null, audio_meta = '{}'::jsonb,
    status = 'script_ready', updated_at = now()
  where id = p_id;
  perform public.admin_log('podcast.script.edit', p_id::text, jsonb_build_object('lines', jsonb_array_length(v_lines)));
  return public.podcast_admin_view(p_id);
end
$$;
revoke execute on function public.app_admin_podcast_save_script(uuid, jsonb) from public, anon;
