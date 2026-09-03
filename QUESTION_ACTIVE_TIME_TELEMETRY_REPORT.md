# Relatório de Telemetria Confiável de Tempo por Questão (Etapa 1.16G)

**Data da Auditoria e Implementação:** 03 de Setembro de 2026  
**Status da Suíte:** 196/196 Testes PASS (22 arquivos de teste) • 0 Erros de Console  
**Escopo:** Implementação do motor de medição de tempo ativo de resolução por questão (`QuestionTimingTracker`), integração com a Page Visibility API, timestamps monotônicos e funções analíticas puras (média, mediana e cobertura).

---

## 1. Auditoria do Modelo de Tentativa Existente

| Modelo / Interface | Campos Identificados | Diagnóstico |
| :--- | :--- | :--- |
| **`QuestionAttempt`** | `id`, `questionId`, `timestamp`, `selectedOption`, `isCorrect`, `timeSpentSeconds`, `confidence`, `mode` | Campo `timeSpentSeconds` armazenava inteiros em segundos. |
| **`SessionAnswerState`** | `questionId`, `selectedOption`, `isCorrect`, `timeSpentSeconds`, `confidence`, `timestamp` | Estado da resposta durante uma sessão de estudo/simulado. |
| **`ActiveTrainingSession`**| `totalDurationSeconds`, `answers`, `currentIndex`, `startTime`, `lastUpdated` | Container da sessão ativa com persistência local e Firestore. |

---

## 2. Implementação do Novo Motor de Telemetria

### A. Campos Adicionados (Retrocompatíveis e Opcionais)
- **`activeDurationMs?: number`**: Duração ativa de resolução em milissegundos calculada via timestamps monotônicos (`performance.now()`).
- **`timingVersion?: number`**: Versão da telemetria (`1 = TIMING_VERSION_ACTIVE_MONOTONIC`). Permite distinguir analiticamente tentativas com telemetria ativa real de tentativas legadas ou de exames impressos.

### B. Tratamento de Page Visibility API & Background
- **Eventos:** Registrado listener centralizado em `document.addEventListener("visibilitychange", ...)` com limpeza automática em React.
- **Comportamento:** Quando `document.visibilityState === "hidden"`, o segmento ativo é imediatamente congelado e somado ao tempo acumulado. Quando a aba volta a ficar visível (`visible`), um novo segmento monotônico é iniciado.

### C. Navegação Entre Questões & Resposta
- **Troca de Questão:** Ao navegar entre questões (Anterior, Próxima, Grid), o tempo ativo da questão anterior é congelado e preservado. Ao retornar à mesma questão na mesma sessão, o novo tempo é somado ao histórico acumulado.
- **Confirmação de Resposta:** Ao submeter a alternativa, o cronômetro ativo daquela questão é finalizado (`finishQuestion()`), impedindo acumulação posterior.

### D. Tratamento de Provas Impressas e Tentativas Legadas
- **`InepPrintableExam.tsx`**: Tentativas registradas via gabarito em papel **não** recebem `timingVersion: 1`, sendo automaticamente ignoradas pelas métricas de tempo ativo por questão.
- **Legacy Attempts**: Tentativas anteriores sem `activeDurationMs` permanecem intactas e **não** são convertidas para zero nas agregações.

---

## 3. Funções Analíticas Puras

- **`isValidTiming(attempt)`**: Validação estrita de número finito não-negativo com `timingVersion === 1`.
- **`calculateMedian(values)`**:
  - Comprimento ímpar: Elemento central do array ordenado.
  - Comprimento par: Média aritmética dos dois elementos centrais.
- **`getQuestionTimingMetrics(attempts)`**:
  - `timingCoverage`: Razão entre tentativas com telemetria válida e o total de tentativas ($N_{\text{valid}} / N_{\text{total}}$).
  - `meanActiveDurationMs`: Média das tentativas com telemetria válida.
  - `medianActiveDurationMs`: Mediana das tentativas com telemetria válida.

---

## 4. Testes Automatizados Implementados

Criado arquivo de testes [`questionTimingTelemetry.test.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/__tests__/questionTimingTelemetry.test.ts) validando:
- **A.** Contagem de tempo ativo com aba visível.
- **B & C.** Pausa quando `visibilityState = hidden` e retomada quando `visible`.
- **D.** Preservação de tempo acumulado na navegação entre questões.
- **E.** Finalização na confirmação da resposta e parada de acumulação.
- **F & M.** Tentativas legadas não são convertidas em zero e não poluem as métricas.
- **G & H.** Rejeição segura de valores inválidos (negativos, `NaN`, `Infinity`).
- **I.** Cálculo exato de média aritmética de tempo ativo.
- **J & K.** Cálculo exato de mediana para conjuntos de tamanho ímpar e par.
- **L.** Cálculo exato da cobertura de telemetria (`timingCoverage`).

---

## 5. Classificação Obrigatória

```
============================================================
STATUS DA TELEMETRIA DE TEMPO POR QUESTÃO (ETAPA 1.16G):
============================================================
ACTIVE_TIME_TRACKING                           = RELIABLE
BACKGROUND_TIME_EXCLUDED                       = YES (via Page Visibility API)
IDLE_TIME_HANDLING                             = YES (segmentos pausáveis e tracker centralizado)
LEGACY_ATTEMPTS_SUPPORTED                      = YES (sem mutação destrutiva)
PRINTABLE_EXAM_FAKE_TIME_REMOVED_FROM_ANALYTICS= YES (excluído de timingVersion: 1)

MEAN_TIME_AVAILABLE                            = YES
MEDIAN_TIME_AVAILABLE                          = YES
TIMING_COVERAGE_AVAILABLE                      = YES

TIME_METRIC_UI_CHANGED                         = NO (UI de Evolução preservada)
ROUTES_REMOVED                                 = 0
FUNCTIONALITY_REMOVED                          = 0
PERFORMANCE_CALCULATION_CHANGES                = 0
PPS_CHANGES                                    = 0
FSRS_CHANGES                                   = 0
PRODUCTION_WRITES                              = 0

NPM_TEST_BEFORE                                = 186/186 PASS
NPM_TEST_AFTER                                 = 196/196 PASS
CONSOLE_ERRORS                                 = 0
============================================================
CLASSIFICAÇÃO FINAL:
QUESTION_ACTIVE_TIME_TELEMETRY_READY
============================================================
```
