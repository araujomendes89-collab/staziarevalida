-- =============================================================================
-- Treino em Dupla, Etapa C: chat entre os dois do match ("Enviar mensagem"), com filtro e limites no servidor, mensagens que
-- se apagam em 24 horas, bloqueio, denúncia à equipe e leitura da equipe SÓ das conversas denunciadas.
-- (Plano de 12/10: "migração 9930"; número 013370, reservado para esta etapa.) Depende das do Treino (013300 dados, 013310
-- telas, 013320 match, 013340 pacote).
-- Pode ser colada duas vezes: tabelas e índices "if not exists", "create or replace", "drop … if exists", a linha da chave só
-- nasce se não existir e a cópia das conversas dos matches antigos é "on conflict do nothing". Colar não abre nada ao aluno: o
-- chat só existe dentro do Treino em Dupla (a chave "treino_dupla" continua mandando).
--
-- O QUE FAZ
--  1) app_settings: a lista de chaves aceitas é a UNIÃO das que existem em todos os ramos ('trial_days', 'announcement',
--     'simulado_ineditas_pct', 'treino_dupla') mais 'treino_dupla_chat'. A linha nasce com os valores PROPOSTOS pelo pacote de
--     11/10 (9 palavras, 600 caracteres, 5 mensagens em 30 s) e "guarda_denuncia_dias" vazio (valor do dono); só o
--     administrador muda (app_admin_save_dupla_chat).
--  2) Uma conversa por PAR (study_chats, par em ordem: user_a < user_b, único). Nasce sozinha quando o par dá match (gatilho em
--     study_matches) e os matches que já existiam ganham a sua. Repetir o match não cria outra conversa. Conta excluída: o lado
--     dela vira nulo e a conversa fica para o outro (que lê "Conta excluída" e não envia mais).
--  3) Mensagens (study_messages): no máximo 24 horas. Cada uma vence em created_at + 24 h; o que venceu não é devolvido nem
--     lido direto da tabela, mesmo antes da limpeza; a limpeza (dupla_chat_sweep) apaga em toda chamada do chat e, se o banco
--     tiver o pg_cron ligado, a cada 30 minutos.
--  4) Quem lê: só os dois do par, com acesso ao Treino em Dupla (RLS). Ninguém grava direto: só app_dupla_chat_send.
--     Equipe, revisor médico, terceiros e visitantes NÃO leem as conversas; a equipe só lê a CÓPIA guardada na denúncia.
--  5) Filtro no servidor (dupla_chat_check, regras e textos do pacote, study-social.js:25-40): vazio, tamanho, palavra
--     bloqueada (acento, caixa, letras trocadas por números, pontuação ou espaço entre as letras, plural com "s", sempre
--     palavra inteira: termo clínico que CONTÉM a palavra passa), link/e-mail/telefone e divulgação. Mensagem recusada não é
--     gravada. Limite de envios seguidos por conversa e pessoa ("rajada" em "janela_s").
--  6) Bloqueio (study_chat_blocks): vale só no chat. Com bloqueio de qualquer lado ninguém envia nem abre sala pelo chat.
--  7) Denúncia (study_chat_reports): guarda a CÓPIA das mensagens ainda visíveis no momento (texto, autor e hora), o motivo e
--     a situação. Lida só pela equipe (administrador e editor) pelas funções app_admin_dupla_chat_*; cada leitura entra no
--     registro de ações. "guarda_denuncia_dias" (vazio = não apaga) apaga as denúncias ENCERRADAS há mais que esse prazo.
--  8) "Abrir sala" no chat (app_dupla_chat_room): leva à sala aberta do par (aceitando o convite pendente para mim) ou abre
--     uma nova (fase dos papéis, sem estação, convite de 60 s ao parceiro). NÃO cria match (não conta em "matches hoje").
--  9) Tempo real: study_messages entra na publicação supabase_realtime (se existir). A tela assina INSERT em study_messages
--     filtrado pela conversa; quem recebe é decidido pela RLS (só os dois). Não há canal com presença nem política nova em
--     realtime.messages.
-- 10) Conta: app_export_my_data ganha a chave "study_chat" (as minhas mensagens ainda visíveis, os meus bloqueios e as minhas
--     denúncias, sem a cópia das mensagens do outro).
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   app_export_my_data() ← 013340 (igual, mais a chave "study_chat" no fim).
--   Novas: dupla_chat_normalize, dupla_chat_settings, dupla_chat_check, dupla_chat_sweep, dupla_chat_get, dupla_chat_summary,
--   dupla_chat_from_match (gatilho), dupla_export_chat, app_dupla_chats, app_dupla_chat_open, app_dupla_chat_messages,
--   app_dupla_chat_send, app_dupla_chat_block, app_dupla_chat_report, app_dupla_chat_room, app_admin_dupla_chat_reports,
--   app_admin_dupla_chat_report, app_admin_dupla_chat_report_close, app_admin_save_dupla_chat.
--   Usadas sem mudar: dupla_assert_access, dupla_allowed, dupla_me_allowed (013300); dupla_sweep, dupla_public_name (013310);
--   dupla_assign (013320); assert_admin, assert_staff, admin_log (…1300).
--
-- DECISÕES PEQUENAS (fora do texto do plano; o dono pode mudar)
--  - A conversa é do PAR, não de cada match (o par pode ter vários matches; "um par = uma conversa").
--  - Teto da tabela: 2000 caracteres (o limite que vale é "max" da chave, que o administrador pode ajustar entre 1 e 2000).
--  - Quem bloqueou lê: "Você bloqueou esta pessoa. Desbloqueie para enviar mensagens."; quem foi bloqueado (ou conversa com
--    conta excluída) lê a frase neutra "Esta conversa não aceita novas mensagens." (não fica sabendo do bloqueio).
--  - Uma denúncia aberta por pessoa e conversa ("Você já denunciou esta conversa. A equipe vai analisar.").
--  - Equipe que lê denúncia = administrador e editor (assert_staff). Revisor médico não.
--  - Mensagens novas (para o dono aprovar) nas funções abaixo, todas em português.
--
-- COMO DESFAZER: drop das tabelas study_chat_reports, study_chat_blocks, study_messages e study_chats; drop do gatilho
--   study_matches_chat; apagar as funções novas acima; recolocar app_export_my_data da 013340; refazer app_settings_key_check
--   sem 'treino_dupla_chat' (e apagar essa linha); tirar study_messages da publicação supabase_realtime; se o pg_cron estiver
--   ligado, cron.unschedule('treino-dupla-chat-limpeza').
-- =============================================================================

