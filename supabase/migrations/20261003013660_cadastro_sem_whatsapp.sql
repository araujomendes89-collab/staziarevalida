-- =============================================================================
-- 013660 — Cadastro sem WhatsApp (decisão do dono, 17/10/2026: "vamos tirar o WhatsApp").
--
-- O cadastro (Criar conta) e a tela de aceite de quem entra pelo Google deixam de pedir WhatsApp/telefone. No banco, a única trava que
-- exigia o telefone do aluno era a abertura do app (app_legal_state):
--     gate_required = aluno e (Termo vigente não aceito  OU  WhatsApp vazio)
-- e passa a ser:
--     gate_required = aluno e (Termo vigente não aceito)
-- Quem já aceitou o Termo vigente e não tem WhatsApp deixa de ver a tela de aceite. Quem não aceitou continua vendo (com as
-- declarações de maioridade e de médico, que seguem obrigatórias no Termo 2.0).
--
-- O que NÃO muda:
--   * a coluna profiles.phone continua lá, opcional (nada é apagado); quem já tem WhatsApp continua com ele;
--   * a chave "phone_missing" continua na abertura do app, só informativa (diz se o perfil não tem WhatsApp); nada mais depende dela;
--   * o gatilho do cadastro (handle_new_user, versão de …11500) já funcionava sem telefone: grava o WhatsApp só se vier válido nos
--     metadados e a conta nasce de qualquer jeito. Não é recriado aqui;
--   * app_accept_terms / app_accept_terms_declared já aceitavam p_phone nulo; quando vier, a validação é a mesma de antes;
--   * app_update_profile (Minha conta) continua aceitando o WhatsApp, opcional, com a mesma validação.
--
-- Técnica: remendo da versão QUE ESTÁ NO BANCO (pg_get_functiondef + replace), sem reescrever a função a partir de cópia antiga.
-- Troca só o trecho da regra; se o trecho não existir (já remendado), não faz nada. Se a função não tiver nem o trecho antigo nem
-- o novo, PARA com erro (a função no banco é diferente da esperada: conferir antes de seguir).
-- Pode ser colada de novo sem estragar nada. SECURITY DEFINER e search_path = '' vêm da própria função (não mudam).
--
-- ORDEM DE PUBLICAÇÃO: colar ANTES de publicar o site que tira o campo WhatsApp do cadastro e da tela de aceite.
-- Desfazer: supabase/desfazer/20261003013660_cadastro_sem_whatsapp.desfazer.sql
-- =============================================================================

do $remendo$
declare
  v_fn constant regprocedure := to_regprocedure('public.app_legal_state()');
  v_def text;
  v_de constant text := '(v_docs #>> ''{termo_uso,current}'') or v_phone_missing)';
  v_para constant text := '(v_docs #>> ''{termo_uso,current}''))';
begin
  if v_fn is null then
    raise exception 'cadastro sem WhatsApp: public.app_legal_state() não existe (aplicar antes a …5300_termo_aceite e a …11500_termo_v2_declaracoes)';
  end if;
  v_def := pg_get_functiondef(v_fn);
  if position(v_de in v_def) > 0 then
    execute replace(v_def, v_de, v_para);
  elsif position(v_para in v_def) = 0 then
    raise exception 'cadastro sem WhatsApp: app_legal_state no banco não tem a regra esperada do gate_required; nada foi mudado';
  end if;
  -- conferência: depois do remendo a regra não pode mais olhar o telefone
  if position('or v_phone_missing' in pg_get_functiondef(v_fn)) > 0 then
    raise exception 'cadastro sem WhatsApp: a regra do gate_required ainda exige o telefone';
  end if;
end
$remendo$;

comment on column public.profiles.phone is 'WhatsApp no formato internacional (ex.: +5541999998888). Opcional desde 17/10/2026 (cadastro sem WhatsApp).';
