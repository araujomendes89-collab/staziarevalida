-- =============================================================================
-- JUNÇÃO DA ETAPA 2 (fase2-etapa2, 19/10/2026): renumerada de 013470 para 014000, para ficar DEPOIS da 013980 (a ordem dos
-- arquivos passa a ser a mesma da produção, onde a 2ª fase base já está gravada). Ordem: 013990 (3ª leva), radar 014000/014010,
-- Stazia Match 014020–014070, convite por link 014080, treino sozinho 014090–014120.
-- Na junção: dupla_invite_core ganhou p_chosen_by (quem trouxe a estação fica em station_chosen_by: aviso "já viu", 013405),
-- a trava por pessoa dupla_lock_users (013990) e a regra de estação dupla_station_liberada (013405: não aprovada só entre duas
-- pessoas da equipe), no lugar de "aprovada ou equipe".
-- Treino em Dupla, radar de quem está online + convite direto (adendo de 12/10, Etapa 6C, tarefa R1; parte 1 de 2).
-- (Plano de 12/10: "migração 9920"; número 014000, reservado para esta frente em .tmp-aulas/NUMEROS-MIGRACAO.md. A parte 2,
-- 014010, refaz o baralho, o match, os convites e o perfil para respeitarem o que nasce aqui.)
-- Depende das migrações do Treino: 013300 (dados, dupla_allowed), 013310 (dupla_sweep, dupla_public_name), 013320 (match:
-- dupla_compat, dupla_assign) e 013370 (chat: study_chat_blocks, dupla_chat_sweep).
-- Pode ser colada duas vezes: colunas e índices "if not exists", "drop constraint if exists", "create or replace" e permissões.
-- Não cria tabela, não apaga dado e não abre nada ao aluno (o módulo continua mandado pela chave "treino_dupla").
--
-- DECISÕES DO DONO QUE MANDAM AQUI (17/10, sobre a D8 e a D9 de 12/10)
--  - A lista do radar é aberta a todos com acesso ao módulo (D8): quem desliga "Aparecer no radar" some da lista dos outros, mas
--    continua vendo a lista. Não existe regra de reciprocidade.
--  - O BLOQUEIO é o do chat (study_chat_blocks), um só: quem bloqueou ou foi bloqueado some do baralho e do radar, nos dois
--    sentidos, e as duas pessoas não se convidam. Não há segundo sistema de bloqueio nem botão novo no convite.
--  - Limites de convite a definir (D9): por hora, por dia e espera depois de recusa ficam VAZIOS (sem limite) até o dono
--    preencher em Administração › Configurações. Só "1 convite pendente por vez" é fixo, por segurança.
--  - Chat: as denúncias encerradas passam a ser guardadas por 180 dias (e depois apagadas pela limpeza que já existe na 013370).
--
-- O QUE FAZ
--  1) study_profiles.allow_direct_invites ("Permitir convites diretos"), padrão ligado, como no pacote de design.
--  2) study_invites.kind: 'match' (o "Deu match!" de sempre, o padrão) ou 'direto' (convite do radar, 60 s).
--  3) Limites dos convites diretos dentro da chave que já existe, app_settings.treino_dupla, no bloco "convites"
--     (por_hora, por_dia, espera_min; ausente ou vazio = sem limite). Nenhuma chave nova em app_settings.
--  4) dupla_blocked / dupla_hides: a regra interna do bloqueio (usa o registro do chat). dupla_place / dupla_near: leem o campo
--     "Cidade / estado" do perfil (sem GPS) para a aba "Perto de você" do radar.
--  5) app_dupla_radar(p_station_id, p_aba): quem está online agora, com o cartão público do baralho, a compatibilidade e a situação
--     (livre | em_sala | sozinho). Nunca e-mail, telefone ou foto.
--  6) app_dupla_invite(p_to, p_station_id): convite direto. Cria a sala na fase dos papéis (sem match) e o convite de 60 s.
--  7) Painel: app_admin_dupla_radar() lê e app_admin_save_dupla_radar(jsonb) grava o bloco "convites" SEM tocar no resto da
--     chave "treino_dupla" (aberto, planos e o que outras frentes guardarem ali).
--  8) Chat: "guarda_denuncia_dias" da chave treino_dupla_chat passa de vazio para 180 (só se estiver vazio).
--  8b) Crédito do Stazia Match: ponto de chamada pronto (dupla_credit_ok), que só passa a bloquear quando a função credit_available
--     do ramo stazia-match existir; sem ela não bloqueia.
--  9) Nome de usuário único com @ (study_profiles.handle), pedido do dono de 17/10: gerado sozinho ("revalida.k7m2"), único sem
--     diferença de maiúsculas, 3 a 20 caracteres (a-z 0-9 . _, sem ponto no começo nem no fim), com lista de reservados e o mesmo
--     filtro de palavras do chat; a pessoa pode trocar. Trocar o @ NÃO muda o nome público, o user_id, matches, salas, chat,
--     histórico nem créditos. Cada troca fica registrada (study_handle_log: quem, de, para, quando) e a equipe lê por
--     app_admin_dupla_handle_log. Sem limite de trocas por enquanto (decisão pendente do dono). Perfis que já existem ganham um @.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA: nenhuma. Todas as funções desta migração são novas. Usadas sem mudar:
--   dupla_assert_access, dupla_allowed (013300); dupla_sweep, dupla_public_name, dupla_station_meta (013310); dupla_compat,
--   dupla_assign (013320); tutor_is_pro (…9550); is_staff (…0100); assert_admin, admin_log (…1300).
--
-- DECISÕES PEQUENAS (fora do texto do plano; o dono pode mudar)
--  - O convite NUNCA leva o nome da estação ao convidado: quem recebe ainda pode virar o candidato, e o tema não vai ao
--    candidato antes do resultado. O convite traz só "Estação N", a área e a duração (a 014010 monta isso).
--  - Quem desligou "Aparecer no radar" pode convidar (é quem escolhe chamar) e vê a lista.
--  - Convite direto só para quem está online (sinal < 2 min e situação diferente de "fora"), livre (nem em sala nem treinando
--    sozinho), com o radar e os convites diretos ligados, sem convite pendente de outra pessoa e sem bloqueio entre os dois.
--  - A espera para reconvidar a mesma pessoa só vale quando o convite anterior foi RECUSADO ou VENCEU (sala fechada por
--    convite_recusado / convite_expirado); quem saiu da própria sala não fica de castigo.
--  - 'sozinho' (treino sozinho) é uma situação do perfil criada por outra frente; aqui só é LIDA: antes de ela existir, nunca
--    aparece e nada muda.
--  - Mensagens novas (para o dono aprovar): 'Disponível.', 'Esse @ já está em uso.', 'Esse @ não está disponível.', 'Esse @ contém uma palavra não permitida.', 'Use de 3 a 20 caracteres: …', 'Você já tem um convite aguardando resposta.', 'Muitos convites seguidos. Tente de
--    novo em N min.', 'Você convidou X há pouco. Tente de novo em N min.', 'X não pode receber convites agora.', 'Você já está
--    em uma sala aberta. Saia dela antes de convidar.', 'Estação exclusiva dos planos Pro e Elite.', 'Configuração dos
--    convites inválida.'.
--
-- COMO DESFAZER: apagar a tabela study_handle_log, o gatilho study_profiles_handle_fill e as funções dupla_handle_*,
--   dupla_has_banned_word, app_dupla_handle_check, app_dupla_set_handle e app_admin_dupla_handle_log; o índice
--   study_profiles_handle_key e a coluna study_profiles.handle podem ficar. Apagar as funções criadas aqui (dupla_radar_settings(), dupla_blocked(uuid, uuid), dupla_hides(uuid, uuid),
--   app_dupla_radar(text, text), dupla_place(text), dupla_near(jsonb, jsonb), app_dupla_invite(uuid, text), app_admin_dupla_radar(), app_admin_save_dupla_radar(jsonb)); tirar o
--   índice study_invites_from_idx e a restrição study_invites_kind_check; as colunas study_invites.kind e
--   study_profiles.allow_direct_invites podem ficar (inofensivas); recolocar as funções da 014010 pelas da 013310/013320.
--   Salas e convites já criados ficam. O prazo de 180 dias das denúncias volta a vazio em Administração › Configurações.
-- =============================================================================

