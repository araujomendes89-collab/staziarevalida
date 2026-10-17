-- DESFAZER da 20261003013680_carteira_creditos.sql (planos, etapa 2: carteira de créditos e minutos).
-- Volta tudo ao que a 013640 deixou: a regra antiga do Tutor volta a se chamar tutor_entitlement (o corpo é o mesmo, nunca
-- mudou), direitos_do_aluno e direitos_regra_atual voltam à versão da 013640 e saem as tabelas, funções, colunas e o gatilho
-- novos da carteira (com o que estiver neles: extras, cortesias, movimentos e avisos). Se a 013690 (etapa 3) estiver aplicada,
-- desfaça a 013690 ANTES. Pode ser rodado de novo sem erro.
-- Para guardar antes: select * from public.carteira_extras; select * from public.carteira_movimentos;

drop trigger if exists carteira_voz_fechamento on public.tutor_voice_calls;

-- o porteiro sai e a regra antiga volta com o nome de sempre
do $do$
begin
  if to_regprocedure('public.tutor_entitlement_regra_antiga(uuid)') is not null then
    drop function if exists public.tutor_entitlement(uuid);
    alter function public.tutor_entitlement_regra_antiga(uuid) rename to tutor_entitlement;
  end if;
end
$do$;
revoke execute on function public.tutor_entitlement(uuid) from public, anon, authenticated;

drop function if exists public.app_admin_carteira_devolucao(jsonb);
drop function if exists public.app_admin_carteira_aluno(text);
drop function if exists public.app_admin_carteira_cortesia_cancelar(bigint, text);
drop function if exists public.app_admin_carteira_cortesia(text, numeric, integer, integer, text);
drop function if exists public.carteira_achar_usuario(text);
drop function if exists public.app_admin_carteira_salvar(jsonb);
drop function if exists public.app_admin_carteira();
drop function if exists public.carteira_devolucoes_recentes(uuid);
drop function if exists public.carteira_calcular_devolucao_extra(integer, numeric, numeric, timestamptz, timestamptz, integer);
drop function if exists public.carteira_calcular_devolucao_plano(text, integer, timestamptz, timestamptz, integer);
drop function if exists public.app_carteira_avisos_vistos(bigint[]);
drop function if exists public.app_minha_carteira();
drop function if exists public.ch_worker_avisos_renovacao();
drop function if exists public.carteira_voz_gatilho();
drop function if exists public.carteira_voz_fechar(uuid, uuid, integer);
drop function if exists public.ch_worker_carteira_devolver(uuid, text);
drop function if exists public.ch_worker_carteira_confirmar(uuid, text, numeric, jsonb);
drop function if exists public.ch_worker_carteira_reservar(uuid, text, text, uuid, integer);
drop function if exists public.carteira_mensagem(text, jsonb, text);
drop function if exists public.carteira_avisar(uuid, jsonb);
drop function if exists public.carteira_gasto_hoje_usd();
drop function if exists public.carteira_varrer_reservas(uuid);
drop function if exists public.carteira_extras_somar(jsonb, jsonb);
drop function if exists public.carteira_devolver_parte(jsonb, numeric, numeric);
drop function if exists public.carteira_alocar(uuid, numeric, numeric);

