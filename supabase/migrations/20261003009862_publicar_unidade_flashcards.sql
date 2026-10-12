-- Central de Conteúdo: Publicar também leva os flashcards da unidade ao baralho StaziaMed de todos os alunos (CC02, etapa 2).
-- Fase 1 do gerenciamento (grupo B), 12/10/2026. Vem DEPOIS da 20261003009861 (que traz a aula e os ganchos que esta migração preenche).
-- Pode ser colada duas ou três vezes.
--
--  * Cartão da Central = flashcards com dono nulo (baralho oficial), revisão "medical_reviewed", ligado à unidade, com uma chave
--    (frente e verso sem diferença de espaços ou de maiúsculas). Cartão igual na versão nova = o MESMO cartão (a agenda de revisão
--    de cada aluno fica). Cartão que saiu da unidade é escondido, não apagado; volta com a agenda se a unidade o trouxer de novo.
--  * Cartão escondido não conta nos vencidos do aluno nem trava o "fila zerada": a data de revisão dele é guardada e a data visível
--    vira "infinity" até o cartão voltar (hidden_due).
--  * Aluno nunca edita nem apaga cartão da Central (as políticas só dão isso ao dono do cartão).
--  * Trava de publicação: frente e verso preenchidos e dentro dos limites do cartão (2.000 e 4.000 caracteres).
-- Partes: ganchos ch_cards_plan, ch_distribute_cards, ch_hide_cards, ch_publish_problems_cards (criados vazios na 9861).

alter table public.flashcards add column if not exists ch_unit_id uuid references public.ch_units (id) on delete restrict;
alter table public.flashcards add column if not exists ch_version_id uuid references public.ch_unit_versions (id);
alter table public.flashcards add column if not exists ch_card_key text;
alter table public.flashcards drop constraint if exists flashcards_central_check;
alter table public.flashcards add constraint flashcards_central_check check (ch_unit_id is null or owner_id is null);
alter table public.flashcards drop constraint if exists flashcards_central_key_check;
alter table public.flashcards add constraint flashcards_central_key_check check ((ch_unit_id is null) = (ch_card_key is null));
create unique index if not exists flashcards_ch_card_uidx on public.flashcards (ch_unit_id, ch_card_key) where ch_unit_id is not null;
alter table public.flashcard_states add column if not exists hidden_due timestamptz;

-- Cartões da versão, sem repetição (mesma frente e verso = um cartão só), na ordem do material.
create or replace function public.ch_version_cards(p_version_id uuid) returns table (pos integer, front text, back text, card_key text)
  language sql stable security definer set search_path = ''
as $$
  select row_number() over (order by min(x.o))::integer, (array_agg(x.f order by x.o))[1], (array_agg(x.b order by x.o))[1], x.k
  from (
    select o, btrim(coalesce(c ->> 'front', '')) as f, btrim(coalesce(c ->> 'back', '')) as b,
           public.ch_hash(jsonb_build_array(lower(regexp_replace(btrim(coalesce(c ->> 'front', '')), '\s+', ' ', 'g')),
                                            lower(regexp_replace(btrim(coalesce(c ->> 'back', '')), '\s+', ' ', 'g')))) as k
    from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'cards', '[]'::jsonb)) with ordinality as t (c, o)
    where m.unit_version_id = p_version_id and m.kind = 'flashcards'
  ) x
  where x.f <> '' and x.b <> ''
  group by x.k
$$;
revoke execute on function public.ch_version_cards(uuid) from public, anon, authenticated;