-- ---------------------------------------------------------------- 1) colunas
alter table public.study_profiles add column if not exists allow_direct_invites boolean not null default true;

alter table public.study_invites add column if not exists kind text not null default 'match';
alter table public.study_invites drop constraint if exists study_invites_kind_check;
alter table public.study_invites add constraint study_invites_kind_check check (kind in ('match', 'direto'));
create index if not exists study_invites_from_idx on public.study_invites (from_user, created_at desc);

-- ---------------------------------------------------------------- 1b) nome de usuário com @ (handle)
-- Troca de @ registrada para a equipe (quem, de, para, quando). Sem política: só as funções leem e gravam. Apaga com a conta.
create table if not exists public.study_handle_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  old_handle text,
  new_handle text not null,
  changed_at timestamptz not null default now()
);
create index if not exists study_handle_log_when_idx on public.study_handle_log (changed_at desc);
alter table public.study_handle_log enable row level security;

alter table public.study_profiles add column if not exists handle text;

-- Palavra proibida do chat (as mesmas de treino_dupla_chat.palavras): palavra inteira (no @, as de 6 letras ou mais também coladas), sem acento, com números no lugar de
-- letras, ponto/sublinhado/espaço entre as letras e plural com "s". Sem a chave do chat, nada é proibido (não derruba o perfil).
create or replace function public.dupla_has_banned_word(p_text text, p_substring boolean default false) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s jsonb;
  w text;
  p text;
  pat text;
begin
  select c.value into s from public.app_settings c where c.key = 'treino_dupla_chat';
  if s is null or jsonb_typeof(s -> 'palavras') is distinct from 'array' then
    return false;
  end if;
  w := translate(public.dupla_chat_normalize(coalesce(p_text, '')), '013457@$', 'oieastas');
  for p in select jsonb_array_elements_text(s -> 'palavras') loop
    pat := regexp_replace(translate(public.dupla_chat_normalize(p), '013457@$', 'oieastas'), '[^a-z0-9]', '', 'g');
    continue when pat = '';
    -- Nome de usuário (p_substring): as palavras de 6 letras ou mais também valem coladas em outras ("meuidiota"); as curtas só
    -- como palavra inteira, para não barrar termos como "computador".
    if p_substring and char_length(pat) >= 6 and regexp_replace(w, '[^a-z0-9]', '', 'g') like '%' || pat || '%' then
      return true;
    end if;
    pat := '(^|[^a-z0-9])' || array_to_string(regexp_split_to_array(pat, ''), '[^a-z0-9]*') || 's?($|[^a-z0-9])';
    if w ~ pat then
      return true;
    end if;
  end loop;
  return false;
end
$$;

-- Nome público que se passa pela equipe: contém "stazia" ou tem como palavra inteira admin, suporte, moderador, staff… Interna.
create or replace function public.dupla_name_reserved(p_name text) returns boolean
  language sql immutable security definer set search_path = ''
as $$
  select public.dupla_chat_normalize(coalesce(p_name, '')) ~ 'stazia'
      or public.dupla_chat_normalize(coalesce(p_name, '')) ~ '(^|[^a-z0-9])(admin|administrador|administradora|suporte|support|staff|moderador|moderadora|moderacao)($|[^a-z0-9])'
$$;

-- "@Ana.Silva " -> "ana.silva" (sem o @ do começo, sem espaços nas pontas, minúsculas).
create or replace function public.dupla_handle_clean(p_text text) returns text
  language sql immutable security definer set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '^@+', ''))
$$;

-- Por que este @ não serve: 'formato' | 'reservado' | 'palavra' | 'em_uso' (de outra pessoa, sem diferença de maiúsculas); nulo = serve.
create or replace function public.dupla_handle_problem(p_handle text, p_uid uuid) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v text := public.dupla_handle_clean(p_handle);
  s text;
