# RELATÓRIO DE PROVENIÊNCIA E ESTABILIDADE DE IDENTIDADE DE QUESTÕES NO CADERNO DE ERROS (ETAPA 1.21C)

Data: 03/09/2026
Status: **ERROR_NOTEBOOK_QUESTION_PROVENANCE_NORMALIZED**
Baseline de Testes: **273/273 testes PASS** (36 arquivos de teste)
Console Errors: **0**

---

## 1. Auditoria de Identidade e Estabilidade

### 1.1. Identidade em Runtime vs Identidade Canônica
- **`ERROR_CASE_RUNTIME_IDENTITY` = `questionId`**
  - No ambiente atual em execução, `attempt.questionId` conecta deterministicamente a `question.id`.
  - Essa chave é totalmente segura para o agrupamento operacional em memória (`buildErrorCases`).
- **`QUESTION_ID_CALLED_PERMANENT_CANONICAL_ID` = `NO`**
  - O runtime `questionId` **não** é chamado de identidade canônica imutável permanente do ecossistema, pois parte do dataset legado ainda possui identificadores gerados na normalização.

### 1.2. Estabilidade em Reingestão Futura
- **`QUESTION_ID_REINGESTION_STABILITY` = `PARTIAL`**
  - Caso o dataset temporário de 300 questões seja reingerido por uma nova pipeline sem um mapa explícito de tradução de IDs, tentativas gravadas sob o `questionId` anterior poderiam se desconectar.
- **`CANONICAL_QUESTION_ID_STABILITY` = `PARTIAL`**
  - Para provas oficiais com `examYear` e `originalNumber`, o padrão `REV-CANONICAL-${examYear}-${originalNumber}` é estável. Para questões inéditas e geradas por IA sem metadados de caderno/número, a estabilidade é parcial.
- **`QUESTION_FINGERPRINT_ROLE` = `DEDUPLICATION_AND_INGESTION_MATCHING`**
  - O hash normalizado do enunciado (`questionFingerprint`) serve primariamente para deduplicação entre cadernos/cores de prova e pareamento de enunciados durante extração e reingestão.
- **`FUTURE_ATTEMPT_IDENTITY_MIGRATION_REQUIRED` = `YES`**
  - Registrado formalmente: quando a pipeline definitiva de ingestão oficial for introduzida, será necessário aplicar uma rotina de migração/pareamento por fingerprint para garantir que `praxis_attempts_v2` mantenha 100% de integridade com o novo banco de questões.

---

## 2. Proveniência e Normalização de Rótulos de Resposta

Criado o helper centralizado [`getQuestionAnswerProvenance(question)`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/services/errorNotebookService.ts) para garantir que **somente questões oficiais** recebam a atribuição de *"Gabarito Oficial (INEP)"*, evitando falsas alegações institucionais.

### 2.1. Regras de Classificação Institucional e Status

| Origem (`origin`) | Status Oficial (`officialStatus`) | Rótulo Compacto (Preview) | Rótulo Detalhado (Card Expandido) | Texto de Exibição |
| :--- | :--- | :--- | :--- | :--- |
| `INEP_OFICIAL` / `OFICIAL_INEP` | `valid` | **Gabarito oficial** | **Gabarito Oficial (INEP)** | Alternativa X |
| `INEP_OFICIAL` / `OFICIAL_INEP` | `pending_validation` | **Gabarito preliminar** | **Gabarito Preliminar (INEP)** | Alternativa X |
| `INEP_OFICIAL` / `OFICIAL_INEP` | `changed_after_appeal` | **Gabarito pós-recurso** | **Gabarito Oficial (Pós-Recurso)** | Alternativa X |
| `INEP_OFICIAL` / `OFICIAL_INEP` | `annulled` | **Status** | **Questão Anulada (INEP)** | Anulada pela Banca |
| `INEDITA_PRAXIS` / `EDITORIAL` | qualquer | **Resposta correta** | **Resposta Correta (Gabarito Editorial)** | Alternativa X |
| `PLATFORM_ORIGINAL` / `AI_GENERATED` | qualquer | **Resposta esperada** | **Resposta Esperada** | Alternativa X |
| *Desconhecido / Fallback* | qualquer | **Resposta correta** | **Resposta Correta** | Alternativa X |

---

## 3. Historicidade e Diretrizes

- **`HISTORICAL_OFFICIAL_ANSWER_PRESERVED` = `YES`**
  - O gabarito oficial histórico de uma edição passada do Revalida (ex: 2021) permanece intacto como documento histórico da banca examinadora.
  - Eventuais mudanças de conduta clínica subsequentes são gerenciadas pela camada de *Atualizações & Diretrizes*, sem adulterar o gabarito original publicado pelo INEP.

---

## 4. Resumo Obrigatório de Conclusão

```
ERROR_CASE_RUNTIME_IDENTITY = questionId
QUESTION_ID_CALLED_PERMANENT_CANONICAL_ID = NO
QUESTION_ID_REINGESTION_STABILITY = PARTIAL
CANONICAL_QUESTION_ID_STABILITY = PARTIAL
QUESTION_FINGERPRINT_ROLE = DEDUPLICATION_AND_INGESTION_MATCHING
FUTURE_ATTEMPT_IDENTITY_MIGRATION_REQUIRED = YES
QUESTION_ORIGIN_MODEL = QuestionOrigin (INEP_OFICIAL | INEDITA_PRAXIS | PLATFORM_ORIGINAL | EDITORIAL)
OFFICIAL_ANSWER_LABEL_RULE = getQuestionAnswerProvenance (OFFICIAL_ONLY)
UNKNOWN_ORIGIN_ANSWER_LABEL = Resposta Correta (SAFE_FALLBACK)
PROVISIONAL_ANSWER_STATUS_SUPPORTED = YES (Gabarito Preliminar)
ANNULLED_QUESTION_STATUS_SUPPORTED = YES (Questão Anulada / Anulada pela Banca)
HISTORICAL_OFFICIAL_ANSWER_PRESERVED = YES
UI_LAYOUT_CHANGED = NO
ATTEMPTS_CHANGED = NO
ERROR_CASE_CONSOLIDATION_PRESERVED = YES
OFFICIAL_LABEL_ONLY_FOR_OFFICIAL_QUESTIONS = YES
UNKNOWN_ORIGIN_USES_SAFE_LABEL = YES
HISTORICAL_OFFICIAL_ANSWER_INTEGRITY = YES
FIRESTORE_SCHEMA_CHANGES = 0
FSRS_CHANGES = 0
PPS_CHANGES = 0
FUNCTIONALITY_REMOVED = 0
ROUTES_REMOVED = 0
```

Classificação final: **ERROR_NOTEBOOK_QUESTION_PROVENANCE_NORMALIZED**
