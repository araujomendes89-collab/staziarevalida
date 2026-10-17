-- DESFAZER o aceite com a maioridade numa caixa só (supabase/migrations/20261003013661_aceite_com_maioridade.sql).
-- Volta a exigir as DUAS declarações (18+ e médico) no aceite da versão que pede declarações e volta os níveis N3/N4 do Tutor a
-- exigir as duas. Mesmo remendo (pg_get_functiondef + replace) na versão que está no banco. Pode ser colado de novo.
-- ATENÇÃO: só desfazer junto com a volta do site que mostra as duas caixas; com o site de uma caixa só, ninguém conseguiria aceitar.
-- As provas gravadas sem a declaração de médico (physician nulo) NÃO são apagadas nem inventadas: enquanto existir alguma, a coluna
-- continua aceitando nulo (aviso abaixo); essas pessoas ficam sem N3/N4 até aceitarem de novo com as duas caixas.

do $desfazer$
declare
  f record;
  v_def text;
  v_novo text;
begin
  for f in select x.fn from (values ('public.legal_record(uuid, text, text, text, text, boolean, boolean)'), ('public.tutor_adult_declared(uuid)'),
                                     ('public.app_tutor_save_explosiva_preferences(text, boolean, boolean)')) as x(fn)
  loop
    if to_regprocedure(f.fn) is null then continue; end if;
    v_def := pg_get_functiondef(to_regprocedure(f.fn));
    v_novo := v_def;
    v_novo := replace(v_novo, 'if v_requires and not coalesce(p_adult, false) then', 'if v_requires and not (coalesce(p_adult, false) and coalesce(p_physician, false)) then');
    v_novo := replace(v_novo, '''Confirme que você tem 18 anos ou mais.''', '''Confirme que você tem 18 anos ou mais e que é médico(a).''');
    v_novo := replace(v_novo, 'if v_id is not null and coalesce(p_adult, false) then', 'if v_id is not null and coalesce(p_adult, false) and coalesce(p_physician, false) then');
    v_novo := replace(v_novo, 'values (v_id, true, case when coalesce(p_physician, false) then true end)', 'values (v_id, true, true)');
    v_novo := replace(v_novo, 'and d.adult)', 'and d.adult and d.physician)');
    v_novo := replace(v_novo, 'com a declaração de maioridade.''', 'com a declaração de maioridade e de médico.''');
    if v_novo <> v_def then
      execute v_novo;
    end if;
  end loop;

  if to_regclass('public.legal_declarations') is not null then
    if exists (select 1 from public.legal_declarations where physician is null) then
      raise notice 'desfazer 013661: há aceites gravados sem a declaração de médico; a coluna physician continua aceitando nulo';
    else
      alter table public.legal_declarations drop constraint if exists legal_declarations_physician_check;
      alter table public.legal_declarations alter column physician set not null;
      alter table public.legal_declarations add constraint legal_declarations_physician_check check (physician);
    end if;
  end if;
end
$desfazer$;

comment on table public.legal_declarations is
  'Declarações feitas junto do aceite (maioridade e formação em Medicina). Uma por aceite. Gravada só por legal_record (servidor).';
comment on column public.legal_versions.requires_declarations is
  'A versão vigente exige as declarações de maioridade (18+) e de formação em Medicina junto do aceite (Termo 2.0 em diante).';