begin
  if v !~ '^[a-z0-9._]{3,20}$' or v ~ '^\.|\.$' then
    return 'formato';
  end if;
  s := replace(replace(v, '.', ''), '_', '');
  -- Reservados: nada com "stazia"; nomes da equipe e de órgãos no começo (admin.app, suporte_x, equipe.med, inep.oficial…); e palavras
  -- genéricas sozinhas ou só com números (todos, root, null…).
  if s like '%stazia%'
     or s ~ '^(admin|suporte|support|staff|moderador|moderadora|moderacao|oficial|equipe|revisor|revisora|atendimento|inep)'
     or s ~ '^(sistema|ajuda|contato|root|null|undefined|todos|everyone)[0-9]*$' then
    return 'reservado';
  end if;
  if public.dupla_has_banned_word(v, true) then
    return 'palavra';
  end if;
  if exists (select 1 from public.study_profiles x where lower(x.handle) = v and x.user_id is distinct from p_uid) then
    return 'em_uso';
  end if;
  return null;
end
$$;

create or replace function public.dupla_handle_message(p_code text) returns text
  language sql immutable security definer set search_path = ''
as $$
  select case p_code
    when 'formato' then 'Use de 3 a 20 caracteres: letras minúsculas, números, ponto ou sublinhado, sem ponto no começo nem no fim.'
    when 'reservado' then 'Esse @ não está disponível.'
    when 'palavra' then 'Esse @ contém uma palavra não permitida.'
    when 'em_uso' then 'Esse @ já está em uso.'
  end
$$;

-- Gera um @ neutro e livre ("revalida.k7m2"): sem nome, e-mail ou dado da pessoa. Tenta de novo se já existir ou se cair em palavra
-- proibida; depois de muitas tentativas aumenta o sufixo. Trava a geração para duas contas novas não sortearem o mesmo.
create or replace function public.dupla_handle_generate() returns text
  language plpgsql volatile security definer set search_path = ''
as $$
declare
  c_alpha constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_len integer := 4;
  v_total integer := 0;
  v_try integer := 0;
  v text;
  i integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('dupla-handle-gerar', 0));
  loop
    v_total := v_total + 1;
    v_try := v_try + 1;
    if v_total > 500 then
      raise exception 'Não foi possível gerar o nome de usuário. Tente de novo.' using errcode = '55000';
    end if;
    if v_try > 20 then
      v_len := least(v_len + 1, 8);
      v_try := 1;
    end if;
    v := 'revalida.';
    for i in 1..v_len loop
      v := v || substr(c_alpha, 1 + floor(random() * length(c_alpha))::integer, 1);
    end loop;
    exit when public.dupla_handle_problem(v, null) is null;
  end loop;
  return v;
end
$$;

-- Perfil novo sem @ ganha um sorteado; com @, ele vai em minúsculas.
create or replace function public.study_profiles_handle_fill() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.handle is null or btrim(new.handle) = '' then
    new.handle := public.dupla_handle_generate();
  else
    new.handle := public.dupla_handle_clean(new.handle);
  end if;
  return new;
end
$$;
drop trigger if exists study_profiles_handle_fill on public.study_profiles;
create trigger study_profiles_handle_fill before insert on public.study_profiles
  for each row execute function public.study_profiles_handle_fill();

-- Perfis que já existiam ganham o seu (um por vez: cada sorteio enxerga os anteriores). Só quem ainda não tem.
do $$
declare
  r record;
begin
  for r in select user_id from public.study_profiles where handle is null order by created_at, user_id loop
    update public.study_profiles set handle = public.dupla_handle_generate() where user_id = r.user_id;
  end loop;
end
$$;

alter table public.study_profiles alter column handle set not null;
alter table public.study_profiles drop constraint if exists study_profiles_handle_check;
alter table public.study_profiles
  add constraint study_profiles_handle_check check (handle ~ '^[a-z0-9._]{3,20}$' and handle !~ '^\.|\.$');
create unique index if not exists study_profiles_handle_key on public.study_profiles (lower(handle));

