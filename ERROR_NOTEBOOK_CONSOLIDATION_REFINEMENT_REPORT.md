# RELATÓRIO DE CONSOLIDAÇÃO DE ERROR CASES E REFINAMENTO VISUAL DO CADERNO DE ERROS (ETAPA 1.21B)

Data: 03/09/2026
Status: **ERROR_NOTEBOOK_CONSOLIDATION_REFINED**
Baseline de Testes: **267/267 testes PASS** (36 arquivos de teste)
Console Errors: **0**

---

## 1. Identity Audit (`ERROR_CASE_IDENTITY_KEY`)

- **Chave de Identidade Auditada:** `questionId` (ligando deterministicamente `attempt.questionId` a `question.id`).
- **Avaliação de Segurança:** Determinística, confiável e canônica em todo o projeto.
- **Regra Anti-Fusão:** O sistema **nunca** consolida questões distintas com base em `topic`, `subtopic`, `clinicalCase` ou `canonicalTopicId`. Duas questões do mesmo tema permanecem como dois `ErrorCase`s independentes.

---

## 2. Source of Truth & Imutabilidade

- **Storage / Banco de Tentativas (`praxis_attempts_v2`):** Permanece **100% imutável**. Nenhuma tentativa histórica de erro ou acerto foi apagada, alterada ou agrupada no storage.
- **`ErrorCase` Model:** Criado estritamente como um **`DERIVED_READ_MODEL`** (modelo de leitura derivado em memória via seletor puro `buildErrorCases`).
- **Migrações / Firestore:** **0** alterações em schemas, **0** coleções novas no Firestore, **0** migrações de dados.

---

## 3. Modelo Derivado `ErrorCase`

