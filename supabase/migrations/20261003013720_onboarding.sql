-- =============================================================================
-- ONBOARDING INTELIGENTE (pedido do dono de 2026-10-17): o caminho do aluno novo depois do aceite do Termo.
--
-- O QUE GUARDA, POR ALUNO:
--   * aluno_onboarding: em que pé está (status not_started/in_progress/completed/skipped, passo atual, quando cada etapa foi
--     feita: apresentação, configuração, nivelamento, trilha), o tour no painel (pendente/em andamento/pausado/concluído/pulado e
--     o passo onde parou) e as explicações de primeiro uso já vistas (Arena, Simulados, 2ª fase...). Versão do onboarding = 1.
--   * aluno_preferencias_estudo: as preferências que NÃO existiam no banco: dias da semana, áreas que o aluno diz ter
--     dificuldade, jeito de estudar (questões/aulas/flashcards/misto), personagem e personalidade escolhidos para o Tutor,
--     lembretes (só a preferência: o app ainda NÃO envia lembretes), a fase que o aluno disse querer (teste) e a prioridade do
--     ELITE. O que já existia continua onde estava, sem cópia: data da prova e tempo por dia (profiles.exam_date e
--     profiles.daily_minutes, os mesmos do "Personalizar plano"), quantos dias por semana (profiles.study_days_per_week, que
--     passa a ser preenchido) e a fase do menu (profiles.phase).
--
-- REGRAS:
--   * Preferência NUNCA libera recurso. O que o aluno pode usar continua vindo só do servidor (regra de hoje e a regra nova dos
--     planos, direitos_do_aluno da …13640, que aqui é só LIDA para decidir a pergunta: teste escolhe a fase; PRO já é 1ª fase;
--     PRÁTICA é 2ª fase; ELITE escolhe a prioridade; vencido/cancelado recebe o convite com tudo guardado). A única gravação de
--     acesso é a escolha do teste pela função oficial app_escolher_teste (…13640), e só quando a 2ª fase estiver aberta aos alunos
--     (com ela fechada, a 1ª fase já é o teste de todos e nada é travado).
--   * 2ª fase fechada aos alunos: a escolha "2ª fase" ou "as duas" é recusada (a tela mostra "em breve").
--   * Equipe e revisor médico não passam pelo onboarding (aplicavel = false); podem abrir pela Ajuda para conferir.
--   * Conta antiga (já respondeu questões, mexeu no nivelamento, revisou flashcards ou falou com o Tutor) e sem registro aqui NÃO
--     é obrigada: o Início oferece ("convite"). Só a conta nova (origem cadastro) vê o onboarding em tela cheia e volta para ele
--     enquanto não terminar nem pular.
--   * Dois aparelhos: o passo atual só anda para a frente (o mais adiantado vale), as datas de cada etapa nunca se apagam e um
--     onboarding concluído não volta a "em andamento" por causa de uma gravação atrasada.
--   * Leitura: o aluno só lê as próprias linhas (RLS). Gravação: só pelas funções app_onboarding_* (security definer,
--     search_path vazio), nunca direto na tabela.
--
-- NÃO MUDA NENHUMA FUNÇÃO QUE JÁ EXISTE (nada de "create or replace" de função antiga): Plano de Hoje (app_today), nivelamento,
-- Tutor e direitos são chamados como estão. O personagem do Tutor só é aplicado se a função app_tutor_set_character (ramo
-- tutor-personagens, …13610) já estiver no banco; antes disso a escolha fica guardada aqui (ponto de ligação).
--
-- DEPENDE de 20261003013640_direitos_por_fase.sql (planos, etapa 1) e de 20261003012300 (nivelamento): colar DEPOIS delas.
-- Pode ser colada de novo sem estragar nada (tabelas "if not exists", funções "create or replace", políticas recriadas).
-- Desfazer: supabase/desfazer/20261003013720_onboarding.desfazer.sql. Conferir: supabase/conferir/onboarding.sql.
-- =============================================================================