-- Disponível? { ok, handle, code, message }. Para a tela mostrar "Disponível" ou "Já em uso" enquanto a pessoa digita. O @ que
-- já é dela vale ("Este já é o seu @.").
create or replace function public.app_dupla_handle_check(p_handle text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  v text := public.dupla_handle_clean(p_handle);
  v_code text;
  v_next timestamptz := public.dupla_handle_next_change(v_uid);
begin
  if exists (select 1 from public.study_profiles x where x.user_id = v_uid and x.handle = v) then
    return jsonb_build_object('ok', true, 'handle', v, 'code', null, 'message', 'Este já é o seu @.', 'next_change_at', v_next,
                              'next_change_message', case when v_next is not null then public.dupla_handle_wait_message(v_next) end);
  end if;
  v_code := public.dupla_handle_problem(v, v_uid);
  return jsonb_build_object('ok', v_code is null and v_next is null, 'handle', v, 'code', case when v_code is null and v_next is not null then 'espera' else v_code end,
                            'message', case when v_code is not null then public.dupla_handle_message(v_code)
                                            when v_next is not null then public.dupla_handle_wait_message(v_next)
                                            else 'Disponível.' end,
                            'next_change_at', v_next,
                            'next_change_message', case when v_next is not null then public.dupla_handle_wait_message(v_next) end);
end
$$;

-- Quando a pessoa poderá trocar o @ de novo: 15 dias depois da última troca REGISTRADA (o @ sorteado ao criar o perfil não é troca).
-- Nulo = já pode.
create or replace function public.dupla_handle_next_change(p_uid uuid) returns timestamptz
  language sql stable security definer set search_path = ''
as $$
  select case when max(l.changed_at) + interval '15 days' > now() then max(l.changed_at) + interval '15 days' end
    from public.study_handle_log l where l.user_id = p_uid
$$;

create or replace function public.dupla_handle_wait_message(p_at timestamptz) returns text
  language sql immutable security definer set search_path = ''
as $$
  select 'Você poderá trocar de novo em ' || to_char(p_at at time zone 'America/Sao_Paulo', 'DD/MM') || '.'
$$;

-- Troca o @ da pessoa (o nome público, o user_id e tudo o que depende dele ficam como estão), no máximo 1 vez a cada 15 dias, e
-- registra a troca. O link de convite do @ antigo deixa de valer.
-- → { handle }
create or replace function public.app_dupla_set_handle(p_handle text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  v text := public.dupla_handle_clean(p_handle);
  v_old text;
  v_code text;
  v_next timestamptz;
begin
  -- Trava por pessoa (a regra dos 15 dias) e por @ (dois alunos pegando o mesmo).
  perform pg_advisory_xact_lock(hashtextextended('dupla-handle-user:' || v_uid::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('dupla-handle:' || v, 0));
  select handle into v_old from public.study_profiles where user_id = v_uid;
  if not found then
    raise exception 'Crie seu perfil de estudo antes de escolher um @.' using errcode = '22023';
  end if;
  if v = v_old then
    return jsonb_build_object('handle', v);
  end if;
  v_code := public.dupla_handle_problem(v, v_uid);
  if v_code is not null then
    raise exception '%', public.dupla_handle_message(v_code) using errcode = '22023';
  end if;
  v_next := public.dupla_handle_next_change(v_uid);
  if v_next is not null then
    raise exception '%', public.dupla_handle_wait_message(v_next) using errcode = '42501';
  end if;
  begin
    update public.study_profiles set handle = v where user_id = v_uid;
  exception when unique_violation then
    raise exception 'Esse @ já está em uso.' using errcode = '23505';
  end;
  insert into public.study_handle_log (user_id, old_handle, new_handle) values (v_uid, v_old, v);
  return jsonb_build_object('handle', v);
end
$$;

-- Equipe (administrador e editor): as trocas de @, da mais nova para a mais antiga. Sem e-mail. → { items: [...] }
create or replace function public.app_admin_dupla_handle_log(p_limit integer default 50) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'user_id', t.user_id, 'public_name', public.dupla_public_name(t.user_id),
                                        'old_handle', t.old_handle, 'new_handle', t.new_handle, 'changed_at', t.changed_at)
                     order by t.changed_at desc, t.id desc)
      from (select * from public.study_handle_log l order by l.changed_at desc, l.id desc limit greatest(1, least(coalesce(p_limit, 50), 200))) t
  ), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------- 2) ajustes (com padrões)
-- Interna. { pendentes (sempre 1), por_hora, por_dia, espera_min, pedidos_por_dia }; os quatro últimos nulos = sem limite. Valor de tipo errado ou fora
-- da faixa vira "sem limite" (nunca derruba o radar).
create or replace function public.dupla_radar_settings() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
  v_hora integer;
  v_dia integer;
  v_espera integer;
  v_pedidos integer;
  x jsonb;
