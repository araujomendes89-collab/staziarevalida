# Motor de Similaridade Clínica e Pedagógica — banco e motor (2026-10-12)

Pedido do dono (proposta em `Documents/Prompts guardados/2026-10-12-motor-similaridade-clinica.md`): achar questões que cobram o
mesmo raciocínio, o mesmo subtema ou etapas complementares do mesmo assunto, mesmo com enunciados diferentes, e marcar as
duplicadas. **Mesmo tema não é equivalente.** Este documento cobre o banco e o motor (ramo `similaridade-banco`); as telas estão
no ramo `similaridade-telas` (outro agente).

## 1. O que já existia (auditoria) e foi reaproveitado

| O que | Onde | Uso aqui |
|---|---|---|
| Classificação detalhada (DNA) de ~1.100 questões oficiais: competência, cenário, raciocínio, decisão clínica, conceitos, diagnósticos | `question_dna` (…1700), carga `scripts/supabase/engine-seed.ts` | perfil de reserva quando a questão ainda não tem perfil da revisão |
| Grupos de questões equivalentes (ENAMED 2025 × Revalida 2025/2) | `question_equivalents` (…1700) | duplicada; o aluno nunca recebe duas cópias |
| Busca por palavras das questões | `questions.search` (tsvector, …0200) | candidatas por palavras |
| pgvector + HNSW 768 dimensões, Gemini Embedding 2, cosseno sem pgvector | …5000, `server/contentHub/embeddings.ts` | mesmo modelo, mesmo formato e o mesmo plano B sem pgvector |
| Semelhança de texto (razão de caracteres e de palavras) | `server/contentHub/questoes/similarity.ts` | enunciado quase igual |
| Fila durável e processamento (Cloud Run) | `ch_jobs`, `server/contentHub/worker.ts`, `scripts/content-hub/worker-job.ts` | etapa nova `similarity` |
| Central de IAs (funções, maestro, tetos, registro de chamadas) | …5200, …9610, `server/ai/*` | função nova `similaridade`, começa desligada |
| Papéis, registro e cadeado das Questões Inéditas | `is_staff`, `ch_is_reviewer`, `ch_draft_scope`, `admin_log`, `has_ineditas`, `ineditas_gate` | mesmos helpers |

## 2. O que foi feito

**Migração `20261003009910_similaridade_clinica.sql`** (pode ser colada de novo):

- `question_profiles` (1:1 com `question_dna` pela mesma chave): área, tema, subtema, **`taxonomy_node_id` e `taxonomy_parent_id`**
  (Taxonomia Médica Oficial, nulos até ela ser aprovada), competência, cenário, problema central, conceitos, achados
  discriminatórios, raciocínio cobrado, tipo, complexidade, confiança, origem (`revisao_local`, `ia`, `revisor`, `dna`) e
  `basis_hash` (impressão digital do texto da questão quando o perfil foi feito).
- `question_embeddings`: dois vetores por questão (`tematico`, `clinico`), com modelo, dimensões, versão do texto e `basis_hash`;
  dois índices HNSW (um por tipo) quando há pgvector.
- `question_relations`: par ordenado sem repetição; tipo em `duplicada_exata`, `duplicada_semantica`, `mesmo_raciocinio`,
  `mesmo_subtema`, `mesmo_tema`, `complementar`, `nao_relacionada`; pontuação e confiança (0 a 1), justificativa, sinais, origem
  (`regra`, `vetor`, `ia`, `revisor`), situação (`proposta`, `aprovada`, `rejeitada`), `stale`, revisado por/em.
- `question_relation_history` (criada, recalculada, removida, desatualizada, aprovada, rejeitada, ia), `question_similarity_state`
  (impressões digitais de cada questão e do último cálculo) e `similarity_runs` (cada execução: questões, vetores, pares, tokens,
  custo e tempo).
