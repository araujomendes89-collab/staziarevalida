# Relatório de Auditoria de Navegação e Arquitetura do Menu ESTUDAR (Etapa 1.17A)

**Data da Auditoria:** 03 de Setembro de 2026  
**Status da Suíte:** 213/213 Testes PASS • 0 Erros de Console  
**Tipo de Operação:** READ-ONLY (Auditoria Arquitetural e de Navegação)

---

## 1. Mapeamento Geral de Rotas e Componentes do Módulo ESTUDAR

| Rota / Tab ID | Alias / Fallback | Componente Principal | Subview / Subcomponente | Finalidade Arquitetural |
| :--- | :--- | :--- | :--- | :--- |
| **`estudar`** | `/estudar` | `EstudarView.tsx` | `EstudarHubView.tsx` | Hub de entrada do módulo com cards direcionadores para as 4 seções. |
| **`estudar-plano-hoje`** | `/estudar/plano-de-hoje` | `EstudarView.tsx` | `PlanoDeHojeView.tsx` | Central de execução diária (Ciclo: 1. Estudar Teoria, 2. Praticar Questões, 3. Revisar Flashcards). |
| **`estudar-aulas`** | `/estudar/aulas` | `EstudarView.tsx` | `VideoLessonsCatalogView.tsx` | Catálogo de videoaulas com player interativo, resumo e pérolas clínicas. |
| **`estudar-grandes-temas`** | `grandes-temas`, `/estudar/grandes-temas` | `EstudarView.tsx` | `GrandesTemasView.tsx` & `ThemeInteractiveLesson.tsx` | Matriz curricular canônica dos 75 Grandes Temas com 16 micro-módulos clínicos progressivos. |
| **`estudar-materiais`** | `official-search`, `/estudar/materiais` | `EstudarView.tsx` | `OfficialMedicalSearchView.tsx` | Mecanismo de busca e consulta documental de diretrizes oficiais, PCDTs e portarias do SUS. |

---

## 2. Configuração Atual da Sidebar