begin
  select c.value into v from public.app_settings c where c.key = 'treino_dupla';
  if v is not null and jsonb_typeof(v) = 'object' then
    x := v #> '{convites,por_hora}';
    if x is not null and jsonb_typeof(x) = 'number' and (x #>> '{}') ~ '^\d{1,4}$' and (x #>> '{}')::integer between 1 and 60 then v_hora := (x #>> '{}')::integer; end if;
    x := v #> '{convites,por_dia}';
    if x is not null and jsonb_typeof(x) = 'number' and (x #>> '{}') ~ '^\d{1,4}$' and (x #>> '{}')::integer between 1 and 200 then v_dia := (x #>> '{}')::integer; end if;
    x := v #> '{convites,espera_min}';
    if x is not null and jsonb_typeof(x) = 'number' and (x #>> '{}') ~ '^\d{1,4}$' and (x #>> '{}')::integer between 1 and 1440 then v_espera := (x #>> '{}')::integer; end if;
    x := v #> '{convites,pedidos_por_dia}';
    if x is not null and jsonb_typeof(x) = 'number' and (x #>> '{}') ~ '^\d{1,4}$' and (x #>> '{}')::integer between 1 and 200 then v_pedidos := (x #>> '{}')::integer; end if;
  end if;
  return jsonb_build_object('pendentes', 1, 'por_hora', v_hora, 'por_dia', v_dia, 'espera_min', v_espera, 'pedidos_por_dia', v_pedidos);
end
$$;

-- ---------------------------------------------------------------- 3) bloqueio
-- Há bloqueio entre as duas pessoas, em qualquer sentido? (A tabela é a do chat: um bloqueio só.)
create or replace function public.dupla_blocked(a uuid, b uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.study_chat_blocks k
     where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a))
$$;

-- O bloqueio faz uma sumir para a outra no baralho e no radar (decisão do dono de 17/10). Hoje é só o bloqueio; fica separada
-- para um único ponto de decisão.
create or replace function public.dupla_hides(a uuid, b uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.dupla_blocked(a, b)
$$;

-- ---------------------------------------------------------------- 3b) lugar (aba "Perto de você")
-- Lê o campo "Cidade / estado" do perfil de estudo (texto livre, ex.: "Curitiba · PR"), SEM GPS e SEM localização do aparelho.
-- Sem acento, minúsculas; o estado é o último termo de 2 letras quando for uma sigla de UF. → { city, uf } ou nulo (campo vazio).
create or replace function public.dupla_place(p_text text) returns jsonb
  language plpgsql immutable security definer set search_path = ''
as $$
declare
  v text := regexp_replace(public.dupla_chat_normalize(btrim(coalesce(p_text, ''))), '\s+', ' ', 'g');
  v_uf text;
  v_city text;
begin
  if v = '' then
    return null;
  end if;
  v_uf := substring(v from '(?:^|[^a-z])([a-z]{2})[^a-z]*$');
  if v_uf is not null and v_uf <> all (array['ac','al','ap','am','ba','ce','df','es','go','ma','mt','ms','mg','pa','pb','pr','pe','pi','rj','rn','rs','ro','rr','sc','sp','se','to']) then
    v_uf := null;
  end if;
  v_city := case when v_uf is null then v else regexp_replace(v, '(?:^|[^a-z])' || v_uf || '[^a-z]*$', '') end;
  v_city := nullif(btrim(regexp_replace(v_city, '[^a-z0-9]+', ' ', 'g')), '');
  if v_city is null and v_uf is null then
    return null;
  end if;
  return jsonb_build_object('city', v_city, 'uf', v_uf);
end
$$;

-- Quão perto dois lugares estão: 'cidade' (mesma cidade; se os dois informaram o estado, o mesmo estado), 'estado' (mesma sigla)
-- ou nulo.
create or replace function public.dupla_near(a jsonb, b jsonb) returns text
  language sql immutable security definer set search_path = ''
as $$
  select case
    when a is null or b is null then null
    when (a ->> 'city') is not null and (a ->> 'city') = (b ->> 'city')
         and ((a ->> 'uf') is null or (b ->> 'uf') is null or (a ->> 'uf') = (b ->> 'uf')) then 'cidade'
    when (a ->> 'uf') is not null and (a ->> 'uf') = (b ->> 'uf') then 'estado'
  end
$$;

-- ---------------------------------------------------------------- 4) radar
-- Quem está online agora (sinal há menos de 2 minutos, situação diferente de "fora"), com acesso ao módulo, perfil e
-- "Aparecer no radar" ligado, sem bloqueio entre as duas pessoas. A lista é aberta a todos com acesso (quem está invisível a vê). Cartão público igual ao do baralho: instituição só com show_school;
-- estações e média só com show_stats; nunca e-mail, telefone ou foto. Ordem: livres, depois compatibilidade, depois sinal mais
-- recente; no máximo 50. Mesmo papel específico NÃO esconde a pessoa (a sala deixa trocar os papéis): vem sem compatibilidade.
-- Com a estação (p_station_id) a lista já diz quem pode receber aquele convite.
-- p_aba: 'online' (todos, padrão), 'atores' (quem topa ser ator/avaliador: ator ou qualquer papel) ou 'perto' ("Perto de você": só
-- quem informou cidade; primeiro a mesma cidade, depois o mesmo estado; dentro de cada grupo, livres e compatibilidade). A cidade
-- vem só do que a própria pessoa informou e já está no cartão público; sem GPS. Quem olha sem cidade no perfil recebe
-- needs_city = true e a lista vazia na aba 'perto'. Cada pessoa traz near = 'cidade' | 'estado' | null.
-- → { needs_city, people: [{ near, user_id, public_name, handle, school, city, exam, bio, goal, areas, role_pref, pace, days, shifts, stats, compat,
--                reasons, online, state: livre|em_sala|sozinho, can_invite, why_not }],
--     online, open_room, me: { radar_visible, allow_direct_invites }, server_now }
create or replace function public.app_dupla_radar(p_station_id text default null, p_aba text default 'online') returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  me public.study_profiles;
  st public.checklist_stations;
  v_open jsonb;
  v_people jsonb := '[]'::jsonb;
  v_online integer;
  v_me_pro boolean := public.tutor_is_pro(v_uid);
  v_mp jsonb;
begin
  if p_aba is null or p_aba not in ('online', 'atores', 'perto') then
    raise exception 'Aba inválida.' using errcode = '22023';
  end if;
  perform public.dupla_sweep();
  select * into me from public.study_profiles where user_id = v_uid;
  if not found then
    raise exception 'Crie seu perfil de estudo antes de procurar uma dupla.' using errcode = '22023';
  end if;
  v_mp := public.dupla_place(me.city);
  if p_station_id is not null then
    select * into st from public.checklist_stations s
     where s.id = p_station_id and (s.medical_review = 'approved' or public.is_staff());
    if not found then
      raise exception 'Estação não encontrada.' using errcode = '22023';
    end if;
  end if;

  select jsonb_build_object('id', r.id, 'phase', r.phase,
                            'partner_name', public.dupla_public_name((select x from unnest(r.member_ids) x where x is distinct from v_uid limit 1)))
    into v_open
    from public.checklist_rooms r
   where r.phase <> 'closed' and v_uid = any (r.member_ids)
   order by r.updated_at desc
   limit 1;

  select coalesce(jsonb_agg(z.person order by z.prox, z.rank, z.compat desc nulls last, z.seen desc), '[]'::jsonb)
    into v_people
  from (
    select x.person, x.compat, x.seen, case when x.state = 'livre' then 0 else 1 end as rank,
           case when p_aba = 'perto' and x.near = 'cidade' then 0 when p_aba = 'perto' then 1 else 0 end as prox
    from (
      select
        (k.c ->> 'compat')::integer as compat,
        p.last_seen_at as seen,
        s.state,
        n.near,
        jsonb_build_object(
          'near', n.near,
          'user_id', p.user_id,
          'public_name', p.public_name,
          'handle', p.handle,
          'school', case when p.show_school then p.school end,
          'city', p.city,
          'exam', p.exam,
          'bio', p.bio,
          'goal', p.goal,
          'areas', to_jsonb(p.areas),
          'role_pref', p.role_pref,
          'pace', p.pace,
          'days', to_jsonb(p.days),
          'shifts', to_jsonb(p.shifts),
          'stats', case when p.show_stats then (
                     select jsonb_build_object('done', count(*), 'avg', round(avg(t.score / nullif(t.max_score, 0) * 10), 2))
                       from public.checklist_study_sessions t where t.doctor_id = p.user_id) end,
          'compat', case when (k.c ->> 'ok')::boolean then (k.c ->> 'compat')::integer end,
          'reasons', case when (k.c ->> 'ok')::boolean then k.c -> 'reasons' else '[]'::jsonb end,
          'online', true,
          'state', s.state,
          'can_invite', w.why is null,
          'why_not', w.why
        ) as person
      from public.study_profiles p
      cross join lateral (select public.dupla_compat(me, p) as c) k
      cross join lateral (select public.dupla_near(v_mp, public.dupla_place(p.city)) as near) n
      cross join lateral (
        select case when p.status = 'sozinho' then 'sozinho'
                    when p.status = 'em_estacao' or exists (
                           select 1 from public.checklist_rooms r where r.phase <> 'closed' and p.user_id = any (r.member_ids)) then 'em_sala'
                    else 'livre' end as state
      ) s
      cross join lateral (
        select case
          when s.state = 'em_sala' then 'Em sala.'
          when s.state = 'sozinho' then 'Treinando sozinho.'
          when not p.allow_direct_invites or public.dupla_blocked(v_uid, p.user_id)
               or exists (select 1 from public.study_invites i where i.to_user = p.user_id and i.status = 'pending' and i.expires_at > now())
            then 'Não recebe convites.'
          when p_station_id is not null and st.is_pro_only and not v_me_pro then 'Estação exclusiva dos planos Pro e Elite.'
          when p_station_id is not null and st.is_pro_only and not public.tutor_is_pro(p.user_id) then 'Não recebe convites.'
        end as why
      ) w
      where p.user_id <> v_uid
        and p.radar_visible
        and p.last_seen_at > now() - interval '2 minutes'
        and p.status <> 'fora'
        and public.dupla_allowed(p.user_id)
        and not public.dupla_hides(v_uid, p.user_id)
        and (p_aba = 'online'
             or (p_aba = 'atores' and p.role_pref in ('ator', 'any'))
             or (p_aba = 'perto' and n.near is not null))
    ) x
    order by case when p_aba = 'perto' and x.near = 'cidade' then 0 when p_aba = 'perto' then 1 else 0 end,
             case when x.state = 'livre' then 0 else 1 end, x.compat desc nulls last, x.seen desc
    limit 50
  ) z;

  select count(*) into v_online
    from public.study_profiles p
   where p.user_id <> v_uid and p.radar_visible and p.last_seen_at > now() - interval '2 minutes' and p.status <> 'fora'
     and public.dupla_allowed(p.user_id) and not public.dupla_hides(v_uid, p.user_id);

  return jsonb_build_object('people', v_people, 'online', v_online, 'open_room', v_open,
                            'needs_city', (p_aba = 'perto' and v_mp is null),
                            'me', jsonb_build_object('radar_visible', me.radar_visible, 'allow_direct_invites', me.allow_direct_invites),
                            'server_now', clock_timestamp());
end
$$;

-- ---------------------------------------------------------------- 5a) crédito (Stazia Match)
-- PONTO DE CHAMADA da pré-checagem de crédito do Stazia Match (ramo stazia-match: credit_available(uuid, text, integer,
-- timestamptz), que não debita e vale sempre quando a cota está desligada ou a pessoa é da equipe). Este ramo ainda não tem a
-- função: sem ela a checagem PASSA (não bloqueia). Com ela, o convite direto, o convite por link e a resposta a um pedido
-- precisam do crédito "match" das DUAS pessoas antes de criar a sala; ninguém vê o saldo do outro (a recusa de quem recebe é a
-- mesma mensagem neutra de "não pode receber convites agora").
create or replace function public.dupla_credit_ok(p_uid uuid) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if to_regprocedure('public.credit_available(uuid, text, integer, timestamp with time zone)') is null then
    return true;
  end if;
  execute 'select public.credit_available($1, $2)' into v_ok using p_uid, 'match';
  return coalesce(v_ok, false);
