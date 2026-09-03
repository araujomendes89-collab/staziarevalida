# Relatório de Refinamento de Métricas de Evolução 2.0 (Etapa 1.16F)

**Data da Auditoria e Implementação:** 03 de Setembro de 2026  
**Status da Suíte:** 186/186 Testes PASS (21 arquivos de teste) • 0 Erros de Console  
**Escopo:** Auditoria de telemetria de tempo por questão, cálculo estrito de taxa de acerto ponderada por tentativas no período e refinamento da subview `/desempenho/evolucao` em [`DesempenhoView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/desempenho/DesempenhoView.tsx).

---

## 1. Auditoria de Tracking de Tempo por Questão

| Parâmetro | Diagnóstico Técnico |
| :--- | :--- |
| **`QUESTION_TIME_TRACKING`** | **`PARTIAL`** |
| **Fontes de Dados de Tempo** | `ActiveSessionResolutionView.tsx` (timer ativo com `setInterval`), `InepPrintableExam.tsx` (default fixo de 120s), `QuestionAttempt.timeSpentSeconds`. |
| **Confiabilidade da Medição** | **Parcial**: Não há listener de `visibilityState` ou detecção de abas em segundo plano / abandono temporário de sessão, o que permite outliers extremos em sessões pausadas. |
| **Média vs. Mediana** | A **mediana** é estatisticamente superior para tempo por questão pois neutraliza interrupções longas. |
| **Exibição na UI Atual** | **`TIME_METRIC_DEFERRED = YES`**. Por prudência metodológica, a métrica de "Tempo por questão" não foi forçada na primeira camada visual enquanto a telemetria não contar com detecção ativa de foco/background. |

---

## 2. Cálculo da Taxa de Acerto do Período (Ponderação Estrita)

- **Método Adotado:** **Ponderação Real por Tentativas**
  $$\text{Taxa Ponderada} = \left( \frac{\sum \text{Acertos}}{\sum \text{Questões}} \right) \times 100$$
- **Erro Evitado:** Nunca calcular a média aritmética simples das taxas semanais $\left( \frac{\text{Taxa}_1 + \text{Taxa}_2}{2} \right)$, pois semanas com 1 questão e 100 questões distorceriam o desempenho agregado (ex.: $1/1 = 100\%$ e $60/100 = 60\%$ resulta corretamente em $61/101 \approx 60.4\%$, e não $80\%$).
- **Proteção por Teste Unitário:** Criado [`performancePeriodMetrics.test.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/__tests__/performancePeriodMetrics.test.ts) validando essa propriedade matemática.

---

## 3. Indicadores Essenciais da Camada Principal (Evolução 2.0)

A primeira camada exibe 3 métricas limpas e factuais:
1. **Taxa de Acerto do Período:** `{periodAccuracy}%` com contexto discreto: `{totalCorrect} acertos · {totalIncorrect} erros`.
2. **Questões Resolvidas:** Total de questões respondidas no período analisado.
3. **Variação no Período:** Diferença líquida entre a semana inicial e mais recente expressa em pontos percentuais (`+X p.p.` ou `-X p.p.`).

---

## 4. Classificação Obrigatória

```
============================================================
STATUS DO REFINAMENTO DE MÉTRICAS DA EVOLUÇÃO (2.0):
============================================================
PERIOD_ACCURACY_WEIGHTED_CORRECTLY   = YES (TotalCorrect / TotalAnswered)
ABSOLUTE_CORRECT_INCORRECT_AVAILABLE = YES (Exibidos em contexto)
QUESTION_TIME_TRACKING               = PARTIAL
TIME_METRIC_DISPLAYED                = NO
TIME_METRIC_DEFERRED                 = YES (Aguardando telemetria com detecção de foco/background)

CARD_WALL_REINTRODUCED               = NO (1 container limpo com trajetória e volume)
ROUTES_REMOVED                       = 0
FUNCTIONALITY_REMOVED                = 0
PERFORMANCE_CALCULATION_CHANGES      = Derivação estrita de acertos/erros no período agregado
PPS_CHANGES                          = 0
FSRS_CHANGES                         = 0
FIRESTORE_CHANGES                    = 0

NPM_TEST_BEFORE                      = 184/184 PASS
NPM_TEST_AFTER                       = 186/186 PASS
CONSOLE_ERRORS                       = 0
============================================================
CLASSIFICAÇÃO FINAL:
PERFORMANCE_EVOLUTION_METRICS_REFINED
============================================================
```
