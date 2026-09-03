# Relatório de Telemetria com Detecção de Inatividade (Idle-Aware Timing — Etapa 1.16I)

**Data da Implementação:** 03 de Setembro de 2026  
**Status da Suíte:** 209/209 Testes PASS (24 arquivos de teste) • 0 Erros de Console  
**Escopo:** Implementação do motor de medição de tempo ativo por questão com detecção de inatividade de primeiro plano (`VISIBLE_IDLE_TIME_EXCLUDED = YES`), threshold operacional de 5 minutos (`QUESTION_IDLE_TIMEOUT_MS`), transição de versão analítica para `timingVersion: 2` e retrocompatibilidade com v1 e tentativas legadas.

---

## 1. Diagnóstico do Motor de Telemetria

| Parâmetro | Configuração Técnica | Detalhes Operacionais |
| :--- | :--- | :--- |
| **`QUESTION_IDLE_TIMEOUT_MS`** | **`300000 ms (5 minutos)`** | Timeout operacional para desconsiderar abandono prolongado da aba aberta em primeiro plano sem penalizar pausas normais de raciocínio clínico. |
| **`VISIBLE_IDLE_TIME_EXCLUDED`** | **`YES`** | Períodos de inatividade com a aba visível acima de 5 min deixam de ser computados. |
| **`IDLE_DETECTION_IMPLEMENTED`** | **`YES`** | Rastreador baseado em timestamps de última atividade (`lastActivityAt`). |
| **`IDLE_ACTIVITY_EVENTS`** | `pointerdown`, `keydown`, `touchstart`, `scroll`, `mousemove` (throttled) | Eventos leves e passivos no browser sem armazenamento de teclas, texto ou coordenadas. |
| **`IDLE_SEGMENT_END_STRATEGY`** | **`Capped at lastActivityAt`** | Quando o tempo ocioso atinge 5 minutos, o segmento acumulado é truncado no exato instante da última interação humana (`lastActivityAt`), descartando os 5 minutos de espera ociosa. |
| **`BACKGROUND_TIME_EXCLUDED`** | **`YES`** | Integração via Page Visibility API (`document.visibilityState === 'hidden'`). |
| **`TIMING_VERSION_BEFORE`** | `1` (Foreground Monotonic) | Gravações realizadas na etapa 1.16G. |
| **`TIMING_VERSION_AFTER`** | `2` (Idle-Aware Active Time) | Gravações ativas de resolução a partir desta etapa. |
| **`TIMING_V1_COMPATIBILITY`** | **`YES`** | `isValidTiming` e `getQuestionTimingMetrics` processam tentativas com `timingVersion: 1`. |
| **`TIMING_V2_COMPATIBILITY`** | **`YES`** | `finishQuestion()` emite `timingVersion: 2` e `activeDurationMs` de alta precisão. |
| **`ANALYTICS_VERSION_POLICY`** | `Multi-Version Safe` | Agrega tentativas válidas de `v1` e `v2` sem forçar zeros ou mutações retroativas. |
| **`PRINTABLE_EXCLUDED`** | **`YES`** | Exames impressos (`InepPrintableExam`) continuam sem `timingVersion`, ficando excluídos das análises de ritmo. |
| **`LEGACY_ATTEMPTS_PRESERVED`** | **`YES`** | Nenhuma alteração destrutiva ou backfill artificial nos dados históricos. |
| **`UI_CHANGED`** | **`NO`** | A tela `DesempenhoView.tsx` permanece visualmente idêntica. |

---

## 2. Estratégia de Isolamento de Segmentos

1. **Início da Resolução:** `startQuestion(questionId)` inicializa `lastActivityAt = performance.now()` e abre o segmento ativo.
2. **Atividade Contínua:** Eventos discretos e throttled mantêm `lastActivityAt` atualizado.
3. **Inatividade Prolongada (> 5 min):**
   - O cálculo `getCurrentActiveDurationMs()` e `commitActiveSegment()` trava a contagem em `lastActivityAt - activeSegmentStart`.
   - Nenhuma acumulação ocorre durante o período ocioso.
4. **Retomada:** Nova interação humana enquanto a página está visível reinicia um novo segmento ativo `activeSegmentStart = performance.now()`.
5. **Navegação & Resposta:** `finishQuestion()` grava a duração líquida consolidada com `timingVersion: 2`.

---

## 3. Testes Automatizados Implementados

Suíte dedicada em [`questionTimingIdleAware.test.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/__tests__/questionTimingIdleAware.test.ts):
- **A.** Contagem normal com atividade contínua.
- **B & C.** Disparo de idle após 5 min de inatividade e corte exato no timestamp `lastActivityAt`.
- **D.** Retomada do timer ativo em nova interação pós-inatividade.
- **E & F.** Prioridade de aba oculta (background) sem duplicação de pausa.
- **G.** `finishQuestion()` gravando `timingVersion: 2`.
- **H & J.** Isolamento e preservação de estado entre múltiplas questões.
- **K & L.** Suporte conjunto a versões v1/v2 e exclusão segura de tentativas de gabarito impresso.

---

## 4. Classificação Obrigatória

```
============================================================
STATUS DA TELEMETRIA COM DETECÇÃO DE INATIVIDADE (ETAPA 1.16I):
============================================================
BACKGROUND_TIME_EXCLUDED             = YES
VISIBLE_IDLE_TIME_EXCLUDED           = YES

ACTIVE_TIME_TRACKING                 = IDLE_AWARE_ACTIVE_TIME
QUESTION_IDLE_TIMEOUT_MS             = 300000 (5 minutos)
IDLE_SEGMENT_END_STRATEGY            = Capped at lastActivityAt

TIMING_VERSION_CURRENT               = 2 (TIMING_VERSION_IDLE_AWARE)
TIMING_V1_COMPATIBILITY              = YES
TIMING_V2_COMPATIBILITY              = YES

LEGACY_ATTEMPTS_PRESERVED            = YES
PRINTABLE_EXCLUDED                   = YES

UI_CHANGED                           = NO
ROUTES_REMOVED                       = 0
FUNCTIONALITY_REMOVED                = 0
PPS_CHANGES                          = 0
FSRS_CHANGES                         = 0
FIRESTORE_CHANGES                    = 0

NPM_TEST_BEFORE                      = 201/201 PASS
NPM_TEST_AFTER                       = 209/209 PASS
CONSOLE_ERRORS                       = 0
============================================================
CLASSIFICAÇÃO FINAL:
QUESTION_IDLE_AWARE_TIMING_READY
============================================================
```
