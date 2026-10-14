-- =============================================================================
-- Flashcard ILUSTRADO no baralho e na revisão (14/10/2026, decisão do dono). Só leitura; nada novo é gravado em tabela.
-- O cartão do baralho StaziaMed (flashcards com ch_unit_id, vindo da publicação da unidade) continua com o texto de sempre; esta função diz,
-- para os cartões que o aluno vai ver, qual é o par de imagens (frente e verso) da aula PUBLICADA. A tela então mostra a imagem no baralho
-- e na revisão espaçada; sem imagem, o texto.
--   * app_flashcards_ilustrados(ids): { id_do_cartão: { tema, n } } só para cartão cuja unidade está PUBLICADA (aula da Central no ar, publicação
--     ativa), cuja versão no ar traz o cartão ilustrado (frente E verso). Nunca devolve caminho de arquivo, PDF nem código visível ao aluno
--     (o "tema" é só a chave técnica da rota de imagem protegida, a mesma da aula: /api/content-hub/aula-aluno/<tema>/<frente|verso>/<n>).
--   * ch_card_images(versão): apoio interno (cartão da versão -> número da imagem).
-- Depende de 9861, 9862, 9950, 9980 e 9992. Pode ser colada duas ou mais vezes.
-- =============================================================================

create or replace function public.ch_card_images(p_version_id uuid) returns table (card_key text, n integer)
  language sql stable security definer set search_path = ''
as $$
  select public.ch_hash(jsonb_build_array(lower(regexp_replace(btrim(coalesce(c ->> 'front', '')), '\s+', ' ', 'g')),
                                           lower(regexp_replace(btrim(coalesce(c ->> 'back', '')), '\s+', ' ', 'g')))), t.o::integer
    from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'cards', '[]'::jsonb)) with ordinality as t (c, o)
   where m.unit_version_id = p_version_id and m.kind = 'flashcards'
     and coalesce(c ->> 'card_id', '') ~ '^[A-Za-z0-9-]{3,40}$'
     and exists (select 1 from public.ch_unit_materials x, jsonb_array_elements(x.files) f1
                  where x.unit_version_id = p_version_id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'flashcards_ilustrados'
                    and f1 ->> 'tipo' = 'image/png' and f1 ->> 'caminho' ~* ('/' || (c ->> 'card_id') || '-digital-frente\.png$'))
     and exists (select 1 from public.ch_unit_materials x, jsonb_array_elements(x.files) f2
                  where x.unit_version_id = p_version_id and x.status = 'ativo' and x.visibility = 'aluno' and x.kind = 'flashcards_ilustrados'
                    and f2 ->> 'tipo' = 'image/png' and f2 ->> 'caminho' ~* ('/' || (c ->> 'card_id') || '-digital-verso\.png$'))
$$;
revoke execute on function public.ch_card_images(uuid) from public, anon, authenticated;

create or replace function public.app_flashcards_ilustrados(p_ids uuid[]) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_out jsonb := '{}'::jsonb;
  a jsonb;
  v_n integer;
  v_code text;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then return v_out; end if;
  if cardinality(p_ids) > 300 then raise exception 'Cartões demais de uma vez (até 300).' using errcode = '22023'; end if;
  for r in select f.id, f.ch_unit_id, f.ch_card_key from public.flashcards f
            where f.id = any (p_ids) and f.ch_unit_id is not null and f.published and f.owner_id is null loop
    v_code := public.ch_unit_code(r.ch_unit_id);
    continue when v_code is null;
    a := public.ch_tema_aula_aberta(v_code);       -- só unidade PUBLICADA (aula da Central no ar + publicação ativa)
    continue when a is null;
    perform public.ch_unit_materials_sync((a ->> 'version_id')::uuid);
    select i.n into v_n from public.ch_card_images((a ->> 'version_id')::uuid) i where i.card_key = r.ch_card_key limit 1;
    continue when v_n is null;
    v_out := v_out || jsonb_build_object(r.id::text, jsonb_build_object('tema', v_code, 'n', v_n));
  end loop;
  return v_out;
end
$$;
revoke execute on function public.app_flashcards_ilustrados(uuid[]) from public, anon;
grant execute on function public.app_flashcards_ilustrados(uuid[]) to authenticated;
