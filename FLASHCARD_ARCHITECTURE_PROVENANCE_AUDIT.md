# AUDITORIA DE ARQUITETURA, PROVENIÊNCIA E QUALIDADE DE CONTEÚDO DOS FLASHCARDS (ETAPA 1.22A)

Data: 03/09/2026  
Status: **FLASHCARD_ARCHITECTURE_PROVENANCE_AUDITED**  
Baseline de Testes: **273/273 testes PASS** (36 arquivos de teste)  
Console Errors: **0**  
Modo: **READ-ONLY** (zero alterações de código, storage, schemas ou FSRS)

---

## 1. Mapeamento da Árvore de Componentes

```
REVISAR (Sidebar)
 └── Flashcards (rota: /revisar/flashcards ou subaba FLASHCARDS em RevisarView)
      └── SpacedReviewView.tsx
           ├── Header & Badge Repetição Espaçada
           ├── Botão Modo Áudio → FlashAudioPlayerView.tsx
           ├── Card Principal: "Revisão de Hoje" (Due Cards, estimativa em min, CTA)
           ├── KPIs do Baralho: Novos, Em Aprendizado, Consolidados
           ├── Filtro de Grande Área Médica (6 chips)
           ├── Sessão Ativa de Revisão:
           │    ├── Barra de Progresso & Indicador de Posição
           │    ├── Flip Card (Gatilho Clínico / Pergunta ↔ Conduta Ouro / Resposta)
           │    ├── Bloco Mnemônico / Regra de Ouro (opcional)
           │    ├── Indicadores de Domínio (%) e Repetição nº
           │    └── Grade de 4 Ratings FSRS com Projeção de Intervalos (1. Errei, 2. Difícil, 3. Bom, 4. Fácil)
           └── Tela de Sessão Concluída (resumo e ações)
```

---

## 2. Modelo de Dados Atual (`Flashcard`)

