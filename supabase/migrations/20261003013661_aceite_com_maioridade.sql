-- =============================================================================
-- 013661 — Aceite com a maioridade numa caixa só; sem a declaração de médico(a) (decisão do dono, 17/10/2026 à noite).
--
-- Antes (Termo 2.0, migrações …11500/…11510): o aceite exigia duas caixas separadas, "Declaro que tenho 18 anos ou mais." e
-- "Declaro que sou médico(a), com a graduação em Medicina concluída.", e as duas ficavam gravadas em legal_declarations.
-- Agora: uma caixa só, obrigatória: "Li e aceito os Termos de Uso e a Política de Privacidade e declaro ter 18 anos ou mais."
--   * legal_record (7 parâmetros): com a versão que exige as declarações, basta a MAIORIDADE (p_adult); a de médico não é mais
--     exigida. A prova grava adult = true e physician = true só se vier (senão nulo);
--   * legal_declarations.physician passa a aceitar nulo (quem já declarou continua com true; nada é apagado);
--   * tutor_adult_declared (…11900, níveis N3/N4 da Durona/Durão): passa a olhar só a maioridade (adult), não mais adult E physician.
--     Quem já tinha as duas declarações continua com N3/N4; quem nunca declarou a maioridade continua sem. A mensagem de recusa de
--     app_tutor_save_explosiva_preferences deixa de falar em "médico";
--   * requires_declarations / declarations_required continuam com o mesmo nome e formato, agora querendo dizer "a versão vigente
--     exige a declaração de maioridade, que vem na própria caixa do aceite" (o site não mostra mais caixas separadas).
-- Sem mudança de assinatura: handle_new_user, app_accept_terms e app_accept_terms_declared seguem iguais (p_physician continua
-- existindo e pode vir false/nulo).
--
-- Técnica: remendo da versão QUE ESTÁ NO BANCO (pg_get_functiondef + replace), sem reescrever a partir de cópia antiga. Para cada
-- trecho: se o antigo existe, troca; se já está trocado, não faz nada; se não há nem um nem outro, PARA com erro e nada muda (a
-- função no banco é diferente da esperada). Pode ser colada de novo sem estragar nada. SECURITY DEFINER e search_path = '' vêm da
-- própria função (não mudam).
--
-- ORDEM: colar DEPOIS da 20261003013660_cadastro_sem_whatsapp.sql e ANTES de publicar o site com a caixa única.
-- Desfazer: supabase/desfazer/20261003013661_aceite_com_maioridade.desfazer.sql
-- =============================================================================

do $remendo$
declare
  f record;
  v_def text;
  v_novo text;
begin
  if to_regclass('public.legal_declarations') is null or to_regprocedure('public.legal_record(uuid, text, text, text, text, boolean, boolean)') is null
     or to_regprocedure('public.tutor_adult_declared(uuid)') is null
     or to_regprocedure('public.app_tutor_save_explosiva_preferences(text, boolean, boolean)') is null then
    raise exception 'aceite com maioridade: falta a estrutura do Termo 2.0 (…11500) ou do Tutor (…11900); nada foi mudado';
  end if;

  -- 1) confere TODOS os trechos antes de mudar qualquer coisa
  for f in
    select * from (values
      ('public.legal_record(uuid, text, text, text, text, boolean, boolean)'::text,
       'if v_requires and not (coalesce(p_adult, false) and coalesce(p_physician, false)) then'::text,
       'if v_requires and not coalesce(p_adult, false) then'::text, 1),
      ('public.legal_record(uuid, text, text, text, text, boolean, boolean)',
       '''Confirme que você tem 18 anos ou mais e que é médico(a).''',
       '''Confirme que você tem 18 anos ou mais.''', 2),
      ('public.legal_record(uuid, text, text, text, text, boolean, boolean)',
       'if v_id is not null and coalesce(p_adult, false) and coalesce(p_physician, false) then',
       'if v_id is not null and coalesce(p_adult, false) then', 3),
      ('public.legal_record(uuid, text, text, text, text, boolean, boolean)',
       'values (v_id, true, true)',
       'values (v_id, true, case when coalesce(p_physician, false) then true end)', 4),
      ('public.tutor_adult_declared(uuid)',
       'and d.adult and d.physician)',
       'and d.adult)', 5),
      ('public.app_tutor_save_explosiva_preferences(text, boolean, boolean)',
       'com a declaração de maioridade e de médico.''',
       'com a declaração de maioridade.''', 6)
    ) as x(fn, de, para, ordem) order by ordem
  loop
    v_def := pg_get_functiondef(to_regprocedure(f.fn));
    if position(f.de in v_def) = 0 and position(f.para in v_def) = 0 then
      raise exception 'aceite com maioridade: % no banco é diferente da esperada (trecho %); nada foi mudado', f.fn, f.ordem;
    end if;
  end loop;

  -- 2) troca, função por função (cada uma recriada uma vez, com todos os trechos dela)
  for f in select x.fn from (values ('public.legal_record(uuid, text, text, text, text, boolean, boolean)'), ('public.tutor_adult_declared(uuid)'),
                                     ('public.app_tutor_save_explosiva_preferences(text, boolean, boolean)')) as x(fn)
  loop
    v_def := pg_get_functiondef(to_regprocedure(f.fn));
    v_novo := v_def;
    v_novo := replace(v_novo, 'if v_requires and not (coalesce(p_adult, false) and coalesce(p_physician, false)) then', 'if v_requires and not coalesce(p_adult, false) then');
    v_novo := replace(v_novo, '''Confirme que você tem 18 anos ou mais e que é médico(a).''', '''Confirme que você tem 18 anos ou mais.''');
    v_novo := replace(v_novo, 'if v_id is not null and coalesce(p_adult, false) and coalesce(p_physician, false) then', 'if v_id is not null and coalesce(p_adult, false) then');
    v_novo := replace(v_novo, 'values (v_id, true, true)', 'values (v_id, true, case when coalesce(p_physician, false) then true end)');
    v_novo := replace(v_novo, 'and d.adult and d.physician)', 'and d.adult)');
    v_novo := replace(v_novo, 'com a declaração de maioridade e de médico.''', 'com a declaração de maioridade.''');
    if v_novo <> v_def then
      execute v_novo;
    end if;
  end loop;

  -- 3) conferência final
  if position('p_physician, false)) then' in pg_get_functiondef(to_regprocedure('public.legal_record(uuid, text, text, text, text, boolean, boolean)'))) > 0
     or position('d.physician' in pg_get_functiondef(to_regprocedure('public.tutor_adult_declared(uuid)'))) > 0 then
    raise exception 'aceite com maioridade: alguma função ainda exige a declaração de médico(a)';
  end if;
end
$remendo$;

-- a prova: physician pode ficar vazio (só "sim" ou nada); adult continua obrigatório e só "sim"
alter table public.legal_declarations alter column physician drop not null;
alter table public.legal_declarations drop constraint if exists legal_declarations_physician_check;
alter table public.legal_declarations add constraint legal_declarations_physician_check check (physician is null or physician);

comment on table public.legal_declarations is
  'Declarações feitas junto do aceite. adult = 18 anos ou mais (obrigatória quando a versão exige). physician = formação em Medicina: '
  'gravada até 17/10/2026; desde então não é mais pedida e fica nula. Uma por aceite. Gravada só por legal_record (servidor).';
comment on column public.legal_versions.requires_declarations is
  'A versão vigente exige a declaração de maioridade (18+) junto do aceite, na própria caixa do aceite. Desde 17/10/2026 não exige mais a de formação em Medicina.';