end
$$;

-- ---------------------------------------------------------------- 5) convite direto
-- Convida p_to (que está no radar) para treinar. Cria a sala na fase dos papéis (sem match, com a estação e os papéis
-- sugeridos por dupla_assign) e o convite de 60 s (kind 'direto'). Quem convida entra na sala; quem recebe vê o aviso.
-- Trava a minha fila e o par antes de ler (dois convites juntos para a mesma pessoa: um só passa).
-- → { room_id, partner: { user_id, public_name }, expires_at }
-- O miolo (dupla_invite_core) também serve ao convite por link e à resposta a um pedido de treino (p_free = true): aí a pessoa
-- convidada pode estar com o radar desligado (o link é compartilhado por ela) e os limites de quantidade não se aplicam.
create or replace function public.dupla_invite_core(v_uid uuid, p_to uuid, p_station_id text, p_free boolean, p_chosen_by uuid default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  me public.study_profiles;
  other public.study_profiles;
  cfg jsonb := public.dupla_radar_settings();
  st public.checklist_stations;
  v_station text;
  v_dur integer;
  v_assign text;
  v_cand uuid;
  v_eval uuid;
  v_room uuid;
  v_exp timestamptz;
  v_n integer;
  v_old timestamptz;
  v_min integer;
  v_recusa timestamptz;
begin
  if p_to is null or p_to = v_uid then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dupla-convite:' || v_uid::text, 0));
  -- Quem recebe também é travado: dois convites de pessoas diferentes para a mesma não passam juntos.
  perform pg_advisory_xact_lock(hashtextextended('dupla-recebe:' || p_to::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('dupla-par:' || least(v_uid, p_to)::text || ':' || greatest(v_uid, p_to)::text, 0));
  -- Trava por pessoa (013990), a mesma do match e do "Abrir sala" do chat: uma sala aberta por pessoa também na corrida
  -- entre um convite e um match ao mesmo tempo.
  perform public.dupla_lock_users(v_uid, p_to);
  perform public.dupla_sweep();

  select * into me from public.study_profiles where user_id = v_uid;
  if not found then
    raise exception 'Crie seu perfil de estudo antes de procurar uma dupla.' using errcode = '22023';
  end if;
  select * into other from public.study_profiles where user_id = p_to;
  if not found then
    raise exception 'Colega não encontrado.' using errcode = '22023';
  end if;
  -- Um convite pendente por vez (fixo). Vem antes da sala aberta: o convite que espera já tem a sua sala.
  select count(*) into v_n from public.study_invites i
   where i.from_user = v_uid and i.status = 'pending' and i.expires_at > now();
  if v_n >= (cfg ->> 'pendentes')::integer then
    raise exception 'Você já tem um convite aguardando resposta.' using errcode = '42501';
  end if;
  if exists (select 1 from public.checklist_rooms r where r.phase <> 'closed' and v_uid = any (r.member_ids)) then
    raise exception 'Você já está em uma sala aberta. Saia dela antes de convidar.' using errcode = '42501';
  end if;

  -- Quem recebe: online, livre, com radar e convites ligados, sem outro convite esperando e sem bloqueio entre os dois.
  if not public.dupla_allowed(p_to)
     or (not other.radar_visible and not p_free)
     or not other.allow_direct_invites
     or coalesce(other.last_seen_at, '-infinity'::timestamptz) <= now() - interval '2 minutes'
     or other.status in ('fora', 'em_estacao', 'sozinho')
     or public.dupla_hides(v_uid, p_to)
     or exists (select 1 from public.checklist_rooms r where r.phase <> 'closed' and p_to = any (r.member_ids))
     or exists (select 1 from public.study_invites i where i.to_user = p_to and i.status = 'pending' and i.expires_at > now()) then
    raise exception '% não pode receber convites agora.', other.public_name using errcode = '42501';
  end if;
  -- Crédito do Stazia Match: o meu (mensagem do próprio crédito) e o dele (mensagem neutra). Sem a função do Match, passa.
  if not public.dupla_credit_ok(v_uid) then
    raise exception 'sem_credito' using errcode = '54000', hint = 'INSUFFICIENT_CREDITS';
  end if;
  if not public.dupla_credit_ok(p_to) then
    raise exception '% não pode receber convites agora.', other.public_name using errcode = '42501';
  end if;

  -- Estação: liberada para os dois (aprovada, ou não aprovada só entre duas pessoas da equipe: dupla_station_liberada, 013405);
  -- só dos planos Pro/Elite exige plano pago nos dois.
  if p_station_id is not null then
    if not public.dupla_station_liberada(p_station_id, array[v_uid, p_to]) then
      if public.is_staff() and exists (select 1 from public.checklist_stations s where s.id = p_station_id) then
        raise exception 'Estação ainda sem aprovação médica: só dá para treinar entre a equipe.' using errcode = '42501';
      end if;
      raise exception 'Estação não encontrada.' using errcode = '22023';
    end if;
    select * into st from public.checklist_stations s where s.id = p_station_id;
    if st.is_pro_only and not (public.tutor_is_pro(v_uid) and public.tutor_is_pro(p_to)) then
      raise exception 'Estação exclusiva dos planos Pro e Elite.' using errcode = '42501';
    end if;
    v_station := st.id;
    v_dur := case when st.duration_ms between 60000 and 3600000 then st.duration_ms end;
  end if;

  -- Limites (o fechamento preguiçoso acima já cancelou os vencidos). O de 1 pendente é fixo; os outros só valem se o dono preencher.
  select count(*), min(i.created_at) into v_n, v_old from public.study_invites i
   where i.from_user = v_uid and i.kind = 'direto' and i.created_at > now() - interval '1 hour';
  if not p_free and cfg ->> 'por_hora' is not null and v_n >= (cfg ->> 'por_hora')::integer then
    v_min := greatest(1, ceil(extract(epoch from (v_old + interval '1 hour' - now())) / 60.0)::integer);
    raise exception 'Muitos convites seguidos. Tente de novo em % min.', v_min using errcode = '42501';
  end if;
  select count(*), min(i.created_at) into v_n, v_old from public.study_invites i
   where i.from_user = v_uid and i.kind = 'direto' and i.created_at > now() - interval '24 hours';
  if not p_free and cfg ->> 'por_dia' is not null and v_n >= (cfg ->> 'por_dia')::integer then
    v_min := greatest(1, ceil(extract(epoch from (v_old + interval '24 hours' - now())) / 60.0)::integer);
    raise exception 'Muitos convites seguidos. Tente de novo em % min.', v_min using errcode = '42501';
  end if;

  -- Depois de recusa ou vencimento, espera antes de reconvidar a mesma pessoa.
  if not p_free and cfg ->> 'espera_min' is not null then
    select max(i.created_at) into v_recusa
      from public.study_invites i
      join public.checklist_rooms r on r.id = i.room_id
     where i.from_user = v_uid and i.to_user = p_to and i.kind = 'direto'
       and r.closed_reason in ('convite_recusado', 'convite_expirado')
       and i.created_at > now() - make_interval(mins => (cfg ->> 'espera_min')::integer);
    if v_recusa is not null then
      v_min := greatest(1, ceil(extract(epoch from (v_recusa + make_interval(mins => (cfg ->> 'espera_min')::integer) - now())) / 60.0)::integer);
      raise exception 'Você convidou % há pouco. Tente de novo em % min.', other.public_name, v_min using errcode = '42501';
    end if;
  end if;

  v_assign := public.dupla_assign(me.role_pref, other.role_pref);
  if v_assign = 'candidato' then
    v_cand := v_uid; v_eval := p_to;
  elsif v_assign = 'ator' then
    v_cand := p_to; v_eval := v_uid;
  end if;

  -- Quem trouxe a estação (quem convida, ou quem pediu o treino pelo link) fica gravado como quem a escolheu: já viu o tema
  -- (aviso "Você já viu esta estação", 013405). Quem recebe o convite vê só "Estação N".
  insert into public.checklist_rooms (member_ids, phase, round, match_id, station_id, station_chosen_by, candidate_id, evaluator_id, duration_ms)
  values (array[v_uid, p_to], 'roles', 1, null, v_station, case when v_station is not null then coalesce(p_chosen_by, v_uid) end, v_cand, v_eval, v_dur)
  returning id into v_room;
  insert into public.study_invites (from_user, to_user, room_id, kind) values (v_uid, p_to, v_room, 'direto')
  returning expires_at into v_exp;
  update public.study_profiles set last_seen_at = now() where user_id = v_uid;
  -- Pedido de treino por link pendente entre os dois: o convite já resolveu (não fica órfão para aparecer amanhã).
  if to_regclass('public.study_train_requests') is not null then
    execute 'update public.study_train_requests set status = ''canceled'', answered_at = now() where status = ''pending'' and least(from_user, to_user) = least($1, $2) and greatest(from_user, to_user) = greatest($1, $2)' using v_uid, p_to;
  end if;

  return jsonb_build_object('room_id', v_room, 'expires_at', v_exp,
                            'partner', jsonb_build_object('user_id', p_to, 'public_name', other.public_name));
end
$$;

create or replace function public.app_dupla_invite(p_to uuid, p_station_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  return public.dupla_invite_core(public.dupla_assert_access(), p_to, p_station_id, false);
end
$$;

-- ---------------------------------------------------------------- 6) painel (só administrador)
-- Os valores em vigor (vazio = sem limite). → { convites: { pendentes (fixo 1), por_hora, por_dia, espera_min, pedidos_por_dia } }
create or replace function public.app_admin_dupla_radar() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object('convites', public.dupla_radar_settings());
end
$$;

-- Grava SÓ o bloco "convites" de app_settings.treino_dupla (por_hora, por_dia, espera_min, pedidos_por_dia; nulo ou vazio = sem limite); o resto
-- da chave (aberto, planos, outras frentes) fica como está. → o mesmo de app_admin_dupla_radar()
create or replace function public.app_admin_save_dupla_radar(p_config jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c jsonb;
  k text;
  v_new jsonb := '{}'::jsonb;
begin
  perform public.assert_admin();
  if p_config is null or jsonb_typeof(p_config) <> 'object' or jsonb_typeof(p_config -> 'convites') is distinct from 'object' then
    raise exception 'Configuração dos convites inválida.' using errcode = '22023';
  end if;
  c := p_config -> 'convites';
  foreach k in array array['por_hora', 'por_dia', 'espera_min', 'pedidos_por_dia'] loop
    if c -> k is null or jsonb_typeof(c -> k) = 'null' then
      v_new := v_new || jsonb_build_object(k, null);
    elsif jsonb_typeof(c -> k) <> 'number' or (c ->> k) !~ '^\d{1,4}$' then
      raise exception 'Configuração dos convites inválida.' using errcode = '22023';
    else
      v_new := v_new || jsonb_build_object(k, (c ->> k)::integer);
    end if;
  end loop;
  if (v_new ->> 'por_hora') is not null and (v_new ->> 'por_hora')::integer not between 1 and 60
     or (v_new ->> 'por_dia') is not null and (v_new ->> 'por_dia')::integer not between 1 and 200
     or (v_new ->> 'espera_min') is not null and (v_new ->> 'espera_min')::integer not between 1 and 1440
     or (v_new ->> 'pedidos_por_dia') is not null and (v_new ->> 'pedidos_por_dia')::integer not between 1 and 200 then
    raise exception 'Configuração dos convites inválida.' using errcode = '22023';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('treino_dupla', jsonb_build_object('aberto', false, 'planos', '[]'::jsonb, 'convites', v_new), now(), (select auth.uid()))
  on conflict (key) do update
    set value = jsonb_set(case when jsonb_typeof(public.app_settings.value) = 'object' then public.app_settings.value else '{}'::jsonb end,
                          '{convites}', v_new, true),
        updated_at = now(), updated_by = excluded.updated_by;
  perform public.admin_log('dupla.convites', null, v_new);
  return public.app_admin_dupla_radar();
end
$$;

-- ---------------------------------------------------------------- 7) chat: denúncias encerradas guardadas por 180 dias
-- Decisão do dono de 17/10. Só preenche quando estava vazio (colar de novo não desfaz uma mudança feita no painel para outro
-- valor); a limpeza é a dupla_chat_sweep da 013370, que roda a cada chamada do chat.
update public.app_settings
   set value = jsonb_set(value, '{guarda_denuncia_dias}', '180'::jsonb, true), updated_at = now()
 where key = 'treino_dupla_chat'
   and jsonb_typeof(value) = 'object'
   and (value -> 'guarda_denuncia_dias' is null or jsonb_typeof(value -> 'guarda_denuncia_dias') = 'null');

-- ---------------------------------------------------------------- permissões
-- As do app: só quem entra (visitante não); o porteiro dupla_assert_access / assert_admin barra o resto.
-- As de apoio: só rodam dentro das funções do servidor (security definer).
revoke execute on function public.app_dupla_radar(text, text) from public, anon;
revoke execute on function public.dupla_place(text) from public, anon, authenticated;
revoke execute on function public.dupla_near(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.app_dupla_invite(uuid, text) from public, anon;
revoke execute on function public.dupla_invite_core(uuid, uuid, text, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_credit_ok(uuid) from public, anon, authenticated;
revoke execute on function public.app_admin_dupla_radar() from public, anon;
revoke execute on function public.app_admin_save_dupla_radar(jsonb) from public, anon;
revoke execute on function public.app_dupla_handle_check(text) from public, anon;
revoke execute on function public.app_dupla_set_handle(text) from public, anon;
revoke execute on function public.app_admin_dupla_handle_log(integer) from public, anon;
revoke execute on function public.dupla_has_banned_word(text, boolean) from public, anon, authenticated;
revoke execute on function public.dupla_name_reserved(text) from public, anon, authenticated;
revoke execute on function public.dupla_handle_clean(text) from public, anon, authenticated;
revoke execute on function public.dupla_handle_problem(text, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_handle_message(text) from public, anon, authenticated;
revoke execute on function public.dupla_handle_next_change(uuid) from public, anon, authenticated;
revoke execute on function public.dupla_handle_wait_message(timestamptz) from public, anon, authenticated;
revoke execute on function public.dupla_handle_generate() from public, anon, authenticated;
revoke execute on function public.study_profiles_handle_fill() from public, anon, authenticated;
revoke execute on function public.dupla_radar_settings() from public, anon, authenticated;
revoke execute on function public.dupla_blocked(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_hides(uuid, uuid) from public, anon, authenticated;