Definido em [`src/types/index.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/types/index.ts):

| Campo | Tipo | Função | Categoria |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Identificador do cartão | Identidade |
| `questionId` | `string?` | ID da questão de origem (se auto-gerado por erro) | Proveniência básica |
| `area` | `MedicalArea` | Grande Área Médica normalizada | Taxonomia |
| `topic` | `string` | Nome textual do tema / subtema | Taxonomia |
| `front` | `string` | Gatilho clínico / Pergunta | Conteúdo |
| `back` | `string` | Conduta padrão-ouro / Justificativa | Conteúdo |
| `keyMnemonic` | `string?` | Dica mnemônica ou regra prática SUS | Conteúdo |
| `schedulerVersion` | `"FSRS_V1" \| "LEGACY_V1"?` | Versão do motor de agendamento | FSRS Engine |
| `stability` | `number?` | Estabilidade de memória em dias ($S$) | FSRS Engine |
| `difficulty` | `number?` | Dificuldade intrínseca ($D$, escala 1-10) | FSRS Engine |
| `elapsedDays` | `number?` | Dias corridos desde a última revisão | FSRS Engine |
| `scheduledDays` | `number?` | Intervalo programado em dias | FSRS Engine |
| `reps` | `number?` | Total de repetições realizadas | FSRS Engine |
| `lapses` | `number?` | Total de falhas (Again / Errei) | FSRS Engine |
| `state` | `number?` | Estado FSRS (0=New, 1=Learning, 2=Review, 3=Relearning) | FSRS Engine |
| `lastReviewed` | `string?` | ISO timestamp da última revisão | FSRS Engine |
| `dueDate` | `string` | ISO timestamp de quando o card vence | FSRS Engine |
| `intervalDays` | `number` | Intervalo em dias (sincronizado com scheduledDays) | Compatibilidade visual |
| `easeFactor` | `number` | Fator de facilidade legado SM-2 (2.5) | Compatibilidade legada |
| `repetitionCount` | `number` | Contagem de repetições | Compatibilidade visual |
| `masteryLevel` | `number` | Nível de domínio estimado (0-100%) | Compatibilidade visual |

---

## 3. Acoplamento Conteúdo × Estado do Agendador

- **Classificação:** `FLASHCARD_CONTENT_SCHEDULER_COUPLING` = **`HIGH`**
- **Diagnóstico:** O mesmo objeto `Flashcard` agrega tanto o **conteúdo pedagógico** (`front`, `back`, `keyMnemonic`, `topic`, `area`) quanto o **estado de agendamento individual** (`stability`, `difficulty`, `state`, `reps`, `lapses`, `dueDate`).
- **Impacto:** Impede o compartilhamento de um catálogo canônico global de flashcards entre diferentes usuários, pois o progresso individual está fundido no próprio registro do cartão.

---

## 4. Identidade e Estabilidade

- **Geração de ID (`FLASHCARD_ID_GENERATION`):** `TIMESTAMP_PLUS_RANDOM` (ex: `fc-auto-${Date.now()}` ou `fc-${Date.now()}-${random}`).
- **Estabilidade da Identidade (`FLASHCARD_ID_STABILITY`):** **`UNSTABLE`**. Se o mesmo erro for cometido em navegadores diferentes ou se a mesma questão gerar um card em momentos distintos, IDs diferentes são gerados sem deduplicação.

---

## 5. Origem e Proveniência do Conteúdo

- **Fontes de Criação Atuais (`FLASHCARD_CREATION_SOURCES`):**
  1. `QUESTION_DERIVED_AUTO`: Gerado automaticamente ao errar uma questão (`AppContext.tsx`: `!attemptData.isCorrect`).
  2. `PROTOCOL_UPDATE_PREVIEW`: Cards embutidos estaticamente em atualizações de diretrizes (`protocolUpdatesData.ts`, mantidos em preview local).
  3. `AI_AGENT_ARTIFACTS`: Gerados como artefatos de IA em `FunctionCallingService`, sem injeção automática no deck.
- **Modelo de Proveniência (`FLASHCARD_PROVENANCE_MODEL`):** **`PARTIAL`**. Possui apenas `questionId?` opcional. Não possui `sourceDocument`, `sourceUpdateId`, `canonicalTopicId`, `contentVersion`, `reviewStatus` ou `createdBy`.

---

## 6. Qualidade Pedagógica e Atomicidade do Conteúdo

- **Formatos (`FLASHCARD_CONTENT_FORMATS`):** Pergunta $\leftrightarrow$ Resposta (`[Autópsia do Erro] keyFinding — Qual é a conduta padrão-ouro no SUS?` $\leftrightarrow$ `expectedConduct + Justificativa`).
- **Atomicidade (`FLASHCARD_ATOMICITY`):** **`HIGH`**. 1 conceito/conduta decisiva por card.
- **Active Recall (`ACTIVE_RECALL_QUALITY`):** **`HIGH`**. O front exige recuperação ativa do raciocínio clínico antes da revelação.
- **Risco de Leakage (`ANSWER_LEAKAGE_RISK`):** **`LOW`**. A pergunta clínica não antecipa a resposta.
- **Deduplicação (`FLASHCARD_DEDUPLICATION`):** **`NONE`**. Não há checagem de cards idênticos ou normalização por `questionId`.

---

## 7. Taxonomia e Vínculo com Grandes Temas

- **Taxonomia de Área (`FLASHCARD_AREA_NORMALIZATION`):** **`YES`** (usa enum canônico `MedicalArea`).
- **Vínculo com Canonical Topic (`FLASHCARD_CANONICAL_TOPIC_LINK`):** **`NO`** (não possui campo `canonicalTopicId`).
- **Navegação Flashcard $\leftrightarrow$ Grande Tema:** **`NONE`** (fluxos não conectados).

---

## 8. Persistência, Isolamento e Sincronização Cross-Device

- **Versão de Storage (`FLASHCARD_STORAGE_VERSION`):** `praxis_flashcards_v2` em `localStorage`.
- **Backup Técnico (`praxis_flashcards_v1_backup`):** Criado automaticamente apenas na migração de cards legados sem FSRS.
- **Sincronização Cross-Device (`FLASHCARD_CARD_CROSS_DEVICE_SYNC`):** **`NO`** (cards não são salvos nem lidos do Firestore).
- **Namespacing por Usuário (`FLASHCARD_STORAGE_NAMESPACED_BY_USER`):** **`NO`** (a chave `praxis_flashcards_v2` é global no navegador).
- **Isolamento de Usuários (`FLASHCARD_LOCAL_USER_ISOLATION`):** **`UNSAFE`**.
- **Risco de Contaminação Cross-Account (`LOCAL_FLASHCARD_CROSS_ACCOUNT_RISK`):** **`HIGH`** (se o Usuário A deslogar e o Usuário B logar no mesmo navegador, o Usuário B verá e revisará os flashcards do Usuário A).
- **Migração Guest $\to$ Autenticado (`GUEST_TO_AUTH_FLASHCARD_MIGRATION`):** **`PARTIAL`** (os cards permanecem no `localStorage` local sem vínculo a UID).

---

## 9. Motor FSRS e Integrações com o Ecossistema

- **FSRS Core:** `ts-fsrs v5.4.2` operacional com `request_retention = 0.90`, `maximum_interval = 36500`, `enable_short_term = false`.
- **Ratings & Mapeamento:**
  - `1. Errei` $\to$ `Rating.Again` (1)
  - `2. Difícil` $\to$ `Rating.Hard` (2)
  - `3. Bom` $\to$ `Rating.Good` (3)
  - `4. Fácil` $\to$ `Rating.Easy` (4)
- **Centralização da Lógica de Vencimento (`FLASHCARD_DUE_LOGIC_CENTRALIZED`):** **`YES`** ([`SpacedRepetitionService.getDueFlashcards`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/services/spacedRepetitionService.ts)).
- **Integração com Plano de Hoje (`FLASHCARD_TODAY_PLAN_INTEGRATION`):** **`FUNCTIONAL`** ([`PlanoDeHojeView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/components/estudar/PlanoDeHojeView.tsx)).
- **Integração com Calendário Adaptativo (`FLASHCARD_CALENDAR_INTEGRATION`):** **`FUNCTIONAL`** ([`AdaptiveCalendarView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/components/calendar/AdaptiveCalendarView.tsx)).
- **Integração com Plano Semanal (`FLASHCARD_WEEKLY_PLAN_INTEGRATION`):** **`FUNCTIONAL`** ([`WeeklyPlanView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/components/planejamento/WeeklyPlanView.tsx)).
- **Efeito Direto no PPS (`FLASHCARD_DIRECT_PPS_EFFECT`):** **`NO`** (PPS não é mutado por revisões de flashcard).

