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
| **4** | reanálise seletiva, gabarito histórico × atual, cartão de atualização, linha do tempo | **pronta** (fluxo completo testado com fonte e IA simuladas; nada real publicado) |
| **5** | diagnóstico do erro do aluno, reforço adaptativo | **pronta** (sem questões novas: ver §11) |

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

## 9. Fase 4 — da mudança de fonte ao cartão do aluno (migração `2600_sqie_updates`)

```
mudança de conteúdo relevante (fase 3: número, negação, trecho reescrito ou removido)
   → reanálise SELETIVA (questionReanalysis.ts): a IA recebe trecho antigo + novo e devolve uma PROPOSTA
   → conferência por software da proposta (citação exata, número só do texto, sem contestar o gabarito, resposta atual só com trecho novo citado)
   → fila do revisor médico DA ÁREA (app_question_updates_queue)
   → decisão: publicar cartão | "a conduta não mudou" | descartar proposta
   → cartão versionado (question_update_cards) + atualidade da análise + selo
```

- **Quem gasta IA:** só questões com mudança relevante e sem proposta. Trecho idêntico, só forma ou redação não gastam IA.
  Comando: `scripts/content-hub/run-question-reanalysis.ts` (`--dry-run` estima; `--allow-external` autoriza o envio).
- **A IA só propõe.** A proposta fica em `question_updates.proposal`; não muda impacto, atualidade nem o que o aluno vê.
- **Evidência pronta** (`question_evidence_ready`): toda afirmação que a questão exige precisa ter evidência compatível,
  não substituída, **conferida por pessoa**, em fonte oficial A–D, documento final e vigente. Sem isso, o revisor não
  publica cartão, não marca "sem mudança" e não confirma atualidade.
- **Gabarito histórico × atual.** O cartão guarda o gabarito oficial da prova (como era) ao lado da conduta atual conferida,
  com fonte, versão, data de vigência e data da conferência. O gabarito oficial nunca é alterado por este fluxo.
  "Difere do gabarito" exige uma alternativa atual diferente da oficial; "mesma resposta" exige igual; ambígua/sem alternativa não aceita resposta.
- **Cartão é histórico:** não se edita nem se apaga; nova decisão cria a versão seguinte e marca a anterior como substituída.
- **Selo "Atualizada":** só com atualidade conferida por revisor da área **e** evidência pronta agora. Se a fonte muda de novo, o
  selo some e o aluno vê "atualização em revisão" (a última conduta revisada continua à vista, sem trocar nada em silêncio).
- **Linha do tempo** (`app_question_timeline`): o aluno vê gabarito oficial, análise publicada e cartões; a equipe vê também alertas
  de mudança e edições da questão. Só depois de responder a questão.
- **Confirmação inicial de atualidade** (`app_question_confirm_currency`): o revisor confirma a análise contra evidência pronta, sem mudança de fonte.

**Limites.** O conferente independente (outra família de modelo) ainda não existe para as propostas; hoje a barreira é o software + o revisor.
Uma nova versão de fonte cadastrada começa sem nível de autoridade (informar no cadastro): sem nível, ela não vale como evidência.
Tudo foi exercitado com fontes e IA simuladas; sem acervo oficial real não há cartão publicado.

## 10. Fase 5 e fechamento (migrações `2700` e `2800`)

- **Diagnóstico do erro** (`app_attempt_diagnosis`, `app_error_profile`): usa a alternativa que o aluno marcou e a análise **publicada por revisor**
  (tipo de distrator, tipos de erro, armadilha). Sem análise publicada não há "tipo de erro" e a tela diz quanto dos erros já foi diagnosticado.
  Repetir a mesma alternativa errada vira "ideia fixa". Os motivos do erro (`app_error_reasons`) são os que **o próprio aluno declara** no caderno de erros.
- **Reforço** (`app_start_reinforcement`): sessão com questões **reais** do ponto fraco (subárea + competência com 3+ respostas e 40%+ de erro):
  primeiro as erradas e não superadas, depois as ainda não respondidas; equivalentes contam como uma só e nada já acertado volta.
