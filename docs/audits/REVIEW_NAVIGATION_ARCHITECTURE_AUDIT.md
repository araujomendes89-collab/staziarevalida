# Relatório de Auditoria de Navegação, Responsabilidades e Sobreposições do Módulo REVISAR (Etapa 1.20A)

**Data da Auditoria:** 03 de Setembro de 2026  
**Status da Suíte:** 247/247 Testes PASS (33 arquivos de teste) • 0 Erros de Console  
**Modo:** READ-ONLY (Nenhuma alteração realizada em código, rotas, FSRS ou Firestore)  
**Classificação Final:** `REVIEW_NAVIGATION_ARCHITECTURE_AUDITED`

---

## 1. Rotas e Aliases Mapeados

| Rota Canônica | Aliases / Legado | Componente Principal | Finalidade Pedagógica |
| :--- | :--- | :--- | :--- |
| `/revisar/erros` | `revisar-erros`, `errors` | [`ErrorNotebookView.tsx`](src/components/errors/ErrorNotebookView.tsx) | Revisão ativa de falhas reais do aluno em questões, com reflexão cognitiva e retreino. |
| `/revisar/flashcards` | `revisar-flashcards`, `review` | [`SpacedReviewView.tsx`](src/components/review/SpacedReviewView.tsx) | Revisão espaçada de gatilhos clínicos e mnemônicos via algoritmo FSRS. |
| `/revisar/atualizacoes` | `revisar-atualizacoes` | [`ProtocolUpdatesHubView.tsx`](src/components/protocols/ProtocolUpdatesHubView.tsx) | Hub de mudanças normativas e protocolos clínicos 2025/2026 com condutas vigentes. |
| `/revisar/radar` | `revisar-radar`, `guidelines`, `radar` | [`GuidelineWatchView.tsx`](src/components/guidelines/GuidelineWatchView.tsx) | Radar de monitoramento de diretrizes e fila de auditoria editorial médica. |
| `/revisar/audio` | `revisar-audio`, `flash-audio` | [`FlashAudioPlayerView.tsx`](src/components/review/FlashAudioPlayerView.tsx) | Reprodutor de áudios clínicos sintetizados (Web Speech API) para estudo em trânsito. |
| `/revisar` | `revisar` | [`RevisarView.tsx`](src/components/revisar/RevisarView.tsx) | Container unificado com navegação em abas para os submódulos de revisão. |

---

## 2. Sidebar Atual (Configuração Canônica)

Definição em [`src/config/navigation.ts`](src/config/navigation.ts):

```
REVISAR (Layers) [Badge: dueFlashcards]
├── Caderno de erros (BookMarked) ────────→ id: "revisar-erros"
├── Flashcards (Layers) [Badge] ──────────→ id: "revisar-flashcards"
└── Atualizações & Diretrizes (Flame) ────→ id: "revisar-atualizacoes"
```

- **`REVISAR_SIDEBAR_ITEMS` = 3**

---

## 3. Navegação Interna & Duplicações

- [`RevisarView.tsx`](src/components/revisar/RevisarView.tsx) renderiza um menu horizontal secundário com 5 abas:
  1. `Flashcards` (revisar-flashcards)
  2. `Caderno de Erros` (revisar-erros)
  3. `Atualizações` (revisar-atualizacoes)
  4. `Radar de Diretrizes` (revisar-radar — *não presente na Sidebar*)
  5. `Flash-Audio` (revisar-audio — *não presente na Sidebar*)
- **`REVIEW_INTERNAL_NAVIGATION_DUPLICATED = YES`** (O menu horizontal interno replica as 3 opções da Sidebar e ainda expõe 2 submódulos adicionais).

---

## 4. Caderno de Erros — Função Real & Origem de Dados

- **O que entra:** Apenas questões com tentativas incorretas (`attempts.filter(a => !a.isCorrect)`).
- **Status de Superação:** Calculado dinamicamente caso haja acerto posterior (`hasLaterCorrectAttempt`) ou status de resolução (`REMEDIATED` / `MASTERED`).
- **Autópsia / Reflexão Pessoal:** Campo editável *"Por que eu errei esta questão?"* gravado via `updateErrorAutopsyReflection` no Firestore (`/errors`) e `localStorage`.
- **Temas Recorrentes:** Agrupamento automático por tema identificando tópicos com $\ge 2$ erros.
- **`ERROR_NOTEBOOK_SOURCE` = `AppContext / StorageService (praxis_attempts_v2) + Firestore (/errors, /sessions)`**

---

## 5. Caderno de Erros × Banco de Questões

- **`ERROR_NOTEBOOK_QUESTION_FLOW = REUSED_RESOLUTION`**
- O Caderno não recria um resolvedor próprio: quando o aluno clica em *"Treinar Erros Pendentes"* ou *"Refazer Esta Questão"*, o sistema gera uma sessão via [`SessionBuilderService.saveActiveSession`](src/services/sessionBuilderService.ts) e despacha o aluno para o fluxo central de questões em `praticar-questoes`.

---

## 6. Caderno de Erros × Desempenho

