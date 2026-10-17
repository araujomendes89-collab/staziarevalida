-- =============================================================================
-- PLANOS · ETAPA 3 (decisões do dono de 2026-10-17): CADEADOS POR FASE NO BANCO, valendo SÓ com a chave "cadeados_ligados".
--
-- O QUE FAZ (com a chave LIGADA; desligada, nada muda para ninguém):
--   * a matriz por fase da etapa 1 (direitos_do_aluno / user_has_access) passa a valer no banco, para quem chama pela REST ou
--     pelas funções do app, inclusive as que rodam como "dono" (security definer):
--       - questões teóricas: abrir treino (practice_sessions), responder (question_attempts, também pelo Tutor), abrir o Tutor
--         numa questão (tutor_sessions) e receber as questões do nivelamento (nivelamento_itens). Amostra = N respostas por dia (20; respostas dentro de simulado não contam). PRÁTICA:
--         trancado. Leitura direta da tabela questions pela REST: trancada para quem não tem a 1ª fase;
--       - simulados Revalida/ENAMED: amostra = 1 simulado CURTO por dia (até 30 questões, editável); PRÁTICA: trancado. A trava
--         antiga do teste vencido (simulado_gate, …9730) deixa de valer com a chave ligada (a regra nova decide: vencido = amostra);
--       - flashcards: amostra = 10 cartões por dia (decisão do dono 17/10 noite); PRÁTICA: trancado. Trancar NUNCA apaga nem
--         reinicia o progresso (flashcard_states): a revisão espaçada volta igual quando o aluno assinar PRO ou ELITE;
--       - estações e checklists, simulados práticos e Treino em Dupla (tabelas da 2ª fase que existem hoje: checklist_*,
--         study_invites): PRO tranca; 2ª fase fechada aos alunos = fechada também no banco (só administrador e editor entram);
--       - abrir uma questão avulsa pelo código (practice_question_view, só enunciado e alternativas, sem gabarito) NÃO é trancado
--         aqui: a função muda a toda hora em outros ramos (13120 e seguintes) e um porteiro nela seria desfeito a cada nova versão.
--         Os caminhos do app (treino, simulado, Tutor, relacionadas) já são barrados ao abrir a sessão. Pendência documentada.
--   * teste grátis por fase "ativado" pelo NOSSO servidor (POST /api/planos/teste/ativar), que vê o IP: guardamos só o HASH do IP
--     (HMAC, 90 dias). Muitos testes do mesmo IP em poucos dias (padrão: mais de 3 em 7 dias) fazem o teste seguinte pedir
--     VERIFICAÇÃO A MAIS (nunca bloqueia). A escolha 1ª fase / 2ª fase / as duas ("as duas" = os dois testes) passa a ser feita
--     por essa rota (o onboarding da etapa 4 chama); app_escolher_teste deixa de ser chamada direto pelo navegador;
--   * a equipe (só administrador) pode DAR um plano por fase (PRO, PRÁTICA ou ELITE) até uma data, em Administração > Usuários,
--     com motivo e registro; e tirar.
--
-- COMO, SEM REGRESSÃO: só gatilhos NOVOS (BEFORE INSERT, nomes "cadeado_*"), políticas NOVAS do tipo RESTRICTIVE (somam-se às de
-- hoje sem trocar nenhuma) e um "porteiro" com a mesma técnica da etapa 2: simulado_gate (…9730) é RENOMEADA sem mudar uma
-- letra (simulado_gate_regra_antiga) e um porteiro com o mesmo nome devolve exatamente a resposta antiga com a chave desligada.
-- ATENÇÃO, próximas migrações: quem mudar simulado_gate deve mudar simulado_gate_regra_antiga (a conferência avisa se o porteiro sumir).
-- Todos os gatilhos decidem pelo aluno da LINHA (new.user_id), não por auth.uid(): valem também quando o servidor grava.
--
-- O QUE FICA PARA DEPOIS (documentado): amostra por dia de estações/checklists/simulados práticos e o Treino em Dupla novo
-- dependem das tabelas novas da 2ª fase (ramos fase2-telas / publicar-fase2 / dupla-*): nas funções que iniciam estação,
-- simulado prático, sala da dupla ou grupo, chamar  perform public.cadeado_conferir(<aluno>, '<recurso>', <usados hoje>);
-- (recursos: estacoes, checklists, simulados_praticos, treino_dupla, grupo_pratico, grupo_teorico). Aulas/Temas (amostra 3 por dia)
-- não gravam a abertura no banco: precisa de decisão (contar por abertura) antes. Mapas mentais são arquivos do app (fora do banco).
--
-- Pode ser colada de novo sem estragar nada. Desfazer: supabase/desfazer/20261003013690_cadeados_por_fase.desfazer.sql.
-- Conferir: supabase/conferir/cadeados-por-fase.sql. Depende da 013640 e da 013680.
-- =============================================================================

