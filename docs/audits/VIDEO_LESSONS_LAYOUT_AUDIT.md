# Relatório de Auditoria Visual e Estrutural do Módulo Aulas (Etapa 1.18A)

**Data da Auditoria:** 03 de Setembro de 2026  
**Status da Auditoria:** READ-ONLY (Sem alterações no código-fonte)  
**Baseline de Testes:** 236/236 PASS (30 arquivos de teste) • 0 Erros de Console  
**Componente Principal Auditado:** [`src/components/lessons/VideoLessonsCatalogView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/lessons/VideoLessonsCatalogView.tsx) (556 linhas, 25.7 KB)

---

## 1. Mapeamento de Rotas e Navegação

| Item | Identificador / Rota | Comportamento |
| :--- | :--- | :--- |
| **Rota Canônica** | `activeTab === "lessons"` | Disparada pela Sidebar no item `ESTUDAR -> Aulas`. |
| **Sub-rota de Estudo** | `currentSubTab === "AULAS"` | Dentro de `EstudarView.tsx`, renderiza `<VideoLessonsCatalogView />`. |
| **Abertura de Aula** | `setActiveLesson(lesson)` | Renderização inline condicional dentro do mesmo componente (não altera URL/rota). |
| **Retorno ao Catálogo** | `setActiveLesson(null)` | Reseta o estado local de aula ativa e encerra o player. |

---

## 2. Árvore de Componentes

```
VideoLessonsCatalogView.tsx (Monolítico - 556 linhas)
├── [Visão 1: Catálogo de Videoaulas] (activeLesson === null)
│   ├── Top Header Banner (Badge "Catálogo Oficial", Título, Descrição, Resumo de Métricas)
│   ├── Seção "Continuar Assistindo" (Grid de cards em andamento com barra de progresso)
│   ├── Barra de Busca & Filtros (Input de busca + 6 botões de Grande Área)
│   └── Grid de Aulas (Cards com área, duração, título, resumo, instrutor e CTA)
│
└── [Visão 2: Player & Detalhes da Aula] (activeLesson !== null)
    ├── Botão "Voltar para o Catálogo de Aulas"
    ├── Video Player Stage (Aspect-video com tela de início ou reprodução simulada)
    ├── Metadados da Aula (Área, Tema, Título, Instrutor e CTA "Treinar Questões")
    ├── Seção "Resumo & Fisiopatologia" + "Pontos-Chave Mais Cobrados"
    └── Seção "Materiais Complementares" (PDF, MP3, Diretriz SUS)
```

---

## 3. Diagnóstico e Inventário Técnico

### A. Source of Truth e Status Funcional
- **`VIDEO_LESSON_SOURCE`**: **`STATIC_MOCK_ARRAY`** (Array constante `SAMPLE_VIDEO_LESSONS` com 8 videoaulas hardcoded dentro de `VideoLessonsCatalogView.tsx`).
- **`AULAS_STATUS`**: **`PARTIAL / STATIC_PROTOTYPE`** (Catálogo estático com dados simulados).
- **`VIDEO_PLAYER`**: **`SIMULATED`** (Não há integração real com tag `<video>`, `<iframe>`, YouTube ou Vimeo; simula um estado booleano `isPlaying` com barra de progresso estática em 35% e timer "14:20").

### B. Densidade Visual e Primeira Viewport
- **Primeira Viewport:**
  - Banner escuro com 2 cards de métricas (*"X/8 Aulas Concluídas"* e *"Y min Tempo Assistido"*).
  - Seção *"Continuar Assistindo"* (se houver aulas em andamento no mock).
  - Barra de busca + 6 botões de filtro.
  - Início da grade de 3 colunas.
- **`AULAS_HOME_DENSITY`**: **`MEDIUM/HIGH`** (Predomínio de superfícies escuras `zinc-900`/`zinc-950`).
- **`PLAYER_VISUAL_DENSITY`**: **`MEDIUM`** (Layout limpo em 2 colunas após o player).

### C. Data Points por Card no Catálogo (Total = 6)
1. **Área Médica** (Tag com `formatMedicalArea`) — *Essencial*
2. **Duração em Minutos** (Ex: `42 min`) — *Essencial*
3. **Título da Aula** — *Essencial*
4. **Resumo Clínico** (2 linhas com `line-clamp-2`) — *Secundário*
5. **Professor / Instrutor com Titulação** (Ex: *Dra. Camila Vasconcelos [USP / FEBRASGO]*) — *Secundário*
6. **Status / Progresso** (*Concluída* / *X% assistido* / *Assistir $\to$*) — *Essencial*

---

## 4. Integração com a Arquitetura StaziaMed

| Dimensão | Diagnóstico Atual | Recomendação para Refinamento |
| :--- | :--- | :--- |
| **`CANONICAL_TOPIC_LINK`** | **`PARTIAL`** (Possui campo de texto livre `theme: "Obstetrícia de Alto Risco"`, sem `canonicalTopicId`) | Associar cada aula ao respectivo `canonicalTopicId` da Taxonomia dos 75 Grandes Temas. |
| **`AREA_VISUAL_THEME_REUSABLE`** | **`YES`** (Atualmente usa cores hardcoded `zinc`/`teal`) | Reutilizar `getAreaVisualTheme(lesson.area)` de [`src/config/areaThemes.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/config/areaThemes.ts). |
| **`CONTINUE_WATCHING`** | **`PARTIAL`** (Exibe aulas com progresso no mock, sem persistência em storage) | Manter visualmente e preparar para persistência real de telemetria de aula. |
| **`LESSON_PROGRESS_TRACKING`** | **`MOCK`** (`progressPercent` fixo no array de exemplo) | Manter desvinculado de dados de questões/PPS. |
| **`PLAYER_NEXT_ACTION_CLEAR`** | **`PARTIAL`** (Possui botão "Treinar Questões", mas falta "Próxima Aula" e "Ver Grande Tema") | Adicionar link direto para o Grande Tema canônico correspondente e fluxo de continuidade. |
| **`SEARCH`** | **`FUNCTIONAL`** (Filtra dinamicamente por título, instrutor, resumo e tema) | Preservar busca rápida. |