- Não há duplicação de métricas pesadas de desempenho (sem gráficos de proficiência, sem ranking, sem PPS). O Caderno limita-se a 3 contadores operacionais: *Para Revisar*, *Temas Recorrentes* e *Questões Superadas*.

---

## 7. Caderno de Erros × Grandes Temas

- **`ERROR_CANONICAL_TOPIC_LINK = PARTIAL`**
- As questões possuem `topic` e `area`, mas ainda não estão formalmente indexadas pelo `canonicalTopicId` dos 75 Grandes Temas.

---

## 8. Autópsia do Erro

- A autópsia cognitiva está integrada dentro do card expansível de cada erro no Caderno (sem tela isolada oculta), gravando a reflexão do aluno e taxonomia do erro.

---

## 9. Flashcards — Função Real & FSRS

- **Fluxo:** Card Pendente $\to$ Exibir Pergunta/Frente $\to$ Virar Card (Espaço) $\to$ Avaliar Recuperação (`AGAIN`, `HARD`, `MEDIUM`, `EASY` / Teclas 1, 2, 3, 4) $\to$ Atualização dos Intervalos no FSRS.
- **`FLASHCARD_SOURCE` = `AppContext / StorageService (praxis_flashcards_v2)`**
- **`FLASHCARD_PERSISTENCE` = `localStorage + memory fallback + Firestore (/users/{uid}/flashcards)`**
- **`FLASHCARD_SYNC` = `Bidirectional on Auth in AppContext`**
- **`FSRS_STATUS` = `OPERATIONAL_CANONICAL (ts-fsrs v4.5, request_retention = 0.9)`**
- **`FLASHCARD_PRIMARY_ACTION_CLEAR = YES`** (Card central "Revisão de Hoje" com CTA destacado `COMEÇAR REVISÃO`).

---

## 10. Flashcards × Plano de Hoje & Calendário

- **Plano de Hoje:** Integrado diretamente via `SpacedRepetitionService.getDueFlashcards(flashcards)`, exibindo a quantidade devida e o tempo estimado de revisão na missão diária.
- **Calendário / Plano Semanal:** Integrado via `SpacedRepetitionService.getFlashcardReviewLoadByDate(flashcards, now)` em [`WeeklyPlanView.tsx`](src/components/planejamento/WeeklyPlanView.tsx), projetando a carga diária de revisões nos próximos 7 dias.

---

## 11. Flashcards × Grandes Temas & Caderno de Erros

- **`FLASHCARD_CANONICAL_TOPIC_LINK = PARTIAL`** (Possui `area` e `topic`, sem `canonicalTopicId` estrito).
- **`ERROR_TO_FLASHCARD_FLOW = NONE`** (Não existe ação direta de criar flashcard a partir de um erro registrado).
- **`FLASHCARD_CREATION_SOURCES` = `PROTOCOL_UPDATES_SEED + KNOWLEDGE_GRAPH_SEED`**

---

## 12. Atualizações & Diretrizes — Função Real & Origem de Dados

- **O que entra:** Feed curado de 15+ atualizações normativas e clínicas ocorridas em 2025 e 2026 (ex: Rastreio DNA-HPV no SUS, Profilaxia Pré-Eclâmpsia com AAS 150mg à noite, Manejo Dengue, Sepse pediátrica, etc.).
- **Conteúdo de cada atualização:** Recomendação pré-2025, o que mudou em 2025/2026, conduta vigente, impacto clínico, impacto no Revalida INEP, pegadinhas de prova, questões antigas do Revalida com gabarito alterado, flashcards específicos e questões inéditas.
- **`UPDATES_SOURCE` = `STATIC_CURATED_DATASET (PROTOCOL_UPDATES_2025_2026 em src/data/protocolUpdatesData.ts)`**

---

## 13. Atualizações × Materiais Oficiais

- **`UPDATES_VS_OFFICIAL_MATERIALS = PARTIALLY_OVERLAPPING`**
  - **Materiais Oficiais (Estudar):** Biblioteca documental médica sob demanda (busca de PCDTs, portarias, documentos INEP e diretrizes de sociedades via Google Search Grounding e base oficial).
  - **Atualizações & Diretrizes (Revisar):** Feed estruturado das *mudanças de conduta* que afetam a resposta correta na prova do Revalida (Antes vs Depois, impacto de gabarito).

---

## 14. Document Provenance & Outdated Content Tracking

- **`OFFICIAL_SOURCE_MODEL_REUSABLE = YES`** (O modelo de `OfficialSourceType`, `versionStatus` e fail-closed de 1.19B pode ser estendido aos updates).
- **`OUTDATED_CONTENT_TRACKING = PARTIAL`** (O campo `affected_exam_questions` sinaliza questões históricas com condutas antigas e fornece aviso de desatualização).
- **`UPDATE_CANONICAL_TOPIC_LINK = PARTIAL`** (Contém `area`, `tema` e `subtema`, sem `canonicalTopicId` explícito).

---

## 15. Densidade Visual & Complexidade