-- ---------------------------------------------------------------- números da amostra e do alerta de IP (editáveis)
alter table public.direitos_config
  add column if not exists amostra_simulado_max_questoes integer not null default 30 check (amostra_simulado_max_questoes between 1 and 200),
  add column if not exists ip_alerta_testes integer not null default 3 check (ip_alerta_testes between 1 and 1000),
  add column if not exists ip_alerta_dias integer not null default 7 check (ip_alerta_dias between 1 and 90),
  add column if not exists ip_guarda_dias integer not null default 90 check (ip_guarda_dias between 1 and 365);

-- flashcards na amostra: 10 cartões por dia (decisão do dono 17/10 noite). Só troca a proposta antiga ("só os do dia").
update public.direitos_recursos set amostra_modo = 'por_dia', amostra_limite = 10, unidade = 'cartões por dia', decidido = true, updated_at = now()
where codigo = 'flashcards' and amostra_modo = 'do_dia';

-- ---------------------------------------------------------------- o cadeado central
-- Interna. Para p_user e p_recurso, com a chave ligada: trancado → recusa (42501) com a frase do recurso; amostra "por dia" com
-- p_usados_hoje informado e já no limite → recusa com a frase da amostra. Desligada (ou sem aluno): não faz nada.
-- A dica "cadeado:<recurso>" / "amostra:<recurso>" vai no HINT do erro, para as telas da etapa 4 mostrarem a mensagem de compra.
create or replace function public.cadeado_conferir(p_user uuid, p_recurso text, p_usados_hoje integer default null) returns void
  language plpgsql stable security definer set search_path = ''
as $$
declare
  r jsonb;
  v_lim integer;