---

## 5. Auditoria Terminológica (`LESSON_TERMINOLOGY_OVERLAP`)

- **Termos Encontrados:**
  1. *"Catálogo Oficial de Videoaulas"* (Cabeçalho)
  2. *"Aulas Teórico-Práticas"* (Título)
  3. *"Resolução orientada a casos clínicos"* (Badge do player)
  4. *"Aulas"* (Sidebar)
  5. *"Treinar Questões Deste Tema"* (Player CTA)
- **Conflito com Grandes Temas:** Sanado na Etapa 1.17E (a Home de Grandes Temas agora utiliza estritamente *"Estudar Tema"* em vez de *"Acessar Aula"*). O termo *"Aula / Videoaula"* agora pertence exclusivamente ao módulo audiovisual.

---

## 6. Fluxograma de Navegação Atual vs Proposto

### Fluxo Atual:
```
ESTUDAR -> Aulas (Catálogo)
  ↓
Filtro de Área / Busca
  ↓
Clique no Card da Aula
  ↓
Player Simulado Inline
  ↓
Opções: [Voltar ao Catálogo] OU [Treinar Questões (Redireciona para tela geral de questões)]
```

### Fluxo Futuro Recomendado:
```
ESTUDAR -> Aulas
  ↓
Hero "Continuar Assistindo" (Última aula assistida em destaque)
  ↓
Filtros pelas 5 Grandes Áreas (Cores semânticas padronizadas)
  ↓
Catálogo Escaneável de Aulas
  ↓
Player de Aula (com indicação do Grande Tema Canônico vinculado)
  ↓
Ações de Fechamento: [Próxima Aula] • [Estudar Grande Tema] • [Treinar Questões do Tema]
```

---

## 7. Resumo Obrigatório das Métricas

```
============================================================
RESUMO DA AUDITORIA DO MÓDULO AULAS (ETAPA 1.18A):
============================================================
VIDEO_LESSON_SOURCE                          = STATIC_MOCK_ARRAY
AULAS_STATUS                                 = PARTIAL
VIDEO_PLAYER                                 = SIMULATED

AULAS_HOME_DENSITY                           = MEDIUM/HIGH
PLAYER_VISUAL_DENSITY                        = MEDIUM

LESSON_CARD_VISIBLE_DATA_POINTS              = 6
CONTINUE_WATCHING                            = PARTIAL
LESSON_PROGRESS_TRACKING                     = MOCK
LESSON_DURATION_RELIABILITY                  = ESTIMATED_MOCK

SEARCH                                       = FUNCTIONAL
PLAYER_NEXT_ACTION_CLEAR                     = PARTIAL
CANONICAL_TOPIC_LINK                         = PARTIAL
AREA_VISUAL_THEME_REUSABLE                   = YES
LESSON_TERMINOLOGY_OVERLAP_COUNT             = 0 (Isolado de Grandes Temas)

NPM_TEST_SUITE                               = 236/236 PASS
CONSOLE_ERRORS                               = 0
============================================================
CLASSIFICAÇÃO FINAL:
VIDEO_LESSONS_LAYOUT_AUDITED
============================================================
```
