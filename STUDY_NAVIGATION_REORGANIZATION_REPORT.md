# Relatório de Reorganização da Navegação do Menu ESTUDAR (Etapa 1.17B)

**Data da Implementação:** 03 de Setembro de 2026  
**Status da Suíte:** 219/219 Testes PASS (26 arquivos de teste) • 0 Erros de Console  
**Escopo:** Eliminação da navegação duplicada no módulo **ESTUDAR** em [`EstudarView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/estudar/EstudarView.tsx), consolidação da Sidebar como fonte única de navegação, direcionamento da rota pai `/estudar` para o *Plano de Hoje* e ajuste terminológico em [`ThemeInteractiveLesson.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/grandesTemas/ThemeInteractiveLesson.tsx).

---

## 1. Estrutura da Sidebar (Preservada e Canônica)

A Sidebar mantém exatamente os 4 destinos estruturais do módulo:

```
ESTUDAR (BookOpen)
├── Plano de hoje        (id: estudar-plano-hoje, icon: CalendarCheck)
├── Aulas                (id: estudar-aulas, icon: Tv)
├── Grandes Temas        (id: estudar-grandes-temas, icon: Target)
└── Materiais oficiais   (id: estudar-materiais, icon: FolderOpen)
```

- **`ESTUDAR_SIDEBAR_ITEMS`** = **4**

---

## 2. Eliminação da Navegação Interna Duplicada

| Elemento | Antes | Depois |
| :--- | :--- | :--- |
| **Barra de Subtabs em `EstudarView.tsx`** | 4 botões horizontais redundantes (`Plano de Hoje`, `Aulas`, `Grandes Temas`, `Materiais Oficiais`) | **0 (Removida)** — `EstudarView` atua puramente como container/router limpo. |
| **Destino da Rota Pai `/estudar`** | Renderizava `EstudarHubView.tsx` (classificado como `REDUNDANT`) | Redireciona diretamente para **`Plano de hoje`** (`PLANO_HOJE`). |
| **Arquivo `EstudarHubView.tsx`** | Hub intermediário | Preservado no repositório para retrocompatibilidade sem quebras. |

---

## 3. Rotas Canônicas e Aliases Preservados

- **Rotas Canônicas:**
  - `estudar-plano-hoje` $\to$ `PlanoDeHojeView.tsx`
  - `estudar-aulas` $\to$ `VideoLessonsCatalogView.tsx`
  - `estudar-grandes-temas` $\to$ `GrandesTemasView.tsx`
  - `estudar-materiais` $\to$ `OfficialMedicalSearchView.tsx`
- **Aliases Históricos Protegidos:**
  - `grandes-temas` $\to$ resolve para `GRANDES_TEMAS`
  - `official-search` $\to$ resolve para `MATERIAIS`
- **Rotas Removidas:** **`0`**

---

## 4. Ajuste Terminológico Pontual

- **Arquivo:** [`ThemeInteractiveLesson.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/grandesTemas/ThemeInteractiveLesson.tsx)
- **Problema:** A lição textual dos 75 temas usava o termo visual *"Aulas & Módulos Progressivos"*, gerando confusão com o módulo audiovisual *Aulas*.
- **Solução:** Atualizado o rótulo visual para **"Módulos Progressivos do Tema"** e **"Estrutura do Estudo"**, delimitando com clareza o livro-texto curricular interativo vs o catálogo de videoaulas.

---

## 5. Arquivos Modificados

1. [`src/components/estudar/EstudarView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/estudar/EstudarView.tsx): Remoção da barra de subtabs duplicadas e roteamento da rota pai para `PLANO_HOJE`.
2. [`src/App.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/App.tsx): Mapeamento de `activeTab === "estudar"` para `initialSubTab = "PLANO_HOJE"`.
3. [`src/components/grandesTemas/ThemeInteractiveLesson.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/grandesTemas/ThemeInteractiveLesson.tsx): Atualização dos rótulos visuais para evitar ambiguidade com videoaulas.
4. [`src/__tests__/studyNavigationReorganization.test.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/__tests__/studyNavigationReorganization.test.tsx): [NEW] Suíte de testes validando Sidebar, rotas canônicas e ausência de subtabs duplicadas.

---

## 6. Classificação Obrigatória

```
============================================================
STATUS DA REORGANIZAÇÃO DO MENU ESTUDAR (ETAPA 1.17B):
============================================================
ESTUDAR_SIDEBAR_ITEMS                        = 4
STUDY_INTERNAL_SUBTABS                       = 4 → 0 (Removidas em EstudarView)

AULAS_PRESERVED                              = YES
GRANDES_TEMAS_PRESERVED                      = YES
MATERIAIS_OFICIAIS_PRESERVED                 = YES
PLANO_DE_HOJE_PRESERVED                      = YES

AULAS_GRANDES_TEMAS_MERGED                   = NO
MATERIAIS_ATUALIZACOES_MERGED                = NO

ESTUDAR_HUB_STATUS                           = REDUNDANT (Rota pai direcionada ao Plano de Hoje)
TERMINOLOGY_COLLISION_RESOLVED               = YES (Rótulos em ThemeInteractiveLesson atualizados)

ROUTES_REMOVED                               = 0
FUNCTIONALITY_REMOVED                        = 0
PPS_CHANGES                                  = 0
FSRS_CHANGES                                 = 0
FIRESTORE_CHANGES                            = 0

NPM_TEST_BEFORE                              = 213/213 PASS
NPM_TEST_AFTER                               = 219/219 PASS
CONSOLE_ERRORS                               = 0
============================================================
CLASSIFICAÇÃO FINAL:
STUDY_NAVIGATION_REORGANIZED
============================================================
```