Implementado no serviço desacoplado [`src/services/errorNotebookService.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/services/errorNotebookService.ts):

```typescript
export interface ErrorCase {
  questionId: string;
  question: Question;
  wrongAttempts: QuestionAttempt[];
  allAttempts: QuestionAttempt[];
  wrongAttemptCount: number;
  totalAttemptCount: number;
  firstErrorAt: string;
  lastErrorAt: string;
  latestWrongAttempt: QuestionAttempt;
  latestAttempt: QuestionAttempt;
  laterCorrectAttempt?: QuestionAttempt;
  isRemediated: boolean;
  reflection: string;
  recurrentTopicErrorCount: number;
}
```

---

## 4. Preservação de Tentativas e Consolidação Derivada

| Cenário | Storage (`attempts`) | Visão no Caderno de Erros (`ErrorCases`) |
| :--- | :--- | :--- |
| **Q1:** Errou 3 vezes (10/08, 15/08, 20/08) | 3 tentativas preservadas | 1 ErrorCase (`wrongAttemptCount = 3`, `isRemediated = false`) |
| **Q1:** Errou (10/08), Errou (15/08), Acertou (22/08) | 3 tentativas preservadas | 1 ErrorCase (`wrongAttemptCount = 2`, `isRemediated = true`) |
| **Q1:** Acertou (05/08), Errou (10/08) | 2 tentativas preservadas | 1 ErrorCase (`wrongAttemptCount = 1`, `isRemediated = false` — temporality rule) |
| **Q1 & Q2:** Ambas de Pediatria / Bronquiolite | 2 tentativas | 2 ErrorCases distintos |

---

## 5. Filtros, Status & KPIs de Remediação

### 5.1. KPIs no Topo (3 Indicadores Focados)
1. **Para Revisar:** Contagem de casos ativos pendentes (`!isRemediated`).
2. **Superados:** Contagem de casos com acerto posterior (`isRemediated = true`).
3. **Questões Recorrentes:** Contagem factual de questões erradas $\ge 2$ vezes (`wrongAttemptCount >= 2`).

### 5.2. Dimensões de Filtro
- **Status:** `Para Revisar` (padrão) | `Superados` | `Todos`
- **Grande Área:** Todas | Clínica Médica | Cirurgia Geral | Pediatria | G.O. | Preventiva / SUS
- **Ano de Prova:** Dinâmico com base nos anos das questões no caderno (ex: 2026, 2025, 2024...)
- **Busca Textual:** Tema, subtema, enunciado clínico, código da questão.
- **Ordenação Determinística:** Mais recentes (`lastErrorAt`), Mais antigas (`firstErrorAt`), Maior incidência (`wrongAttemptCount`).

---

## 6. Refinamento Visual e Acessibilidade do Card

- **Identificação Completa:** Badge de Área médica com cores semânticas (`getAreaVisualTheme`), código da questão (`REV-2025.1-CM-12` ou `Q12`), edição do exame.
- **Scanability Alta:** Trecho curto do enunciado (1 linha clamped), evitando enunciados gigantes que poluem a tela.
- **Comparativo Acessível de Respostas:**
  - `Sua resposta: Alternativa B ✕` (com ícone e texto explicito, não apenas cor).
  - `Gabarito oficial: Alternativa D ✓` (com ícone e texto explicito).
- **Histórico de Tentativas Secundário:** Botão discreto `Ver histórico de N tentativas` quando `allAttempts.length > 1`, abrindo a timeline detalhada com data, modo e desfecho de cada resolução.
- **Reflexão do Aluno:** Área dedicada *"Por que eu errei esta questão?"* com persistência local e sincronização transparente com Firestore `/errors`.
- **Ações:** Botão primário *"Refazer Esta Questão"* e botão global *"TREINAR X ERROS PENDENTES"* que despacham diretamente para o motor central de questões (`SessionBuilderService` $\to$ `/praticar-questoes`).
- **Apresentação Progressiva:** Exibição inicial de 25 casos com botão *"Mostrar mais"* para alto desempenho em alunos com centenas de erros acumulados.

---

## 7. Comparativo Obrigatório (Antes × Depois)

| Métrica | Antes (1.21A) | Depois (1.21B) |
| :--- | :--- | :--- |
| **ERROR_CASE_IDENTITY_KEY** | Heurística / implícita | `questionId` (auditada & determinística) |
| **ERROR_CASE_MODEL** | Inexistente (lista de attempts) | `DERIVED_READ_MODEL` (`buildErrorCases`) |
| **REPEATED_ERROR_HANDLING** | `MULTIPLE_ENTRIES` (duplicatas visuais) | `CONSOLIDATED_VIEW` (1 card por questão com contador) |
| **ATTEMPT_HISTORY_PRESERVED** | YES | **YES** (100% no storage) |
| **ERROR_ENTRY_CRITERIA_CHANGED** | NO (`!isCorrect`) | **NO** (`!isCorrect`) |
| **ERROR_EXIT_CRITERIA_CHANGED** | NO (`hasLaterCorrectAttempt`) | **NO** (`isRemediated = true`) |
| **RETRAIN_LOGIC_CHANGED** | NO (`SessionBuilderService`) | **NO** (`SessionBuilderService`) |
| **ERROR_CARD_SURFACE_DEPTH** | 3 | **2** (limpo, hierárquico) |
| **ERROR_NOTEBOOK_DENSITY** | MEDIUM (poluído por repetidos) | **LOW/OPTIMIZED** (alta scanability) |
| **ANSWER_COMPARISON_CLARITY** | MEDIUM (texto simples) | **HIGH** (ícone + texto + contraste) |
| **ATTEMPT_TIMELINE_IN_CARD** | NO | **YES** (expansível quando >1) |
| **PROGRESSIVE_PRESENTATION** | NO (renderizava tudo) | **YES** (25 iniciais + Ver Mais) |
| **REFLECTION_PRESERVED** | YES | **YES** |
| **AUTOPSY_PRESERVED** | YES | **YES** |
| **CENTRAL_QUESTION_ENGINE_PRESERVED** | YES | **YES** |
| **ERROR_TO_FLASHCARD_FLOW** | NONE | **NONE** |
| **ERROR_TO_PPS_LINK** | NONE | **NONE** |
| **FIRESTORE_SCHEMA_CHANGES** | 0 | **0** |
| **FSRS_CHANGES** | 0 | **0** |
| **PPS_CHANGES** | 0 | **0** |

---

## 8. Resumo Obrigatório de Conclusão

```
ERROR_CASE_IDENTITY_KEY = questionId
ERROR_CASE_CONSOLIDATION = IMPLEMENTED
ATTEMPT_HISTORY_PRESERVED = YES
ERROR_CASE_MODEL = DERIVED_READ_MODEL
RAW_WRONG_ATTEMPTS = PRESERVED_FACTUAL_STORAGE
UNIQUE_ERROR_CASES = CONSOLIDATED_BY_QUESTION_ID
ACTIVE_ERROR_CASES = FILTERED_BY_PENDING_STATUS
REMEDIATED_ERROR_CASES = FILTERED_BY_SUPERADOS_STATUS
REPEATED_ERROR_HANDLING: MULTIPLE_ENTRIES → CONSOLIDATED_VIEW
ERROR_ENTRY_CRITERIA_CHANGED = NO
ERROR_EXIT_CRITERIA_CHANGED = NO
RETRAIN_LOGIC_CHANGED = NO
ERROR_CARD_SURFACE_DEPTH: 3 → 2
ERROR_NOTEBOOK_DENSITY: MEDIUM → LOW/OPTIMIZED
ANSWER_COMPARISON_CLARITY = HIGH
REFLECTION_PRESERVED = YES
AUTOPSY_PRESERVED = YES
CENTRAL_QUESTION_ENGINE_PRESERVED = YES
ERROR_TO_FLASHCARD_FLOW = NONE
ERROR_TO_PPS_LINK = NONE
FIRESTORE_SCHEMA_CHANGES = 0
FSRS_CHANGES = 0
PPS_CHANGES = 0
```

Classificação final: **ERROR_NOTEBOOK_CONSOLIDATION_REFINED**
