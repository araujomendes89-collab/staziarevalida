-- DESFAZER a ativação do Termo 2.0 (supabase/migrations/20261003011510_termo_v2_ativar.sql). 
-- Volta o Termo 1.0 sem exigir as declarações e o aceite dos Tutores (§34) 1.0. Quem tinha aceitado o 1.0 não vê a tela de novo (app_legal_state considera a versão
-- vigente aceita, mesmo que a pessoa tenha aceitado a 2.0 depois). Quem só aceitou a 2.0 vê a tela uma vez e aceita a 1.0.
-- As provas da 2.0 (aceites e declarações) ficam guardadas.
-- Publicar junto o site com TERMO_VERSAO = "1.0".

update public.legal_versions set version = '1.0', requires_declarations = false where document = 'termo_uso';
update public.legal_versions set version = '1.0' where document = 'tutor_ia';

-- A retenção da transcrição volta ao padrão do código (180 dias). O valor de antes da ativação não fica guardado: confira no painel
-- (Administração > Configurações > Tutor) e ajuste se era outro.
update public.tutor_config set transcript_retention_days = 180 where transcript_retention_days = 7;
