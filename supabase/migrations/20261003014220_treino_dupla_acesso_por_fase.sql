-- =============================================================================
-- 2ª FASE PELA CHAVE "PRÁTICA" DOS PLANOS NOVOS (acesso por fase, decisões do dono de 17/10; preparado em 19/10/2026).
--
-- PROBLEMA QUE CORRIGE: a regra do Treino em Dupla (dupla_allowed, …013300) ainda segue os planos ANTIGOS: com a chave
-- "treino_dupla" ligada, entra quem tem Pro ou Elite pago (ou o teste grátis, se marcado em "planos"). No modelo novo o PRO é
-- só a 1ª fase: ligar a chave hoje abriria a 2ª fase para quem pagou só a teoria.
--
-- REGRA NOVA (uma só, no banco; a tela só mostra):
--   * equipe (administrador e editor) entra SEMPRE, com a chave ligada ou desligada;
--   * a chave "treino_dupla" (app_settings, campo "aberto") continua mandando: DESLIGADA = só a equipe (e o revisor médico no
--     Treino em Dupla, como já é hoje, regra de 17/10 conferida em fase2PublicacaoEquipe);
--   * LIGADA, o aluno entra pela chave "prática" da regra central dos planos (direitos_do_aluno, …013640/…013680):
--       - 2ª fase PAGA (PRÁTICA ou ELITE pagos, inclusive o pagamento pendente até 3 dias, ou plano por fase dado pela equipe)
--         → tudo da 2ª fase liberado, com o Treino em Dupla;
--       - 2ª fase em TESTE (o teste grátis da 2ª fase) ou VENCIDA/CANCELADA → AMOSTRA da 2ª fase: estação sozinho com o limite
--         do dia (1 estação por dia, editável em Administração > Planos), SEM Treino em Dupla (amostra "trancado" na matriz);
--       - sem a 2ª fase (visitante, teste da 1ª fase, PRO pago ou vencido, quem paga só a teoria) → TRANCADO, com a mensagem de
--         compra e os planos que liberam (PRÁTICA e ELITE; "em breve" enquanto não estiverem à venda);
--   * a lista "planos" da chave treino_dupla deixa de valer (fica gravada, sem uso): quem decide é o plano por fase.
--   * vale com os cadeados ligados OU desligados (direitos_config.cadeados_ligados): a 2ª fase nunca abre por engano.
--
-- O QUE MUDA:
--   1) fase2_acesso(uuid, text) NOVA, interna: liberado / amostra / trancado de um recurso da 2ª fase para um aluno, com motivo,
--      mensagem, amostra e ofertas (planos que liberam, com "à venda" ou "em breve").
--   2) dupla_allowed(uuid) ← …013300: equipe e revisor sempre; aluno só com a chave ligada e o Treino em Dupla LIBERADO.
--   3) app_dupla_access() ← …013300: as mesmas chaves de antes (aberto, permitido, planos, equipe) e mais "fase2" e "dupla"
--      (o acesso da pessoa à 2ª fase e ao Treino em Dupla, com a mensagem de compra). "planos" passa a ser a lista dos planos
--      que trazem a 2ª fase (pratica, elite), na ordem da vitrine.
--   4) fase2_allowed() ← …013330: equipe sempre; com a chave ligada, quem tem a 2ª fase liberada ou em amostra.
--   5) gatilho NOVO em station_attempts (antes de gravar, só quando é o próprio aluno que grava pelo app): a amostra da 2ª fase
--      conta 1 estação por dia e não abre estação marcada "só planos pagos" (is_pro_only). Recusa com a dica "amostra:estacoes"
--      ou "cadeado:estacoes" (a tela mostra a mensagem de compra que o app já usa). app_fase2_start NÃO é refeita.
--   6) gatilho NOVO em billing_pedidos: enquanto a 2ª fase não abrir aos alunos (direitos_config.fase2_aberta_alunos), nenhum
--      pedido NOVO de plano que traga a 2ª fase (PRÁTICA, ELITE) é aberto, mesmo que alguém marque "à venda" por engano
--      ("até a 2ª fase abrir, SÓ O PRO À VENDA", dono 17/10). Renovação de contrato existente não é barrada.
--
-- O QUE NÃO MUDA: direitos_do_aluno e a matriz (Administração > Planos), cadeados da 1ª fase, app_fase2_start e as demais
-- funções app_dupla_*/app_fase2_* (todas passam por dupla_assert_access/fase2_assert, que chamam as funções acima), créditos,
-- IA do treino sozinho (solo_plan_matches, desligada), Stazia Match (desligado), cobrança (só PRO à venda).
--
-- ATENÇÃO, próximas migrações: quem refizer dupla_allowed, app_dupla_access ou fase2_allowed deve manter a regra por fase
-- (supabase/conferir/acesso-por-fase.sql avisa se ela sumir).
-- Pode ser colada duas vezes. Desfazer: supabase/desfazer/20261003014220_treino_dupla_acesso_por_fase.desfazer.sql.
-- Depende da 013640/013680 (direitos por fase), 013690 (cadeado_inicio_do_dia) e 013700 (billing_pedidos).
-- =============================================================================