begin
  if p_user is null or not public.direitos_cadeados_ligados() then return; end if;
  r := public.direitos_do_aluno(p_user) -> 'recursos' -> p_recurso;
  if r is null then return; end if;
  if r ->> 'acesso' = 'trancado' then
    raise exception '%', coalesce(r ->> 'mensagem', 'Este recurso não faz parte do seu plano.')
      using errcode = '42501', hint = 'cadeado:' || p_recurso;
  end if;
  if r ->> 'acesso' = 'amostra' and p_usados_hoje is not null and r #>> '{amostra,modo}' = 'por_dia' then
    v_lim := (r #>> '{amostra,limite}')::int;
    if v_lim is not null and p_usados_hoje >= v_lim then
      raise exception 'Você já usou a amostra de hoje (% %). Amanhã tem mais, ou assine um plano para liberar.', v_lim, coalesce(r #>> '{amostra,unidade}', '')
        using errcode = '42501', hint = 'amostra:' || p_recurso;
    end if;
  end if;
end
$$;
revoke execute on function public.cadeado_conferir(uuid, text, integer) from public, anon, authenticated;

-- Para as regras de leitura (RLS): a pessoa logada pode LER este recurso? Com a chave desligada, sempre. Avaliada uma vez por
-- consulta (usada como "(select public.cadeado_pode_ler('…'))"). Só diz respeito à própria pessoa.
create or replace function public.cadeado_pode_ler(p_recurso text) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select not public.direitos_cadeados_ligados() or (select auth.uid()) is null
         or coalesce(public.user_has_access((select auth.uid()), p_recurso), 'liberado') <> 'trancado'
$$;
revoke execute on function public.cadeado_pode_ler(text) from public, anon;
grant execute on function public.cadeado_pode_ler(text) to authenticated;

-- Para o servidor e as telas: o acesso a um recurso, sem recusar (liberado/amostra/trancado + mensagem e ofertas).
create or replace function public.app_cadeado(p_recurso text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  d jsonb;
begin
  if v_user is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  d := public.direitos_do_aluno(v_user);
  return jsonb_build_object('modo', d ->> 'modo', 'recurso', p_recurso,
                            'vale', d ->> 'modo' = 'ligado', 'acesso', d #>> array['recursos', p_recurso, 'acesso'],
                            'detalhe', d #> array['recursos', p_recurso]);
end
$$;
revoke execute on function public.app_cadeado(text) from public, anon;
grant execute on function public.app_cadeado(text) to authenticated;

-- Início do dia de hoje em São Paulo (para contar a amostra do dia).
create or replace function public.cadeado_inicio_do_dia() returns timestamptz
  language sql stable set search_path = ''
as $$ select (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') $$;
revoke execute on function public.cadeado_inicio_do_dia() from public, anon, authenticated;

-- ---------------------------------------------------------------- gatilhos novos (só agem com a chave ligada)
-- Sessões de treino e simulados (todas as portas: app_start_session, Trilha, Plano de Hoje, relacionadas, reforço, TRI…).
create or replace function public.cadeado_practice_sessions() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
  v_max integer;
begin
  if not public.direitos_cadeados_ligados() then return new; end if;
  if new.kind = 'simulado' then
    select count(*) into n from public.practice_sessions s
    where s.user_id = new.user_id and s.kind = 'simulado' and s.started_at >= public.cadeado_inicio_do_dia();
    perform public.cadeado_conferir(new.user_id, 'simulados_teoricos', n);
    if public.user_has_access(new.user_id, 'simulados_teoricos') = 'amostra' then
      v_max := coalesce((select c.amostra_simulado_max_questoes from public.direitos_config c), 30);
      if cardinality(new.question_ids) > v_max then
        raise exception 'Na amostra, o simulado é curto: até % questões. Assine um plano para fazer simulados completos.', v_max
          using errcode = '42501', hint = 'amostra:simulados_teoricos';
      end if;
    end if;
  else
    select count(*) into n from public.question_attempts a left join public.practice_sessions s on s.id = a.session_id
    where a.user_id = new.user_id and a.answered_at >= public.cadeado_inicio_do_dia() and s.kind is distinct from 'simulado';
    perform public.cadeado_conferir(new.user_id, 'questoes', n);
  end if;
  return new;
end
$$;
revoke execute on function public.cadeado_practice_sessions() from public, anon, authenticated;
drop trigger if exists cadeado_practice_sessions on public.practice_sessions;
create trigger cadeado_practice_sessions before insert on public.practice_sessions
  for each row execute function public.cadeado_practice_sessions();

-- Cada resposta (treino e Tutor). Respostas de simulado (gravadas no fim, em lote) não contam: o simulado já foi conferido ao abrir.
create or replace function public.cadeado_question_attempts() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if not public.direitos_cadeados_ligados() then return new; end if;
  if new.session_id is not null and exists (select 1 from public.practice_sessions s where s.id = new.session_id and s.kind = 'simulado') then
    return new;
  end if;
  select count(*) into n from public.question_attempts a left join public.practice_sessions s on s.id = a.session_id
  where a.user_id = new.user_id and a.answered_at >= public.cadeado_inicio_do_dia() and s.kind is distinct from 'simulado';
  perform public.cadeado_conferir(new.user_id, 'questoes', n);
  return new;
end
$$;
revoke execute on function public.cadeado_question_attempts() from public, anon, authenticated;
drop trigger if exists cadeado_question_attempts on public.question_attempts;
create trigger cadeado_question_attempts before insert on public.question_attempts
  for each row execute function public.cadeado_question_attempts();

-- Flashcards: cada revisão. Recusar a revisão desfaz a transação inteira de app_review_flashcard (o estado do cartão não muda) e
-- NADA é apagado: o progresso fica guardado para quando o aluno voltar a ter a 1ª fase.
create or replace function public.cadeado_flashcard_reviews() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if not public.direitos_cadeados_ligados() then return new; end if;
  select count(*) into n from public.flashcard_reviews r where r.user_id = new.user_id and r.reviewed_at >= public.cadeado_inicio_do_dia();
  perform public.cadeado_conferir(new.user_id, 'flashcards', n);
  return new;
end
$$;
revoke execute on function public.cadeado_flashcard_reviews() from public, anon, authenticated;
drop trigger if exists cadeado_flashcard_reviews on public.flashcard_reviews;
create trigger cadeado_flashcard_reviews before insert on public.flashcard_reviews
  for each row execute function public.cadeado_flashcard_reviews();

-- Tutor numa questão do banco (abrir com questão ou trocar de questão): é conteúdo da 1ª fase.
create or replace function public.cadeado_tutor_sessions() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.direitos_cadeados_ligados() then return new; end if;
  if new.question_id is not null and (tg_op = 'INSERT' or new.question_id is distinct from old.question_id) then
    perform public.cadeado_conferir(new.user_id, 'questoes');
  end if;
  return new;
end
$$;
revoke execute on function public.cadeado_tutor_sessions() from public, anon, authenticated;
drop trigger if exists cadeado_tutor_sessions on public.tutor_sessions;
create trigger cadeado_tutor_sessions before insert or update of question_id on public.tutor_sessions
  for each row execute function public.cadeado_tutor_sessions();

-- Nivelamento (questões teóricas, com a correção): quem não tem a 1ª fase não recebe as questões do diagnóstico. Sem contagem
-- (o nivelamento é um por aluno e não gasta a amostra do dia).
create or replace function public.cadeado_diagnostico_itens() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.direitos_cadeados_ligados() then return new; end if;
  perform public.cadeado_conferir((select d.user_id from public.nivelamento_diagnosticos d where d.id = new.diagnostico_id), 'questoes');
  return new;
end
$$;
revoke execute on function public.cadeado_diagnostico_itens() from public, anon, authenticated;
drop trigger if exists cadeado_diagnostico_itens on public.nivelamento_itens;
create trigger cadeado_diagnostico_itens before insert on public.nivelamento_itens
  for each row execute function public.cadeado_diagnostico_itens();

-- ---------------------------------------------------------------- regras de leitura NOVAS (RESTRICTIVE: só tiram, nunca dão acesso)
drop policy if exists "cadeado: 1ª fase (questões)" on public.questions;
create policy "cadeado: 1ª fase (questões)" on public.questions as restrictive
  for select to authenticated using ((select public.cadeado_pode_ler('questoes')));
drop policy if exists "cadeado: 1ª fase (flashcards)" on public.flashcards;
create policy "cadeado: 1ª fase (flashcards)" on public.flashcards as restrictive
  for select to authenticated using ((select public.cadeado_pode_ler('flashcards')));
drop policy if exists "cadeado: 2ª fase (estações)" on public.checklist_stations;
create policy "cadeado: 2ª fase (estações)" on public.checklist_stations as restrictive
  for select to authenticated using ((select public.cadeado_pode_ler('estacoes')));
drop policy if exists "cadeado: 2ª fase (conteúdo das estações)" on public.checklist_station_contents;
create policy "cadeado: 2ª fase (conteúdo das estações)" on public.checklist_station_contents as restrictive
  for select to authenticated using ((select public.cadeado_pode_ler('checklists')));
drop policy if exists "cadeado: 2ª fase (simulados práticos)" on public.checklist_events;
create policy "cadeado: 2ª fase (simulados práticos)" on public.checklist_events as restrictive
  for select to authenticated using ((select public.cadeado_pode_ler('simulados_praticos')));
drop policy if exists "cadeado: 2ª fase (filas dos simulados práticos)" on public.checklist_study_schedules;
create policy "cadeado: 2ª fase (filas dos simulados práticos)" on public.checklist_study_schedules as restrictive
  for select to authenticated using ((select public.cadeado_pode_ler('simulados_praticos')));
drop policy if exists "cadeado: 2ª fase (salas da dupla)" on public.checklist_rooms;
create policy "cadeado: 2ª fase (salas da dupla)" on public.checklist_rooms as restrictive
  for insert to authenticated with check ((select public.cadeado_pode_ler('treino_dupla')));
drop policy if exists "cadeado: 2ª fase (convites da dupla)" on public.study_invites;
create policy "cadeado: 2ª fase (convites da dupla)" on public.study_invites as restrictive
  for insert to authenticated with check ((select public.cadeado_pode_ler('treino_dupla')));

-- ---------------------------------------------------------------- porteiro (mesma técnica da etapa 2)
-- simulado_gate (…9730): com a chave ligada, a trava ANTIGA do teste vencido sai (vencido = amostra na regra nova, conferida pelo
-- gatilho cadeado_practice_sessions). Desligada: exatamente a resposta antiga.
do $do$
begin
  if to_regprocedure('public.simulado_gate_regra_antiga()') is null then
    alter function public.simulado_gate() rename to simulado_gate_regra_antiga;
  end if;
end
$do$;
revoke execute on function public.simulado_gate_regra_antiga() from public, anon, authenticated;

create or replace function public.simulado_gate() returns text
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.direitos_cadeados_ligados() then return null; end if;
  return public.simulado_gate_regra_antiga();
end
$$;
revoke execute on function public.simulado_gate() from public, anon;
grant execute on function public.simulado_gate() to authenticated;

-- ---------------------------------------------------------------- teste grátis: ativação pelo servidor e alerta de IP
-- verificacao: "pedida" quando o alerta de IP disparou (o app pede verificação a mais; nunca bloqueia); "feita" depois que a
-- equipe (ou, na etapa 4, a verificação do app) confirmou. ativado_em: quando o servidor ativou o teste (viu o IP).
alter table public.aluno_testes
  add column if not exists ativado_em timestamptz,
  add column if not exists verificacao text check (verificacao in ('pedida', 'feita')),
  add column if not exists verificacao_motivo text check (char_length(verificacao_motivo) <= 120),
  add column if not exists verificacao_em timestamptz;

-- Só o HASH do IP (HMAC feito no servidor; o IP em si nunca chega ao banco), guardado por "ip_guarda_dias" (90).
create table if not exists public.teste_ips (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now()
);
create index if not exists teste_ips_hash_idx on public.teste_ips (ip_hash, criado_em);
create index if not exists teste_ips_criado_idx on public.teste_ips (criado_em);
alter table public.teste_ips enable row level security;
revoke all on public.teste_ips from public, anon, authenticated;

-- O alerta do teste (lido por direitos_do_aluno → teste.verificacao). Substitui a versão "sem alerta" da 013680.
create or replace function public.direitos_teste_alerta(p_user uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select case when t.verificacao is null then null else jsonb_build_object(
           'pedida', t.verificacao = 'pedida', 'feita', t.verificacao = 'feita', 'motivo', t.verificacao_motivo, 'em', t.verificacao_em) end
  from public.aluno_testes t where t.user_id = p_user
$$;
revoke execute on function public.direitos_teste_alerta(uuid) from public, anon, authenticated;

-- A escolha do teste (1ª fase, 2ª fase ou as duas), agora interna: chamada pela ativação do servidor. Mesmo corpo de
-- app_escolher_teste (…13640), trocando só "o aluno logado" pelo aluno informado.
create or replace function public.direitos_escolher_teste(p_user uuid, p_escolha text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user constant uuid := p_user;
  t public.aluno_testes;
  v_fases text[];
begin
  if v_user is null then
    raise exception 'Aluno não informado.' using errcode = '22023';
  end if;
  if public.user_has_full_access(v_user) then
    raise exception 'A equipe já tem acesso completo; o teste grátis é só para alunos.' using errcode = '22023';
  end if;
  if p_escolha is null or p_escolha not in ('teoria', 'pratica', 'as_duas') then
    raise exception 'Escolha 1ª fase, 2ª fase ou as duas.' using errcode = '22023';
  end if;
  if p_escolha <> 'teoria' and not coalesce((select c.fase2_aberta_alunos from public.direitos_config c), false) then
    raise exception 'A 2ª fase ainda não está aberta aos alunos. Por enquanto, escolha a 1ª fase.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('direitos:' || v_user::text, 0));
  select * into t from public.aluno_testes where user_id = v_user for update;
  if not found then
    raise exception 'Sua conta não tem teste grátis. Fale com a equipe.' using errcode = '22023';
  end if;
  if t.escolhido_em is not null then
    raise exception 'Você já escolheu o seu teste grátis. Só existe um teste por conta: para a outra fase, assine o plano.' using errcode = '22023';
  end if;
  if (t.fim is not null and t.fim <= now())
     or not exists (select 1 from public.subscriptions s where s.user_id = v_user and s.status = 'trialing'
                    and (s.trial_ends_at is null or s.trial_ends_at > now())) then
    raise exception 'Seu teste grátis já terminou. Só existe um teste por conta.' using errcode = '22023';
  end if;
  if public.direitos_teste_repetido(v_user) then
    raise exception 'Este WhatsApp já foi usado no teste grátis de outra conta. Só existe um teste por telefone.' using errcode = '22023';
  end if;
  v_fases := case p_escolha when 'teoria' then array['teoria'] when 'pratica' then array['pratica'] else array['teoria', 'pratica'] end;
  update public.aluno_testes set escolha = p_escolha, fases = v_fases, escolhido_em = now() where user_id = v_user;
  if 'pratica' = any (v_fases) then
    -- nunca rebaixa uma 2ª fase que já esteja paga
    insert into public.aluno_fases (user_id, fase, situacao, plano, inicio, fim, origem)
    values (v_user, 'pratica', 'teste', null, t.inicio, t.fim, 'escolha_teste')
    on conflict (user_id, fase) do nothing;
  end if;
  return public.direitos_do_aluno(v_user);
end
$$;
revoke execute on function public.direitos_escolher_teste(uuid, text) from public, anon, authenticated;

-- O navegador não escolhe mais o teste direto: passa pelo servidor (que vê o IP). Sem isso, o alerta de IP seria contornável.
revoke execute on function public.app_escolher_teste(text) from public, anon, authenticated;

-- SERVIDOR: ativa o teste grátis do aluno (POST /api/planos/teste/ativar, logo depois do cadastro / no onboarding).
-- p_escolha: 'teoria', 'pratica', 'as_duas' ou null (só registra a ativação; a escolha fica para depois).
-- p_ip_hash: HMAC-SHA256 do IP (64 hexadecimais) ou null (IP desconhecido: sem alerta).
-- Alerta (nunca bloqueia): se, nos últimos "ip_alerta_dias", mais de "ip_alerta_testes" OUTRAS contas ativaram teste com o mesmo
-- hash, este teste fica com verificacao = 'pedida'. Guarda o hash por "ip_guarda_dias" e apaga os mais velhos aqui mesmo.
create or replace function public.ch_worker_teste_ativar(p_user uuid, p_escolha text, p_ip_hash text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  cfg public.direitos_config;
  t public.aluno_testes;
  n integer;
begin
  if p_user is null then raise exception 'Aluno não informado.' using errcode = '22023'; end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'Código do IP inválido.' using errcode = '22023'; end if;
  if public.user_has_full_access(p_user) then
    return jsonb_build_object('ok', true, 'equipe', true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('direitos:' || p_user::text, 0));
  select * into cfg from public.direitos_config;
  delete from public.teste_ips where criado_em < now() - make_interval(days => coalesce(cfg.ip_guarda_dias, 90));
  select * into t from public.aluno_testes where user_id = p_user for update;
  if not found then
    raise exception 'Sua conta não tem teste grátis. Fale com a equipe.' using errcode = '22023';
  end if;
  if t.ativado_em is null then
    if p_ip_hash is not null then
      select count(distinct i.user_id) into n from public.teste_ips i
      where i.ip_hash = p_ip_hash and i.user_id <> p_user and i.criado_em > now() - make_interval(days => coalesce(cfg.ip_alerta_dias, 7));
      insert into public.teste_ips (user_id, ip_hash) values (p_user, p_ip_hash);
      if n >= coalesce(cfg.ip_alerta_testes, 3) then
        update public.aluno_testes set verificacao = 'pedida', verificacao_motivo = 'muitos_testes_mesmo_ip', verificacao_em = now()
        where user_id = p_user and verificacao is null;
      end if;
    end if;
    update public.aluno_testes set ativado_em = now() where user_id = p_user;
  end if;
  if p_escolha is not null then
    perform public.direitos_escolher_teste(p_user, p_escolha);
  end if;
  return jsonb_build_object('ok', true, 'direitos', public.direitos_do_aluno(p_user));
end
$$;
revoke execute on function public.ch_worker_teste_ativar(uuid, text, text) from public, anon, authenticated;

-- SERVIDOR (tarefa diária): apaga os hashes de IP mais velhos que o prazo (mesmo sem nenhum teste novo).
create or replace function public.ch_worker_teste_ips_limpar() returns integer
  language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.teste_ips where criado_em < now() - make_interval(days => coalesce((select c.ip_guarda_dias from public.direitos_config c), 90));
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function public.ch_worker_teste_ips_limpar() from public, anon, authenticated;

-- ---------------------------------------------------------------- Administração (só administrador)
-- Dar um plano por fase (PRO, PRÁTICA ou ELITE) até uma data, para uma pessoa (inclusive o PRÁTICA, que o modelo antigo não tem).
-- Grava as fases com origem "equipe" (o espelho da assinatura nunca mexe nelas). Com a 2ª fase fechada, avisa: a pessoa só
-- verá a prática quando a 2ª fase abrir.
create or replace function public.app_admin_direitos_dar_plano(p_busca text, p_plano text, p_ate timestamptz, p_motivo text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  pl public.direitos_planos;
  f text;
begin
  perform public.assert_admin();
  v_user := public.carteira_achar_usuario(p_busca);
  select * into pl from public.direitos_planos where codigo = p_plano;
  if not found then raise exception 'Escolha PRO, PRÁTICA ou ELITE.' using errcode = '22023'; end if;
  if p_ate is null or p_ate <= now() or p_ate > now() + interval '2 years' then
    raise exception 'Informe até quando (uma data futura, no máximo em 2 anos).' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 300 then raise exception 'Escreva o motivo.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('direitos:' || v_user::text, 0));
  -- o plano dado substitui o que a equipe tinha dado antes (as fases de fora do plano voltam a seguir a assinatura)
  delete from public.aluno_fases where user_id = v_user and origem = 'equipe' and not (fase = any (pl.fases));
  foreach f in array pl.fases loop
    insert into public.aluno_fases as a (user_id, fase, situacao, plano, inicio, fim, origem, atualizado_em)
    values (v_user, f, 'paga', pl.codigo, now(), p_ate, 'equipe', now())
    on conflict (user_id, fase) do update set situacao = 'paga', plano = excluded.plano, inicio = excluded.inicio, fim = excluded.fim,
      origem = 'equipe', atualizado_em = now();
  end loop;
  perform public.direitos_sincronizar_assinatura(v_user);
  perform public.admin_log('direitos.fase_dada', v_user::text, jsonb_build_object('plano', pl.codigo, 'ate', p_ate, 'motivo', btrim(p_motivo)));
  return public.app_admin_direitos_aluno(v_user::text) || jsonb_build_object(
    'aviso', case when 'pratica' = any (pl.fases) and not coalesce((select c.fase2_aberta_alunos from public.direitos_config c), false)
                  then 'A 2ª fase ainda está fechada aos alunos: a parte prática só aparece quando ela abrir.' end);
end
$$;
revoke execute on function public.app_admin_direitos_dar_plano(text, text, timestamptz, text) from public, anon;
grant execute on function public.app_admin_direitos_dar_plano(text, text, timestamptz, text) to authenticated;

-- Tirar o plano dado pela equipe: as fases voltam a seguir a assinatura de sempre.
create or replace function public.app_admin_direitos_tirar_plano(p_busca text, p_motivo text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  n integer;
begin
  perform public.assert_admin();
  v_user := public.carteira_achar_usuario(p_busca);
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 300 then raise exception 'Escreva o motivo.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('direitos:' || v_user::text, 0));
  delete from public.aluno_fases where user_id = v_user and origem = 'equipe';
  get diagnostics n = row_count;
  perform public.direitos_sincronizar_assinatura(v_user);
  if n > 0 then
    perform public.admin_log('direitos.fase_tirada', v_user::text, jsonb_build_object('motivo', btrim(p_motivo)));
  end if;
  return public.app_admin_direitos_aluno(v_user::text);
end
$$;
revoke execute on function public.app_admin_direitos_tirar_plano(text, text) from public, anon;
grant execute on function public.app_admin_direitos_tirar_plano(text, text) to authenticated;

-- Testes com verificação pedida (alerta de IP) e marcar como verificado.
create or replace function public.app_admin_testes_alerta() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'verificacao', t.verificacao, 'motivo', t.verificacao_motivo,
                                                       'em', t.verificacao_em, 'teste_fim', t.fim) order by t.verificacao_em desc)
                   from public.aluno_testes t join auth.users u on u.id = t.user_id
                   where t.verificacao is not null and t.verificacao_em > now() - interval '90 days'), '[]'::jsonb);
end
$$;
revoke execute on function public.app_admin_testes_alerta() from public, anon;
grant execute on function public.app_admin_testes_alerta() to authenticated;

create or replace function public.app_admin_teste_verificado(p_busca text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform public.assert_admin();
  v_user := public.carteira_achar_usuario(p_busca);
  update public.aluno_testes set verificacao = 'feita', verificacao_em = now() where user_id = v_user and verificacao = 'pedida';
  if found then perform public.admin_log('direitos.teste_verificado', v_user::text, '{}'::jsonb); end if;
  return public.app_admin_testes_alerta();
end
$$;
revoke execute on function public.app_admin_teste_verificado(text) from public, anon;
grant execute on function public.app_admin_teste_verificado(text) to authenticated;