- RLS ligado nas seis; aluno e visitante sem acesso direto; funções internas e do processamento fechadas para eles.
- Fila: etapa `similarity` (restrição recriada com a união do que existe); trava contra processamento em dobro.
- Central de IAs: chave `similaridade` ("Questões parecidas"); `ch_worker_ai_save_function` e `app_ai_summary` passam a ler a
  lista de funções da própria restrição (`ai_function_keys()`).

**Motor** (`server/contentHub/similarity/`): `engine.ts` (regras e pontuação, funções puras), `run.ts` (etapa da fila) e
`classifier.ts` (IA só para pares duvidosos). Integração em `pipeline.ts`, `worker.ts`, `worker-job.ts`, `server/ai/config.ts` e
`maestro.ts`; nomes na tela da Central de IAs, no registro de ações e na fila.

### Como o motor decide

1. Só o que mudou: a impressão digital do texto da questão e dos dois textos de busca; a versão do motor (`sim-1`, no servidor e
   em `similarity_engine_version()`); a marca "com vetor". Nada de comparar todas com todas: cada questão pendente busca até
   ~20 candidatas por caminho.
2. Candidatas: texto igual (impressão digital), grupo de equivalentes, palavras (tsvector, mesma área + 5 de outra), **taxonomia**
   (mesmo nó ou mesmo pai; sem nó, o tema da questão em texto) e vetor (top-K na mesma área, conta exata; e o vizinho clínico
   ≥ 0,9 de outra área, para questão mal classificada).
3. Pontuação com os pesos iniciais da proposta (não são precisão comprovada): raciocínio 40 (problema central, raciocínio cobrado,
   vetor clínico), conceitos/subtema 30 (nó da taxonomia, conceitos, vetor temático), competência 20, achados 10.
4. Regras: `duplicada_exata` = texto igual; `duplicada_semantica` = enunciado ≥ 85% igual ou grupo de equivalentes (70–85% ou só
   pelo vetor: confiança baixa); `mesmo_raciocinio` exige a **mesma competência e o mesmo problema central**; `complementar` =
   mesmo problema/subtema com competência diferente; depois `mesmo_subtema` e `mesmo_tema`.
5. **Taxonomia (decisão do dono):** sem o nó nas duas questões, o par não vira relação definitiva — fica a duplicata exata e, com
   confiança baixa (≤ 0,45), só o enunciado quase igual e a candidata achada pelo vetor.
6. O aluno só recebe relação **aprovada**, ou proposta do motor com confiança **alta** (≥ 0,8). O que a IA reclassificou só depois
   de uma pessoa aprovar. Par revisado nunca é trocado pelo motor (fica "desatualizado" se a questão mudar).
7. IA: só os pares de confiança baixa, em lote pedido pelo administrador, pela função `similaridade` da Central de IAs (custo em
   `ai_calls`); nunca aprova; nada de IA na abertura da questão.
8. Vetores: só com a função "Questões parecidas" **configurada (ligada) na Central de IAs** e a busca por significado pronta no
   processamento. Desligada: nada vai ao Google; os vetores já gravados continuam servindo (de graça).

## 3. Contrato das telas (final, com os ajustes pedidos pelo ramo `similaridade-telas`, df92ef6)

- `app_related_questions(p_question_id text, p_limit int default 8)` → `{ items: [{ id, code, exam_label, number, area, tema,
  subtema, relation, reason, answered, locked }] }`. `relation` em mesmo_raciocinio | complementar | mesmo_subtema | mesmo_tema;
  `reason` é texto fixo (nunca gabarito nem IA); `locked` sempre falso (a inédita fechada nem aparece).
- `app_start_related_question(p_question_id text)` → `{ session_id, count }`: treino de uma questão; inédita fechada recusa com o
  aviso do plano (42501); anulada, recolhida ou sem a figura recusa (22023).
- `app_admin_question_relations(p_filter, p_limit, p_offset)`, filtro em duplicadas | baixa_confianca | propostas | todas →
  `{ total, items: [{ id, a: {id, code, excerpt, subtema, area, status}, b, relation, score, confidence, confidence_level
  (alta/media/baixa), reason, status, origin, created_at, ... }] }`. Revisor médico vê só pares das áreas dele.
