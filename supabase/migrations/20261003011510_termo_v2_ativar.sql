-- =============================================================================
-- 011510 — ATIVAR o Termo de Aceite e Uso 2.0 (Tutor de voz). "Pode" do dono em 16/10/2026 (a voz nova vem depois).
-- Ensaiada no PGlite (src/__tests__/termoV2Declaracoes.test.ts). Pode ser colada de novo sem estragar nada.
--
-- ORDEM: colar DEPOIS da 20261003011500_termo_v2_declaracoes.sql (este arquivo confere e recusa se ela faltar) e publicar o site
-- com TERMO_VERSAO = "2.0" logo em seguida.
--
-- O que acontece ao colar: todo ALUNO que entrar de novo vê a tela de aceite com o Termo 2.0 e só segue depois de marcar o aceite e
-- as duas declarações (18 anos ou mais; médico(a) com formação em Medicina concluída). Equipe e revisores médicos continuam
-- dispensados (regra de antes). Quem ainda não aceitou nada continua vendo a tela, agora já na 2.0. O aceite dos Tutores (§34)
-- também passa a 2.0 (texto novo: palavrões e humor adulto ligados por padrão): o cartão do Tutor aparece de novo uma vez.
-- Entre colar isto e publicar o site: quem se cadastrar recebe a tela de aceite logo depois de entrar (o cadastro antigo manda 1.0
-- e o banco recusa a versão velha sem travar a conta). Nada quebra, só um passo a mais.
--
-- Desfazer: supabase/desfazer/20261003011510_termo_v2_ativar.desfazer.sql (volta o 1.0; quem aceitou o 1.0 não fica preso).
-- =============================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'legal_versions' and column_name = 'requires_declarations') then
    raise exception 'Cole antes a migração 20261003011500_termo_v2_declaracoes.sql.';
  end if;
end
$$;

-- Termo 2.0 vigente, com as declarações obrigatórias.
update public.legal_versions set version = '2.0', requires_declarations = true where document = 'termo_uso';

-- Aceite dos Tutores (§34) 2.0: o texto mudou (palavrões e humor adulto ligados por padrão, decisão do dono de 16/10).
update public.legal_versions set version = '2.0' where document = 'tutor_ia';

-- Retenção da transcrição da voz que o Termo 2.0 promete: 7 DIAS (decisão do dono de 16/10: "menos tempo" que 30).
-- O áudio em si não é gravado pelo StaziaMed (já é assim no código); isto vale para o TEXTO das falas da voz guardado na conversa.
-- 0 no painel significa "sem prazo" e por isso também vira 7. Depois da ativação, não aumentar no painel sem trocar o Termo.
update public.tutor_config set transcript_retention_days = 7 where transcript_retention_days = 0 or transcript_retention_days > 7;
