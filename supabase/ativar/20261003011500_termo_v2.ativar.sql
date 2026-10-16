-- =============================================================================
-- ATIVAR o Termo de Aceite e Uso 2.0 (Tutor de voz). NÃO aplicado em produção.
--
-- SÓ COLAR quando as três coisas estiverem prontas:
--   1. o texto da versão 2.0 conferido pelo dono (docs/voice-tutor/04-termo-voz.md, src/novo/app/legal/termo-uso-v2.0.md e
--      privacidade-v2.js) e o que a seção 3 do documento lista como "precisa ser verdade" (voz ao vivo pelo Vertex, palavrões
--      ligados por padrão no Tutor);
--   2. a migração 20261003011500_termo_v2_declaracoes.sql já colada no Supabase;
--   3. o site pronto para publicar logo em seguida com TERMO_VERSAO = "2.0" em src/novo/app/legal/versions.js.
--
-- O que acontece ao colar: todo ALUNO que entrar de novo vê a tela de aceite com o Termo 2.0 e só segue depois de marcar o aceite e
-- as duas declarações (18 anos ou mais; médico(a) com formação em Medicina concluída). Equipe e revisores médicos continuam
-- dispensados (regra de antes). Quem ainda não aceitou nada continua vendo a tela, agora já na 2.0. O aceite dos Tutores (§34)
-- também passa a 2.0 (texto novo: palavrões e humor adulto ligados por padrão): o cartão do Tutor aparece de novo uma vez.
-- Entre colar isto e publicar o site: quem se cadastrar recebe a tela de aceite logo depois de entrar (o cadastro antigo manda 1.0
-- e o banco recusa a versão velha sem travar a conta). Nada quebra, só um passo a mais.
--
-- Desfazer: supabase/desfazer/20261003011500_termo_v2.ativar.desfazer.sql (volta o 1.0; quem aceitou o 1.0 não fica preso).
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
