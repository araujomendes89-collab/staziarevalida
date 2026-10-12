-- =============================================================================
-- Central de IAs › gasto do mês de tudo o que já fica registrado (IA02, parte só de leitura; 2026-10-11).
--
-- O gasto do mês da Central (ai_calls) só enxerga o que passa pelo maestro. O Tutor, a voz ao vivo, a transcrição do microfone, a
-- voz do professor, o áudio dos Podcasts e a busca por significado gravam o gasto em outros lugares:
--   * ai_usage_ledger (Tutor, vozes, transcrição, áudio dos Podcasts);
--   * ch_ai_runs, etapa "embeddings" (busca por significado).
-- Esta função só LÊ e soma esses lugares no mês corrente (fuso de Brasília), por grupo, sem contar duas vezes o que a Central já
-- conta: lesson_assist e podcast_script (o ledger repete o que o maestro grava em ai_calls) e as outras etapas de ch_ai_runs ficam de
-- fora. "tutor_voice" é só o tempo da cota de voz (o custo está nas linhas tutor_voice_live, tutor_voice_gemini e tutor_voice_tokens).
-- Linha com uso (tokens, segundos ou caracteres) e custo zero conta em "unpriced_records": o preço não foi definido (por exemplo, o
-- preço da voz e da transcrição no painel do Tutor). Nada é estimado aqui.
--
-- Só cria uma função: nada é apagado, alterado ou gravado. Pode ser colada de novo sem erro (create or replace).
-- Só administrador lê (assert_admin); visitante e papel público não executam.
-- =============================================================================

create or replace function public.app_admin_ai_spend_month() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_month timestamp := date_trunc('month', now() at time zone 'America/Sao_Paulo');
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'month_start', to_char(v_month, 'YYYY-MM-DD'),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('key', k.key, 'cost_usd', coalesce(s.cost, 0), 'records', coalesce(s.records, 0),
                                           'unpriced_records', coalesce(s.unpriced, 0)) order by k.ord)
        from unnest(array['tutor_conversa', 'tutor_voz_ao_vivo', 'tutor_transcricao', 'tutor_voz_professor', 'podcasts_audio', 'busca_significado'])
             with ordinality as k(key, ord)
        left join (
          select u.grp, round(sum(u.cost), 6) as cost, count(*) as records, count(*) filter (where u.cost = 0) as unpriced
            from (
              select case
                       when l.feature in ('tutor_text', 'tutor_eval') then 'tutor_conversa'
                       when l.feature in ('tutor_voice_live', 'tutor_voice_gemini', 'tutor_voice_tokens', 'tutor_voice_backend') then 'tutor_voz_ao_vivo'
                       when l.feature = 'tutor_stt' then 'tutor_transcricao'
                       when l.feature in ('tutor_tts', 'tutor_tts_audicao') then 'tutor_voz_professor'
                       when l.feature = 'podcast_tts' then 'podcasts_audio'
                     end as grp,
                     l.estimated_cost_usd as cost
                from public.ai_usage_ledger l
               where date_trunc('month', l.created_at at time zone 'America/Sao_Paulo') = v_month
                 and l.input_text_tokens + l.input_audio_tokens + l.output_text_tokens + l.output_audio_tokens + l.duration_seconds + l.characters > 0
              union all
              select 'busca_significado', coalesce(r.cost_usd, 0)
                from public.ch_ai_runs r
               where r.step = 'embeddings' and r.status = 'ok' and coalesce(r.input_tokens, 0) > 0
                 and date_trunc('month', r.created_at at time zone 'America/Sao_Paulo') = v_month
            ) u
           where u.grp is not null
           group by u.grp
        ) s on s.grp = k.key), '[]'::jsonb)
  );
end
$$;

revoke execute on function public.app_admin_ai_spend_month() from public, anon;
