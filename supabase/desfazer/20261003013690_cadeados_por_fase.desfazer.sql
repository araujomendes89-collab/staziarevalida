-- DESFAZER da 20261003013690_cadeados_por_fase.sql (planos, etapa 3: cadeados por fase no banco).
-- Tira os gatilhos e as regras de leitura novas, devolve simulado_gate com o nome de sempre (o corpo
-- nunca mudou), devolve app_escolher_teste ao aluno logado e apaga o que a 013690 criou (hashes de IP, colunas de verificação,
-- funções novas). Planos dados pela equipe (aluno_fases com origem "equipe") FICAM: para tirar, use antes
-- app_admin_direitos_tirar_plano. Rode ANTES de desfazer a 013680. Pode ser rodado de novo sem erro.

drop trigger if exists cadeado_practice_sessions on public.practice_sessions;
drop trigger if exists cadeado_question_attempts on public.question_attempts;
drop trigger if exists cadeado_flashcard_reviews on public.flashcard_reviews;
drop trigger if exists cadeado_tutor_sessions on public.tutor_sessions;

drop policy if exists "cadeado: 1ª fase (questões)" on public.questions;
drop policy if exists "cadeado: 1ª fase (flashcards)" on public.flashcards;
drop policy if exists "cadeado: 2ª fase (estações)" on public.checklist_stations;
drop policy if exists "cadeado: 2ª fase (conteúdo das estações)" on public.checklist_station_contents;
drop policy if exists "cadeado: 2ª fase (simulados práticos)" on public.checklist_events;
drop policy if exists "cadeado: 2ª fase (filas dos simulados práticos)" on public.checklist_study_schedules;
drop policy if exists "cadeado: 2ª fase (salas da dupla)" on public.checklist_rooms;
drop policy if exists "cadeado: 2ª fase (convites da dupla)" on public.study_invites;

do $do$
begin
  if to_regprocedure('public.simulado_gate_regra_antiga()') is not null then
    drop function if exists public.simulado_gate();
    alter function public.simulado_gate_regra_antiga() rename to simulado_gate;
  end if;
end
$do$;
-- as permissões de antes: simulado_gate só para quem está logado
revoke execute on function public.simulado_gate() from public, anon;
grant execute on function public.simulado_gate() to authenticated;

grant execute on function public.app_escolher_teste(text) to authenticated;

drop function if exists public.app_admin_teste_verificado(text);
drop function if exists public.app_admin_testes_alerta();
drop function if exists public.app_admin_direitos_tirar_plano(text, text);
drop function if exists public.app_admin_direitos_dar_plano(text, text, timestamptz, text);
drop function if exists public.ch_worker_teste_ips_limpar();
drop function if exists public.ch_worker_teste_ativar(uuid, text, text);
drop function if exists public.direitos_escolher_teste(uuid, text);
drop function if exists public.cadeado_tutor_sessions();
drop function if exists public.cadeado_flashcard_reviews();
drop function if exists public.cadeado_question_attempts();
drop function if exists public.cadeado_practice_sessions();
drop function if exists public.cadeado_inicio_do_dia();
drop function if exists public.app_cadeado(text);
drop function if exists public.cadeado_pode_ler(text);
drop function if exists public.cadeado_conferir(uuid, text, integer);

-- o alerta do teste volta à versão "sem alerta" da 013680
create or replace function public.direitos_teste_alerta(p_user uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$ select null::jsonb $$;
revoke execute on function public.direitos_teste_alerta(uuid) from public, anon, authenticated;

drop table if exists public.teste_ips;
alter table public.aluno_testes drop column if exists ativado_em, drop column if exists verificacao, drop column if exists verificacao_motivo,
  drop column if exists verificacao_em;
alter table public.direitos_config drop column if exists amostra_simulado_max_questoes, drop column if exists ip_alerta_testes,
  drop column if exists ip_alerta_dias, drop column if exists ip_guarda_dias;
update public.direitos_recursos set amostra_modo = 'do_dia', amostra_limite = null, unidade = 'flashcards do dia', updated_at = now()
where codigo = 'flashcards' and amostra_modo = 'por_dia' and amostra_limite = 10;
