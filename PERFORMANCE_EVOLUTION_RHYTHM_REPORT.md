# Relatório de Integração de Ritmo em Evolução 3.0 (Etapa 1.16H)

**Data da Implementação:** 03 de Setembro de 2026  
**Status da Suíte:** 201/201 Testes PASS (23 arquivos de teste) • 0 Erros de Console  
**Escopo:** Integração de telemetria de ritmo na subview `/desempenho/evolucao` em [`DesempenhoView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/desempenho/DesempenhoView.tsx), cálculo de mediana de tempo ativo por questão e implementação do threshold de apresentação (`MIN_TIMED_ATTEMPTS_FOR_DISPLAY = 10`).

---

## 1. Auditoria de Tempo Ocioso Visível (Visible Idle)

| Critério | Diagnóstico Técnico |
| :--- | :--- |
| **`VISIBLE_IDLE_TIME_EXCLUDED`** | **`NO`** |
| **Classificação Metodológica** | **`ACTIVE_TIME_TRACKING = FOREGROUND_TIME_TRACKING`** (mede o tempo com a aba aberta em primeiro plano). Se o aluno deixar a aba aberta sem interação física, o tempo é contabilizado até que a aba seja oculta ou minimizada. |
| **Mitigação Estatística Adotada** | A utilização da **Mediana** (`TIME_METRIC_SOURCE = MEDIAN`) em vez da média protege o indicador contra pausas ou interrupções esporádicas. |
| **Rótulo na UI** | **`Tempo típico por questão`** acompanhado de tooltip explicativo: *"Mediana do tempo ativo registrado nas questões respondidas."* |

---

## 2. Regra de Apresentação e Threshold de Cobertura

- **Threshold Definido:** `MIN_TIMED_ATTEMPTS_FOR_DISPLAY = 10` (mínimo de 10 tentativas com telemetria ativa versionada).
- **Comportamento Condicional:**
  - Se $\text{countWithTiming} \ge 10$: exibe o valor formatado da mediana (ex: `1m22s`, `42s`) com subtexto *"Mediana baseada em X questões"*.
  - Se $\text{countWithTiming} < 10$: exibe o estado elegante **`Coletando dados`** com subtexto orientador *"Mínimo de 10 questões cronometradas"*.

---

## 3. Estrutura dos 3 Indicadores Principais (Evolução 3.0)

A primeira camada consolidada apresenta os 3 eixos essenciais de treino sem sobrecarga visual:
1. **Qualidade:** **Taxa de Acerto do Período** (`{periodAccuracy}%`) + contexto `{totalCorrect} acertos · {totalIncorrect} erros`.
2. **Volume:** **Questões Resolvidas** (`{totalQuestions}` no período).
3. **Ritmo:** **Tempo Típico por Questão** (`{formattedMedian}` ou `"Coletando dados"` com ícone explicativo).

A variação no período (`+X p.p.` / `-X p.p.`) é posicionada junto ao cabeçalho da trajetória de acertos.

---

## 4. Classificação Obrigatória

```
============================================================
STATUS DA EVOLUÇÃO 3.0 (QUALIDADE + VOLUME + RITMO):
============================================================
VISIBLE_IDLE_TIME_EXCLUDED           = NO
ACTIVE_TIME_TRACKING                 = FOREGROUND_TIME_TRACKING
TIMING_PRESENTATION_THRESHOLD        = 10 (MIN_TIMED_ATTEMPTS_FOR_DISPLAY)

TIME_METRIC_SOURCE                   = MEDIAN
TIME_METRIC_LABEL                    = "Tempo típico por questão"
TIME_METRIC_DISPLAYED                = YES/CONDITIONAL (se >= 10 attempts cronometrados)
TIME_METRIC_INSUFFICIENT_STATE       = YES (Coletando dados)
MEAN_DISPLAYED                       = NO (Exclusivo Mediana)

PERIOD_ACCURACY_WEIGHTED_CORRECTLY   = YES (TotalCorrect / TotalAnswered)
ABSOLUTE_ERRORS_VISIBLE              = YES (Exibidos em contexto)
QUESTION_VOLUME_VISIBLE              = YES

LEGACY_ATTEMPTS_IGNORED              = YES
PRINTABLE_ATTEMPTS_IGNORED           = YES
CARD_WALL_REINTRODUCED               = NO (3 cards limpos + trajetória)

ROUTES_REMOVED                       = 0
FUNCTIONALITY_REMOVED                = 0
PPS_CHANGES                          = 0
FSRS_CHANGES                         = 0
FIRESTORE_CHANGES                    = 0

NPM_TEST_BEFORE                      = 196/196 PASS
NPM_TEST_AFTER                       = 201/201 PASS
CONSOLE_ERRORS                       = 0
============================================================
CLASSIFICAÇÃO FINAL:
PERFORMANCE_EVOLUTION_RHYTHM_INTEGRATED
============================================================
```