-- direitos_do_aluno e direitos_regra_atual: as versões da 013640 (iguais às de lá)
create or replace function public.direitos_do_aluno(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  cfg public.direitos_config;
  t public.aluno_testes;
  a public.aluno_fases;
  r public.direitos_recursos;
  pl public.direitos_planos;
  v_staff boolean;
  v_equipe boolean;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes0 timestamptz;
  v_mes0_dia date;
  v_fase2 boolean;
  v_repetido boolean := false;
  v_teste_oferecido boolean := coalesce((select p.active from public.plans p where p.code = 'trial'), true);
  v_fase text;
  v_sit text;
  v_mot text;
  v_estado jsonb := '{}'::jsonb;
  v_rank jsonb := '{"paga": 3, "teste": 2, "vencida": 1, "sem_acesso": 0}'::jsonb;
  v_fases_alvo text[];
  v_melhor text;
  v_acesso text;
  v_motivo text;
  v_msg text;
  v_ofertas jsonb;
  v_recursos jsonb := '{}'::jsonb;
  v_perfil text;
  v_plano_cred public.direitos_planos;
  v_cred_dia integer; v_cred_mes integer;
  v_usado_dia integer; v_usado_mes integer;
  v_voz_lim integer; v_voz_usado integer; v_voz_periodo text;
  v_teste_usado boolean;
  v_teo text; v_pra text;
  e jsonb;
  v_saldo jsonb;
begin
  select * into cfg from public.direitos_config;
  if cfg.id is null then cfg.cadeados_ligados := false; cfg.fase2_aberta_alunos := false; cfg.amostra_creditos_dia := 5;
    cfg.amostra_voz_minutos_total := 2; cfg.credito_valor_centavos := 10; end if;
  v_fase2 := cfg.fase2_aberta_alunos;
  v_mes0_dia := date_trunc('month', v_today::timestamp)::date;
  v_mes0 := (v_mes0_dia::timestamp at time zone 'America/Sao_Paulo');
  v_staff := p_user is not null and public.user_has_full_access(p_user);
  v_equipe := p_user is not null and public.user_is_staff(p_user);
  select * into t from public.aluno_testes where user_id = p_user;
  v_teste_usado := t.user_id is not null;
  if v_teste_usado and not v_staff then v_repetido := public.direitos_teste_repetido(p_user); end if;

  -- situação de cada fase
  foreach v_fase in array array['teoria', 'pratica'] loop
    select * into a from public.aluno_fases where user_id = p_user and fase = v_fase;
    if a.user_id is null then
      v_sit := 'sem_acesso'; v_mot := 'sem_acesso';
    elsif a.situacao = 'teste' then
      if t.user_id is not null and not (v_fase = any (t.fases)) then
        v_sit := 'sem_acesso'; v_mot := 'fora_da_escolha_do_teste';
      elsif v_repetido then
        v_sit := 'vencida'; v_mot := 'teste_repetido_telefone';
      elsif a.fim is null or a.fim > now() then
        v_sit := 'teste'; v_mot := 'teste';
      else
        v_sit := 'vencida'; v_mot := 'teste_acabou';
      end if;
    elsif a.situacao = 'paga' then
      if a.fim > now() then v_sit := 'paga'; v_mot := 'paga'; else v_sit := 'vencida'; v_mot := 'plano_acabou'; end if;
    elsif a.situacao = 'pagamento_pendente' then
      if a.fim + interval '3 days' > now() then v_sit := 'paga'; v_mot := 'pagamento_pendente'; else v_sit := 'vencida'; v_mot := 'plano_acabou'; end if;
    else
      v_sit := 'vencida';
      v_mot := case when a.plano is null and a.fim is null then 'sem_teste' when a.plano is null then 'teste_acabou' else 'plano_cancelado' end;
    end if;
    if v_staff then v_sit := 'paga'; v_mot := 'equipe'; end if;
    v_estado := v_estado || jsonb_build_object(v_fase, jsonb_build_object(
      'situacao', v_sit, 'motivo', v_mot, 'plano', a.plano, 'inicio', a.inicio, 'fim', a.fim, 'origem', a.origem,
      -- a 2ª fase fechada vale para todos, menos administrador e editor (igual à trava de hoje nas telas)
      'aberta', v_fase = 'teoria' or v_fase2 or v_equipe));
  end loop;

  -- quem paga uma fase e não tem a outra (só um teste antigo que acabou): a outra fica FORA DO PLANO (trancada com convite),
  -- não em amostra. Ex.: PRÁTICA tranca as questões teóricas; PRO tranca as estações. A amostra de vencido é para quem não paga nada.
  if not v_staff and 'paga' in (v_estado #>> '{teoria,situacao}', v_estado #>> '{pratica,situacao}') then
    foreach v_fase in array array['teoria', 'pratica'] loop
      if v_estado #>> array[v_fase, 'situacao'] = 'vencida' then
        v_estado := jsonb_set(v_estado, array[v_fase], (v_estado -> v_fase) || '{"situacao": "sem_acesso", "motivo": "fora_do_plano"}'::jsonb);
      end if;
    end loop;
  end if;

  v_teo := v_estado #>> '{teoria,situacao}';
  v_pra := case when (v_estado #>> '{pratica,aberta}')::boolean then v_estado #>> '{pratica,situacao}' else 'sem_acesso' end;
  v_perfil := case
    when v_staff then 'equipe'
    when v_teo = 'paga' and (v_estado #>> '{pratica,situacao}') = 'paga' then 'elite'
    when v_teo = 'paga' then 'pro'
    when (v_estado #>> '{pratica,situacao}') = 'paga' then 'pratica'
    when 'teste' in (v_teo, v_pra) then 'teste'
    when 'vencida' in (v_teo, v_pra) then 'vencido'
    else 'sem_acesso' end;

  -- cada recurso
  for r in select * from public.direitos_recursos order by posicao, codigo loop
    v_fases_alvo := case r.fase when 'comum' then array['teoria', 'pratica'] else array[r.fase] end;
    -- melhor situação entre as fases que dão acesso a este recurso (a 2ª fase só conta aberta)
    select x into v_melhor from unnest(v_fases_alvo) f, lateral (select v_estado #>> array[f, 'situacao'] as x) s
      where (v_estado #>> array[f, 'aberta'])::boolean
      order by (v_rank ->> x)::int desc limit 1;
    v_melhor := coalesce(v_melhor, 'sem_acesso');
    v_ofertas := '[]'::jsonb; v_msg := null;
    if r.fase = 'pratica' and not (v_estado #>> '{pratica,aberta}')::boolean then
      v_acesso := 'trancado'; v_motivo := 'fase2_fechada';
      v_msg := 'A 2ª fase ainda não está aberta aos alunos.';
    elsif v_melhor = 'paga' then
      v_acesso := 'liberado'; v_motivo := null;
    elsif v_melhor in ('teste', 'vencida') and r.amostra_modo <> 'trancado' then
      v_acesso := 'amostra'; v_motivo := case v_melhor when 'teste' then 'amostra_do_teste' else 'amostra_vencida' end;
      v_msg := case v_melhor when 'teste' then 'Teste grátis: você usa uma amostra deste recurso.'
                 else 'Seu teste ou plano terminou: você continua com a amostra do dia. Seus dados ficam guardados.' end;
    elsif v_melhor in ('teste', 'vencida') then
      v_acesso := 'trancado'; v_motivo := 'fora_da_amostra';
      v_msg := 'Não faz parte da amostra do teste grátis.';
    else
      v_acesso := 'trancado'; v_motivo := 'fase_nao_incluida';
      v_msg := case r.fase when 'teoria' then 'Faz parte da 1ª fase (Revalida e ENAMED), que não está no seu acesso.'
                           when 'pratica' then 'Faz parte da 2ª fase (prova prática), que não está no seu acesso.'
                           else 'Faz parte dos planos do StaziaMed.' end;
    end if;
    if v_acesso <> 'liberado' and v_motivo <> 'fase2_fechada' then
      -- testar: só se a conta nunca teve teste, o cadastro oferece teste e a fase está aberta
      if not v_teste_usado and v_teste_oferecido and not v_staff then
        v_ofertas := v_ofertas || jsonb_build_array(jsonb_build_object('tipo', 'testar', 'fase', case when r.fase = 'pratica' then 'pratica' else 'teoria' end));
      end if;
      -- assinar: os planos que trazem a fase deste recurso (com a 2ª fase fechada, os planos só de prática ficam de fora)
      for pl in select * from public.direitos_planos p
                where p.fases && v_fases_alvo and (v_fase2 or v_equipe or 'teoria' = any (p.fases))
                order by p.posicao loop
        v_ofertas := v_ofertas || jsonb_build_array(jsonb_build_object('tipo', 'assinar', 'plano', pl.codigo, 'nome', pl.nome));
      end loop;
    end if;
    v_recursos := v_recursos || jsonb_build_object(r.codigo, jsonb_build_object(
      'nome', r.nome, 'fase', r.fase, 'tipo', r.tipo, 'existe', r.existe, 'acesso', v_acesso, 'motivo', v_motivo, 'mensagem', v_msg,
      'amostra', case when v_acesso = 'amostra' then jsonb_build_object('modo', r.amostra_modo,
                   'limite', case r.amostra_modo when 'por_dia' then r.amostra_limite when 'creditos' then cfg.amostra_creditos_dia
                                                 when 'minutos_total' then cfg.amostra_voz_minutos_total end,
                   'unidade', r.unidade) end,
      'ofertas', v_ofertas));
  end loop;

  -- créditos de IA e voz: franquia do perfil e uso calculado (nada é consumido nem bloqueado aqui)
  if v_perfil in ('elite', 'pro', 'pratica') then
    select * into v_plano_cred from public.direitos_planos where codigo = v_perfil;
    v_cred_dia := v_plano_cred.creditos_dia; v_cred_mes := v_plano_cred.creditos_mes;
    v_voz_lim := v_plano_cred.voz_minutos_mes * 60; v_voz_periodo := 'mes';
    v_voz_usado := public.tutor_voice_seconds(p_user, null, v_mes0);
  elsif v_perfil in ('teste', 'vencido') then
    v_cred_dia := cfg.amostra_creditos_dia; v_cred_mes := null;
    v_voz_lim := cfg.amostra_voz_minutos_total * 60; v_voz_periodo := 'teste_total';
    v_voz_usado := public.tutor_voice_seconds(p_user, null, coalesce(t.inicio, now()));
  elsif v_perfil = 'sem_acesso' then
    v_cred_dia := 0; v_cred_mes := 0; v_voz_lim := 0; v_voz_periodo := null; v_voz_usado := 0;
  end if;
  if cfg.cotacao_dolar is null then
    -- sem cotação: 1 crédito por mensagem do Tutor (provisório, até o dono informar a cotação)
    v_usado_dia := coalesce((select sum(l.interactions) from public.ai_usage_ledger l where l.user_id = p_user and l.feature = 'tutor_text' and l.day = v_today), 0);
    v_usado_mes := coalesce((select sum(l.interactions) from public.ai_usage_ledger l where l.user_id = p_user and l.feature = 'tutor_text' and l.day >= v_mes0_dia), 0);
  else
    v_usado_dia := ceil(coalesce((select sum(l.estimated_cost_usd) from public.ai_usage_ledger l
                                  where l.user_id = p_user and l.feature in ('tutor_text', 'tutor_eval') and l.day = v_today), 0)
                        * cfg.cotacao_dolar * 100 / cfg.credito_valor_centavos)::int;
    v_usado_mes := ceil(coalesce((select sum(l.estimated_cost_usd) from public.ai_usage_ledger l
                                  where l.user_id = p_user and l.feature in ('tutor_text', 'tutor_eval') and l.day >= v_mes0_dia), 0)
                        * cfg.cotacao_dolar * 100 / cfg.credito_valor_centavos)::int;
  end if;

  -- SALDO que vale de verdade AGORA (o chip do Início mostra este): em modo sombra, a cota de hoje do Tutor pela regra antiga
  -- (mensagens do dia e segundos de voz de tutor_entitlement, sem mudar nada); com a chave ligada, os créditos e a voz da regra nova.
  if v_staff then
    v_saldo := jsonb_build_object('fonte', 'equipe', 'ilimitado', true);
  elsif cfg.cadeados_ligados then
    v_saldo := jsonb_build_object('fonte', 'creditos', 'ilimitado', false,
      'creditos_hoje', greatest(0, least(v_cred_dia - v_usado_dia, coalesce(v_cred_mes - v_usado_mes, 2147483647))),
      'creditos_limite_hoje', v_cred_dia,
      'creditos_mes', case when v_cred_mes is not null then greatest(0, v_cred_mes - v_usado_mes) end,
      'creditos_limite_mes', v_cred_mes,
      'voz_restante_s', greatest(0, coalesce(v_voz_lim, 0) - coalesce(v_voz_usado, 0)), 'voz_limite_s', v_voz_lim, 'voz_periodo', v_voz_periodo);
  else
    e := public.tutor_entitlement(p_user);
    v_saldo := jsonb_build_object('fonte', 'tutor_atual', 'ilimitado', false,
      'tutor_ligado', coalesce((e ->> 'enabled')::boolean, false) and coalesce((e ->> 'can_use')::boolean, false),
      'mensagens_hoje', coalesce((e #>> '{text,remaining}')::int, 0), 'mensagens_limite_hoje', coalesce((e #>> '{text,limit}')::int, 0),
      'voz_ligada', coalesce((e #>> '{voice,enabled}')::boolean, false),
      'voz_restante_s', coalesce((e #>> '{voice,remaining_s}')::int, 0),
      'voz_periodo', case when (e #>> '{voice,limit_total_s}') is not null then 'teste_total' else 'dia' end);
  end if;

  return jsonb_build_object(
    'saldo', v_saldo,
    'modo', case when cfg.cadeados_ligados then 'ligado' else 'sombra' end,
    'cadeados_ligados', cfg.cadeados_ligados,
    'fase2_aberta', v_fase2,
    'venda_ligada', false,
    'perfil', v_perfil,
    'equipe', v_staff,
    'fases', v_estado,
    'recursos', v_recursos,
    'creditos', case when v_staff then jsonb_build_object('ilimitado', true) else jsonb_build_object(
      'valor_credito_centavos', cfg.credito_valor_centavos,
      'base', case when cfg.cotacao_dolar is null then 'mensagens' else 'custo' end,
      'franquia_dia', v_cred_dia, 'franquia_mes', v_cred_mes,
      'usados_hoje', v_usado_dia, 'usados_mes', v_usado_mes,
      'saldo_hoje', greatest(0, least(v_cred_dia - v_usado_dia, coalesce(v_cred_mes - v_usado_mes, 2147483647)))) end,
    'voz', case when v_staff then jsonb_build_object('ilimitado', true) else jsonb_build_object(
      'periodo', v_voz_periodo, 'limite_s', v_voz_lim, 'usado_s', v_voz_usado, 'saldo_s', greatest(0, v_voz_lim - v_voz_usado)) end,
    'teste', jsonb_build_object(
      'usado', v_teste_usado, 'escolha', t.escolha, 'fases', to_jsonb(t.fases), 'inicio', t.inicio, 'fim', t.fim,
      'escolhido_em', t.escolhido_em, 'repetido_telefone', v_repetido, 'oferecido_no_cadastro', v_teste_oferecido,
      'pode_escolher', t.user_id is not null and t.escolhido_em is null and (t.fim is null or t.fim > now()) and not v_repetido
                       and v_teo = 'teste',
      'escolhas', case when v_fase2 then '["teoria", "pratica", "as_duas"]'::jsonb else '["teoria"]'::jsonb end),
    'calculado_em', now());
end
$$;
revoke execute on function public.direitos_do_aluno(uuid) from public, anon, authenticated;

create or replace function public.direitos_regra_atual(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_full boolean := public.user_has_full_access(p_user);
  v_equipe boolean := public.user_is_staff(p_user);
  v_sem_pago boolean := public.user_without_paid_access(p_user);
  e jsonb := public.tutor_entitlement(p_user);
  v_tutor text;
  v_voz text;
  v_pratica text;
begin
  v_tutor := case when not coalesce((e ->> 'enabled')::boolean, false) then 'desligado'
                  when e ->> 'mode' = 'paid' then 'liberado' when e ->> 'mode' = 'trial' then 'amostra' else 'trancado' end;
  v_voz := case when v_tutor = 'desligado' or not coalesce((e #>> '{voice,enabled}')::boolean, false) then 'desligado' else v_tutor end;
  -- 2ª fase: hoje só administrador e editor entram (trava das telas, isPhase2Locked)
  v_pratica := case when v_equipe then 'liberado' else 'trancado' end;
  return jsonb_build_object(
    'questoes', 'liberado',
    'simulados_teoricos', case when v_full or not v_sem_pago then 'liberado' else 'trancado' end,
    'flashcards', 'liberado',
    'grupo_teorico', 'nao_existe',
    'dica_questao', v_tutor,
    'estacoes', v_pratica,
    'checklists', v_pratica,
    'simulados_praticos', 'nao_existe',
    'treino_dupla', 'nao_existe',
    'grupo_pratico', 'nao_existe',
    'correcao_estacao_ia', 'nao_existe',
    'aulas_temas', 'liberado',
    'mapas', 'liberado',
    'podcasts', 'liberado',
    'atualizacoes', 'liberado',
    'tutor_texto', v_tutor,
    'tutor_janela', v_tutor,
    'voz_ao_vivo', v_voz);
end
$$;
revoke execute on function public.direitos_regra_atual(uuid) from public, anon, authenticated;

drop function if exists public.direitos_teste_alerta(uuid);
drop function if exists public.carteira_numeros(uuid, text, timestamptz);
drop function if exists public.carteira_creditos_do_custo(numeric);

drop table if exists public.carteira_devolucoes;
drop table if exists public.carteira_avisos;
drop table if exists public.carteira_movimentos;
drop table if exists public.carteira_extras;
drop table if exists public.carteira_pacotes;

alter table public.direitos_planos drop column if exists a_venda;
alter table public.direitos_recursos drop column if exists reserva_creditos;
alter table public.direitos_config drop column if exists teto_custo_dia_usd, drop column if exists devolucao_desconto_pct,
  drop column if exists devolucao_abuso_qtd, drop column if exists devolucao_abuso_dias;
-- a cotação (R$ 5,08) fica como está: é um número que o dono edita no painel da etapa 1.
