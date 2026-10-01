# Relatório de Redesign do Shell de Planejamento e Calendário (Etapa 1.15B)

**Data da Implementação:** 03 de Setembro de 2026  
**Status da Suíte:** 184/184 Testes PASS (20 arquivos de teste) • 0 Erros de Console  
**Escopo:** Eliminação da navegação duplicada no `PlanejamentoView`, simplificação da hierarquia visual do `AdaptiveCalendarView` e preservação integral de todas as rotas e funcionalidades.

---

## 1. Resumo das Alterações Estruturais

### A. Shell de Navegação (`PlanejamentoView.tsx`)
- **Antes:** Renderizava uma barra horizontal com 5 abas redundantes (`Calendário`, `Plano Semanal`, `Plano até a Prova`, `Disponibilidade`, `Replanejamento`) que competia diretamente com a Sidebar.
- **Depois:** Barra horizontal removida. O `PlanejamentoView` agora atua como um container/router limpo e de alta performance, delegando a navegação primária para a Sidebar e permitindo que cada tela aproveite 100% da área vertical.
- **Rotas Preservadas:** Todas as 5 rotas (`/planejamento/calendario`, `/planejamento/semanal`, `/planejamento/ate-prova`, `/planejamento/disponibilidade`, `/planejamento/replanejamento`) continuam 100% ativas e funcionais.

### B. Tela de Calendário (`AdaptiveCalendarView.tsx`)
- **Redução de Linhas de Código:** De 1.236 linhas para 560 linhas (código mais modular, legível e limpo).
- **Cabeçalho:** Substituído o bloco de 4 cards e badges pesados por um cabeçalho compacto com status essencial (`Revalida INEP 2026/2 • 46 dias para a prova • 14h planejadas na semana • X revisões hoje`) e botão de ação secundária `[ Ajustar disponibilidade ]`.
- **Hero do Plano de Hoje:** Simplificado para destacar o tema central do dia, carga horária e um **único CTA dominante:** `[ Começar Plano de Hoje ]`, acompanhado do link discreto `Tenho menos tempo hoje →` para sessões curtas via `TimeBoxModal`.
- **Toolbar de Ações:** Reduzida de 11 botões concorrentes para um seletor simples `[ Hoje ]` \| `[ Visão Semanal ]` e um menu discreto `[ Mais opções ]` para recursos analíticos e integrações (`Google Agenda`, `.ICS`, `Boletim PPS`, `Matriz de Prioridade`, `Autópsia de Falhas`, `Replanejar Imprevistos`).
- **Roteiro do Dia:** Blocos de estudo apresentados em formato limpo (*1. Estudar, 2. Praticar, 3. Revisar*), com um único link contextual `Por que este tema?`.

---

## 2. Comparativo Antes vs. Depois

| Métrica / Elemento | Antes (Auditoria 1.15A) | Depois (Redesign 1.15B) | Variação |
| :--- | :---: | :---: | :---: |
| **Abas Horizontais Internas no Topo** | 5 abas concorrentes | **0 (Delegado à Sidebar)** | **-100% (Duplicidade eliminada)** |
| **CTAs Primários Concorrentes no Calendário** | 3 botões em destaque | **1 Dominante (`Começar Plano`)** | **Foco Claro** |
| **Botões Visíveis na Toolbar do Calendário** | 11 botões na primeira viewport | **2 abas + 1 menu overflow** | **-73% de poluição visual** |
| **Cards na Primeira Viewport do Calendário** | 18 cards/pills | **3 containers limpos** | **-83% de densidade** |
| **Linhas de Código do Calendário** | 1.236 linhas | **560 linhas** | **-54% de complexidade** |
| **Linguagem Técnica / Ruído no 1º Nível** | 8 termos (FSRS, PPS, SQS, Schedulers) | **0 no 1º nível (guardados em detalhes)** | **Linguagem Focada no Aluno** |
| **Funcionalidades Removidas** | — | **0 (Todas preservadas)** | **100% de integridade** |

---

## 3. Preservação de Modais e Serviços

Todos os 6 modais foram mantidos intactos e integrados:
1. `WhyThisBlockModal` (Por que este tema?)
2. `TimeBoxModal` (Tenho só X minutos / menos tempo)
3. `GuidedStudySessionModal` (Player do Modo Foco)
4. `ScheduleConfigModal` (Ajustar Capacidade & Dias)
5. `RecoveryPlanModal` (Imprevistos & Replanejamento)
6. `WeeklyBulletinModal` (Boletim PPS de Prontidão Clínica)

---

## 4. Classificação Obrigatória

```
============================================================
STATUS DO REDESIGN DO PLANEJAMENTO / CALENDÁRIO:
============================================================
PLANNING_VIEW_SUBTABS_REMOVED = YES (navegação duplicada eliminada)
CALENDAR_FIRST_VIEWPORT_DENSITY = LOW / CLEAN

PRIMARY_CTA_COUNT             = 1 (Começar Plano de Hoje)
TOOLBAR_VISIBLE_BUTTONS       = 3 (Hoje | Visão Semanal | Mais opções)

FUNCTIONALITY_REMOVED         = 0
ROUTES_REMOVED                = 0

PPS_CHANGES                   = 0
FSRS_CHANGES                  = 0
FIRESTORE_CHANGES             = 0

NPM_TEST_BEFORE               = 184/184 PASS
NPM_TEST_AFTER                = 184/184 PASS
CONSOLE_ERRORS                = 0
============================================================
CLASSIFICAÇÃO FINAL:
PLANNING_CALENDAR_REDESIGNED
============================================================
```
