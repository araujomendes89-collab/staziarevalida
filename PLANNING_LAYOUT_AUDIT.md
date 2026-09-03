# Relatório de Auditoria Visual e Estrutural do Módulo Planejamento (Etapa 1.15A)

**Data da Auditoria:** 03 de Setembro de 2026  
**Status da Suíte:** 184/184 Testes PASS • 0 Erros de Console  
**Escopo:** Diagnóstico exaustivo (Read-Only) da arquitetura de informação, rotas, hierarquia visual, densidade de componentes, concorrência de CTAs e fluxos de navegação do módulo `/planejamento`.

---

## 1. Rotas Canônicas e Mapeamento de Componentes

| Rota / Tab ID | Componente Principal | Componentes Filhos / Modais Integrados | Serviços & Hooks Utilizados |
| :--- | :--- | :--- | :--- |
| **`/planejamento`** (alias default) | `PlanejamentoView` | `AdaptiveCalendarView`, `WeeklyPlanView`, Roadmap inline, Disponibilidade inline, Replanejamento inline | `useApp()` |
| **`/planejamento/calendario`** (`planejamento-calendario`) | `PlanejamentoView` $\to$ `AdaptiveCalendarView` | `WhyThisBlockModal`, `TimeBoxModal`, `GuidedStudySessionModal`, `ScheduleConfigModal`, `RecoveryPlanModal`, `WeeklyBulletinModal` | `SpacedRepetitionService`, `CalendarService`, `ExamEngine`, `StudyPlannerEngine`, `useApp()` |
| **`/planejamento/semanal`** (`planejamento-semanal`) | `PlanejamentoView` $\to$ `WeeklyPlanView` | Grade 7 dias, Bloco Operacional (Estudar / Praticar / Revisar) | `SpacedRepetitionService`, `useApp()` |
| **`/planejamento/ate-prova`** (`planejamento-ate-prova`) | `PlanejamentoView` (aba `ATE_PROVA`) | Bloco Macro-Ciclo, Timeline de 3 Fases (Semanas 1-6, 7-10, Últimas 2) | `useApp()` |
| **`/planejamento/disponibilidade`** (`planejamento-disponibilidade`) | `PlanejamentoView` (aba `DISPONIBILIDADE`) | Slider de horas/dia (1–10h), Seletor de Data Alvo da Prova | `useApp()` |
| **`/planejamento/replanejamento`** (`planejamento-replanejamento`) | `PlanejamentoView` (aba `REPLANEJAMENTO`) | Card de Diagnóstico de Aderência, Botão de Execução de Replanejamento | `useApp()` |

---

## 2. Diagnóstico da Duplicidade de Navegação

```
SIDEBAR (3 Itens)                      BARRA HORIZONTAL INTERNA (5 Tabs)
├── Calendário                          ├── Calendário
├── Plano semanal                       ├── Plano Semanal
└── Até a prova                         ├── Plano até a Prova
                                        ├── Disponibilidade  (Sub-item não exposto na sidebar)
                                        └── Replanejamento   (Sub-item não exposto na sidebar)
```

- **Diagnóstico:** Existe duplicação evidente entre os itens da Sidebar e a barra de tabs horizontais no topo de `PlanejamentoView`. O usuário possui 2 menus concorrentes ocupando espaço vertical precioso.

---

## 3. Inventário Detalhado por Tela

### A. Calendário (`/planejamento/calendario` • `AdaptiveCalendarView`)
- **Linhas de Código:** 1.236 linhas em um único arquivo.
- **Sub-Views Internas (6 abas secundárias):** `Hoje (Plano do Dia)`, `Visão Semanal`, `Plano até a Prova & Cobertura`, `O Que Não Estudar Agora`, `Matriz de Prioridade (A–D)`, `Autópsia de Erros`.
- **Modais Integrados (6 modais):**
  1. `WhyThisBlockModal` (Por que estudar isso?)
  2. `TimeBoxModal` (Tenho só X minutos)
  3. `GuidedStudySessionModal` (Modo Foco / Player de Estudo)
  4. `ScheduleConfigModal` (Ajustar Capacidade & Dias)
  5. `RecoveryPlanModal` (Imprevistos & Replanejamento)
  6. `WeeklyBulletinModal` (Boletim PPS Semanal)
- **Primeira Viewport:** Contém cerca de **18 cards/pills**, 4 métricas, 2 banners de alerta/toast, 1 hero banner de Missão com 5 etapas e 11 botões de ação na toolbar.
- **Densidade Visual:** **VERY_HIGH**.

### B. Plano Semanal (`/planejamento/semanal` • `WeeklyPlanView`)
- **Linhas de Código:** 422 linhas.
- **Estrutura:** Header compacto $\to$ Grade horizontal/responsiva de 7 dias com carga FSRS $\to$ Painel inferior com o desdobramento do dia selecionado (1. Estudar, 2. Praticar, 3. Revisar).
- **Densidade Visual:** **MEDIUM** (Estrutura clara e focada nos 7 dias).

