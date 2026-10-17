-- DESFAZER o cadastro sem WhatsApp (supabase/migrations/20261003013660_cadastro_sem_whatsapp.sql).
-- Volta a regra de antes na abertura do app: o aluno sem WhatsApp vê a tela de aceite até informar o número
--     gate_required = aluno e (Termo vigente não aceito  OU  WhatsApp vazio)
-- Mesmo remendo (pg_get_functiondef + replace) na versão que está no banco. Pode ser colado de novo sem estragar nada.
-- ATENÇÃO: só desfazer junto com a volta do site que PEDE o WhatsApp no cadastro e na tela de aceite; com o site sem o campo,
-- o aluno sem WhatsApp ficaria preso na tela de aceite.

do $desfazer$
declare
  v_fn constant regprocedure := to_regprocedure('public.app_legal_state()');
  v_def text;
  v_de constant text := '(v_docs #>> ''{termo_uso,current}''))';
  v_para constant text := '(v_docs #>> ''{termo_uso,current}'') or v_phone_missing)';
begin
  if v_fn is null then
    return;
  end if;
  v_def := pg_get_functiondef(v_fn);
  if position(v_para in v_def) = 0 and position(v_de in v_def) > 0 then
    execute replace(v_def, v_de, v_para);
  end if;
end
$desfazer$;

comment on column public.profiles.phone is 'WhatsApp no formato internacional (ex.: +5541999998888).';
