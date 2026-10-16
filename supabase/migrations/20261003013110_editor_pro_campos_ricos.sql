-- =============================================================================
-- Editor profissional, expansão (Questões, Atualizações, Podcasts, Estações, Central): base dos CAMPOS com formatação.
-- Padrão: o texto oficial continua no campo de sempre; a formatação fica num objeto "formatacao" (campo → envelope sdoc v1).
-- Decisão do dono (16/10): mudança SÓ de formatação não derruba aprovação/conferência. Aqui só as funções puras que cada área usa:
--   * ch_campos_conteudo(textos, formatacao): o que, na formatação, é CONTEÚDO (imagem, link novo, nota...). '{}' = só formatação.
--     Mesma regra da 013080 (ch_rico_conteudo × ch_texto_conteudo). Espelho em TS: src/shared/docRico/campos.ts (camposConteudo).
--   * ch_campos_so_formatacao(textos_antes, form_antes, textos_depois, form_depois): true quando os textos são idênticos e a
--     formatação não traz conteúdo diferente.
--   * ch_formatacao_valida(formatacao): só a forma (objeto de envelopes sdoc v1, até 64 campos, até 400 KB). Não confere projeção
--     (quem mostra ao aluno descarta rico cuja projeção não bate com o texto — ricoValido no TS).
-- Depende da 013080. Pode ser colada duas vezes. Desfazer: drop das 3 funções (ninguém mais depende delas até as áreas usarem).
-- =============================================================================

create or replace function public.ch_formatacao_valida(p_formatacao jsonb) returns boolean
  language sql immutable set search_path = ''
as $$
  select p_formatacao is null
      or (jsonb_typeof(p_formatacao) = 'object'
          and (select count(*) from jsonb_object_keys(p_formatacao)) <= 64
          and octet_length(p_formatacao::text) <= 400000
          and not exists (select 1 from jsonb_each(p_formatacao) e
                           where jsonb_typeof(e.value) <> 'object' or e.value ->> 'f' is distinct from 'sdoc' or e.value -> 'v' is distinct from '1'::jsonb
                              or jsonb_typeof(e.value -> 'doc') is distinct from 'object' or (e.value - 'f' - 'v' - 'doc') <> '{}'::jsonb))
$$;

create or replace function public.ch_campos_conteudo(p_textos jsonb, p_formatacao jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case
    when p_formatacao is null or jsonb_typeof(p_formatacao) = 'null' then '{}'::jsonb
    when jsonb_typeof(p_formatacao) <> 'object' then jsonb_build_object('bruto', p_formatacao)
    else coalesce((select jsonb_object_agg(e.key, public.ch_rico_conteudo(e.value))
                     from jsonb_each(p_formatacao) e
                    where public.ch_rico_conteudo(e.value) is distinct from public.ch_texto_conteudo(p_textos ->> e.key)), '{}'::jsonb)
  end
$$;

create or replace function public.ch_campos_so_formatacao(p_textos_antes jsonb, p_form_antes jsonb, p_textos_depois jsonb, p_form_depois jsonb) returns boolean
  language sql immutable set search_path = ''
as $$
  select coalesce(p_textos_antes, '{}'::jsonb) = coalesce(p_textos_depois, '{}'::jsonb)
     and public.ch_campos_conteudo(p_textos_antes, p_form_antes) = public.ch_campos_conteudo(p_textos_depois, p_form_depois)
$$;

revoke execute on function public.ch_formatacao_valida(jsonb) from public, anon;
revoke execute on function public.ch_campos_conteudo(jsonb, jsonb) from public, anon;
revoke execute on function public.ch_campos_so_formatacao(jsonb, jsonb, jsonb, jsonb) from public, anon;