-- ---------------------------------------------------------------- 1) chave do chat
alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings
  add constraint app_settings_key_check
  check (key in ('trial_days', 'announcement', 'simulado_ineditas_pct', 'treino_dupla', 'treino_dupla_chat'));

insert into public.app_settings (key, value)
values ('treino_dupla_chat',
        '{"palavras": ["idiota", "imbecil", "babaca", "otario", "porra", "caralho", "merda", "puta", "puto"],
          "max": 600, "rajada": 5, "janela_s": 30, "guarda_denuncia_dias": null}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- 2) tabelas
-- Uma conversa por par (ordem fixa: user_a < user_b). Conta excluída: o lado dela vira nulo.
create table if not exists public.study_chats (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references auth.users (id) on delete set null,
  user_b uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check (user_a < user_b)
);
create unique index if not exists study_chats_pair_idx on public.study_chats (user_a, user_b);
create index if not exists study_chats_b_idx on public.study_chats (user_b);
alter table public.study_chats enable row level security;
drop policy if exists "conversas: os dois leem" on public.study_chats;
create policy "conversas: os dois leem" on public.study_chats
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));

-- Mensagens: vencem em 24 horas; o que venceu não aparece nem lido direto da tabela. "seq" desempata a ordem de duas mensagens
-- gravadas no mesmo instante.
create table if not exists public.study_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  chat_id uuid not null references public.study_chats (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (expires_at <= created_at + interval '24 hours')
);
create index if not exists study_messages_chat_idx on public.study_messages (chat_id, created_at, seq);
create index if not exists study_messages_expires_idx on public.study_messages (expires_at);
create index if not exists study_messages_sender_idx on public.study_messages (sender_id, created_at);
alter table public.study_messages enable row level security;
drop policy if exists "mensagens: os dois leem" on public.study_messages;
create policy "mensagens: os dois leem" on public.study_messages
  for select to authenticated using (
    expires_at > now()
    and exists (select 1 from public.study_chats c where c.id = chat_id and (select auth.uid()) in (c.user_a, c.user_b))
    and public.dupla_me_allowed()
  );
-- Sem política de escrita: só app_dupla_chat_send grava.

-- Bloqueio de pessoa no chat (só no chat; radar, baralho e convite não mudam).
create table if not exists public.study_chat_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.study_chat_blocks enable row level security;
drop policy if exists "bloqueios: quem bloqueou lê" on public.study_chat_blocks;
create policy "bloqueios: quem bloqueou lê" on public.study_chat_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

-- Denúncia: cópia das mensagens visíveis no momento. Sem política: só a equipe lê, pelas funções app_admin_dupla_chat_*.
create table if not exists public.study_chat_reports (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.study_chats (id) on delete set null,
  reporter_id uuid references auth.users (id) on delete set null,
  reported_id uuid references auth.users (id) on delete set null,
  reporter_name text not null,
  reported_name text not null,
  reason text check (char_length(reason) <= 500),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  status text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  team_note text check (char_length(team_note) <= 1000),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null
);
create index if not exists study_chat_reports_status_idx on public.study_chat_reports (status, created_at desc);
create index if not exists study_chat_reports_reporter_idx on public.study_chat_reports (reporter_id, chat_id);
alter table public.study_chat_reports enable row level security;

-- ---------------------------------------------------------------- 3) conversas nascem do match
create or replace function public.dupla_chat_from_match() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.study_chats (user_a, user_b)
  values (least(new.user_a, new.user_b), greatest(new.user_a, new.user_b))
  on conflict (user_a, user_b) do nothing;
  return null;
end
$$;
drop trigger if exists study_matches_chat on public.study_matches;
create trigger study_matches_chat after insert on public.study_matches
  for each row execute function public.dupla_chat_from_match();