-- ---------------------------------------------------------------- estado do onboarding (uma linha por aluno)
create table if not exists public.aluno_onboarding (
  user_id uuid primary key references auth.users (id) on delete cascade,
  versao smallint not null default 1 check (versao between 1 and 100),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'skipped')),
  -- o passo mais adiantado a que o aluno chegou (só anda para a frente)
  passo_atual text not null default 'apresentacao' check (passo_atual in (
    'apresentacao', 'fase', 'prova', 'rotina', 'dificuldades', 'jeito', 'tutor', 'lembretes', 'nivelamento', 'trilha', 'fim')),
  -- cadastro: conta nova (o onboarding abre sozinho); conta_antiga: já estudava antes (só convite no Início)
  origem text not null default 'cadastro' check (origem in ('cadastro', 'conta_antiga')),
  apresentacao_em timestamptz,
  configuracao_em timestamptz,
  nivelamento text check (nivelamento in ('feito', 'pulado', 'nao_se_aplica')),
  nivelamento_em timestamptz,
  trilha_em timestamptz,
  tour_status text not null default 'pendente' check (tour_status in ('pendente', 'em_andamento', 'pausado', 'concluido', 'pulado')),
  tour_passo smallint not null default 0 check (tour_passo between 0 and 20),
  tour_em timestamptz,
  dicas_vistas text[] not null default '{}' check (cardinality(dicas_vistas) <= 60),
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz,
  pulado_em timestamptz,
  atualizado_em timestamptz not null default now()
);
alter table public.aluno_onboarding enable row level security;
drop policy if exists "onboarding: ler o próprio" on public.aluno_onboarding;
create policy "onboarding: ler o próprio" on public.aluno_onboarding
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.aluno_onboarding from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.aluno_onboarding from authenticated;
grant select on public.aluno_onboarding to authenticated;

-- ---------------------------------------------------------------- preferências de estudo que faltavam (uma linha por aluno)
create table if not exists public.aluno_preferencias_estudo (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- o que o aluno disse querer (teste) ou a fase do plano (PRO = teoria, PRÁTICA = pratica). Só preferência: não dá acesso.
  fase_escolhida text check (fase_escolhida in ('teoria', 'pratica', 'as_duas')),
  -- ELITE: por onde começar
  prioridade_fase text check (prioridade_fase in ('teoria', 'pratica')),
  -- 0 = domingo ... 6 = sábado
  dias_semana smallint[] check (dias_semana is null or (dias_semana <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] and cardinality(dias_semana) between 1 and 7)),
  -- vazio = "nenhuma em especial"
  areas_dificeis public.med_area[] check (areas_dificeis is null or cardinality(areas_dificeis) <= 5),
  jeito_estudar text check (jeito_estudar in ('questoes', 'aulas', 'flashcards', 'misto')),
  tutor_personagem text check (tutor_personagem in ('stazi', 'stazia')),
  tutor_personalidade text check (tutor_personalidade in ('durao', 'acolhedor', 'durona', 'tranquila')),
  -- lembretes: só a preferência (o envio ainda não existe)
  lembretes_quer boolean,
  lembretes_horario time,
  atualizado_em timestamptz not null default now(),
  check (tutor_personalidade is null or tutor_personagem is null
         or (tutor_personagem = 'stazi') = (tutor_personalidade in ('durao', 'acolhedor')))
);
alter table public.aluno_preferencias_estudo enable row level security;
drop policy if exists "preferências de estudo: ler as próprias" on public.aluno_preferencias_estudo;
create policy "preferências de estudo: ler as próprias" on public.aluno_preferencias_estudo
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
revoke all on public.aluno_preferencias_estudo from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.aluno_preferencias_estudo from authenticated;
grant select on public.aluno_preferencias_estudo to authenticated;

-- ---------------------------------------------------------------- ordem dos passos (o passo atual só anda para a frente)
create or replace function public.onboarding_ordem(p_passo text) returns integer
  language sql immutable set search_path = ''
as $$
  select array_position(array['apresentacao', 'fase', 'prova', 'rotina', 'dificuldades', 'jeito', 'tutor', 'lembretes',
                              'nivelamento', 'trilha', 'fim'], p_passo)