### C. Até a Prova (`/planejamento/ate-prova` • Inline Roadmap)
- **Estrutura:** Header com contador de dias restantes (46d) $\to$ Barra de progresso da Fase 1 (68%) $\to$ Timeline de 3 Fases macro-curriculares.
- **Densidade Visual:** **LOW / MEDIUM** (Funciona como um mapa de orientação de longo prazo).

### D. Disponibilidade (`/planejamento/disponibilidade`)
- **Classificação:** **`CONFIGURATION_CANDIDATE`**.
- **Justificativa:** É um formulário simples de 2 campos (slider de horas e data alvo). Não justifica uma página isolada no menu principal; enquadra-se como modal ou gaveta de configurações.

### E. Replanejamento (`/planejamento/replanejamento`)
- **Classificação:** **`CONTEXTUAL_ACTION_CANDIDATE`**.
- **Justificativa:** É uma ação disparada sob demanda (quando o aluno atrasa blocos ou quer redistribuir a carga). Deve ser um modal ou gatilho contextual, não uma tela estática de navegação.

---

## 4. Classificação dos Elementos Visuais (Hierarquia & Competição)

| Elemento | Classificação | Nível Atual | Recomendação |
| :--- | :--- | :--- | :--- |
| **"ESTUDAR AGORA (Modo Foco)"** | PRIMARY | Destacado | Manter como CTA principal |
| **"Começar Plano de Hoje"** | PRIMARY | Destacado | Manter no Plano Semanal / Hoje |
| **"Revisar Flashcards Agora"** | PRIMARY / SECONDARY | Destacado | Manter contextual à carga FSRS |
| **Roteiro do Dia (Blocos de estudo)** | PRIMARY | Central | Manter no foco central |
| **Grade dos 7 Dias** | PRIMARY | Central | Manter no Plano Semanal |
| **"Tenho só X minutos"** | SECONDARY | Destacado | Tornar ação rápida secundária |
| **"Por que estudar isso?"** | TERTIARY | Visível em todos os cards | Mover para tooltip / ícone discreto |
| **"Adaptive Learning Scheduler"** | TECHNICAL / DECORATIVE | Badge de topo | Simplificar para texto claro |
| **"PPS 96/100" / "Boletim PPS"** | TECHNICAL / SECONDARY | Badge de topo | Guardar em detalhes de analytics |
| **"Matriz A–D" / "Quadrantes"** | TECHNICAL | Sub-aba | Mover para analytics / desempenho |
| **"O Que Não Estudar Agora"** | SECONDARY | Sub-aba | Fundir em explicação de prioridades |
| **Sincronização Google Cal / .ICS** | ACTION / SECONDARY | Barra de ferramentas | Agrupar em menu de exportação |

---

## 5. Terminologia Técnica Exposta ao Aluno

| Termo Técnico | Onde Aparece | Avaliação Pedagógica | Ação Recomendada |
| :--- | :--- | :--- | :--- |
| **FSRS** | Badges, contadores de revisão, cards | SECONDARY | Pode ser apresentado como *"Revisão Espaçada"* com detalhes técnicos em tooltip |
| **PPS** | Badges ("PPS 96/100", "Boletim PPS") | TECHNICAL | Pode ser apresentado como *"Índice de Prioridade"* ou mantido de forma discreta |
| **Adaptive Learning Scheduler** | Badge topo | DECORATIVE | Remover ou simplificar para *"Cronograma Inteligente"* |
| **Next Best Action** | Hero banner | TECHNICAL | Substituir por *"Missão Recomendada de Hoje"* |
| **Quadrantes A–D** | Aba do Calendário | TECHNICAL | Pertence à explicação metodológica, não ao roteiro diário |
| **IRS** | Métricas de cobertura | TECHNICAL | Substituir por *"Recorrência na Prova"* |

---

## 6. Mapeamento de CTAs e Concorrência de Ações

| Tela | CTA | Ação / Destino | Prioridade Visual | Concorrência |
| :--- | :--- | :--- | :--- | :--- |
| **Calendário** | `ESTUDAR AGORA (Modo Foco)` | Abre `GuidedStudySessionModal` | Primária (Verde Neon) | Concorre com `Tenho só X min` e `Abrir Módulo` |
| **Calendário** | `Tenho só X minutos` | Abre `TimeBoxModal` | Secundária (Ciano) | Alta |
| **Calendário** | `Revisar Flashcards Agora` | Redireciona para `/revisar/flashcards` | Secundária (Roxo) | Alta |
| **Calendário** | `Abrir Módulo` (em cada bloco) | Redireciona para Grandes Temas / Questões | Primária (Branco sólido) | Compete visualmente com cada card |
| **Calendário** | `Imprevistos & Replanejamento` | Abre `RecoveryPlanModal` | Secundária (Âmbar) | Média |
| **Plano Semanal** | `Começar Plano de Hoje` | Redireciona para `/estudar/plano-de-hoje` | Primária (Verde) | Foco claro e sem ruído |

---

## 7. Responsividade e Densidade em Viewports

