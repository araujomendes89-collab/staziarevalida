# Stazia Question Intelligence Engine (SQIE) — desenho e plano de fases

> Escrito para: o dono do produto (decisões) e quem for programar (mapa técnico).
> Origem: especificação "Stazia Question Intelligence Engine" (2026-10-04). Cumpre o item 105 da própria
> especificação: analisar o que existe, não duplicar, migrar aos poucos, mostrar o grafo de dependências, os
> workers, o registro de fontes e o fluxo de atualização **antes** de implementar.
> Complementa `STAZIA_KNOWLEDGE_ENGINE.md` (Central de Conteúdo). Estado de cada fase no fim deste arquivo.

## 0. Ideia central e regra mestra

Toda questão histórica tem **duas verdades separadas**:

```
HISTORICAL EXAM TRUTH  (imutável)         CURRENT MEDICAL TRUTH  (camada própria, versionada)
 enunciado, alternativas, gabarito         melhor resposta segundo as fontes vigentes hoje,
 oficial, prova, ano, banca                comentário, atualização, data da verificação
```

Regra mestra (item 102): nunca apagar o passado; nunca apresentar conduta antiga como atual; nunca apresentar
conduta nova como se fosse o gabarito original; mostrar as duas quando forem diferentes.

## 1. O que já existe (não será duplicado)

| Necessidade do SQIE | Já existe | Situação medida em 2026-10-04 |
|---|---|---|
| questions / options | `questions` (1.200; `options` jsonb com texto e explicação) | ✅ 1.117 válidas, 83 anuladas |
| gabarito oficial | `questions.correct_option` + `status` (`valid`, `annulled`, `changed_after_appeal`) + `sources` (procedência do gabarito) | ⚠️ sem histórico de versões nem estado preliminar/definitivo |
| classificação | `question_dna` (1.117): subárea, competência, cenário, população, decisão clínica, padrões de distrator, tópicos de protocolo | ✅ |
| explicação por alternativa | `options[].explanation` | ❌ **nenhuma** das 1.117 tem as 4; todas têm de 1 a 3 |
| questões repetidas | `question_equivalents` | ✅ |
| limpeza do texto | `question_cleanups` (cada remoção registrada) | ✅ |
| Knowledge Core | `ch_claims`, `ch_evidence`, `ch_units`, `ch_unit_claims` | ✅ afirmações têm fonte, página, versão |
| Source Registry | `ch_sources` (+ `authority_level`, `ch_source_passages`, `ch_source_watch`, `ch_source_changes`) | ⚠️ 0 fontes cadastradas; faltam país, SUS, vigência, frescor |
| Guideline Watcher | `ch_worker_watch_due/result` + worker (hash do arquivo, a cada N dias) | ⚠️ detecta mudança do arquivo; não compara conteúdo |
| Dependency Graph | `ch_unit_claims`, `ch_materials`, `ch_flag_dependents` | ⚠️ alcança unidades; não alcança questões |
| fila, IA, custo, auditoria | `ch_jobs`, `ch_ai_runs`, provedores com schema, conferência independente de rascunhos | ✅ |
| incidência | `app_incidence` | ✅ |
| erro do aluno | `question_attempts`, `my_error_notebook` | ⚠️ não liga a escolha ao distrator |

**Decisão de desenho:** as novas tabelas do SQIE usam o prefixo `question_`/`guideline_` apenas quando são
conceitos novos de questão; o **registro de fontes é o próprio `ch_sources` ampliado** (não se cria `guideline_sources`).

## 2. Grafo de dependências

```
ch_sources ─▶ source version (nova linha em ch_sources; a anterior vira 'superseded')
     │
     ▼
ch_claims ─────────────▶ question_claims ─▶ questions ─▶ question_option_analysis ─▶ question_comments (versões)
     │                         │                                   │
     │                         └──▶ question_updates ◀─────────────┘   (impacto detectado, estado, revisão)
     └──▶ ch_unit_claims ─▶ ch_unit_versions ─▶ ch_materials (aulas, flashcards…)
```

Mudou a fonte → `ch_flag_dependents` já marca unidades; passa a marcar também `question_claims` →
`question_updates` com `status = 'queued'`. **Só as questões ligadas à afirmação alterada** entram na fila (item 65).

## 3. Modelo de dados (migração `2200_sqie_core`)