create or replace function public.ch_cards_plan(p_version_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_unit uuid;
  v_total integer;
  v_kept integer;
  v_hidden integer;
begin
  select unit_id into v_unit from public.ch_unit_versions where id = p_version_id;
  select count(*)::int, count(*) filter (where exists (select 1 from public.flashcards f where f.ch_unit_id = v_unit and f.ch_card_key = c.card_key))::int
    into v_total, v_kept from public.ch_version_cards(p_version_id) c;
  select count(*)::int into v_hidden from public.flashcards f
   where f.ch_unit_id = v_unit and f.published and not exists (select 1 from public.ch_version_cards(p_version_id) c where c.card_key = f.ch_card_key);
  return jsonb_build_object('added', v_total - v_kept, 'kept', v_kept, 'hidden', v_hidden, 'total', v_total);
end
$$;

create or replace function public.ch_hide_card_rows(p_ids uuid[]) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.flashcards set published = false where id = any (p_ids) and published;
  get diagnostics n = row_count;
  -- a data de revisão de cada aluno fica guardada; a visível vira "infinity" (não conta como vencido)
  update public.flashcard_states set hidden_due = due, due = 'infinity' where card_id = any (p_ids) and hidden_due is null and due <> 'infinity';
  return n;
end
$$;
revoke execute on function public.ch_hide_card_rows(uuid[]) from public, anon, authenticated;

create or replace function public.ch_distribute_cards(p_version_id uuid, p_lesson_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v public.ch_unit_versions;
  l public.lessons;
  c record;
  f public.flashcards;
  v_added integer := 0;
  v_kept integer := 0;
  v_hidden integer;
  v_total integer := 0;
  v_gone uuid[];
begin
  select * into v from public.ch_unit_versions where id = p_version_id;
  select * into l from public.lessons where id = p_lesson_id;
  for c in select * from public.ch_version_cards(p_version_id) order by pos loop
    v_total := v_total + 1;
    select * into f from public.flashcards x where x.ch_unit_id = v.unit_id and x.ch_card_key = c.card_key for update;
    if found then
      -- o texto do cartão igual não muda (só difere em espaços ou maiúsculas)
      update public.flashcards set area = l.area, topic = l.topic, ch_version_id = v.id, published = true, review_status = 'medical_reviewed'
       where id = f.id;
      -- cartão que volta: a data de revisão de cada aluno também volta
      update public.flashcard_states set due = hidden_due, hidden_due = null where card_id = f.id and hidden_due is not null;
      v_kept := v_kept + 1;
    else
      insert into public.flashcards (owner_id, area, topic, front, back, review_status, published, ch_unit_id, ch_version_id, ch_card_key)
      values (null, l.area, l.topic, c.front, c.back, 'medical_reviewed', true, v.unit_id, v.id, c.card_key);
      v_added := v_added + 1;
    end if;
  end loop;
  select coalesce(array_agg(x.id), '{}') into v_gone from public.flashcards x
   where x.ch_unit_id = v.unit_id and x.published and not exists (select 1 from public.ch_version_cards(p_version_id) k where k.card_key = x.ch_card_key);
  v_hidden := public.ch_hide_card_rows(v_gone);
  return jsonb_build_object('added', v_added, 'kept', v_kept, 'hidden', v_hidden, 'total', v_total);
end
$$;

-- Retirar a unidade: os cartões da versão no ar saem do baralho (nada é apagado).
create or replace function public.ch_hide_cards(p_version_id uuid) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(f.id), '{}') into v_ids from public.flashcards f
   join public.ch_unit_versions v on v.unit_id = f.ch_unit_id
   where v.id = p_version_id and f.ch_version_id = p_version_id and f.published;
  return public.ch_hide_card_rows(v_ids);
end
$$;

create or replace function public.ch_publish_problems_cards(p_version_id uuid) returns text[]
  language plpgsql stable security definer set search_path = ''
as $$
declare
  p text[] := '{}';
  r record;
begin
  if exists (select 1 from public.ch_materials m, jsonb_array_elements(coalesce(m.content -> 'cards', '[]'::jsonb)) c
             where m.unit_version_id = p_version_id and m.kind = 'flashcards' and (btrim(coalesce(c ->> 'front', '')) = '' or btrim(coalesce(c ->> 'back', '')) = '')) then
    p := array_append(p, 'Há flashcard sem frente ou sem verso.');
  end if;
  for r in select c.front, c.back from public.ch_version_cards(p_version_id) c where char_length(c.front) > 2000 or char_length(c.back) > 4000 loop
    p := array_append(p, 'Flashcard grande demais (frente até 2.000 e verso até 4.000 caracteres): ' || left(r.front, 60));
  end loop;
  return p;
end
$$;

-- ---------------------------------------------------------------- 99. Permissões
revoke execute on function public.ch_cards_plan(uuid) from public, anon, authenticated;
revoke execute on function public.ch_distribute_cards(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ch_hide_cards(uuid) from public, anon, authenticated;
revoke execute on function public.ch_publish_problems_cards(uuid) from public, anon, authenticated;