- **`ERROR_NOTEBOOK_DENSITY = MEDIUM`** (Visual clean, 3 cards de resumo, filtros simples, card expansível com reflexão).
- **`FLASHCARDS_DENSITY = LOW/MEDIUM`** (Dashboard inicial objetivo, sessão 1 card por vez, atalhos de teclado 1-4).
- **`UPDATES_DENSITY = VERY_HIGH`** ([`ProtocolUpdatesHubView.tsx`](src/components/protocols/ProtocolUpdatesHubView.tsx) tem 1238 linhas, 7 sub-abas internas, tabela comparativa, resolvedor de inéditas embutido e flashcard player embutido).
- **`REVIEW_EMBEDDED_FULL_MODULES = 2`**
  1. Em `ProtocolUpdatesHubView`: minissistema de resolução de questões inéditas + minissistema de flashcards.
  2. Em `GuidelineWatchView`: painel administrativo/editorial de auditoria de questões com fluxo de aprovação de CRM.
- **`REVIEW_TECHNICAL_LABEL_COUNT = 8`** (`FSRS`, `Estabilidade`, `Autópsia Cognitiva`, `TRI`, `Gabarito Histórico`, `Genotipagem`, `PCDT`, `Status de Resolução`).

---

## 16. Purpose Collisions & Análise de Sobreposição

- **`PURPOSE_COLLISION_COUNT = 1`**
  - **`GuidelineWatchView` (Radar de Diretrizes) × `ProtocolUpdatesHubView` (Atualizações):** Ambos tratam de diretrizes e atualizações clínicas, mas `GuidelineWatchView` mistura ferramentas de backoffice editorial médico (aprovação de alertas, log de auditoria do revisor) com conteúdo de estudo do aluno, gerando sobreposição conceitual com `ProtocolUpdatesHubView`.

---

## 17. Recomendações Arquiteturais Futuras (Para Próximas Etapas)

1. **Alinhar a Navegação Interna de Revisar:** Eliminar o menu secundário redundante em `RevisarView.tsx` e manter a integridade das 3 sub-rotas oficiais da Sidebar (`Caderno de Erros`, `Flashcards`, `Atualizações & Diretrizes`).
2. **Desacoplar Backoffice de Diretrizes:** Mover a fila de auditoria editorial de `GuidelineWatchView` para a área administrativa (`/admin`), deixando em Revisar apenas o conteúdo voltado ao aluno.
3. **Consolidar os Flashcards de Atualizações no Motor Central FSRS:** Em vez de manter um mini-player de flashcards isolado em `ProtocolUpdatesHubView`, permitir que os flashcards de protocolos sejam adicionados diretamente ao baralho FSRS central do aluno.
4. **Vincular Erros ao Gerador de Flashcards:** Criar no Caderno de Erros a ação opcional de *"Gerar Flashcard de Fixação"* para o erro cometido.
5. **Normalizar com `canonicalTopicId`:** Associar os erros, flashcards e atualizações aos 75 Grandes Temas canônicos.

---

## 18. Resumo Obrigatório de Auditoria

```
============================================================
RESUMO DA AUDITORIA DO MÓDULO REVISAR (ETAPA 1.20A):
============================================================
REVISAR_SIDEBAR_ITEMS                        = 3
REVIEW_INTERNAL_NAVIGATION_DUPLICATED        = YES

ERROR_NOTEBOOK_SOURCE                        = AppContext / StorageService (praxis_attempts_v2) + Firestore (/errors)
ERROR_NOTEBOOK_QUESTION_FLOW                 = REUSED_RESOLUTION
ERROR_CANONICAL_TOPIC_LINK                   = PARTIAL
ERROR_TO_FLASHCARD_FLOW                      = NONE

FLASHCARD_SOURCE                             = AppContext / StorageService (praxis_flashcards_v2)
FLASHCARD_PERSISTENCE                        = localStorage + memory fallback + Firestore (/users/{uid}/flashcards)
FLASHCARD_SYNC                               = Bidirectional on Auth in AppContext
FSRS_STATUS                                  = OPERATIONAL_CANONICAL (ts-fsrs v4.5, request_retention = 0.9)
FLASHCARD_PRIMARY_ACTION_CLEAR               = YES

UPDATES_SOURCE                               = STATIC_CURATED_DATASET (PROTOCOL_UPDATES_2025_2026)
UPDATES_VS_OFFICIAL_MATERIALS                = PARTIALLY_OVERLAPPING
OFFICIAL_SOURCE_MODEL_REUSABLE               = YES
UPDATE_CANONICAL_TOPIC_LINK                  = PARTIAL
OUTDATED_CONTENT_TRACKING                    = PARTIAL

ERROR_NOTEBOOK_DENSITY                       = MEDIUM
FLASHCARDS_DENSITY                           = LOW/MEDIUM
UPDATES_DENSITY                              = VERY_HIGH

PURPOSE_COLLISION_COUNT                      = 1
REVIEW_EMBEDDED_FULL_MODULES                 = 2
REVIEW_TECHNICAL_LABEL_COUNT                 = 8

NPM_TEST_SUITE                               = 247/247 PASS (33 arquivos de teste)
CONSOLE_ERRORS                               = 0
============================================================
CLASSIFICAÇÃO FINAL:
REVIEW_NAVIGATION_ARCHITECTURE_AUDITED
============================================================
```