A Sidebar (`STUDENT_NAVIGATION_CONFIG` em [`navigation.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/config/navigation.ts)) possui exatamente:

```
ESTUDAR (BookOpen)
├── Plano de hoje        (id: estudar-plano-hoje, icon: CalendarCheck)
├── Aulas                (id: estudar-aulas, icon: Tv)
├── Grandes Temas        (id: estudar-grandes-temas, icon: Target)
└── Materiais oficiais   (id: estudar-materiais, icon: FolderOpen)
```

- **`ESTUDAR_SIDEBAR_ITEMS`** = **4**

---

## 3. Navegação Interna e Duplicações Identificadas

1. **Barra Superior Redundante em [`EstudarView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/estudar/EstudarView.tsx):**
   - O cabeçalho de `EstudarView` renderiza um segmented control com 4 botões (`Plano de Hoje`, `Aulas`, `Grandes Temas`, `Materiais Oficiais`), duplicando visualmente os mesmos 4 links que já estão permanentemente acessíveis na Sidebar.
2. **Hub de Entrada [`EstudarHubView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/estudar/EstudarHubView.tsx):**
   - Ao acessar a tab pai `estudar`, é exibido um hub intermediário com 1 banner grande para o Plano de Hoje e 3 cards para Aulas, Grandes Temas e Materiais Oficiais. Isso gera uma camada adicional de cliques para chegar aos destinos já visíveis na Sidebar.

---

## 4. Análise Individual das Telas de ESTUDAR

### A. Plano de Hoje (`/estudar/plano-de-hoje` • `PlanoDeHojeView.tsx`)
- **Pergunta Principal:** *"O que preciso fazer hoje para cumprir minha meta diária?"*
- **Conteúdo:** Ciclo estruturado em 3 etapas sequenciais:
  1. **Estudar:** Foco teórico prioritário (baseado no tema de maior ganho de pontos do Grafo de Conhecimento).
  2. **Praticar:** Meta de 20 questões oficiais comentadas.
  3. **Revisar:** Flashcards pendentes agendados pelo algoritmo FSRS.
- **Relação com Dashboard:** O `DashboardView.tsx` renderiza um widget resumido do mesmo ciclo diário. O `PlanoDeHojeView.tsx` aprofunda com barra de progresso, justificativa pedagógica e controle de personalização.
- **Relação com Planejamento:**
  - `Plano de Hoje`: **Execução imediata** do dia.
  - `Plano Semanal`: **Distribuição das metas** nos 7 dias.
  - `Calendário`: **Visão de agenda/datas** do mês.
  - *Diagnóstico: Responsabilidades conceituais estão bem delimitadas.*

### B. Aulas (`/estudar/aulas` • `VideoLessonsCatalogView.tsx`)
- **Pergunta Principal:** *"Quais videoaulas estruturadas estão disponíveis para eu assistir?"*
- **Conteúdo:** Catálogo audiovisual com filtros por grande área, busca textual, player simulado em vídeo HD, pontos-chave da aula e contagem de materiais complementares.
- **Estado Atual:** `PARTIAL / MOCK` (alimentado pelo array mock `SAMPLE_VIDEO_LESSONS` com player interativo simulado).

### C. Grandes Temas (`/estudar/grandes-temas` • `GrandesTemasView.tsx`)
- **Pergunta Principal:** *"Qual é a matriz completa dos 75 temas do Revalida e como estudar cada um?"*
- **Conteúdo:** Navegação pelas 5 grandes áreas médicas com os 75 temas canônicos. Ao clicar em um tema, abre o `ThemeInteractiveLesson.tsx` contendo:
  - 16 micro-módulos clínicos progressivos (enquadramento INEP, critérios diagnósticos, sinais de alerta, escores, gabarito ouro SUS, populações especiais, etc.).
  - Fluxogramas e condutas.
  - Insights específicos da banca INEP.
  - Fontes oficiais e diretrizes.
- **Estado Atual:** `FUNCTIONAL` (alimentado pelo dataset canônico estruturado em `src/data/grandesTemas/`).

### D. Materiais Oficiais (`/estudar/materiais` • `OfficialMedicalSearchView.tsx`)
- **Pergunta Principal:** *"Onde posso consultar na íntegra as diretrizes, portarias e PCDTs oficiais do Ministério da Saúde e do SUS?"*
- **Conteúdo:** Mecanismo de busca e auditoria em fontes governamentais primárias (gov.br, saude.gov.br, CONITEC, ANVISA, INEP). Retorna resumo do protocolo, mudanças recentes, conduta padrão-ouro e links oficiais.
- **Estado Atual:** `FUNCTIONAL` (conectado ao `OfficialSearchService`).

---

## 5. Matriz de Comparações e Sobreposições Críticas

### A. Aulas vs Grandes Temas
- **Aulas:** Formato audiovisual/palestra guiada por instrutor, com duração em minutos e player de mídia.
- **Grandes Temas:** Livro-texto interativo curricular, estruturado na matriz dos 75 temas com 16 micro-módulos escritos e fluxogramas.
- **Classificação:** **`PARTIALLY_OVERLAPPING`** (ambos cobrem o conteúdo teórico do Revalida, mas com formatos pedagógicos distintos: audiovisual vs textual/curricular).

### B. Materiais Oficiais vs Revisar Atualizações
- **`ESTUDAR -> Materiais oficiais` (`OfficialMedicalSearchView.tsx`):** **Buscador/Biblioteca Documental** para pesquisar qualquer documento ou PCDT oficial do SUS sob demanda.
- **`REVISAR -> Atualizações & Diretrizes` (`ProtocolUpdatesHubView.tsx`):** **Feed Curado de Mudanças 2025/2026**, com comparativo "como era vs como ficou" e questões inéditas de fixação.
- **Classificação:** **`CLEARLY_DISTINCT`** (papéis e objetivos pedagógicos bem diferenciados).

### C. Materiais Oficiais vs Grandes Temas
- `Materiais oficiais` atua como a **biblioteca global de pesquisa**, enquanto `Grandes Temas` incorpora referências documentais específicas no contexto de cada um dos 75 temas.
- **Classificação:** **`CLEARLY_DISTINCT`** (relação saudável de referência cruzada).

---

## 6. Diagnóstico de Densidade Visual

| Tela / Subview | Densidade Visual | Diagnóstico e Oportunidades Futuras |
| :--- | :--- | :--- |
| **`/estudar/plano-de-hoje`** | **`LOW`** | Layout limpo com 3 cards sequenciais horizontais (Estudar, Praticar, Revisar) e cabeçalho gradiente escuro. |
| **`/estudar/aulas`** | **`MEDIUM`** | Grid de cards de videoaulas com barra de busca e visualizador de player. |
| **`/estudar/grandes-temas`** | **`MEDIUM`** | Seletor de 6 botões de áreas + grid de 75 cards + leitor de 16 passos. Boa hierarquia. |
| **`/estudar/materiais`** | **`LOW`** | Campo de busca centralizado + badge de fontes verificadas + card de resultado. |

---

## 7. Resumo Executivo e Classificação

```
============================================================
DIAGNÓSTICO DA NAVEGAÇÃO E ARQUITETURA DO MENU ESTUDAR:
============================================================
ESTUDAR_SIDEBAR_ITEMS                        = 4
STUDY_INTERNAL_NAVIGATION_DUPLICATED         = YES (Barra superior de 4 subtabs em EstudarView replica Sidebar)

PLANO_DE_HOJE_PURPOSE_CLEAR                  = YES (Execução diária do ciclo de 3 etapas)
AULAS_PURPOSE_CLEAR                          = YES (Catálogo de videoaulas com player)
GRANDES_TEMAS_PURPOSE_CLEAR                  = YES (Matriz curricular dos 75 temas com 16 micro-módulos)
MATERIAIS_PURPOSE_CLEAR                      = YES (Buscador oficial de PCDTs e diretrizes do SUS)

AULAS_VS_GRANDES_TEMAS                       = PARTIALLY_OVERLAPPING (Audiovisual vs Livro-texto curricular)
MATERIAIS_VS_ATUALIZACOES                    = CLEARLY_DISTINCT (Biblioteca de busca vs Feed curado de novidades)

PURPOSE_COLLISION_COUNT                      = 0
DUPLICATE_ROUTES_COUNT                       = 1 (estudar-grandes-temas e grandes-temas / estudar-materiais e official-search)
EMBEDDED_FULL_MODULES_COUNT                  = 0
TERMINOLOGY_OVERLAP_COUNT                    = 1 (Aulas vs ThemeInteractiveLesson chamada de "aula interativa")

PLANO_DE_HOJE_VISUAL_DENSITY                 = LOW
AULAS_VISUAL_DENSITY                         = MEDIUM
GRANDES_TEMAS_VISUAL_DENSITY                 = MEDIUM
MATERIAIS_VISUAL_DENSITY                     = LOW
============================================================
CLASSIFICAÇÃO FINAL:
STUDY_NAVIGATION_ARCHITECTURE_AUDITED
============================================================
```
