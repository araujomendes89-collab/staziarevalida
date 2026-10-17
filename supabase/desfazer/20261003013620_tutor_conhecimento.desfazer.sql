-- Desfaz supabase/migrations/20261003013620_tutor_conhecimento.sql (cérebro do Tutor: índice de conhecimento aprovado).
-- Volta ao desenho de antes: o Tutor busca só nas fontes oficiais, por palavras (ch_worker_search_official_passages, que esta
-- migração NÃO mudou). Desfaça também no servidor as ligações do módulo server/tutor/conhecimento (tools.ts, engine.ts, realtime.ts,
-- router.ts e a ponte): sem estas funções, a busca nova cai no catch e o Tutor segue sem trechos novos.
-- NÃO desfaz nada fora daqui: aulas, atualizações, questões, fontes e vetores da Central continuam como estavam.

drop function if exists public.ch_worker_tutor_kb_evidencias(uuid, uuid, integer);
drop function if exists public.ch_worker_tutor_kb_pacote(uuid, uuid, text, text, integer, uuid);
drop function if exists public.ch_worker_tutor_kb_buscar(uuid, uuid, text, text, jsonb, text, integer, uuid, text, text, boolean);
drop function if exists public.tutor_kb_questoes_travadas(uuid, uuid);
drop function if exists public.tutor_kb_tsquery(text, text);
drop function if exists public.tutor_kb_vetor_de(jsonb);
drop function if exists public.tutor_kb_vizinhos(real[], text, integer, text);
drop function if exists public.ch_worker_tutor_kb_cobertura(text);
drop function if exists public.ch_worker_tutor_kb_situacao(text);
drop function if exists public.ch_worker_tutor_kb_limpar(text[]);
drop function if exists public.ch_worker_tutor_kb_gravar_rotulos(text, jsonb);
drop function if exists public.ch_worker_tutor_kb_rotulos_a_vetorizar(text, integer);
drop function if exists public.ch_worker_tutor_kb_gravar_vetores(text, jsonb);
drop function if exists public.ch_worker_tutor_kb_a_vetorizar(text, integer);
drop function if exists public.ch_worker_tutor_kb_copiar_vetores_fontes(text);
drop function if exists public.ch_worker_tutor_kb_gravar(text, text, text, jsonb, jsonb);
drop function if exists public.ch_worker_tutor_kb_origens(text, integer, text, boolean);
drop function if exists public.tutor_kb_plano_libera(uuid, text);
drop function if exists public.tutor_kb_versao_atual(text, text);
drop function if exists public.tutor_kb_nivel_rank(text);
drop function if exists public.tutor_kb_nivel_questao(text, jsonb);
drop table if exists public.tutor_kb_cobertura;
drop table if exists public.tutor_kb_entregas;
drop table if exists public.tutor_kb_consultas;
drop table if exists public.tutor_kb_rotulos;
drop table if exists public.tutor_kb_vetores;
drop table if exists public.tutor_kb_trechos;
drop table if exists public.tutor_kb_regras;