-- Matches que já existiam ganham a sua conversa (uma por par).
insert into public.study_chats (user_a, user_b)
select distinct least(m.user_a, m.user_b), greatest(m.user_a, m.user_b) from public.study_matches m
on conflict (user_a, user_b) do nothing;

-- ---------------------------------------------------------------- 4) apoios (o navegador nunca chama)
-- Texto para o filtro: sem acento, sem caracteres invisíveis, em minúsculas (como normalize() de study-social.js).
create or replace function public.dupla_chat_normalize(p_text text) returns text
  language sql immutable security definer set search_path = ''
as $$
  select lower(regexp_replace(normalize(coalesce(p_text, ''), NFKD), '[̀-ͯ​-‏‪-‮⁠﻿]', '', 'g'))
$$;

-- Valores da chave 'treino_dupla_chat'. Chave ausente ou estragada: o chat recusa o envio (falha para o lado seguro).
create or replace function public.dupla_chat_settings() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  select c.value into v from public.app_settings c where c.key = 'treino_dupla_chat';
  if v is null or jsonb_typeof(v) <> 'object'
     or jsonb_typeof(v -> 'palavras') is distinct from 'array'
     or jsonb_typeof(v -> 'max') is distinct from 'number'
     or jsonb_typeof(v -> 'rajada') is distinct from 'number'
     or jsonb_typeof(v -> 'janela_s') is distinct from 'number' then
    raise exception 'O chat está indisponível no momento. Tente mais tarde.' using errcode = '55000';
  end if;
  return v;
end
$$;