- **1440px (Desktop Grande):** Boa disposição da grade de 7 dias, mas excesso de botões na toolbar superior do Calendário.
- **1024px (Tablet Horizontal / Laptop):** A toolbar de 11 botões do Calendário quebra em 3 linhas, gerando um bloco pesado de cabeçalho.
- **768px (Tablet Vertical):** A grade de 7 dias quebra em 2 colunas; os cards de blocos do Calendário comprimem os botões *"Por que estudar isso?"* e *"Abrir Módulo"*.
- **390px (Mobile):** Densidade extrema no Calendário. O usuário precisa rolar várias telas para passar pelo cabeçalho, métricas, toolbar, hero de missão e FSRS até atingir os blocos do dia.

---

## 8. Arquitetura de Informação: Pergunta Central de Cada Tela

| Tela | Pergunta Principal que a Tela Responde | Diagnóstico de Foco |
| :--- | :--- | :--- |
| **Calendário** | *"Qual é o meu roteiro de estudo para hoje e como organizo meu tempo?"* | **Sobrecarga:** Mistura o plano de hoje com visão semanal, matriz estratégica, autópsia de erros e exportações. |
| **Plano Semanal** | *"O que eu preciso cumprir nos próximos 7 dias?"* | **Foco Excelente:** Mostra a carga equilibrada dos próximos 7 dias com clareza. |
| **Até a Prova** | *"Em qual fase do cronograma estou até a data da prova?"* | **Foco Bom:** Roadmap de macro-ciclo de 3 fases. |
| **Disponibilidade** | *"Quantas horas posso estudar por dia?"* | **Configuração:** Deve ser um ajuste/modal rápido. |
| **Replanejamento** | *"Como recupero matéria atrasada?"* | **Ação Contextual:** Deve ser acionado sob demanda. |

---

## 9. Fluxogramas Comparativos

### Fluxograma Atual (Fragmentado e Concorrente)
```
Entrada em Planejamento
  ├── Sidebar: Calendário / Semanal / Até a Prova
  └── Barra Superior (5 Tabs): Calendário | Semanal | Até a Prova | Disponibilidade | Replanejamento
        │
        ├── [Calendário] ──► Toolbar com 6 sub-abas internas + 5 botões de modal + Hero 20-60-20 + Blocos do Dia
        ├── [Semanal]    ──► Grade de 7 dias ──► Detalhes do dia selecionado (Estudar/Praticar/Revisar)
        ├── [Até a Prova]──► 3 Fases macro-curriculares
        ├── [Disponib.]  ──► Formulário de horas
        └── [Replanej.]  ──► Diagnóstico de blocos atrasados
```

### Fluxograma Simplificado Recomendado
```
Planejamento
  ├── 1. HOJE / ROTEIRO DO DIA (Foco imediato: Estudar + Praticar + Revisar FSRS)
  ├── 2. PLANO SEMANAL (Visão clara dos próximos 7 dias com equilíbrio de carga)
  └── 3. ROADMAP ATÉ A PROVA (Fases macro-curriculares e ritmo até o exame)

* Ações como "Ajustar Horas", "Imprevistos / Replanejar" e "Exportar Calendário"
  tornam-se botões secundários contextuais / modais, sem poluir a navegação primária.
```

---

## 10. Resumo Executivo e Métricas Obrigatórias

```
============================================================
RESUMO DA AUDITORIA VISUAL DO PLANEJAMENTO:
============================================================
PLANNING_ROUTES                 = 5 (/calendario, /semanal, /ate-prova, /disponibilidade, /replanejamento)
VISIBLE_PLANNING_SIDEBAR_ITEMS  = 3 (Calendário, Plano semanal, Até a prova)
INTERNAL_NAV_ITEMS              = 5 (Calendário, Plano Semanal, Plano até a Prova, Disponibilidade, Replanejamento)

DUPLICATE_NAVIGATION            = YES (Sidebar e Horizontal Sub-Tabs competem)

CALENDAR_VISUAL_DENSITY         = VERY_HIGH (1.236 linhas, 6 sub-views, 6 modais, 11 botões na toolbar)
WEEKLY_VISUAL_DENSITY           = MEDIUM (422 linhas, grade de 7 dias limpa)
ROADMAP_VISUAL_DENSITY          = LOW (macro-ciclo direto)

AVAILABILITY_CLASSIFICATION     = CONFIGURATION_CANDIDATE
REPLANNING_CLASSIFICATION       = CONTEXTUAL_ACTION_CANDIDATE

TECHNICAL_LABEL_COUNT           = 8 (FSRS, PPS, SQS, IRS, Next Best Action, Quadrantes A-D, Schedulers)

PRIMARY_CTA_COUNT_BY_SCREEN:
- Calendário: 3 CTAs primários concorrentes (Estudar Agora, Abrir Módulo, Tenho só X min)
- Plano Semanal: 1 CTA primário dominante (Começar Plano de Hoje)
- Até a Prova: 0 CTAs (Puramente informativo)
============================================================
CLASSIFICAÇÃO FINAL:
PLANNING_LAYOUT_AUDITED
============================================================
```
