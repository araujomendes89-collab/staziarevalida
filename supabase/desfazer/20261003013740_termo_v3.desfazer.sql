-- DESFAZER os textos legais 3.0 (supabase/migrations/20261003013740_termo_v3.sql). Pode ser colado de novo.
--
-- O que volta: o Termo de Aceite e Uso 2.0 fica vigente de novo (com a declaração de maioridade na caixa, como hoje); a tela de aceite
-- volta a pedir o 2.0 só para quem ainda não o aceitou; o site novo, sem as funções app_legal_*, volta a mostrar os textos 2.0 que ele
-- mesmo traz (páginas /novo/termos e /novo/privacidade; /novo/regulamento avisa que o Regulamento ainda não vale).
-- O que NÃO é apagado: nenhum aceite (quem aceitou o 3.0 continua com a prova, com IP e código do texto), a tabela legal_texts com os
-- textos publicados e as colunas novas da prova. Colar a migração 013740 de novo religa o 3.0 com os mesmos textos.
-- Quem aceitou só o 3.0 (conta criada enquanto ele valia) verá a tela de aceite do 2.0 no próximo acesso.

update public.legal_versions set version = '2.0', requires_declarations = true where document = 'termo_uso';
delete from public.legal_versions where document in ('politica_privacidade', 'regulamento');

-- a prova volta a ser gravada como antes (sem carimbo e sem a trava de alteração)
drop trigger if exists legal_acceptances_carimbo on public.legal_acceptances;
drop trigger if exists legal_acceptances_imutavel on public.legal_acceptances;

-- funções do site: sem elas, o site usa os textos 2.0 que ele mesmo traz
drop function if exists public.app_legal_current();
drop function if exists public.app_legal_text(text, text);
drop function if exists public.app_my_legal_documents();
drop function if exists public.app_legal_cadastro_ip(uuid);

-- dados de abertura: a regra de antes (…11500 com o remendo da …13660): tela de aceite = aluno sem o aceite da versão vigente
create or replace function public.app_legal_state() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user constant uuid := (select auth.uid());
  v_docs jsonb;
  v_student boolean;
  v_phone_missing boolean;
  v_requires boolean;
begin
  if v_user is null then
    return null;
  end if;

  select jsonb_object_agg(v.document, jsonb_build_object('current', v.version, 'accepted', a.version, 'accepted_at', a.accepted_at))
    into v_docs
  from public.legal_versions v
  left join lateral (
    select x.version, x.accepted_at
    from public.legal_acceptances x
    where x.user_id = v_user and x.document = v.document
    order by (x.version = v.version) desc, x.accepted_at desc, x.id desc
    limit 1
  ) a on true;

  v_student := public.legal_is_student(v_user);
  v_phone_missing := not exists (select 1 from public.profiles p where p.id = v_user and p.phone is not null);
  v_requires := coalesce((select v.requires_declarations from public.legal_versions v where v.document = 'termo_uso'), false);

  -- O aceite da versão que exige as declarações só existe com elas (legal_record), então "aceitou a vigente" já basta para a tela.
  return jsonb_build_object(
    'termo_uso', v_docs -> 'termo_uso',
    'tutor_ia', v_docs -> 'tutor_ia',
    'student', v_student,
    'phone_missing', v_phone_missing,
    'gate_required', v_student and ((v_docs #>> '{termo_uso,accepted}') is distinct from (v_docs #>> '{termo_uso,current}'))
  ) || case when v_requires then jsonb_build_object('declarations_required', true) else '{}'::jsonb end;
end
$$;

-- conferência
do $confere$
begin
  if (select version from public.legal_versions where document = 'termo_uso') <> '2.0'
     or to_regprocedure('public.app_legal_current()') is not null
     or position('not v_valid' in pg_get_functiondef('public.app_legal_state()'::regprocedure)) > 0 then
    raise exception 'desfazer 013740: não voltou ao 2.0';
  end if;
end
$confere$;