-- Motivo da recusa (texto do pacote) ou nulo quando a mensagem pode ser enviada.
create or replace function public.dupla_chat_check(p_text text) returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare
  s jsonb := public.dupla_chat_settings();
  v_max integer := (s ->> 'max')::numeric::integer;
  v text := regexp_replace(coalesce(p_text, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  n text;
  w text;
  p text;
  pat text;
begin
  if v = '' then
    return 'Escreva uma mensagem para combinar o treino.';
  end if;
  if char_length(v) > v_max then
    return format('Use até %s caracteres por mensagem.', v_max);
  end if;
  n := public.dupla_chat_normalize(v);
  -- Letras trocadas por números e símbolos (0 1 3 4 5 7 @ $).
  w := translate(n, '013457@$', 'oieastas');
  for p in select jsonb_array_elements_text(s -> 'palavras') loop
    pat := regexp_replace(translate(public.dupla_chat_normalize(p), '013457@$', 'oieastas'), '[^a-z0-9]', '', 'g');
    continue when pat = '';
    -- Palavra inteira (nunca trecho de outra), com qualquer coisa que não seja letra ou número entre as letras, e plural com "s".
    pat := '(^|[^a-z0-9])' || array_to_string(regexp_split_to_array(pat, ''), '[^a-z0-9]*') || 's?($|[^a-z0-9])';
    if w ~ pat then
      return 'Essa mensagem contém uma palavra não permitida. Reformule com respeito e mantenha o foco no treino.';
    end if;
  end loop;
  if n ~* '(https?://|www\.|\y[[:alnum:]_.-]+\.(com|net|org|br)\y|[[:alnum:]_.+-]+@[[:alnum:]_.-]+\.[a-z]{2,}|(\+?[0-9][[:space:]().-]*){10,})' then
    return 'Combine o treino por aqui, sem links ou contatos externos.';
  end if;
  if n ~* '\y(compre agora|ganhe dinheiro|renda extra|apostas?|cassino|namorar|nudes?)\y' then
    return 'Este chat é exclusivo para estudo. Não envie divulgação ou convites fora desse objetivo.';
  end if;
  return null;
end
$$;

-- Limpeza: mensagens vencidas (24 h) e, se o dono definiu o prazo, denúncias encerradas há mais que ele.
create or replace function public.dupla_chat_sweep() returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_dias integer;
begin
  delete from public.study_messages where expires_at <= now();
  select case when jsonb_typeof(c.value -> 'guarda_denuncia_dias') = 'number' then (c.value ->> 'guarda_denuncia_dias')::numeric::integer end
    into v_dias
    from public.app_settings c where c.key = 'treino_dupla_chat';
  if v_dias is not null and v_dias > 0 then
    delete from public.study_chat_reports r
     where r.status = 'encerrada' and r.closed_at < now() - make_interval(days => v_dias);
  end if;
end
$$;

-- A conversa, se a pessoa é um dos dois; senão recusa sem dizer se a conversa existe.
create or replace function public.dupla_chat_get(p_chat_id uuid, p_uid uuid) returns public.study_chats
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.study_chats;
begin
  select * into c from public.study_chats where id = p_chat_id and p_uid in (user_a, user_b);
  if not found then
    raise exception 'Faça um match antes de iniciar a conversa.' using errcode = '42501';
  end if;
  return c;
end
$$;

-- Resumo da conversa para quem pergunta (p_uid é um dos dois; quem chama já conferiu).
create or replace function public.dupla_chat_summary(p_chat public.study_chats, p_uid uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_partner uuid := case when p_chat.user_a = p_uid then p_chat.user_b else p_chat.user_a end;
  v_by_me boolean;
  v_by_them boolean;
begin
  v_by_me := v_partner is not null and exists (select 1 from public.study_chat_blocks b where b.blocker_id = p_uid and b.blocked_id = v_partner);
  v_by_them := v_partner is not null and exists (select 1 from public.study_chat_blocks b where b.blocker_id = v_partner and b.blocked_id = p_uid);
  return jsonb_build_object(
    'chat_id', p_chat.id,
    'partner', jsonb_build_object('user_id', v_partner, 'public_name', public.dupla_public_name(v_partner)),
    'last', (select jsonb_build_object('body', m.body, 'created_at', m.created_at, 'mine', coalesce(m.sender_id = p_uid, false))
               from public.study_messages m
              where m.chat_id = p_chat.id and m.expires_at > now()
              order by m.created_at desc, m.seq desc limit 1),
    'room_id', (select r.id from public.checklist_rooms r
                 where v_partner is not null and r.phase <> 'closed' and p_uid = any (r.member_ids) and v_partner = any (r.member_ids)
                 order by r.created_at desc limit 1),
    'blocked_by_me', v_by_me,
    'can_send', v_partner is not null and not v_by_me and not v_by_them
  );
end
$$;

-- Mensagem para a tela.
create or replace function public.dupla_chat_message(p_m public.study_messages, p_uid uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_m.id, 'body', p_m.body, 'created_at', p_m.created_at, 'expires_at', p_m.expires_at,
    'mine', coalesce(p_m.sender_id = p_uid, false),
    'author', public.dupla_public_name(p_m.sender_id)
  )
$$;

-- ---------------------------------------------------------------- 5) funções do app
-- Minhas conversas, a mais recente primeiro. → { chats: [resumo], server_now }
create or replace function public.app_dupla_chats() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
begin
  perform public.dupla_chat_sweep();
  return jsonb_build_object(
    'chats', coalesce((
      select jsonb_agg(public.dupla_chat_summary(c, v_uid) order by coalesce(m.last_at, c.created_at) desc, c.id)
        from public.study_chats c
        left join lateral (select max(x.created_at) as last_at from public.study_messages x
                            where x.chat_id = c.id and x.expires_at > now()) m on true
       where v_uid in (c.user_a, c.user_b)
    ), '[]'::jsonb),
    'server_now', clock_timestamp()
  );
end
$$;

-- A conversa com quem deu match comigo ("Enviar mensagem" no "Deu match!"). Sem match: recusa.
create or replace function public.app_dupla_chat_open(p_partner uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  c public.study_chats;
begin
  if p_partner is null or p_partner = v_uid or not exists (
       select 1 from public.study_matches m
        where (m.user_a = v_uid and m.user_b = p_partner) or (m.user_a = p_partner and m.user_b = v_uid)) then
    raise exception 'Faça um match antes de iniciar a conversa.' using errcode = '42501';
  end if;
  insert into public.study_chats (user_a, user_b) values (least(v_uid, p_partner), greatest(v_uid, p_partner))
  on conflict (user_a, user_b) do nothing;
  select * into c from public.study_chats where user_a = least(v_uid, p_partner) and user_b = greatest(v_uid, p_partner);
  perform public.dupla_chat_sweep();
  return public.dupla_chat_summary(c, v_uid);
end
$$;

-- Mensagens da conversa (as 200 mais recentes ainda visíveis; com p_since, só as mais novas que ele) e o tamanho máximo de
-- uma mensagem (da chave; nulo se a chave estiver estragada) para o contador da tela.
-- → { chat: resumo, messages: [{ id, body, created_at, expires_at, mine, author }], max, server_now }
create or replace function public.app_dupla_chat_messages(p_chat_id uuid, p_since timestamptz default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  c public.study_chats := public.dupla_chat_get(p_chat_id, v_uid);
begin
  perform public.dupla_chat_sweep();
  return jsonb_build_object(
    'chat', public.dupla_chat_summary(c, v_uid),
    'messages', coalesce((
      select jsonb_agg(public.dupla_chat_message(x, v_uid) order by x.created_at, x.seq)
        from (select * from public.study_messages m
               where m.chat_id = c.id and m.expires_at > now() and (p_since is null or m.created_at > p_since)
               order by m.created_at desc, m.seq desc limit 200) x
    ), '[]'::jsonb),
    'max', (select case when jsonb_typeof(k.value -> 'max') = 'number' then (k.value ->> 'max')::numeric::integer end
              from public.app_settings k where k.key = 'treino_dupla_chat'),
    'server_now', clock_timestamp()
  );
end
$$;

-- Enviar: filtro, bloqueio e limite de envios seguidos antes de gravar. Recusada: nada é gravado.
create or replace function public.app_dupla_chat_send(p_chat_id uuid, p_text text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  c public.study_chats := public.dupla_chat_get(p_chat_id, v_uid);
  v_partner uuid;
  v_reason text;
  s jsonb;
  m public.study_messages;
begin
  perform pg_advisory_xact_lock(hashtextextended('dupla-chat:' || c.id::text || ':' || v_uid::text, 0));
  perform public.dupla_chat_sweep();
  v_partner := case when c.user_a = v_uid then c.user_b else c.user_a end;
  if v_partner is not null and exists (select 1 from public.study_chat_blocks b where b.blocker_id = v_uid and b.blocked_id = v_partner) then
    raise exception 'Você bloqueou esta pessoa. Desbloqueie para enviar mensagens.' using errcode = '42501', hint = 'CHAT_BLOQUEADO';
  end if;
  if v_partner is null or exists (select 1 from public.study_chat_blocks b where b.blocker_id = v_partner and b.blocked_id = v_uid) then
    raise exception 'Esta conversa não aceita novas mensagens.' using errcode = '42501', hint = 'CHAT_FECHADO';
  end if;
  v_reason := public.dupla_chat_check(p_text);
  if v_reason is not null then
    raise exception '%', v_reason using errcode = '22023', hint = 'CHAT_FILTRO';
  end if;
  s := public.dupla_chat_settings();
  if (select count(*) from public.study_messages x
       where x.chat_id = c.id and x.sender_id = v_uid
         and x.created_at > now() - make_interval(secs => (s ->> 'janela_s')::numeric))
     >= (s ->> 'rajada')::numeric then
    raise exception 'Você enviou várias mensagens seguidas. Aguarde alguns segundos para continuar.' using errcode = '22023', hint = 'RATE_LIMITED';
  end if;
  insert into public.study_messages (chat_id, sender_id, body)
  values (c.id, v_uid, regexp_replace(p_text, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
  returning * into m;
  update public.study_chats set last_message_at = m.created_at where id = c.id;
  return public.dupla_chat_message(m, v_uid);
end
$$;

-- Bloquear ou desbloquear a outra pessoa (só no chat). → resumo da conversa
create or replace function public.app_dupla_chat_block(p_chat_id uuid, p_block boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  c public.study_chats := public.dupla_chat_get(p_chat_id, v_uid);
  v_partner uuid := case when c.user_a = v_uid then c.user_b else c.user_a end;
begin
  if p_block is null then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  if v_partner is not null then
    if p_block then
      insert into public.study_chat_blocks (blocker_id, blocked_id) values (v_uid, v_partner) on conflict do nothing;
    else
      delete from public.study_chat_blocks where blocker_id = v_uid and blocked_id = v_partner;
    end if;
  end if;
  return public.dupla_chat_summary(c, v_uid);
end
$$;

-- Denunciar a conversa à equipe: guarda a cópia das mensagens ainda visíveis. → { report_id, messages }
create or replace function public.app_dupla_chat_report(p_chat_id uuid, p_reason text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  c public.study_chats := public.dupla_chat_get(p_chat_id, v_uid);
  v_partner uuid := case when c.user_a = v_uid then c.user_b else c.user_a end;
  v_reason text := nullif(regexp_replace(coalesce(p_reason, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  v_copy jsonb;
  v_id uuid;
begin
  if char_length(v_reason) > 500 then
    raise exception 'Use até 500 caracteres para contar o que aconteceu.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dupla-chat-denuncia:' || c.id::text || ':' || v_uid::text, 0));
  if exists (select 1 from public.study_chat_reports r where r.chat_id = c.id and r.reporter_id = v_uid and r.status = 'aberta') then
    raise exception 'Você já denunciou esta conversa. A equipe vai analisar.' using errcode = '23505';
  end if;
  perform public.dupla_chat_sweep();
  select coalesce(jsonb_agg(jsonb_build_object(
           'autor', case when m.sender_id = v_uid then 'denunciante' when m.sender_id is null then 'conta_excluida' else 'denunciado' end,
           'nome', public.dupla_public_name(m.sender_id),
           'texto', m.body,
           'enviada_em', m.created_at) order by m.created_at, m.seq), '[]'::jsonb)
    into v_copy
    from public.study_messages m where m.chat_id = c.id and m.expires_at > now();
  insert into public.study_chat_reports (chat_id, reporter_id, reported_id, reporter_name, reported_name, reason, messages)
  values (c.id, v_uid, v_partner, public.dupla_public_name(v_uid), public.dupla_public_name(v_partner), v_reason, v_copy)
  returning id into v_id;
  return jsonb_build_object('report_id', v_id, 'messages', jsonb_array_length(v_copy));
end
$$;

-- "Abrir sala" no chat: a sala aberta do par (aceita o convite pendente para mim) ou uma nova, na fase dos papéis, sem estação,
-- com convite de 60 s ao parceiro. Não cria match. → { room_id }
create or replace function public.app_dupla_chat_room(p_chat_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  c public.study_chats := public.dupla_chat_get(p_chat_id, v_uid);
  v_partner uuid := case when c.user_a = v_uid then c.user_b else c.user_a end;
  me public.study_profiles;
  other public.study_profiles;
  r public.checklist_rooms;
  v_assign text;
  v_cand uuid;
  v_eval uuid;
  v_match uuid;
  v_room uuid;
begin
  if v_partner is null or exists (
       select 1 from public.study_chat_blocks b
        where (b.blocker_id = v_uid and b.blocked_id = v_partner) or (b.blocker_id = v_partner and b.blocked_id = v_uid)) then
    raise exception 'Não é possível abrir a sala por esta conversa.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dupla-par:' || least(v_uid, v_partner)::text || ':' || greatest(v_uid, v_partner)::text, 0));
  perform public.dupla_sweep();

  -- Já há sala aberta dos dois: entra nela (o convite pendente para mim vira aceito).
  select * into r from public.checklist_rooms x
   where x.phase <> 'closed' and v_uid = any (x.member_ids) and v_partner = any (x.member_ids)
   order by x.created_at desc limit 1;
  if found then
    if exists (select 1 from public.study_invites i where i.room_id = r.id and i.to_user = v_uid and i.status = 'pending') then
      update public.study_invites set status = 'accepted' where room_id = r.id and to_user = v_uid and status = 'pending';
      update public.checklist_rooms set rev = rev + 1 where id = r.id;
    end if;
    return jsonb_build_object('room_id', r.id);
  end if;

  if exists (select 1 from public.checklist_rooms x where x.phase <> 'closed' and v_uid = any (x.member_ids)) then
    raise exception 'Você já está em uma sala aberta. Saia dela antes de abrir outra.' using errcode = '42501';
  end if;
  if exists (select 1 from public.checklist_rooms x where x.phase <> 'closed' and v_partner = any (x.member_ids))
     or not public.dupla_allowed(v_partner) then
    raise exception 'Não foi possível abrir a sala agora. Combinem pelo chat e tentem de novo.' using errcode = '42501';
  end if;
  select * into me from public.study_profiles where user_id = v_uid;
  if not found then
    raise exception 'Crie seu perfil de estudo antes de procurar uma dupla.' using errcode = '22023';
  end if;
  select * into other from public.study_profiles where user_id = v_partner;
  if not found then
    raise exception 'Não foi possível abrir a sala agora. Combinem pelo chat e tentem de novo.' using errcode = '42501';
  end if;

  v_assign := public.dupla_assign(me.role_pref, other.role_pref);
  if v_assign = 'candidato' then
    v_cand := v_uid; v_eval := v_partner;
  elsif v_assign = 'ator' then
    v_cand := v_partner; v_eval := v_uid;
  end if;
  select m.id into v_match from public.study_matches m
   where (m.user_a = v_uid and m.user_b = v_partner) or (m.user_a = v_partner and m.user_b = v_uid)
   order by m.created_at desc limit 1;

  insert into public.checklist_rooms (member_ids, phase, round, match_id, station_id, candidate_id, evaluator_id)
  values (array[v_uid, v_partner], 'roles', 1, v_match, null, v_cand, v_eval)
  returning id into v_room;
  insert into public.study_invites (from_user, to_user, room_id) values (v_uid, v_partner, v_room);
  return jsonb_build_object('room_id', v_room);
end
$$;

-- ---------------------------------------------------------------- 6) equipe: denúncias e chave do chat
-- Lista das denúncias (sem as mensagens). → { items: [...], open }
create or replace function public.app_admin_dupla_chat_reports(p_status text default 'aberta') returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_staff();
  if p_status is null or p_status not in ('aberta', 'encerrada', 'todas') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  perform public.dupla_chat_sweep();
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'created_at', r.created_at, 'status', r.status, 'reporter_name', r.reporter_name,
               'reported_name', r.reported_name, 'reason', r.reason, 'message_count', jsonb_array_length(r.messages),
               'closed_at', r.closed_at) order by r.created_at desc)
        from public.study_chat_reports r
       where p_status = 'todas' or r.status = p_status
    ), '[]'::jsonb),
    'open', (select count(*) from public.study_chat_reports r where r.status = 'aberta')
  );
end
$$;

-- Uma denúncia com a cópia da conversa. Cada leitura entra no registro de ações.
create or replace function public.app_admin_dupla_chat_report(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  r public.study_chat_reports;
begin
  perform public.assert_staff();
  select * into r from public.study_chat_reports where id = p_id;
  if not found then
    raise exception 'Denúncia não encontrada.' using errcode = '22023';
  end if;
  perform public.admin_log('dupla.chat.denuncia.ler', r.id::text, '{}'::jsonb);
  return jsonb_build_object(
    'id', r.id, 'created_at', r.created_at, 'status', r.status, 'reporter_name', r.reporter_name,
    'reported_name', r.reported_name, 'reason', r.reason, 'messages', r.messages, 'team_note', r.team_note,
    'closed_at', r.closed_at
  );
end
$$;

-- Encerrar a denúncia (com anotação da equipe, opcional).
create or replace function public.app_admin_dupla_chat_report_close(p_id uuid, p_note text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_note text := nullif(regexp_replace(coalesce(p_note, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
begin
  perform public.assert_staff();
  if char_length(v_note) > 1000 then
    raise exception 'Use até 1000 caracteres na anotação.' using errcode = '22023';
  end if;
  update public.study_chat_reports
     set status = 'encerrada', closed_at = now(), closed_by = (select auth.uid()), team_note = v_note
   where id = p_id and status = 'aberta';
  if not found then
    raise exception 'Denúncia não encontrada ou já encerrada.' using errcode = '22023';
  end if;
  perform public.admin_log('dupla.chat.denuncia.encerrar', p_id::text, jsonb_build_object('anotacao', v_note is not null));
  return jsonb_build_object('id', p_id, 'status', 'encerrada');
end
$$;

-- Chave do chat (só administrador): palavras, tamanho máximo, limite de envios seguidos e prazo de guarda das denúncias.
create or replace function public.app_admin_save_dupla_chat(p_settings jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_palavras jsonb;
  v_max numeric;
  v_rajada numeric;
  v_janela numeric;
  v_guarda jsonb;
  v jsonb;
begin
  perform public.assert_admin();
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Configurações do chat inválidas.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_settings -> 'palavras') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p_settings -> 'palavras') e
                 where jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 1 and 40)
     or jsonb_array_length(p_settings -> 'palavras') > 200 then
    raise exception 'Lista de palavras inválida: até 200 palavras, cada uma com 1 a 40 caracteres.' using errcode = '22023';
  end if;
  -- (Cada valor só vira número depois de conferido o tipo: o banco não garante a ordem do "or".)
  v_max := case when jsonb_typeof(p_settings -> 'max') = 'number' then (p_settings ->> 'max')::numeric end;
  v_rajada := case when jsonb_typeof(p_settings -> 'rajada') = 'number' then (p_settings ->> 'rajada')::numeric end;
  v_janela := case when jsonb_typeof(p_settings -> 'janela_s') = 'number' then (p_settings ->> 'janela_s')::numeric end;
  if v_max is null or v_max <> trunc(v_max) or v_max not between 1 and 2000 then
    raise exception 'Tamanho máximo: um número inteiro de 1 a 2000.' using errcode = '22023';
  end if;
  if v_rajada is null or v_rajada <> trunc(v_rajada) or v_rajada not between 1 and 100
     or v_janela is null or v_janela <> trunc(v_janela) or v_janela not between 1 and 3600 then
    raise exception 'Limite de envios: de 1 a 100 mensagens em 1 a 3600 segundos.' using errcode = '22023';
  end if;
  v_guarda := coalesce(p_settings -> 'guarda_denuncia_dias', 'null'::jsonb);
  if v_guarda <> 'null'::jsonb then
    if jsonb_typeof(v_guarda) <> 'number' then
      raise exception 'Prazo de guarda das denúncias: vazio ou de 1 a 3650 dias.' using errcode = '22023';
    end if;
    if (v_guarda #>> '{}')::numeric <> trunc((v_guarda #>> '{}')::numeric) or (v_guarda #>> '{}')::numeric not between 1 and 3650 then
      raise exception 'Prazo de guarda das denúncias: vazio ou de 1 a 3650 dias.' using errcode = '22023';
    end if;
  end if;
  select jsonb_agg(distinct lower(btrim(e #>> '{}'))) into v_palavras from jsonb_array_elements(p_settings -> 'palavras') e;
  v := jsonb_build_object('palavras', coalesce(v_palavras, '[]'::jsonb), 'max', v_max::integer, 'rajada', v_rajada::integer,
                          'janela_s', v_janela::integer, 'guarda_denuncia_dias', v_guarda);
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('treino_dupla_chat', v, now(), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  perform public.admin_log('dupla.chat.save', null, v - 'palavras' || jsonb_build_object('palavras', jsonb_array_length(v -> 'palavras')));
  return v;
end
$$;

-- ---------------------------------------------------------------- 7) tempo real e limpeza agendada
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'study_messages') then
    alter publication supabase_realtime add table public.study_messages;
  end if;
end
$$;

-- Só se o pg_cron já estiver ligado no banco (não liga a extensão). Sem ele, a limpeza acontece em cada chamada do chat.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'treino-dupla-chat-limpeza';
    perform cron.schedule('treino-dupla-chat-limpeza', '*/30 * * * *', 'select public.dupla_chat_sweep()');
  end if;
exception when others then
  raise notice 'Treino em Dupla: a limpeza agendada do chat não foi criada (%); a limpeza segue acontecendo em cada uso do chat.', sqlerrm;
end
$$;

-- ---------------------------------------------------------------- 8) conta: exportação dos dados
-- O que o chat guarda da pessoa: as mensagens dela ainda visíveis, os bloqueios que ela fez e as denúncias que ela enviou
-- (sem a cópia das mensagens). Visitante: nulo.
create or replace function public.dupla_export_chat() returns jsonb
  language sql stable security definer set search_path = ''
as $$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'chat_id', m.chat_id, 'body', m.body,
                                                              'created_at', m.created_at, 'expires_at', m.expires_at)
                                           order by m.created_at, m.seq)
                            from public.study_messages m where m.sender_id = (select auth.uid()) and m.expires_at > now()), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('blocked_id', b.blocked_id, 'created_at', b.created_at) order by b.created_at)
                          from public.study_chat_blocks b where b.blocker_id = (select auth.uid())), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'chat_id', r.chat_id, 'reason', r.reason, 'status', r.status,
                                                             'created_at', r.created_at) order by r.created_at)
                           from public.study_chat_reports r where r.reporter_id = (select auth.uid())), '[]'::jsonb)
  ) end