$$;
revoke execute on function public.onboarding_ordem(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- já estudava antes? (conta antiga: não obriga o onboarding)
create or replace function public.onboarding_conta_antiga(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.question_attempts a where a.user_id = p_user)
      or exists (select 1 from public.nivelamento_diagnosticos d where d.user_id = p_user)
      or exists (select 1 from public.flashcard_reviews r where r.user_id = p_user)
      or exists (select 1 from public.tutor_sessions s where s.user_id = p_user)
$$;
revoke execute on function public.onboarding_conta_antiga(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- o retrato do onboarding de um aluno (interna)
-- Devolve: se se aplica, se abre sozinho (mostrar) ou vira convite no Início, o passo e as etapas, o tour, as dicas vistas, as
-- preferências (novas e as que já existiam no perfil), o Tutor de hoje, a situação de acesso lida no servidor (para escolher a
-- pergunta da fase) e os "Primeiros passos" confirmados por ação real. Nunca devolve preço.
create or replace function public.onboarding_estado_de(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  o public.aluno_onboarding;
  pr public.aluno_preferencias_estudo;
  p public.profiles;
  v_aplicavel boolean;
  v_antiga boolean;
  v_mostrar boolean;
  v_convite boolean;
  v_dir jsonb;
  v_perfil text;
  v_modo text;
  v_fase2 boolean;
  v_tutor jsonb;
  v_niv text;
  v_passos jsonb;
begin
  if p_user is null then return null; end if;
  select * into o from public.aluno_onboarding where user_id = p_user;
  select * into pr from public.aluno_preferencias_estudo where user_id = p_user;
  select * into p from public.profiles where id = p_user;
  v_aplicavel := not public.user_has_full_access(p_user);
  v_antiga := public.onboarding_conta_antiga(p_user);
  -- abre sozinho só para a conta nova (sem registro e sem estudo, ou registro de cadastro ainda não terminado nem pulado)
  -- (coalesce: sem linha, o.status é nulo e a conta não pode virar "nulo")
  v_mostrar := v_aplicavel and coalesce(
    (o.user_id is null and not v_antiga)
    or (o.status in ('not_started', 'in_progress') and o.origem = 'cadastro'), false);
  -- conta antiga que ainda não fez nem dispensou: convite no Início
  v_convite := v_aplicavel and not v_mostrar
    and coalesce(o.user_id is null or o.status in ('not_started', 'in_progress'), false)
    and not ('convite_onboarding' = any (coalesce(o.dicas_vistas, '{}'::text[])));

  -- acesso decidido no servidor (só para escolher a pergunta; nunca libera nada)
  v_dir := public.direitos_do_aluno(p_user);
  v_perfil := v_dir ->> 'perfil';
  v_fase2 := coalesce((v_dir ->> 'fase2_aberta')::boolean, false);
  v_modo := case
    when not v_aplicavel or v_perfil = 'equipe' then 'equipe'
    when v_perfil = 'teste' and coalesce((v_dir #>> '{teste,pode_escolher}')::boolean, false) then 'escolher_teste'
    when v_perfil = 'teste' then 'teste_definido'
    when v_perfil = 'pro' then 'pro'
    when v_perfil = 'pratica' then 'pratica'
    when v_perfil = 'elite' then 'elite'
    else 'convite' end;

  select jsonb_build_object('personalidade', tp.personality_id, 'personagem', to_jsonb(tp) ->> 'character') into v_tutor
  from public.tutor_preferences tp where tp.user_id = p_user;
  select d.situacao into v_niv from public.nivelamento_diagnosticos d where d.user_id = p_user;

  -- Primeiros passos: cada um marcado por uma AÇÃO REAL no banco (não por clique na lista)
  v_passos := jsonb_build_array(
    jsonb_build_object('id', 'perfil', 'feito', o.configuracao_em is not null),
    jsonb_build_object('id', 'plano', 'feito', p.daily_minutes is not null),
    jsonb_build_object('id', 'questoes', 'feito', exists (select 1 from public.question_attempts a where a.user_id = p_user)),
    jsonb_build_object('id', 'tutor', 'feito', exists (select 1 from public.tutor_sessions s where s.user_id = p_user)),
    jsonb_build_object('id', 'revisao', 'feito',
      exists (select 1 from public.flashcard_reviews r where r.user_id = p_user)
      or exists (select 1 from public.question_attempts a join public.practice_sessions s on s.id = a.session_id
                 where a.user_id = p_user and s.config -> 'filters' ->> 'status' = 'wrong')));

  return jsonb_build_object(
    'versao', 1,
    'aplicavel', v_aplicavel,
    'mostrar', v_mostrar,
    'convite', v_convite,
    'conta_antiga', v_antiga,
    'status', coalesce(o.status, 'not_started'),
    'origem', coalesce(o.origem, case when v_antiga then 'conta_antiga' else 'cadastro' end),
    'passo_atual', coalesce(o.passo_atual, 'apresentacao'),
    'etapas', jsonb_build_object(
      'apresentacao', o.apresentacao_em is not null,
      'configuracao', o.configuracao_em is not null,
      'nivelamento', o.nivelamento,
      'trilha', o.trilha_em is not null),
    'tour', jsonb_build_object('status', coalesce(o.tour_status, 'pendente'), 'passo', coalesce(o.tour_passo, 0)),
    'dicas_vistas', to_jsonb(coalesce(o.dicas_vistas, '{}'::text[])),
    'preferencias', jsonb_build_object(
      'fase_escolhida', pr.fase_escolhida,
      'prioridade_fase', pr.prioridade_fase,
      'dias_semana', to_jsonb(pr.dias_semana),
      'areas_dificeis', to_jsonb(pr.areas_dificeis),
      'jeito_estudar', pr.jeito_estudar,
      'tutor_personagem', pr.tutor_personagem,
      'tutor_personalidade', pr.tutor_personalidade,
      'lembretes_quer', pr.lembretes_quer,
      'lembretes_horario', left(pr.lembretes_horario::text, 5),
      'exam_date', p.exam_date,
      'daily_minutes', p.daily_minutes,
      'study_days_per_week', p.study_days_per_week),
    'tutor_atual', v_tutor,
    'acesso', jsonb_build_object(
      'perfil', v_perfil,
      'modo_fase', v_modo,
      'fase2_aberta', v_fase2,
      'teste_escolha', v_dir #>> '{teste,escolha}',
      'teste_escolhido', (v_dir #>> '{teste,escolhido_em}') is not null,
      'teste_fim', v_dir #> '{teste,fim}',
      'teoria', v_dir #>> '{fases,teoria,situacao}',
      'pratica', v_dir #>> '{fases,pratica,situacao}'),
    'nivelamento', jsonb_build_object(
      'situacao', coalesce(v_niv, 'novo'),
      'concluido', coalesce(v_niv, 'novo') in ('parcial', 'bloco2', 'concluido'),
      -- o diagnóstico usa questões da 1ª fase: quem só tem a 2ª fase (PRÁTICA) não faz
      'cabe', v_aplicavel and v_modo <> 'pratica'),
    'primeiros_passos', v_passos);
end
$$;
revoke execute on function public.onboarding_estado_de(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- o aluno logado lê o próprio onboarding
create or replace function public.app_onboarding_estado() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  return public.onboarding_estado_de(v_user);
end
$$;
revoke execute on function public.app_onboarding_estado() from public, anon;
grant execute on function public.app_onboarding_estado() to authenticated;

-- ---------------------------------------------------------------- cria a linha do aluno quando ainda não existe (interna)
create or replace function public.onboarding_garantir(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.aluno_onboarding (user_id, origem)
  values (p_user, case when public.onboarding_conta_antiga(p_user) then 'conta_antiga' else 'cadastro' end)
  on conflict (user_id) do nothing;
  insert into public.aluno_preferencias_estudo (user_id) values (p_user) on conflict (user_id) do nothing;
end
$$;
revoke execute on function public.onboarding_garantir(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- nivelamento adiado (interna): só para quem ele vale
-- Usa a função do próprio nivelamento (app_nivelamento_adiar, como o botão "Depois"); quem já terminou não muda.
create or replace function public.onboarding_adiar_diagnostico(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_sit text;
begin
  if public.user_has_full_access(p_user) then return; end if;
  select d.situacao into v_sit from public.nivelamento_diagnosticos d where d.user_id = p_user;
  if coalesce(v_sit, 'novo') in ('parcial', 'bloco2', 'concluido') then return; end if;
  perform public.app_nivelamento_adiar();
end
$$;
revoke execute on function public.onboarding_adiar_diagnostico(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- grava UM passo (o aluno logado)
-- p_passo: apresentacao | fase | prova | rotina | dificuldades | jeito | tutor | lembretes | nivelamento | trilha | concluir | pular
-- p_dados (objeto, conforme o passo):
--   fase:          {"escolha": "teoria"|"pratica"|"as_duas"} (teste) · {"prioridade": "teoria"|"pratica"} (ELITE)
--   prova:         {"exam_date": "AAAA-MM-DD" | null}            (null = ainda não sabe)
--   rotina:        {"daily_minutes": 15|30|45|60|90|120|180|240|300, "dias_semana": [0..6]}
--   dificuldades:  {"areas": ["CLINICA_MEDICA", ...]}          ([] = nenhuma em especial)
--   jeito:         {"jeito": "questoes"|"aulas"|"flashcards"|"misto"}
--   tutor:         {"personagem": "stazi"|"stazia", "personalidade": "durao"|"acolhedor"|"durona"|"tranquila"}
--   lembretes:     {"quer": true|false, "horario": "HH:MM" | null}
-- Devolve o retrato atualizado (app_onboarding_estado), mais "tutor_aplicado" no passo do Tutor.
create or replace function public.app_onboarding_salvar(p_passo text, p_dados jsonb default '{}'::jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  d constant jsonb := coalesce(p_dados, '{}'::jsonb);
  o public.aluno_onboarding;
  v_dir jsonb;
  v_perfil text;
  v_fase2 boolean;
  v_escolha text;
  v_prio text;
  v_data date;
  v_min integer;
  v_dias smallint[];
  v_areas public.med_area[];
  v_txt text;
  v_pers text;
  v_pnal text;
  v_hora time;
  v_aplicado boolean;
  v_proximo text;
  v_aplicavel boolean;
begin
  if v_user is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if p_passo is null or p_passo not in ('apresentacao', 'fase', 'prova', 'rotina', 'dificuldades', 'jeito', 'tutor', 'lembretes',
                                        'nivelamento', 'trilha', 'concluir', 'pular') then
    raise exception 'Passo do onboarding desconhecido.' using errcode = '22023';
  end if;
  if jsonb_typeof(d) <> 'object' or length(d::text) > 2000 then
    raise exception 'Dados do passo inválidos.' using errcode = '22023';
  end if;

  -- um passo por vez por aluno (dois aparelhos ao mesmo tempo não se atropelam)
  perform pg_advisory_xact_lock(hashtextextended('onboarding:' || v_user::text, 0));
  perform public.onboarding_garantir(v_user);
  select * into o from public.aluno_onboarding where user_id = v_user for update;
  v_aplicavel := not public.user_has_full_access(v_user);

  if p_passo = 'apresentacao' then
    update public.aluno_onboarding set apresentacao_em = coalesce(apresentacao_em, now()) where user_id = v_user;

  elsif p_passo = 'fase' then
    v_dir := public.direitos_do_aluno(v_user);
    v_perfil := v_dir ->> 'perfil';
    v_fase2 := coalesce((v_dir ->> 'fase2_aberta')::boolean, false);
    v_escolha := d ->> 'escolha';
    v_prio := d ->> 'prioridade';
    if v_escolha is not null and v_escolha not in ('teoria', 'pratica', 'as_duas') then
      raise exception 'Escolha 1ª fase, 2ª fase ou as duas.' using errcode = '22023';
    end if;
    if v_prio is not null and v_prio not in ('teoria', 'pratica') then
      raise exception 'Escolha por onde começar: 1ª fase ou 2ª fase.' using errcode = '22023';
    end if;
    if v_aplicavel and v_perfil = 'teste' then
      if (v_dir #>> '{teste,escolhido_em}') is not null then
        -- o teste já foi escolhido antes (só um por conta): vale o que foi escolhido
        v_escolha := v_dir #>> '{teste,escolha}';
      else
        v_escolha := coalesce(v_escolha, 'teoria');
        if v_escolha <> 'teoria' and not v_fase2 then
          raise exception 'A 2ª fase ainda não está aberta aos alunos. Por enquanto, o teste é da 1ª fase.' using errcode = '22023';
        end if;
        -- com a 2ª fase aberta, a escolha vale como o teste da conta (função oficial dos planos; só uma vez)
        if v_fase2 and coalesce((v_dir #>> '{teste,pode_escolher}')::boolean, false) then
          perform public.app_escolher_teste(v_escolha);
        end if;
      end if;
      update public.aluno_preferencias_estudo set fase_escolhida = v_escolha, atualizado_em = now() where user_id = v_user;
      update public.profiles set phase = case when v_escolha = 'pratica' and v_fase2 then 2 else 1 end where id = v_user;
    elsif v_aplicavel and v_perfil = 'elite' then
      v_prio := coalesce(v_prio, 'teoria');
      if v_prio = 'pratica' and not v_fase2 then
        raise exception 'A 2ª fase ainda não está aberta aos alunos. Por enquanto, comece pela 1ª fase.' using errcode = '22023';
      end if;
      update public.aluno_preferencias_estudo set fase_escolhida = 'as_duas', prioridade_fase = v_prio, atualizado_em = now() where user_id = v_user;
      update public.profiles set phase = case when v_prio = 'pratica' then 2 else 1 end where id = v_user;
    elsif v_aplicavel and v_perfil = 'pro' then
      update public.aluno_preferencias_estudo set fase_escolhida = 'teoria', atualizado_em = now() where user_id = v_user;
      update public.profiles set phase = 1 where id = v_user;
    elsif v_aplicavel and v_perfil = 'pratica' then
      update public.aluno_preferencias_estudo set fase_escolhida = 'pratica', atualizado_em = now() where user_id = v_user;
      update public.profiles set phase = case when v_fase2 then 2 else 1 end where id = v_user;
    else
      -- vencido/cancelado/sem acesso (convite) ou equipe: só guarda o interesse; nada de teste nem plano
      if v_escolha is not null then
        if v_escolha <> 'teoria' and not v_fase2 and v_aplicavel then
          raise exception 'A 2ª fase ainda não está aberta aos alunos.' using errcode = '22023';
        end if;
        update public.aluno_preferencias_estudo set fase_escolhida = v_escolha, atualizado_em = now() where user_id = v_user;
      end if;
    end if;

  elsif p_passo = 'prova' then
    v_txt := d ->> 'exam_date';
    if v_txt is null then
      v_data := null;
    elsif v_txt !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Data da prova inválida.' using errcode = '22023';
    else
      begin
        v_data := v_txt::date;
      exception when others then
        raise exception 'Data da prova inválida.' using errcode = '22023';
      end;
      if v_data < public.today_br() then
        raise exception 'A data da prova precisa ser hoje ou depois.' using errcode = '22023';
      end if;
      if v_data > public.today_br() + 1100 then
        raise exception 'A data da prova está longe demais (até 3 anos).' using errcode = '22023';
      end if;
    end if;
    update public.profiles set exam_date = v_data where id = v_user;

  elsif p_passo = 'rotina' then
    -- uma condição por vez (o "or" do SQL não garante a ordem; jsonb_array_length só depois de saber que é lista)
    if coalesce(jsonb_typeof(d -> 'daily_minutes'), '') <> 'number' or (d ->> 'daily_minutes') !~ '^\d{1,4}$' then
      raise exception 'Escolha o tempo de estudo por dia.' using errcode = '22023';
    end if;
    v_min := (d ->> 'daily_minutes')::integer;
    if v_min not in (15, 30, 45, 60, 90, 120, 180, 240, 300) then
      raise exception 'Escolha o tempo de estudo por dia.' using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(d -> 'dias_semana'), '') <> 'array' then
      raise exception 'Escolha pelo menos um dia da semana.' using errcode = '22023';
    end if;
    if jsonb_array_length(d -> 'dias_semana') not between 1 and 7
       or exists (select 1 from jsonb_array_elements(d -> 'dias_semana') x where jsonb_typeof(x) <> 'number' or x::text !~ '^[0-6]$') then
      raise exception 'Escolha pelo menos um dia da semana.' using errcode = '22023';
    end if;
    select array_agg(distinct x::text::smallint order by x::text::smallint) into v_dias from jsonb_array_elements(d -> 'dias_semana') x;
    update public.profiles set daily_minutes = v_min, study_days_per_week = cardinality(v_dias) where id = v_user;
    update public.aluno_preferencias_estudo set dias_semana = v_dias, atualizado_em = now() where user_id = v_user;

  elsif p_passo = 'dificuldades' then
    if coalesce(jsonb_typeof(d -> 'areas'), '') <> 'array' then
      raise exception 'Escolha as áreas da lista.' using errcode = '22023';
    end if;
    if jsonb_array_length(d -> 'areas') > 5
       or exists (select 1 from jsonb_array_elements(d -> 'areas') x
                  where jsonb_typeof(x) <> 'string' or not ((x #>> '{}') = any (enum_range(null::public.med_area)::text[]))) then
      raise exception 'Escolha as áreas da lista.' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct (x #>> '{}')::public.med_area), '{}') into v_areas from jsonb_array_elements(d -> 'areas') x;
    update public.aluno_preferencias_estudo set areas_dificeis = v_areas, atualizado_em = now() where user_id = v_user;

  elsif p_passo = 'jeito' then
    v_txt := d ->> 'jeito';
    if v_txt is null or v_txt not in ('questoes', 'aulas', 'flashcards', 'misto') then
      raise exception 'Escolha o seu jeito de estudar.' using errcode = '22023';
    end if;
    update public.aluno_preferencias_estudo set jeito_estudar = v_txt, atualizado_em = now() where user_id = v_user;

  elsif p_passo = 'tutor' then
    v_pers := d ->> 'personagem';
    v_pnal := d ->> 'personalidade';
    if v_pers is null or v_pers not in ('stazi', 'stazia') then
      raise exception 'Escolha o Stazi ou a Stazia.' using errcode = '22023';
    end if;
    if v_pnal is null or v_pnal not in ('durao', 'acolhedor', 'durona', 'tranquila')
       or (v_pers = 'stazi') <> (v_pnal in ('durao', 'acolhedor')) then
      raise exception 'Escolha um jeito do personagem escolhido.' using errcode = '22023';
    end if;
    update public.aluno_preferencias_estudo set tutor_personagem = v_pers, tutor_personalidade = v_pnal, atualizado_em = now() where user_id = v_user;
    -- ponto de ligação com o Tutor: quando a função do personagem existir (ramo tutor-personagens), o personagem passa a valer
    -- já no Tutor (ela escolhe a personalidade calma; a firme, com palavrão e 18+, o próprio Tutor confirma na primeira conversa)
    v_aplicado := false;
    if to_regprocedure('public.app_tutor_set_character(text)') is not null then
      begin
        perform public.app_tutor_set_character(v_pers);
        v_aplicado := true;
      exception when others then
        -- o Tutor recusou (por exemplo, personagem desligado pela equipe): a escolha continua guardada aqui
        raise warning 'onboarding: app_tutor_set_character recusou (%): %', v_pers, sqlerrm;
      end;
    end if;

  elsif p_passo = 'lembretes' then
    if coalesce(jsonb_typeof(d -> 'quer'), '') <> 'boolean' then
      raise exception 'Diga se quer lembretes.' using errcode = '22023';
    end if;
    v_txt := d ->> 'horario';
    if v_txt is not null and v_txt !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'Horário inválido.' using errcode = '22023';
    end if;
    v_hora := case when (d ->> 'quer')::boolean and v_txt is not null then v_txt::time end;
    update public.aluno_preferencias_estudo set lembretes_quer = (d ->> 'quer')::boolean, lembretes_horario = v_hora, atualizado_em = now()
    where user_id = v_user;
    update public.aluno_onboarding set configuracao_em = coalesce(configuracao_em, now()) where user_id = v_user;

  elsif p_passo = 'nivelamento' then
    -- o resultado vem do banco, não da tela: terminou o diagnóstico = feito; quem só tem a 2ª fase (ou equipe) = não se aplica;
    -- senão, pulado (e o nivelamento fica "adiado", como o botão "Depois": o Início oferece depois)
    if exists (select 1 from public.nivelamento_diagnosticos n where n.user_id = v_user and n.situacao in ('parcial', 'bloco2', 'concluido')) then
      v_txt := 'feito';
    elsif not v_aplicavel or (public.direitos_do_aluno(v_user) ->> 'perfil') = 'pratica' then
      v_txt := 'nao_se_aplica';
    else
      v_txt := 'pulado';
      perform public.onboarding_adiar_diagnostico(v_user);
    end if;
    update public.aluno_onboarding set nivelamento = v_txt, nivelamento_em = now() where user_id = v_user;

  elsif p_passo = 'trilha' then
    update public.aluno_onboarding set trilha_em = coalesce(trilha_em, now()) where user_id = v_user;

  elsif p_passo = 'concluir' then
    if o.nivelamento is null and v_aplicavel then
      perform public.onboarding_adiar_diagnostico(v_user);
    end if;
    update public.aluno_onboarding set
      status = 'completed', concluido_em = coalesce(concluido_em, now()),
      tour_status = case when tour_status = 'pendente' then 'em_andamento' else tour_status end,
      tour_passo = case when tour_status = 'pendente' then 0 else tour_passo end
    where user_id = v_user;
    update public.profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = v_user;

  elsif p_passo = 'pular' then
    -- pular tudo: entra direto no app (o nivelamento fica para depois, oferecido no Início); nada do que foi salvo se perde
    if v_aplicavel then perform public.onboarding_adiar_diagnostico(v_user); end if;
    update public.aluno_onboarding set status = 'skipped', pulado_em = coalesce(pulado_em, now())
    where user_id = v_user and status <> 'completed';
  end if;

  -- passo atual: só anda para a frente; concluído/pulado não volta a "em andamento"
  v_proximo := case p_passo
    when 'apresentacao' then 'fase' when 'fase' then 'prova' when 'prova' then 'rotina' when 'rotina' then 'dificuldades'
    when 'dificuldades' then 'jeito' when 'jeito' then 'tutor' when 'tutor' then 'lembretes' when 'lembretes' then 'nivelamento'
    when 'nivelamento' then 'trilha' when 'trilha' then 'fim' when 'concluir' then 'fim' else null end;
  update public.aluno_onboarding set
    passo_atual = case when v_proximo is not null and public.onboarding_ordem(v_proximo) > public.onboarding_ordem(passo_atual)
                       then v_proximo else passo_atual end,
    status = case when status = 'not_started' and p_passo not in ('pular', 'concluir') then 'in_progress' else status end,
    atualizado_em = now()
  where user_id = v_user;

  return public.onboarding_estado_de(v_user)
    || case when p_passo = 'tutor' then jsonb_build_object('tutor_aplicado', v_aplicado) else '{}'::jsonb end;
end
$$;
revoke execute on function public.app_onboarding_salvar(text, jsonb) from public, anon;
grant execute on function public.app_onboarding_salvar(text, jsonb) to authenticated;

-- ---------------------------------------------------------------- o tour no painel: começar, avançar, pausar, terminar, pular
-- Também serve para "Conhecer funcionalidades" (Conta → Ajuda): em_andamento a partir do passo 0. Não muda o status do
-- onboarding (uma conta antiga que pede o tour não passa a ser obrigada a fazer o onboarding).
create or replace function public.app_onboarding_tour(p_status text, p_passo integer default 0) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if p_status is null or p_status not in ('em_andamento', 'pausado', 'concluido', 'pulado') then
    raise exception 'Situação do tour inválida.' using errcode = '22023';
  end if;
  if p_passo is null or p_passo not between 0 and 20 then
    raise exception 'Passo do tour inválido.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('onboarding:' || v_user::text, 0));
  perform public.onboarding_garantir(v_user);
  update public.aluno_onboarding set tour_status = p_status, tour_passo = p_passo,
    tour_em = case when p_status in ('concluido', 'pulado') then now() else tour_em end, atualizado_em = now()
  where user_id = v_user;
  return public.onboarding_estado_de(v_user);
end
$$;
revoke execute on function public.app_onboarding_tour(text, integer) from public, anon;
grant execute on function public.app_onboarding_tour(text, integer) to authenticated;

-- ---------------------------------------------------------------- explicação de primeiro uso vista (Arena, Simulados, 2ª fase...)
-- Também guarda o "Agora não" do convite do Início (dica 'convite_onboarding') e o "Ocultar" dos Primeiros passos.
create or replace function public.app_onboarding_dica_vista(p_dica text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if p_dica is null or p_dica !~ '^[a-z][a-z0-9_]{1,39}$' then
    raise exception 'Dica inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('onboarding:' || v_user::text, 0));
  perform public.onboarding_garantir(v_user);
  update public.aluno_onboarding set dicas_vistas = dicas_vistas || p_dica, atualizado_em = now()
  where user_id = v_user and not (p_dica = any (dicas_vistas)) and cardinality(dicas_vistas) < 60;
  return public.onboarding_estado_de(v_user);
end
$$;
revoke execute on function public.app_onboarding_dica_vista(text) from public, anon;
grant execute on function public.app_onboarding_dica_vista(text) to authenticated;
