# Relatório de Política de Versionamento de Telemetria (Etapa 1.16J)

**Data da Implementação:** 03 de Setembro de 2026  
**Status da Suíte:** 213/213 Testes PASS (25 arquivos de teste) • 0 Erros de Console  
**Escopo:** Implementação de política estrita de versionamento analítico de telemetria em [`questionTimingService.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/services/questionTimingService.ts), garantindo que a métrica principal de ritmo ("Tempo típico por questão") utilize exclusivamente dados idle-aware (`timingVersion: 2`) sem contaminação semântica por tentativas `v1` (foreground-only).

---

## 1. Definição Semântica das Versões

| Versão | Semântica da Medição | Status no Produto | Papel Analítico |
| :--- | :--- | :--- | :--- |
| **`timingVersion = 1`** | `FOREGROUND_TIME` (Aba em primeiro plano sem detecção de inatividade prolongada) | Histórico / Legado | Preservado intacto para auditoria histórica; **não** alimenta a métrica de ritmo idle-aware. |
| **`timingVersion = 2`** | `IDLE_AWARE_ACTIVE_TIME` (Aba visível + atividade humana com corte determinístico em 5 min) | **Padrão Atual** | **Fonte Exclusiva de Verdade** para "Tempo típico por questão". |

---

## 2. Política de Isolamento e Apresentação

1. **Separação Estrita de Versões:**
   - A função `getQuestionTimingMetrics(attempts)` utiliza por padrão `allowedVersions = [TIMING_VERSION_IDLE_AWARE]` (`v2`).
   - Tentativas em `v1` são computadas em `v1Count` e `v1MedianActiveDurationMs` de forma isolada e **não** são misturadas com `v2` para atingir artificialmente o threshold de apresentação.

2. **Aplicação do Threshold (`MIN_TIMED_ATTEMPTS_FOR_DISPLAY = 10`):**
   - Apenas tentativas válidas com `timingVersion === 2` contam para o threshold.
   - Exemplo: um aluno com 8 tentativas `v2` e 20 tentativas `v1` verá o estado **`Coletando dados`** (já que `v2Count = 8 < 10`), garantindo pureza estatística absoluta.

3. **Proteção Contra Contaminação de Outliers Legados:**
   - Valores extremos de `v1` (ex: 20min, 30min de aba aberta) não alteram em absolutamente nada a mediana de `v2`.

4. **Integridade de Gabaritos Impressos e Histórico:**
   - Exames impressos (`InepPrintableExam`) e tentativas sem versionamento continuam 100% excluídos das métricas de ritmo.

---

## 3. Testes Automatizados Implementados

Criada suíte dedicada em [`questionTimingVersionPolicy.test.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/__tests__/questionTimingVersionPolicy.test.ts):
- **Cenário Crítico:** 8 attempts `v2` + 20 attempts `v1` resulta em `isTimingDisplayable: false` (`v2Count = 8`).
- **Cenário de Threshold:** 10 attempts `v2` exibe a mediana calculada estritamente sobre os 10.
- **Cenário de Contaminação:** Outliers de `v1` (20min, 30min, 40min) não alteram a mediana `v2` (`1m45s`).
- **Preservação:** Tentativas legadas e de exames impressos são preservadas sem mutação destrutiva.

---

## 4. Classificação Obrigatória

```
============================================================
STATUS DA POLÍTICA DE VERSIONAMENTO ANALÍTICO (ETAPA 1.16J):
============================================================
TIMING_V1_SEMANTIC                   = FOREGROUND_TIME
TIMING_V2_SEMANTIC                   = IDLE_AWARE_ACTIVE_TIME

PRIMARY_TIMING_VERSION               = 2 (TIMING_VERSION_IDLE_AWARE)
V1_V2_COMBINED_FOR_PRIMARY_METRIC    = NO
V2_MIN_DISPLAY_ATTEMPTS              = 10

V1_ATTEMPTS_PRESERVED                = YES
V1_ATTEMPTS_USED_FOR_PRIMARY_RHYTHM  = NO
PRINTABLE_USED_FOR_TIMING            = NO

UI_LAYOUT_CHANGED                    = NO
ROUTES_REMOVED                       = 0
FUNCTIONALITY_REMOVED                = 0
PPS_CHANGES                          = 0
FSRS_CHANGES                         = 0
FIRESTORE_CHANGES                    = 0

NPM_TEST_BEFORE                      = 209/209 PASS
NPM_TEST_AFTER                       = 213/213 PASS
CONSOLE_ERRORS                       = 0
============================================================
CLASSIFICAÇÃO FINAL:
TIMING_ANALYTICS_VERSION_POLICY_READY
============================================================
```
