# Relatório de Auditoria Visual e Estrutural das Telas de Desempenho (Etapa 1.16B)

**Data da Auditoria:** 03 de Setembro de 2026  
**Status da Suíte:** 184/184 Testes PASS • 0 Erros de Console  
**Escopo:** Diagnóstico exaustivo (Read-Only) da arquitetura de informação, rotas, hierarquia visual, dados consumidos, métricas exibidas, concorrência de CTAs e dependências de dados legados do módulo `/desempenho` (`/desempenho/geral`, `/desempenho/areas`, `/desempenho/evolucao`).

---

## 1. Mapeamento de Rotas, Componentes e Serviços

```
/desempenho/geral (ou /desempenho)
└── DesempenhoView (subtab GERAL)
    └── UnifiedProgressView (defaultTab READINESS)
        ├── Sub-tabs internas legadas: READINESS | CALENDAR | TRENDS | MATRIX | SUS
        ├── Modais integrados: WhatIfSimulatorModal (setIsWhatIfOpen)
        └── Hooks & Contextos: useApp() [user, readinessData, setIsWhatIfOpen]

/desempenho/areas
└── DesempenhoView (subtab AREAS)
    ├── Grid das 5 Grandes Áreas Médicas
    ├── Ação secundária: [ Ver Matriz de Competências ] -> /desempenho/matriz
    └── Hooks & Contextos: useApp() [attempts, questions, knowledgeGraph, readinessData]

/desempenho/evolucao (ou /evolucao)
└── DesempenhoView (subtab EVOLUCAO)
    ├── Trajetória Semanal de Acurácia (4 semanas dinâmicas)
    ├── Ação secundária: [ Ver Tendências Históricas INEP ] -> /desempenho/tendencias
    └── Hooks & Contextos: useApp() [attempts]

/desempenho/matriz (Rota Especializada Preservada)
└── DesempenhoView (subtab MATRIZ)
    └── KnowledgeGraphView
        └── Microcompetências, ROI de tempo de estudo e filtros por área

/desempenho/tendencias (Rota Especializada Preservada)
└── DesempenhoView (subtab TENDENCIAS)
    └── InepPatternEngineView
        └── Raio-X do Edital, Questões Irmãs, Backtest e Tendências Históricas do INEP
```

---

## 2. Inventário Detalhado por Tela

### A. Visão Geral (`/desempenho/geral`)
- **Pergunta Central:** *"Como estou no geral?"*
- **Componente Principal:** `UnifiedProgressView` (dentro de `DesempenhoView`).
- **Elementos Visuais Encontrados:**
  1. Header com título *"Minha evolução"* + **Barra com 5 sub-tabs internas redundantes** (`Aprovação`, `Calendário`, `Tendências INEP`, `Matriz`, `SUS & Brasil`) $\to$ **DUPLICATED / LEGACY_CONTAINER**.
  2. Banner de Probabilidade de Aprovação: *"Probabilidade estimada de superar o corte: {score}%"* $\to$ **CLAIM_REVIEW_REQUIRED**.
  3. CTA Primário: `[ Simular Prova Hoje ]` (abre modal de simulação What-If).
  4. Grid de 3 Métricas Estatísticas:
     - Faixa de Nota Projetada (ex: `58–67 / 100`) $\to$ **CLAIM_REVIEW_REQUIRED**.
     - Intervalo de Confiança 95% (Margem: ±X pts) $\to$ **TECHNICAL / HEURISTIC**.
     - Evolução Recente 14d (+X%, questões resolvidas) $\to$ **PRIMARY**.
  5. Desempenho por Área (5 barras de progresso com acurácia) $\to$ **SECONDARY**.
  6. Box de Transparência Metodológica (`Como calculamos...`) $\to$ **DETAIL**.
- **Densidade Visual:** **HIGH** (devido ao aninhamento da barra de sub-tabs interna e múltiplos blocos estatísticos).

### B. Por Área (`/desempenho/areas`)
- **Pergunta Central:** *"Onde estou forte ou fraco?"*
- **Componente Principal:** `DesempenhoView` (seção `AREAS`).
- **Elementos Visuais Encontrados:**
  1. Cabeçalho limpo com título *"Desempenho por Área Médica"* e botão secundário `[ Ver Matriz de Competências ]`.
  2. Grid de 5 Cards (Clínica Médica, Cirurgia Geral, GO, Pediatria, Medicina Preventiva/SUS):
     - Taxa de acerto em destaque (`%` com cor semântica verde/âmbar).
     - Barra de progresso visual.
     - Quantidade de questões resolvidas na área.
     - Ponto prioritário de revisão (`Ponto a revisar: {weakSpot}`).