---

## 10. Flash-Audio

- **Fonte de Dados (`FLASH_AUDIO_SOURCE`):** `SEPARATE_DATASET` ([`AudioSummaryService.getCuratedAudioSummaries()`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/services/audioSummaryService.ts)).
- **Integração FSRS (`FLASH_AUDIO_FSRS_INTEGRATION`):** **`NONE`** (o player de áudio é uma ferramenta de escuta passiva/sintetizada e não registra ratings nem avança intervalos FSRS).

---

## 11. Interface e Densidade Visual

- **Elementos Interativos na 1ª Viewport:** ~11 elementos (botão modo áudio, card CTA principal, 3 KPIs, 6 chips de área).
- **Densidade:** **`LOW/MEDIUM`** (focada e limpa).
- **Ação Primária Clara:** **`YES`** (CTA *"COMEÇAR REVISÃO"* em destaque com tempo estimado).
- **Termos Técnicos Visíveis:** **`1`** (apenas menção contextual a *"FSRS"*, sem poluir com equações ou métricas internas).
- **Modelo de Decks / Coleções:** **`NONE`** (apenas baralho único filtrável por área médica).

---

## 12. Recomendações de Arquitetura Futura

1. **Separação de Conteúdo Canônico e Estado do Usuário (`FUTURE_CONTENT_STATE_SPLIT_RECOMMENDED = YES`):**
   - `FlashcardContent`: Catálogo imutável curado editorialmente (`id`, `front`, `back`, `keyMnemonic`, `canonicalTopicId`, `areaId`, `sourceQuestionId`, `version`).
   - `UserFlashcardState`: Progresso individual (`userId`, `flashcardId`, `stability`, `difficulty`, `state`, `reps`, `lapses`, `dueDate`, `lastReviewed`).