-- ---------------------------------------------------------------- 1) acesso de um aluno a um recurso da 2ª fase
-- Interna (recebe qualquer aluno). p_recurso: código da matriz com fase 'pratica' (estacoes, checklists, simulados_praticos,
-- treino_dupla, grupo_pratico, correcao_estacao_ia). Não grava nada.
create or replace function public.fase2_acesso(p_user uuid, p_recurso text default 'estacoes') returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.direitos_recursos;
  d jsonb;
  pl record;
  v_aberto boolean;
  v_venda_fase2 boolean;
  v_sit text;
  v_mot text;
  v_acesso text;
  v_motivo text;
  v_msg text;
  v_amostra jsonb;
  v_ofertas jsonb := '[]'::jsonb;
begin
  if p_user is null then
    return jsonb_build_object('recurso', p_recurso, 'acesso', 'trancado', 'motivo', 'sem_login', 'mensagem', 'Entre na sua conta.',
                              'ofertas', '[]'::jsonb);
  end if;
  if public.user_is_staff(p_user) then
    return jsonb_build_object('recurso', p_recurso, 'acesso', 'liberado', 'motivo', 'equipe', 'situacao', 'paga', 'ofertas', '[]'::jsonb);
  end if;
  v_aberto := coalesce((select c.value -> 'aberto' = 'true'::jsonb from public.app_settings c where c.key = 'treino_dupla'), false);
  if not v_aberto then
    return jsonb_build_object('recurso', p_recurso, 'acesso', 'trancado', 'motivo', 'fase2_fechada',
                              'mensagem', 'A 2ª fase ainda não está aberta aos alunos.', 'ofertas', '[]'::jsonb);
  end if;
  select * into r from public.direitos_recursos where codigo = p_recurso and fase = 'pratica';
  if r.codigo is null then
    return jsonb_build_object('recurso', p_recurso, 'acesso', 'trancado', 'motivo', 'recurso_desconhecido', 'ofertas', '[]'::jsonb);
  end if;

  d := public.direitos_do_aluno(p_user);
  v_sit := coalesce(d #>> '{fases,pratica,situacao}', 'sem_acesso');
  v_mot := d #>> '{fases,pratica,motivo}';
  if v_sit = 'paga' then
    v_acesso := 'liberado'; v_motivo := coalesce(v_mot, 'paga');
  elsif v_sit in ('teste', 'vencida') and r.amostra_modo <> 'trancado' then
    v_acesso := 'amostra';
    v_motivo := case v_sit when 'teste' then 'amostra_do_teste' else 'amostra_vencida' end;
    v_msg := case v_sit when 'teste' then 'Teste grátis da 2ª fase: você usa uma amostra por dia. Assine para liberar tudo.'
               else 'Seu teste ou plano da 2ª fase terminou: você continua com a amostra do dia. Seus dados ficam guardados.' end;
    v_amostra := jsonb_build_object('modo', r.amostra_modo,
                                    'limite', case when r.amostra_modo = 'por_dia' then r.amostra_limite end,
                                    'unidade', r.unidade);
  elsif v_sit in ('teste', 'vencida') then
    v_acesso := 'trancado'; v_motivo := 'fora_da_amostra';
    v_msg := r.nome || ' não faz parte da amostra da 2ª fase. Assine para liberar.';
  else
    v_acesso := 'trancado'; v_motivo := 'fase_nao_incluida';
    v_msg := 'Faz parte da 2ª fase (prova prática), que não está no seu acesso.';
  end if;

  if v_acesso <> 'liberado' then
    -- planos que trazem a 2ª fase; "à venda" só com a marca da Administração E a 2ª fase aberta aos alunos (até lá, "em breve")
    v_venda_fase2 := coalesce((select c.fase2_aberta_alunos from public.direitos_config c), false);
    for pl in select p.codigo, p.nome, p.a_venda from public.direitos_planos p where 'pratica' = any (p.fases) order by p.posicao loop
      v_ofertas := v_ofertas || jsonb_build_array(jsonb_build_object(
        'tipo', 'assinar', 'plano', pl.codigo, 'nome', pl.nome,
        'a_venda', pl.a_venda and v_venda_fase2, 'em_breve', not (pl.a_venda and v_venda_fase2)));
    end loop;
  end if;

  return jsonb_build_object('recurso', p_recurso, 'nome', r.nome, 'acesso', v_acesso, 'motivo', v_motivo, 'mensagem', v_msg,
                            'situacao', v_sit, 'amostra', v_amostra, 'ofertas', v_ofertas);
end
$$;
revoke execute on function public.fase2_acesso(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2) Treino em Dupla (base: …013300)
-- Pode usar o Treino em Dupla? Interna: o navegador nunca a chama (usa app_dupla_access / dupla_me_allowed).
-- Equipe e revisor médico (user_has_full_access) sempre, como antes. Aluno: chave ligada e o recurso treino_dupla LIBERADO
-- pelo plano por fase (amostra só se a matriz disser "livre" para o Treino em Dupla; hoje é "trancado").
create or replace function public.dupla_allowed(p_user uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select p_user is not null and (
    public.user_has_full_access(p_user)
    or coalesce((
      select x.a ->> 'acesso' = 'liberado' or (x.a ->> 'acesso' = 'amostra' and x.a #>> '{amostra,modo}' = 'livre')
      from (select public.fase2_acesso(p_user, 'treino_dupla') as a) x), false)
  )
$$;
revoke execute on function public.dupla_allowed(uuid) from public, anon, authenticated;

-- O que a tela precisa saber para abrir ou trancar a 2ª fase (base: …013300). Chaves de antes: aberto, permitido (Treino em
-- Dupla), planos (agora: planos que trazem a 2ª fase), equipe. Novas: fase2 (estações) e dupla (Treino em Dupla), cada uma com
-- acesso (liberado/amostra/trancado), motivo, mensagem, amostra e ofertas.
create or replace function public.app_dupla_access() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'aberto', coalesce((select c.value -> 'aberto' = 'true'::jsonb from public.app_settings c where c.key = 'treino_dupla'), false),
    'permitido', public.dupla_allowed((select auth.uid())),
    'planos', coalesce((select jsonb_agg(p.codigo order by p.posicao) from public.direitos_planos p where 'pratica' = any (p.fases)), '[]'::jsonb),
    'equipe', public.user_is_staff((select auth.uid())),
    'regra', 'por_fase',
    'fase2', public.fase2_acesso((select auth.uid()), 'estacoes'),
    'dupla', public.fase2_acesso((select auth.uid()), 'treino_dupla')
  )
  where (select auth.uid()) is not null
$$;
revoke execute on function public.app_dupla_access() from public, anon;
grant execute on function public.app_dupla_access() to authenticated;

-- ---------------------------------------------------------------- 4) telas da 2ª fase com dados / treino sozinho (base: …013330)
-- Equipe sempre (com a chave ligada ou desligada, como hoje). Com a chave ligada: quem tem as estações da 2ª fase liberadas
-- (2ª fase paga) ou em amostra (teste da 2ª fase, 2ª fase vencida). O limite da amostra é conferido ao começar a estação (5).
create or replace function public.fase2_allowed() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    public.is_staff()
    or coalesce(public.fase2_acesso((select auth.uid()), 'estacoes') ->> 'acesso' in ('liberado', 'amostra'), false)
  )