- **Densidade Visual:** **MEDIUM** (Layout limpo, direto e perfeitamente focado na pergunta da tela).

### C. Evolução (`/desempenho/evolucao`)
- **Pergunta Central:** *"Estou melhorando ao longo do tempo?"*
- **Componente Principal:** `DesempenhoView` (seção `EVOLUCAO`).
- **Elementos Visuais Encontrados:**
  1. Cabeçalho com título *"Evolução do Desempenho"*, badge *"Dados Reais"* e botão secundário `[ Ver Tendências Históricas INEP ]`.
  2. Painel de Trajetória Semanal com total de questões registradas no Firestore.
  3. 4 Barras de Evolução Semanal (`Semana 1`, `Semana 2`, `Semana 3`, `Semana Atual`) com taxa de acerto e volume de questões calculados a partir dos `attempts` reais.
- **Densidade Visual:** **MEDIUM** (Estrutura simples, limpa e responsiva).

---

## 3. Duplicação de Métricas e Componentes

1. **`DUPLICATED_COMPONENTS`:**
   - O componente [`UnifiedProgressView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/progress/UnifiedProgressView.tsx) atua como um container monolítico antigo que re-incorpora:
     - `AdaptiveCalendarView` (aba `CALENDAR`)
     - `InepPatternEngineView` (aba `TRENDS`)
     - `KnowledgeGraphView` (aba `MATRIX`)
     - `BrazilMedicineGuideView` (aba `SUS`)
   - Isso duplica módulos inteiros que já possuem rotas canônicas e navegação dedicada na Sidebar.

2. **`DUPLICATED_METRICS`:**
   - **Acurácia por Grande Área:** Exibida resumidamente em *Visão Geral* e detalhada em *Por Área*.
   - **Total de Questões Resolvidas:** Exibido no card de evolução recente da *Visão Geral* e no topo de *Evolução*.

---

## 4. Auditoria de Métricas Técnicas e Alegações (Claims)

| Termo / Métrica | Localização | Avaliação Pedagógica | Classificação |
| :--- | :--- | :--- | :--- |
| **Probabilidade estimada de corte (X%)** | Visão Geral (`readinessData.score`) | Sugere probabilidade estatística de passar na prova. | **CLAIM_REVIEW_REQUIRED** (cálculo heurístico baseado em readiness) |
| **Faixa de Nota Projetada (Min–Max)** | Visão Geral (`projectedMin–Max`) | Projeta nota final no exame real. | **CLAIM_REVIEW_REQUIRED** (sem calibração psicométrica oficial) |
| **Intervalo de Confiança (95%)** | Visão Geral | Termo estatístico avançado de inferência. | **HIDE_BEHIND_DETAILS** |
| **ROI do Tempo de Estudo** | Matriz (`KnowledgeGraphView`) | Termo econômico para ganho de pontos por hora. | **SECONDARY** |
| **Microcompetências** | Matriz (`KnowledgeGraphView`) | Nomenclatura da taxonomia de nós. | **SECONDARY** |
| **IRS (Índice de Recorrência StaziaMed)** | Tendências INEP (`InepPatternEngineView`)| Métrica interna de recorrência. | **HIDE_BEHIND_DETAILS** |

---

## 5. Dependência do Dataset Legado (`LEGACY_DATA_DEPENDENT_METRICS`)

As métricas calculadas a partir de `attempts` dependem do histórico real de questões do usuário. Como o dataset atual de 300 questões no Firestore foi classificado como `LEGACY_TEMPORARY_DATASET`:
- **`areaPerformance`:** A acurácia por área depende das questões provisórias resolvidas.
- **`evolutionWeeks`:** A taxa semanal reflete o acerto no dataset provisório.
- **`readinessData`:** As projeções de nota baseiam-se em amostragem provisória.
- **Recomendação:** A interface não deve prometer "previsão exata de aprovação no Revalida", mas sim apresentar as métricas como "Desempenho no Banco de Treino".

---

## 6. Responsividade e Cores

- **1440px / 1024px (Desktop):** Boa disposição em grids de 3 a 5 colunas.
- **768px (Tablet):** Quebra limpa para 2 colunas; as barras de progresso preservam legibilidade.
- **390px (Mobile):**
  - Em *Por Área* e *Evolução*, o empilhamento vertical funciona naturalmente.
  - Em *Visão Geral*, a barra interna de 5 sub-tabs sofre quebra de linha excessiva, gerando ruído no topo.
- **Cores Semânticas por Área:**
  - O sistema utiliza primariamente ciano/esmeralda para acurácia >= 70% e âmbar para < 70%. Não há cores individuais arbitrárias por especialidade, mantendo coerência visual.

---

## 7. Fluxogramas Comparativos

### Fluxograma Atual (Monolítico em Visão Geral)
```
/desempenho/geral ──► UnifiedProgressView ──► Tabs internas (Aprovação | Calendário | Tendências | Matriz | SUS)
/desempenho/areas ──► DesempenhoView (AREAS) ──► 5 Cards de Grandes Áreas ──► [ Ver Matriz ]
/desempenho/evolucao ──► DesempenhoView (EVOLUCAO) ──► 4 Semanas de Acurácia ──► [ Ver Tendências ]
```

### Fluxograma Simplificado Recomendado
```
/desempenho/geral (Visão Geral Limpa)
  ├── 1. Card de Status Geral (Acurácia global + Total de questões resolvidas + Meta da semana)
  ├── 2. Resumo das 5 Grandes Áreas (visão compacta de progresso)
  └── 3. Próxima Ação Recomendada (CTA: Praticar Área com Menor Domínio)

/desempenho/areas (Por Área)
  ├── 1. 5 Grandes Áreas com acurácia e ponto fraco a revisar
  └── 2. Ação contextual: [ Ver Matriz de Competências ]

/desempenho/evolucao (Evolução)
  ├── 1. Gráfico de trajetória temporal das últimas 4 semanas
  └── 2. Ação contextual: [ Ver Tendências Históricas INEP ]
```

---

## 8. Componentes Candidatos à Reutilização Futura

1. `PerformanceAreaCard`: Card reutilizável para exibição de métricas e pontos a revisar por área.
2. `PerformanceWeeklyTrendBar`: Componente gráfico compacto para curvas temporais.
3. `PerformanceGlobalHeader`: Cabeçalho padrão simplificado com título e badge de dados reais.

---

## 9. Resumo Obrigatório das Métricas de Auditoria

```
============================================================
RESUMO DA AUDITORIA VISUAL DO DESEMPENHO:
============================================================
GENERAL_VISUAL_DENSITY         = HIGH (devido a sub-tabs internas legadas em UnifiedProgressView)
AREA_VISUAL_DENSITY            = MEDIUM (5 cards bem distribuídos)
EVOLUTION_VISUAL_DENSITY       = MEDIUM (4 barras de trajetória limpas)

GENERAL_FIRST_VIEWPORT_CARDS   = 6 (Header, Sub-tabs, Summary, 3 Métricas, 5 Áreas)
AREA_FIRST_VIEWPORT_CARDS      = 5 (5 cards de áreas médicas)
EVOLUTION_FIRST_VIEWPORT_CARDS = 4 (4 cards semanais)

DUPLICATED_METRICS_COUNT       = 2 (Acurácia por área, total de questões resolvidas)
DUPLICATED_COMPONENTS_COUNT    = 4 (Calendar, Trends, Matrix, SUS embutidos em UnifiedProgressView)

TECHNICAL_LABEL_COUNT          = 4 (Readiness Score, IC 95%, ROI de Estudo, IRS)
CLAIM_REVIEW_REQUIRED_COUNT    = 2 (Probabilidade de superar o corte, Faixa de nota projetada)

LEGACY_DATA_DEPENDENT_METRICS  = 3 (Accuracy por área, evolução semanal, prontidão estimada)

PRIMARY_CTA_COUNT_GENERAL      = 1 (Simular Prova Hoje)
PRIMARY_CTA_COUNT_AREA         = 0 (Apenas botão secundário "Ver Matriz")
PRIMARY_CTA_COUNT_EVOLUTION    = 0 (Apenas botão secundário "Ver Tendências")
============================================================
CLASSIFICAÇÃO FINAL:
PERFORMANCE_LAYOUT_AUDITED
============================================================
```
