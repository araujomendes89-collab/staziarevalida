-- =============================================================================
-- Gemini 2.5 sai do ar em 20/10/2026 (página "Model versions" do Vertex AI, conferida em 17/10/2026):
-- gemini-2.5-pro, gemini-2.5-flash e gemini-2.5-flash-lite. Esta migração troca SÓ O NOME do modelo nas funções
-- da Central de IAs e a lista de modelos do Gemini. Não mexe em preços, modo, cuidado, tetos nem em outras IAs.
--
-- Troca (o Google recomenda o gemini-3.8-flash no lugar do 2.5 Pro e do 2.5 Flash):
--   gemini-2.5-pro        -> gemini-3.8-flash
--   gemini-2.5-flash      -> gemini-3.8-flash
--   gemini-2.5-flash-lite -> gemini-3.1-flash-lite   (nenhuma função usa hoje; fica coberto)
--
-- O que muda em produção (leitura de 17/10/2026): só `reviewers` de 4 funções (criacao, engenharia_reversa, assistente_conferir
-- e verificacao); nenhuma principal nem reserva usa Gemini 2.5. Em ai_providers, a lista de modelos do Gemini passa a ser a que
-- o botão "Atualizar lista" montaria com o código novo (só os modelos com preço cadastrado que a chave expressa do Vertex aceita).
-- Sem essa lista nova, o modelo escolhido nas funções ficaria "fora da lista" e a Central o bloquearia (refProblems).
--
-- Preços: não mexe em nenhum. Os 5 modelos novos já têm preço em ai_model_prices em produção (conferido em 17/10/2026; o
-- conferir-013580.sql avisa se algum faltar) e os preços do Gemini 2.5 ficam (histórico).
--
-- Pode ser colada duas vezes: a segunda não encontra mais nenhum gemini-2.5 nas funções e regrava a mesma lista.
-- Para desfazer: modelos-gemini/desfazer-013580.sql. Para conferir: modelos-gemini/conferir-013580.sql.
-- =============================================================================

-- 1) funções: troca o modelo Gemini 2.5 em principal, reserva e conferentes/membros (só as linhas que têm um)
create or replace function pg_temp.gemini_novo(p_model text) returns text
  language sql immutable
as $$
  select case p_model
    when 'gemini-2.5-pro' then 'gemini-3.8-flash'
    when 'gemini-2.5-flash' then 'gemini-3.8-flash'
    when 'gemini-2.5-flash-lite' then 'gemini-3.1-flash-lite'
    else p_model
  end
$$;

create or replace function pg_temp.ref_nova(p_ref jsonb) returns jsonb
  language sql immutable
as $$
  select case
    when p_ref is not null and jsonb_typeof(p_ref) = 'object' and p_ref ->> 'provider' = 'gemini'
      then jsonb_set(p_ref, '{model}', to_jsonb(pg_temp.gemini_novo(p_ref ->> 'model')))
    else p_ref
  end
$$;

update public.ai_functions f
set primary_ref = pg_temp.ref_nova(f.primary_ref),
    fallback_ref = pg_temp.ref_nova(f.fallback_ref),
    reviewers = coalesce(
      (select jsonb_agg(pg_temp.ref_nova(e.v) order by e.n) from jsonb_array_elements(f.reviewers) with ordinality as e(v, n)),
      '[]'::jsonb
    ),
    updated_at = now()
where f.primary_ref::text ~ 'gemini-2\.5-' or f.fallback_ref::text ~ 'gemini-2\.5-' or f.reviewers::text ~ 'gemini-2\.5-';

-- 2) lista de modelos do Gemini na Central (mesma lista que o código novo monta ao atualizar), se já existir uma lista guardada
update public.ai_providers
set models = '[
  {"id": "gemini-3.1-flash-lite", "label": "gemini-3.1-flash-lite"},
  {"id": "gemini-3.1-pro-preview", "label": "gemini-3.1-pro-preview"},
  {"id": "gemini-3.5-flash", "label": "gemini-3.5-flash"},
  {"id": "gemini-3.5-flash-lite", "label": "gemini-3.5-flash-lite"},
  {"id": "gemini-3.8-flash", "label": "gemini-3.8-flash"}
]'::jsonb,
    models_refreshed_at = now(),
    updated_at = now()
where id = 'gemini'
  -- só quando a lista já foi montada alguma vez (lista vazia = Central sem lista guardada: nada é conferido contra ela)
  and jsonb_array_length(models) > 0;