2. **Isolamento de Storage:** Adicionar namespace por `userId` no `localStorage` (`praxis_flashcards_v2_${userId}`).
3. **Persistência Cross-Device:** Criar subcoleção no Firestore (`/users/{uid}/flashcardStates`) para sincronização em nuvem.

---

## 13. Resumo Obrigatório de Métricas

```
FLASHCARD_ID_GENERATION = TIMESTAMP_PLUS_RANDOM
FLASHCARD_ID_STABILITY = UNSTABLE
FLASHCARD_CONTENT_SCHEDULER_COUPLING = HIGH
FLASHCARD_CREATION_SOURCES = [QUESTION_DERIVED_AUTO, PROTOCOL_UPDATE_PREVIEW, AI_AGENT_ARTIFACTS]
FLASHCARD_PROVENANCE_MODEL = PARTIAL
TOTAL_FLASHCARDS = RUNTIME_USER_DYNAMIC (0_INITIAL_SEEDS)
FLASHCARD_CONTENT_FORMATS = [QUESTION_ANSWER_WITH_MNEMONIC]
FLASHCARD_ATOMICITY = HIGH
ACTIVE_RECALL_QUALITY = HIGH
ANSWER_LEAKAGE_RISK = LOW
FLASHCARD_DEDUPLICATION = NONE
FLASHCARD_CANONICAL_TOPIC_LINK = NO
FLASHCARD_AREA_NORMALIZATION = YES
FLASHCARD_TO_GRANDE_TEMA_LINK = NONE
GRANDE_TEMA_TO_FLASHCARD_LINK = NONE
QUESTION_TO_FLASHCARD_FLOW = FUNCTIONAL (ON_ERROR_ONLY)
PROTOCOL_UPDATE_TO_GLOBAL_FLASHCARD = NO (LOCAL_PREVIEW_ONLY)
MANUAL_FLASHCARD_CREATION = NONE
AI_FLASHCARD_CREATION = PARTIAL (AGENT_TRACE_ONLY)
AI_CARD_HUMAN_REVIEW_REQUIRED = YES
FLASHCARD_STORAGE_VERSION = praxis_flashcards_v2
FLASHCARD_CARD_CROSS_DEVICE_SYNC = NO
FLASHCARD_STORAGE_NAMESPACED_BY_USER = NO
FLASHCARD_LOCAL_USER_ISOLATION = UNSAFE
GUEST_TO_AUTH_FLASHCARD_MIGRATION = PARTIAL
LOCAL_FLASHCARD_CROSS_ACCOUNT_RISK = HIGH
VISIBLE_RATINGS = [1_Errei, 2_Dificil, 3_Bom, 4_Facil]
FSRS_RATING_MAPPING = [AGAIN->Again, HARD->Hard, MEDIUM->Good, EASY->Easy]
FLASHCARD_DUE_LOGIC_CENTRALIZED = YES
FLASHCARD_TODAY_PLAN_INTEGRATION = FUNCTIONAL
FLASHCARD_CALENDAR_INTEGRATION = FUNCTIONAL
FLASHCARD_WEEKLY_PLAN_INTEGRATION = FUNCTIONAL
FLASHCARD_FIRST_VIEWPORT_ELEMENTS = 11
FLASHCARDS_DENSITY = LOW_MEDIUM
FLASHCARD_PRIMARY_ACTION_CLEAR = YES
FLASHCARD_TECHNICAL_LABEL_COUNT = 1
FLASHCARD_DECK_MODEL = NONE
FLASH_AUDIO_SOURCE = SEPARATE_DATASET
FLASH_AUDIO_FSRS_INTEGRATION = NONE
CONTENT_AND_USER_STATE_SEPARATION = NO
FLASHCARD_DIRECT_PPS_EFFECT = NO
FLASHCARD_SCALE_RISK = MEDIUM
FUTURE_CONTENT_STATE_SPLIT_RECOMMENDED = YES
```

Classificação final: **FLASHCARD_ARCHITECTURE_PROVENANCE_AUDITED**