$$;

-- Base: 013340 (igual, mais "study_chat" no fim).
create or replace function public.app_export_my_data() returns jsonb
  language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object('id', (select auth.uid())),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'role', public.current_app_role(),
    'subscription', (select to_jsonb(s) - 'provider_customer_id' - 'provider_subscription_id'
                     from public.subscriptions s where s.user_id = (select auth.uid())),
    'practice_sessions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.started_at), '[]'::jsonb)
                          from public.practice_sessions t where t.user_id = (select auth.uid())),
    'question_attempts', (select coalesce(jsonb_agg(to_jsonb(t) - 'seq' order by t.seq), '[]'::jsonb)
                          from public.question_attempts t where t.user_id = (select auth.uid())),
    'question_bookmarks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                           from public.question_bookmarks t where t.user_id = (select auth.uid())),
    'error_notes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at), '[]'::jsonb)
                    from public.error_notes t where t.user_id = (select auth.uid())),
    'plan_tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.day, t.position), '[]'::jsonb)
                   from public.plan_tasks t where t.user_id = (select auth.uid())),
    'flashcards', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                   from public.flashcards t where t.owner_id = (select auth.uid())),
    'flashcard_states', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                         from public.flashcard_states t where t.user_id = (select auth.uid())),
    'flashcard_reviews', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb)
                          from public.flashcard_reviews t where t.user_id = (select auth.uid())),
    'checklist_favorites', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                            from public.checklist_favorites t where t.user_id = (select auth.uid())),
    'checklist_station_reports', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                  from public.checklist_station_reports t where t.user_id = (select auth.uid())),
    'checklist_event_confirmations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                      from public.checklist_event_confirmations t where t.user_id = (select auth.uid())),
    'checklist_study_sessions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                                 from public.checklist_study_sessions t
                                 where t.actor_id = (select auth.uid()) or t.doctor_id = (select auth.uid())),
    'study_profile', (select to_jsonb(t) from public.study_profiles t where t.user_id = (select auth.uid())),
    'study_swipes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
                     from public.study_swipes t where t.from_user = (select auth.uid())),
    -- sem station_id: o tema da estação não sai pela exportação (a coluna nem é legível pelo aluno, 013300)
    'study_matches', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'user_a', t.user_a, 'user_b', t.user_b,
                                                                   'room_id', t.room_id, 'created_at', t.created_at)
                                                order by t.created_at), '[]'::jsonb)
                      from public.study_matches t where (select auth.uid()) in (t.user_a, t.user_b)),
    'checklist_rooms', public.dupla_export_rooms(),
    'acceptances', (select coalesce(jsonb_agg(jsonb_build_object('document', t.document, 'version', t.version,
                                                                  'accepted_at', t.accepted_at, 'origin', t.origin,
                                                                  'user_agent', t.user_agent)
                                              order by t.accepted_at, t.id), '[]'::jsonb)
                    from public.legal_acceptances t where t.user_id = (select auth.uid())),
    'declarations', (select coalesce(jsonb_agg(jsonb_build_object('document', a.document, 'version', a.version,
                                                                   'adult', d.adult, 'physician', d.physician, 'declared_at', d.declared_at)
                                               order by d.declared_at, a.id), '[]'::jsonb)
                     from public.legal_declarations d join public.legal_acceptances a on a.id = d.acceptance_id
                     where a.user_id = (select auth.uid())),
    'study_chat', public.dupla_export_chat()
  )
  where (select auth.uid()) is not null
