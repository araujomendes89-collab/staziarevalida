# Relatório de Auditoria Visual e Pedagógica da Tela Grandes Temas (Etapa 1.17C)

**Data da Auditoria:** 03 de Setembro de 2026  
**Status da Suíte:** 219/219 Testes PASS (26 arquivos de teste) • 0 Erros de Console  
**Tipo de Operação:** READ-ONLY (Auditoria Visual e Pedagógica)  
**Componentes Auditados:** [`GrandesTemasView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/grandesTemas/GrandesTemasView.tsx), [`ThemeInteractiveLesson.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/grandesTemas/ThemeInteractiveLesson.tsx), [`ThemeProtocolUpdateBadge.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/grandesTemas/ThemeProtocolUpdateBadge.tsx)

---

## 1. Rotas Canônicas e Aliases

- **Rota Canônica:** `estudar-grandes-temas` (`/estudar/grandes-temas`)
- **Alias Preservado:** `grandes-temas` (`/grandes-temas`)
- **Status:** Rotas protegidas e integradas na Sidebar sob a seção `ESTUDAR`.

---

## 2. Mapeamento da Árvore de Componentes

```
GrandesTemasView (Container & Lista dos 75 Temas)
├── Top Banner Header (Métricas: 75 Temas, 5 Áreas, 100% Foco no SUS)
├── Area Tabs Selector (Todas as Áreas [75] + 5 Grandes Áreas [15 cada])
├── Filter & Search Bar (Input de busca + Select de Recorrência + Toggle de Diretrizes Atualizadas)
└── Themes Grid (ou Empty State)
    └── ThemeCard [Repetido para os 75 temas cadastrados]
        ├── Header: Área Médica com Ícone + Badge de Recorrência (ex: "🔥 Altíssima")
        ├── Título do Tema
        ├── Resumo Clínico (3 linhas truncadas)
        ├── Badge de Atualização de Diretriz Oficial (quando aplicável)
        └── Footer: Tempo Estimado em minutos + CTA "Acessar Aula" (ou card click)

ThemeInteractiveLesson (Visualizador Detalhado do Tema Ativo)
├── Top Action Bar (Botão Voltar, Favoritar, Compartilhar)
├── Hero Card do Tema (Área, Recorrência, Duração, Módulos, Título, Resumo)
│   ├── ThemeProtocolUpdateBadge (quando há diretriz atualizada)
│   ├── Barra de Progresso do Estudo (% e N/16 concluídos)
│   └── CTAs de Ação: "Gerar questões deste tema (IA)" + "Treinar Questões (N)"
├── Tab Navigation de Seções (4 Abas):
│   ├── 1. Módulos Progressivos do Tema (16)
│   │   ├── Left Sidebar: 16 botões de etapas progressivas com status (Done/Current/Pending)
│   │   └── Right Viewer: Card do módulo ativo com Tag, Título, Descrição, Conteúdo, Caixa "Diretriz Prática", Botão "Marcar como Estudado" e Navegadores Anterior/Próximo
│   ├── 2. Mapa Visual & Algoritmo Decisório (Fluxograma mnemônico em bloco de código mono)
│   ├── 3. Matriz Cognitiva Revalida INEP (4 cards: Diagnóstico Mais Cobrado, Conduta Gabarito, Distratores, Provas Anteriores)
│   └── 4. Fontes Oficiais do SUS (Lista de PCDTs, portarias e manuais institucionais)
```

---

## 3. Auditoria da Primeira Viewport (Home de Grandes Temas)

Na primeira viewport (1440x900) sem rolagem:
- **Cards Visíveis:** ~4 a 6 (Banner principal + 6 botões de áreas + Barra de busca/filtros + 3 a 6 cards de temas).
- **Badges Visíveis:** ~12 (Módulo Estruturante, tags de áreas, badges de recorrência).
- **Filtros e Controles:** 6 botões de áreas + 1 select de recorrência + 1 toggle button + 1 input de busca textual.
- **Métricas Visíveis:** 4 (75 Grandes Temas, 5 Áreas Médicas, 100% Foco no SUS, Exibindo X de 75).
- **Barras de Progresso:** 0 (A lista dos 75 temas **não** exibe o progresso do aluno nos cards).
- **Classificação de Densidade da Home:** **`MEDIUM`**

---

## 4. Análise Pedagógica: Respostas às Perguntas Principais

| Pergunta do Aluno | Avaliação Atual | Diagnóstico |
| :--- | :--- | :--- |
| **"Quais são as 5 áreas?"** | **Excelente** | As 5 grandes áreas aparecem destacadas no seletor do topo com contagem exata (15 temas cada). |
| **"Qual tema devo estudar agora?"** | **Parcial / Difusa** | A tela apresenta os 75 temas em peso equivalente, sem destacar uma seção *"Continuar de onde parou"* ou *"Temas prioritários para seu perfil"*. |
| **"Qual tema já estudei?"** | **Ausente na Lista** | Os cards da lista não possuem indicador de status ("não iniciado", "em andamento", "concluído"). |
| **"Qual tema merece atenção?"** | **Boa** | O badge de recorrência ("🔥 Altíssima") e o alerta de diretriz atualizada ajudam na triagem editorial. |
| **"Como começo?"** | **Direta** | Clicar em qualquer card abre a lição interativa do tema. |

---

## 5. Exposição de Dados por Tema na Lista (7 Data Points)

Cada card de tema na listagem apresenta simultaneamente:
1. `tema.title` (Título do agravo clínico)
2. `tema.areaName` (Nome da Grande Área com ícone)
3. `tema.recurrenceBadgeLabel` (Badge de Recorrência Editorial StaziaMed)
4. `tema.summary` (Resumo clínico de 3 linhas)
5. `tema.hasProtocolUpdate` (Alerta visual se houver mudança de protocolo 2025/2026)
6. `tema.estimatedMinutes` (Duração estimada de estudo)
7. CTA *"Acessar Aula"* (com ícone de seta)

- **Total de Pontos de Dado por Card:** **`7`**
- **Diagnóstico:** Quantidade equilibrada de informação por card, porém com oportunidades de scanability (hoje ocupa formato de card vertical denso em vez de linha compacta).

---

## 6. Auditoria de Métricas Especiais: IRS e PPS

- **IRS (Índice de Recorrência StaziaMed):**
  - Exibido visualmente como badge de recorrência (*"🔥 Altíssima Recorrência"*, *"🔴 Alta Recorrência"*, *"🟡 Média Recorrência"*).
  - É um indicador editorial histórico desenvolvido pelo StaziaMed para guiar a priorização de estudo.
  - **Classificação:** `EDITORIAL / SECONDARY`.
- **PPS (Prioridade de Pontos StaziaMed):**
  - **NÃO** é exibido nos cards de Grandes Temas nem no detalhe do tema.
  - **Classificação:** `NOT_PRESENT` na tela (correto para evitar sobreposição com o módulo de Planejamento e Desempenho).

---

## 7. Progresso e Status dos Temas

- **Cálculo do Progresso:**
  - Na lista geral: Não é exibido.
  - No detalhe do tema (`ThemeInteractiveLesson.tsx`): Calculado pelo percentual de micro-módulos marcados como concluídos (`completedSteps.length / 16 * 100`).
  - **Source of Truth Atual:** `LOCAL_STATE` (React `useState` no componente, sem persistência remota nesta versão).
- **Status dos Temas:**
  - Todos os 75 cards na home têm o mesmo tratamento visual, sem diferenciação entre não iniciado, em andamento ou revisado.

---

## 8. Os 16 Micro-Módulos Progressivos do Tema

Dentro de `ThemeInteractiveLesson.tsx`, o estudo do tema é decomposto em 16 etapas padronizadas:

| Nº | Rótulo / Tag | Título do Micro-Módulo | Classificação Pedagógica |
| :---: | :--- | :--- | :--- |
| **1** | `Matriz INEP` | Enquadramento e Relevância no Revalida INEP | **CORE** |
| **2** | `Conceito Chave` | Definição Conceitual e Critérios Diagnósticos | **CORE** |
| **3** | `Epidemiologia` | Epidemiologia, Fatores de Risco e Prevenção | **SUPPORTING** |
| **4** | `Semiologia` | Apresentação Clínica e Sinais de Alerta | **CORE** |
| **5** | `Diagnóstico` | Investigação Diagnóstica e Exames Complementares | **CORE** |
| **6** | `Diferencial` | Diagnóstico Diferencial Crítico | **SUPPORTING** |
| **7** | `Escores Clínicos` | Estratificação de Risco e Gravidade | **SUPPORTING** |
| **8** | `Gabarito Ouro` | Conduta Terapêutica de Primeira Linha (Padrão-Ouro SUS) | **CORE** |
| **9** | `Emergência` | Manejo de Emergência e Situações Críticas | **CORE** |
| **10** | `Populações Especiais` | Cuidados Especiais em Populações Específicas | **SUPPORTING** |
| **11** | `Prova Prática` | Procedimentos Práticos e Habilidades Clínicas (OSCE) | **SUPPORTING** |
| **12** | `Vigilância SUS` | Notificação Compulsória e Vigilância Epidemiológica | **SUPPORTING** |
| **13** | `Seguimento APS` | Acompanhamento, Seguimento e Critérios de Alta | **SUPPORTING** |
| **14** | `Pegadinhas INEP` | Erros Clássicos e Pegadinhas da Banca INEP | **CORE** |
| **15** | `Síntese Rápida` | Padrão Decisório e Resumo Visual (Flash-Review) | **CORE** |
| **16** | `Fixação Ativa` | Treinamento com Questões Oficiais e Inéditas | **PRACTICE** |

- **Micro-módulos visíveis simultaneamente:** **16** (na sidebar esquerda do visualizador).
- **Progressão:** **`RECOMMENDED_SEQUENCE`** (o aluno pode navegar livremente ou seguir a ordem 1 a 16 com os botões Anterior/Próximo e "Marcar como Estudado").

---

## 9. Carga Cognitiva e "Choice Overload"

- **Na Home de Grandes Temas:** O aluno se depara com 75 opções no grid geral se não filtrar por área. Recomenda-se no futuro priorizar "Continuar de onde parou" e "Temas prioritários da sua área fraca".
- **No Detalhe do Tema:** O aluno tem:
  - 2 botões de topo (IA + Questões)
  - 4 abas de seções
  - 16 passos na sidebar lateral
  - 1 visualizador central
  - **Classificação:** **`CHOICE_OVERLOAD = MEDIUM`**

---

## 10. Terminologia e Rótulos Visuais

- **Rótulos Auditados:**
  - `Módulos Progressivos do Tema` (Claro)
  - `Estrutura do Estudo` (Claro)
  - `Matriz Cognitiva Revalida INEP` (Claro / Factual)
  - `Fontes Oficiais do SUS` (Claro)
  - `Acessar Aula` (no footer do card de tema em `GrandesTemasView.tsx` linha 306 — oportunidade futura de ajuste para *"Estudar Tema"* para não conflitar com videoaulas).

---

## 11. Fluxograma Atual vs Proposto

### Fluxograma Atual (Real)
```
Menu ESTUDAR -> Grandes Temas
  ↓
Exibe Banner + 6 Filtros de Área + Busca + 75 Cards de Temas
  ↓
Aluno clica em um Tema
  ↓
ThemeInteractiveLesson abre em tela cheia:
  - Hero com resumo e 2 CTAs
  - 4 Abas (Módulos, Fluxograma, INEP, Fontes)
  - 16 Etapas na sidebar esquerda
  - Leitor da etapa ativa na direita
  - Botão "Marcar como Estudado" / Próximo
```

### Fluxograma Simplificado Proposto para o Futuro
```
ESTUDAR -> GRANDES TEMAS
  ↓
1. Seção "Retomar Estudo" (Último tema aberto com barra de progresso)
2. Seletor das 5 Áreas (15 temas por área)
3. Lista Escaneável dos Temas da Área (com status: Não iniciado / Em andamento / Concluído)
  ↓
Ao selecionar Tema -> DETALHE DO TEMA:
  1. Visão Geral & Conduta Padrão-Ouro (O essencial para o Revalida)
  2. Trilha de Estudo em Etapas (Navegação guiada passo a passo)
  3. Ações de Prática (Questões Oficiais & IA)
  4. Referências Oficiais (PCDTs e Diretrizes)
```

---

## 12. Resumo Executivo e Classificação Obrigatória

```
============================================================
RESUMO DA AUDITORIA DE GRANDES TEMAS (ETAPA 1.17C):
============================================================
GRANDES_TEMAS_HOME_DENSITY                   = MEDIUM
THEME_DETAIL_DENSITY                         = HIGH

TOTAL_CANONICAL_TOPICS                       = 75
THEME_CARD_VISIBLE_DATA_POINTS               = 7

MICRO_MODULE_COUNT                           = 16
MICRO_MODULES_VISIBLE_AT_ONCE                = 16

MICRO_MODULE_NAVIGATION                      = RECOMMENDED_SEQUENCE
CHOICE_OVERLOAD                              = MEDIUM
NEXT_ACTION_CLEAR                            = YES

THEME_LIST_SCANABILITY                       = MEDIUM
LEGACY_DATA_DEPENDENT_ELEMENTS               = 2 (relatedQuestionsCount, totalQuestionsInDb)

TECHNICAL_LABEL_COUNT                        = 0 (Termos são orientados à prática clínica)
CLAIM_REVIEW_REQUIRED_COUNT                  = 1 (Card footer CTA "Acessar Aula" -> preferir "Estudar Tema")

NPM_TEST_BASELINE                            = 219/219 PASS
CONSOLE_ERRORS                               = 0
============================================================
CLASSIFICAÇÃO FINAL:
GRANDES_TEMAS_LAYOUT_AUDITED
============================================================
```