$$;
revoke execute on function public.fase2_allowed() from public, anon, authenticated;

-- ---------------------------------------------------------------- 5) amostra da 2ª fase ao começar uma estação sozinho
-- Gatilho NOVO (antes de gravar a tentativa). Só age quando o próprio aluno grava pelo app (app_fase2_start); a equipe e as
-- gravações do servidor não passam por aqui. Trancado → recusa; amostra → estação "só planos pagos" recusa e, no modo "por dia",
-- conta as estações começadas hoje (horário de São Paulo; retomar a mesma estação não grava tentativa nova, então não conta).
create or replace function public.fase2_amostra_station_attempts() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb;
  n integer;
  v_lim integer;
begin
  if (select auth.uid()) is distinct from new.user_id or public.user_is_staff(new.user_id) then
    return new;
  end if;
  a := public.fase2_acesso(new.user_id, 'estacoes');
  if a ->> 'acesso' = 'trancado' then
    raise exception '%', coalesce(a ->> 'mensagem', 'A 2ª fase não faz parte do seu acesso.')
      using errcode = '42501', hint = 'cadeado:estacoes';
  end if;
  if a ->> 'acesso' = 'amostra' then
    if coalesce((select s.is_pro_only from public.checklist_stations s where s.id = new.station_id), false) then
      raise exception 'Esta estação não faz parte da amostra da 2ª fase. Assine para liberar.'
        using errcode = '42501', hint = 'cadeado:estacoes';
    end if;
    if a #>> '{amostra,modo}' = 'por_dia' then
      v_lim := (a #>> '{amostra,limite}')::int;
      select count(*) into n from public.station_attempts t
       where t.user_id = new.user_id and t.started_at >= public.cadeado_inicio_do_dia();
      if v_lim is not null and n >= v_lim then
        raise exception 'Você já usou a amostra de hoje (% %). Amanhã tem mais, ou assine para liberar.', v_lim, coalesce(a #>> '{amostra,unidade}', '')
          using errcode = '42501', hint = 'amostra:estacoes';
      end if;
    end if;
  end if;
  return new;
end
$$;
revoke execute on function public.fase2_amostra_station_attempts() from public, anon, authenticated;
drop trigger if exists fase2_amostra_station_attempts on public.station_attempts;
create trigger fase2_amostra_station_attempts before insert on public.station_attempts
  for each row execute function public.fase2_amostra_station_attempts();

-- ---------------------------------------------------------------- 6) só o PRO à venda até a 2ª fase abrir
-- Gatilho NOVO (antes de gravar um pedido). Pedido de COMPRA de plano que traz a 2ª fase, com a 2ª fase fechada aos alunos:
-- recusa com a mesma etiqueta que a cobrança já usa para "fora de venda" (a tela mostra "Esta opção não está à venda").
create or replace function public.fase2_venda_pedidos() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.tipo = 'plano' and new.motivo = 'compra'
     and exists (select 1 from public.direitos_planos p where p.codigo = new.codigo and 'pratica' = any (p.fases))
     and not coalesce((select c.fase2_aberta_alunos from public.direitos_config c), false) then
    raise exception 'fora_de_venda: Este plano ainda não está à venda (em breve, quando a 2ª fase abrir).';
  end if;
  return new;
end
$$;
revoke execute on function public.fase2_venda_pedidos() from public, anon, authenticated;
drop trigger if exists fase2_venda_pedidos on public.billing_pedidos;
create trigger fase2_venda_pedidos before insert on public.billing_pedidos
  for each row execute function public.fase2_venda_pedidos();
