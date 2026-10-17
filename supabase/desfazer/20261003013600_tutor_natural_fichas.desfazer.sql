-- Desfaz supabase/migrations/20261003013600_tutor_natural_fichas.sql (abertura e passagem criadas pela IA).
-- Volta ao desenho de antes: a abertura e a passagem ficam só nas falas sorteadas em SQL (openings / lines).
-- Desfaça também no servidor (server/tutor/opening.ts): sem estas funções, o servidor só registra no log e mantém a reserva.
-- NÃO desfaz: as falas já trocadas nas conversas antigas continuam com o texto da IA (a reserva ficou em meta.reserve, se precisar).

drop function if exists public.ch_worker_tutor_passage_prep_save(uuid, uuid, text, text, jsonb);
drop function if exists public.ch_worker_tutor_passage_prep_state(uuid, uuid);
drop function if exists public.ch_worker_tutor_claim_opening(uuid, uuid, bigint);
drop table if exists public.tutor_natural_prep;
drop function if exists public.ch_worker_tutor_voice_opening_save(uuid, uuid, text);
drop function if exists public.ch_worker_tutor_voice_openings(uuid, uuid);
drop function if exists public.ch_worker_tutor_set_opening(uuid, uuid, bigint, text, jsonb, jsonb);
drop function if exists public.ch_worker_tutor_opening_state(uuid, uuid);
drop table if exists public.tutor_recent_openings;

-- limite de frequência: volta aos 4 tipos da migração 012800 (as linhas do tipo novo saem antes da trava)
delete from public.tutor_rate_limits where bucket = 'tutor_opening';
alter table public.tutor_rate_limits drop constraint if exists tutor_rate_limits_bucket_check;
alter table public.tutor_rate_limits add constraint tutor_rate_limits_bucket_check
  check (bucket in ('voice_tool', 'voice_eval', 'voice_delegate', 'voice_transcript'));
-- a função ch_worker_tutor_rate_hit volta exatamente como na migração 012800:
create or replace function public.ch_worker_tutor_rate_hit(p_user uuid, p_bucket text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_limits jsonb;
  r public.tutor_rate_limits;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_min integer;
  v_day integer;
begin
  if p_bucket is null or p_bucket not in ('voice_tool', 'voice_eval', 'voice_delegate', 'voice_transcript') then
    raise exception 'Limite desconhecido.' using errcode = '22023';
  end if;
  v_limits := '{"voice_tool_per_minute": 30, "voice_tool_per_day": 600, "voice_eval_per_minute": 4, "voice_eval_per_day": 60,
                "voice_delegate_per_minute": 15, "voice_delegate_per_day": 600, "voice_transcript_per_minute": 40, "voice_transcript_per_day": 1500}'::jsonb
              || coalesce((select c.voice_rate_limits from public.tutor_config c), '{}'::jsonb);
  v_min := greatest(0, (v_limits ->> (p_bucket || '_per_minute'))::integer);
  v_day := greatest(0, (v_limits ->> (p_bucket || '_per_day'))::integer);
  insert into public.tutor_rate_limits (user_id, bucket) values (p_user, p_bucket) on conflict (user_id, bucket) do nothing;
  select * into r from public.tutor_rate_limits where user_id = p_user and bucket = p_bucket for update;
  if r.minute_start <= now() - interval '60 seconds' then r.minute_start := now(); r.minute_hits := 0; end if;
  if r.day <> v_today then r.day := v_today; r.day_hits := 0; end if;
  if r.minute_hits >= v_min or r.day_hits >= v_day then
    update public.tutor_rate_limits set minute_start = r.minute_start, minute_hits = r.minute_hits, day = r.day, day_hits = r.day_hits
     where user_id = p_user and bucket = p_bucket;
    return jsonb_build_object('ok', false, 'reason', case when r.day_hits >= v_day then 'per_day' else 'per_minute' end,
      'retry_after_s', case when r.day_hits >= v_day then null
                            else greatest(1, ceil(extract(epoch from (r.minute_start + interval '60 seconds' - now()))))::int end);
  end if;
  update public.tutor_rate_limits set minute_start = r.minute_start, minute_hits = r.minute_hits + 1, day = r.day, day_hits = r.day_hits + 1
   where user_id = p_user and bucket = p_bucket;
  return jsonb_build_object('ok', true);
end
$$;
revoke execute on function public.ch_worker_tutor_rate_hit(uuid, text) from public, anon, authenticated;