| Tabela (spec) | Decisão | Campos principais |
|---|---|---|
| `question_official_answers` | **nova**, histórico | resposta, estado (`PRELIMINARY`, `FINAL`, `CHANGED_AFTER_APPEAL`, `ANNULLED`, `UNKNOWN`), data, fonte, versão, `is_current`. Preliminar não substitui definitivo posterior |
| `question_change_log` | **nova**, trilha | toda mudança em enunciado/alternativas/gabarito/estado de `questions` (antes → depois, quem, quando). Nada se altera em silêncio |
| `question_analysis` | **nova** | núcleo da pergunta, dados-chave com papel (`CRITICAL/SUPPORTIVE/NEUTRAL/DISTRACTOR_INFORMATION`), raciocínios, dificuldade 1–5 com componentes, armadilha, regra para lembrar, pedagogia, estado temporal, melhor resposta atual, confianças |
| `question_option_analysis` | **nova** | por alternativa: é a oficial? é a atual? por que parece plausível, por que está errada, quando estaria correta, tipo de erro, "verdadeira mas não é a melhor", armadilha, qualidade 0–4, afirmações usadas |
| `question_comments` | **nova**, versionada | níveis rápido/completo/professor; versão 1, 2, 3…; nunca sobrescreve |
| `question_claims` | **nova** | liga questão ↔ `ch_claims` (papel: resolve, distrator, contexto) |
| `question_updates` | **nova** | mudança detectada: tipo, impacto, afirmação/fonte antiga e nova, resposta oficial × atual, estado |
| `question_sources` | **não criar** | já há `questions.sources` (gabarito) e `ch_evidence` (afirmações) |
| `guideline_sources` | **não criar** | amplia `ch_sources`: país, SUS, especialidade, tema, vigência, revisão, `update_in_progress`, `freshness_status` |
| `question_versions` | **não criar agora** | a trilha `question_change_log` cobre a exigência; versão completa só se for pedida |

Estados temporais (item 39) e tipos de impacto (item 41) viram `check` no banco.

## 4. Workers e fluxo (itens 64, 92)

Reaproveita `ch_jobs` (fila durável com checkpoint e idempotência). Novas etapas: `q_analyze`, `q_verify`, `q_claims`,
`q_currency`, `q_reanalyze`, `watch_diff`.

```
Guideline Watcher (já existe: hash) → Diff (novo: compara trechos) → claims alterados → question_claims
   → question_updates (fila) → reanálise (só as afetadas) → novo comentário (versão n+1)
   → validador médico (independente) → auditor de citações → REVISOR MÉDICO → publicação
```

Fases de verificação reaproveitam as camadas já construídas (`software`, `sources`, `currency`, `redteam`).
O criador e o conferente são de famílias de modelo diferentes (regra já implementada).

## 5. Pontos em que a especificação conflita com regras já combinadas (decisão do dono)

1. **Publicação automática (itens 56, 64, 106.20).** A especificação quer o aluno vendo a atualização "sem que ninguém
   edite". As regras anteriores: IA não aprova nem publica; publicação exige revisor médico da área.
   **Proposta:** a reanálise é automática, mas o **texto novo só chega ao aluno depois de aprovado** por revisor. Enquanto
   isso o aluno vê o comentário publicado com o aviso "atualização em revisão" (sem trocar conduta). Itens de alto risco
   (item 57) sempre exigem revisão.
2. **"Resposta atual" calculada pela IA (itens 2.2, 37).** **Proposta:** só é exibida ao aluno depois de aprovada; até lá
   fica como `REQUIRES_MEDICAL_REVIEW`. Nunca se chama de "atual" o que não foi conferido com fonte oficial vigente.
3. **Selo "Atualizada" (itens 44, 68, 90).** Só aparece com fonte oficial verificada dentro do prazo; sem acervo oficial
   o selo **não existe** (hoje: nenhum).
4. **Comentários originais (item 51).** Gerados por IA a partir do conhecimento médico validado e conferidos por software
   (cópia de 6 palavras contra o que já existe), nunca de comentário de terceiros.

## 6. Fases (item 104) e estado