- **Tipos de alteração clínica** no diff (dose, ponto de corte, faixa etária, idade gestacional, rastreamento, tempo, seguimento, contraindicação,
  critério, tratamento, nova/removida/modificada, terminologia, sem impacto) com **valor antigo e novo**. Regras, sem IA.
- **Frescor da questão** (`question_freshness`, 0–100) e **verificar ao servir** (`app_question_verify_on_serve`): selo só com frescor ≥ 80.
  A conferência vencida pede ao worker uma verificação imediata, sem confirmar nada sozinha.
- **Eventos** (`sqie_events`): `guideline.updated`, `guideline.diff_ready`, `claim.updated`, `question.impacted`, `question.reanalysis_started/completed`,
  `question.review_required`, `question.published`, emitidos por gatilhos do banco.
- **Conflito entre fontes**: evidência conflitante ou desatualizada de fonte oficial vigente impede "evidência pronta" (`app_question_conflicts` lista).
- **Painel "Questões atualizadas"** (`app_updated_questions`) e os três modos do aluno: *Como caiu na prova*, *Como responder hoje*, *O que mudou*.

## 11. Cobertura da especificação (itens 1–106)

| Situação | Itens |
|---|---|
| **Feito** | 1–3 (dois gabaritos), 5 (data dupla: prova e análise), 7–8 (estado e histórico do gabarito), 9–21 (análise, dados-chave, distratores, armadilha, regra, dificuldade), 22–23 (claims e Knowledge Core), 24 e 28 (vigia permanente), 27 (registro de fontes), 30–31 (frescor e verificar ao servir), 32–35 e 97 (diff com tipos e valores), 36–42 (impacto por afirmação, status temporal, tipos de impacto, cartão), 43 (linha do tempo), 44 e 90 (selos e indicador), 45–48 (modos e comentário padrão), 49 (níveis rápido/completo), 51 (originalidade), 54 (conflito), 57 (itens de alto risco: tudo vai ao revisor), 63 (versionamento), 65–66 (reanálise seletiva e eventos), 67–68 (frescor), 70–72 (fonte em atualização, minuta ≠ vigente, vigência), 74 (nada de referência inventada), 79–81 (diagnóstico do erro e reforço), 87–88 (painéis), 93–94 (uma pesquisa por afirmação: afirmações são compartilhadas e a evidência é por afirmação × fonte × versão), 96, 98–99, 102 (regra mestra) |
| **Feito em parte** | 4 e 52–53 (sem alternativa válida, ambiguidade e má formulação: existem os estados e o revisor decide; não há detector automático além das conferências por software), 55 (confianças existem nas análises, mas só a de resposta é preenchida pela IA), 73 e 75 (auditor de citações e red team existem para rascunhos; para as análises e propostas a barreira é software + revisor), 77 (qualidade do distrator 0–4 vem da IA e é conferida só por software), 83 (padrões de distrator vêm da classificação do motor), 95 (hierarquia de modelos: criação e conferência separadas por família; falta o conferente OpenAI no servidor), 84–86 (busca por filtros e painel existem; a "evolução do tema" e a busca em linguagem natural não) |
| **Decidido não fazer** | 56 (publicação automática: contraria a regra combinada de que IA não aprova nem publica; a reanálise é automática, a publicação é do revisor médico) |
| **Não feito** | 82 e Fase 5 "questões novas" (exigem a Fábrica de Conteúdo e revisão médica: o reforço usa questões reais), 76 (escores de qualidade/discriminação/relevância), 85 (como o tema mudou ao longo dos anos), 86 (busca em linguagem natural), 92 (workers separados por função: hoje há uma fila durável e um worker), 25–26 e 29 (a lista de fontes e as frequências por prioridade dependem do acervo, que você ainda não forneceu) |
| **Depende de você** | acervo oficial (itens 6, 25–29, 106), revisores médicos, texto da licença de "Sangue nos Olhos" |

O critério final (item 106, 20 passos) só pode ser considerado cumprido com **fonte oficial real**: todo o caminho foi exercitado com fontes e IA simuladas.