- `app_admin_review_relation(p_id, p_decision 'aprovar'|'rejeitar', p_relation, p_note)` → o item atualizado; `admin_audit_log`
  (`similarity.relation.review`) e histórico. Revisor médico decide os pares das áreas dele.
- `app_admin_similarity_reprocess(p_question_ids text[] default null)` → `{ queued, job_id, duplicate }` (sem lista = só o que
  mudou; com lista = essas de novo). Equipe (editor e administrador).
- `app_admin_similarity_status()` → `{ perfis, com_vetor, relacoes, pendentes_revisao, ultima_execucao (data ISO),
  ultima_execucao_detalhe, questoes, duplicadas, baixa_confianca, desatualizadas, perfis_desatualizados, pendentes_processar,
  na_fila, versao_do_motor, funcao_ia_ligada }`.
- Além do contrato: `app_admin_similarity_classify(p_limit default 20)` → `{ queued, job_id, duplicate }` (só administrador, só com
  a função ligada). Ainda sem botão nas telas.

## 4. Scripts

- `scripts/similaridade/gerar-sql-perfis.mjs`: lê os `prof-NN.json` da revisão local (`perfil`, `tema`, `subtema`, `confianca`) e
  gera SQL idempotente (não sobrescreve perfil da equipe nem apaga nó de taxonomia já gravado; aceita `--taxonomia` com o mapa
  questão → nó quando a taxonomia for aprovada). Vetores não são gerados ali.
- `scripts/similaridade/avaliar.mjs` + `pares-revisados.json` (VAZIO de propósito: os pares virão da revisão médica):
  precision@5, recall@20, acerto do tipo; registra tempo e custo da execução em `avaliacoes.jsonl`.

## 5. Testes (PGlite com todas as migrações e a carga real do repositório; nenhuma chave de IA)

- `similaridadeMotor.test.ts` (9): regras com os perfis reais da revisão (cópia em `src/__tests__/fixtures/similaridade`).
- `similaridadeBanco.test.ts` (29): RLS, perfis reais pelo SQL do script, duplicatas exatas reais (ENAMED 2025 × Revalida 2025/2),
  só o que mudou, trava da fila, taxonomia (nó derivado do tema real, prefixo `teste-`), mesmo tema ≠ equivalente, revisão,
  aluno (contrato, sem gabarito, cadeado, abrir a questão), vetores de teste derivados do texto real, IA de teste, pgvector e sem.
- Ajustados: catálogo de leitores de `questions` (`questoesStaziaMedSoOficiais.test.ts`) e a Central de IAs com 8 funções.

## 6. Ordem para ligar (o motor só é ligado depois da taxonomia)

1. Colar `1-Similaridade.sql`, depois `2-Perfis-da-revisao.sql` (pode colar de novo quando a revisão andar) e `0-CONFERIR.sql`.
2. Publicar o código (site e processamento do Cloud Run) com o ramo.
3. "Reprocessar" pode rodar antes da taxonomia: grava só as duplicatas.
4. **Aprovar a Taxonomia Médica Oficial e reclassificar as questões** (preencher `taxonomy_node_id`, pelo script com `--taxonomia`).
5. Só então ligar a função "Questões parecidas" na Central de IAs (vetores e fila automática) e reprocessar.
6. Revisão médica de pares → `avaliar.mjs` → calibrar pesos e limites (versão nova do motor = migração nova).

## 7. O que falta

- Taxonomia aprovada e questões reclassificadas (sem isso, nada além de duplicatas).
- Ligar a função na Central de IAs (preço do modelo escolhido) e gerar os vetores.
- Pares revisados por médico para medir e calibrar (o arquivo começa vazio).
- Botão de "Classificar pares duvidosos com IA" nas telas (a função do banco existe).
- "Reforço inteligente" e montagem de simulados com as relações (fora deste ramo).