| Fase | Conteúdo | Estado |
|---|---|---|
| **1** | gabarito oficial com histórico, trilha de mudanças, análise da questão e de cada alternativa, comentário versionado, conferência por software | **pronta** (nenhuma análise gerada ainda) |
| **2** | `question_claims`, integração com o Knowledge Core, citações, impacto seletivo | **pronta** (1.117 afirmações ligadas às questões; 0 com evidência oficial, pois não há acervo) |
| **3** | Source Registry ampliado, Watcher com diff, Claim Impact | **pronta** (comparação de conteúdo, triagem por afirmação, frescor; só exercitada com fontes sintéticas) |
| 4 | reanálise automática, gabarito histórico × atual, cartão de atualização, linha do tempo | pendente |
| 5 | diagnóstico do erro do aluno, reforço adaptativo, questões novas | pendente |

## 7. Critério de aceitação (item 106)

Só vale como funcional quando o cenário de 20 passos rodar de ponta a ponta com **fonte oficial real**. Sem acervo
oficial cadastrado, os passos 7, 8, 10 a 13 e 15 a 20 **não podem ser demonstrados com honestidade**; serão testados com
fontes sintéticas identificadas como tal, e isso será dito em cada relatório.

## 8. Fase 3 — como o vigia compara o conteúdo (migração `2500_sqie_source_diff`)

A comparação é **texto contra texto, sem IA**. Ela não decide conduta: só ordena a fila do revisor médico.

```
versão nova cadastrada (ou página monitorada mudou)
   → ch_flag_dependents: evidências da fonte antiga ficam desatualizadas; SÓ as questões ligadas entram na fila ("impacto a definir")
   → comparação de conteúdo (server/contentHub/sourceDiff.ts): alinha os trechos e classifica cada um
   → impacto por afirmação (pelo trecho que sustentava a evidência) → a fila ganha triagem e passa a "revisão necessária"
```

| O que mudou no trecho | Triagem da questão | Crítico |
|---|---|---|
| idêntico / só a forma (pontuação, espaços) | "trecho igual: confirmar a nova versão" | não |
| pequena mudança de redação, mesmos números e negações | "só o comentário" | não |
| número (dose, prazo, intervalo, valor) | "impacto a definir" — reanálise obrigatória | **sim** |
| negação ou restrição ("não", "contraindicado", "evitar"…) | "impacto a definir" — reanálise obrigatória | **sim** |
| trecho reescrito ou removido | "impacto a definir" — reanálise obrigatória | sim, se tratar de dose, conduta, critério… |
| evidência não localizada no texto comparado | "impacto a definir" — **nunca** "sem impacto" | **sim** |

Regras que valem sempre:

- Nenhuma atualização é encerrada sozinha: mesmo com o trecho idêntico, uma pessoa confirma a nova versão.
- A análise da questão segue "atualidade não conferida" até a revisão; nada volta a "atual" por comparação automática.
- Várias evidências da mesma afirmação na mesma fonte: vale a pior mudança.
- Quem já foi triado não é reescrito por uma segunda comparação.

**Quando a comparação roda**

| Situação | O que acontece |
|---|---|
| PDF da versão nova termina de ser lido (etapa `source_index`) | compara sozinho com a versão que ela substituiu, se a antiga também tiver o documento completo |
| Administrador clica "Comparar conteúdo com a versão nova" | `POST /api/content-hub/sources/:antiga/compare/:nova` |
| Página **HTML ou texto** monitorada mudou | o vigia compara a leitura atual com a anterior (parágrafos de 40 caracteres ou mais) |
| **PDF** monitorado por endereço mudou | só a impressão digital acusa a mudança; a comparação de conteúdo acontece quando o PDF novo for enviado como nova versão |

**Registro de fontes.** `app_ch_set_source_registry` grava país, SUS, especialidade, tema, vigência, revisão e "em atualização".
O frescor é uma regra só (`ch_source_freshness`): *a publicação mudou* → *evidências a reconferir* → *conferida no prazo* /
*conferência vencida* → *não monitorada*. `app_ch_resolve_source_change` registra, com nota, que uma pessoa analisou a mudança;
isso **não** devolve validade a nenhuma evidência.

**Limites.** A comparação não entende medicina: sinônimos, reordenação de capítulos e mudanças de sentido sem mudança de
número ou negação podem cair em "redação" ou "reescrito". Por isso tudo termina em revisão humana. Tabelas e linhas curtas de
páginas HTML não entram na comparação. Sem acervo oficial cadastrado, tudo isto só foi exercitado com fontes sintéticas.