$$;

-- ---------------------------------------------------------------- permissões
-- As do app: só quem entra (visitante não); o porteiro (dupla_assert_access, assert_staff, assert_admin) barra o resto.
revoke execute on function public.app_dupla_chats() from public, anon;
revoke execute on function public.app_dupla_chat_open(uuid) from public, anon;
revoke execute on function public.app_dupla_chat_messages(uuid, timestamptz) from public, anon;
revoke execute on function public.app_dupla_chat_send(uuid, text) from public, anon;
revoke execute on function public.app_dupla_chat_block(uuid, boolean) from public, anon;
revoke execute on function public.app_dupla_chat_report(uuid, text) from public, anon;
revoke execute on function public.app_dupla_chat_room(uuid) from public, anon;
revoke execute on function public.app_admin_dupla_chat_reports(text) from public, anon;
revoke execute on function public.app_admin_dupla_chat_report(uuid) from public, anon;
revoke execute on function public.app_admin_dupla_chat_report_close(uuid, text) from public, anon;
revoke execute on function public.app_admin_save_dupla_chat(jsonb) from public, anon;
-- As de apoio: só dentro das funções do servidor.
revoke execute on function public.dupla_chat_normalize(text) from public, anon, authenticated;
revoke execute on function public.dupla_chat_settings() from public, anon, authenticated;
revoke execute on function public.dupla_chat_check(text) from public, anon, authenticated;
revoke execute on function public.dupla_chat_sweep() from public, anon, authenticated;
revoke execute on function public.dupla_chat_get(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_chat_summary(public.study_chats, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_chat_message(public.study_messages, uuid) from public, anon, authenticated;
revoke execute on function public.dupla_chat_from_match() from public, anon, authenticated;
-- A exportação roda com os direitos de quem chama (como dupla_export_rooms na 013340).
revoke execute on function public.dupla_export_chat() from public;
grant execute on function public.dupla_export_chat() to anon, authenticated;
