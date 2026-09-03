# Relatório de Auditoria Funcional, Documental e Visual do Módulo Materiais Oficiais (Etapa 1.19A)

**Data da Auditoria:** 03 de Setembro de 2026  
**Status da Auditoria:** READ-ONLY (Sem alterações no código-fonte)  
**Baseline de Testes:** 241/241 PASS (31 arquivos de teste) • 0 Erros de Console  
**Componentes Principais Auditados:**
1. [`src/components/search/OfficialMedicalSearchView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/search/OfficialMedicalSearchView.tsx) (453 linhas, 21.7 KB)
2. [`src/components/search/OfficialSearchModal.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/search/OfficialSearchModal.tsx) (54 linhas, 1.8 KB)
3. [`src/services/officialSearchService.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/services/officialSearchService.ts) (198 linhas, 8.0 KB)
4. [`server/ai/officialMedicalSearch.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/server/ai/officialMedicalSearch.ts) (449 linhas, 23.0 KB)

---

## 1. Mapeamento de Rotas e Navegação

| Rota / Ponto de Entrada | Identificador | Comportamento |
| :--- | :--- | :--- |
| **Rota Canônica na Sidebar** | `activeTab === "official-search"` | Disparada pela Sidebar no item `ESTUDAR -> Materiais oficiais`. |
| **Subtab Interna de Estudo** | `currentSubTab === "MATERIAIS"` | Dentro de `EstudarView.tsx`, renderiza `<OfficialMedicalSearchView />`. |
| **Modal Global Contextual** | `openOfficialSearch(query)` | Acionado via `AppContext` em qualquer tela de resolução de questões ou estudo para abrir `<OfficialSearchModal />`. |

---

## 2. Árvore de Componentes

```
OfficialMedicalSearchView.tsx
├── Hero Header (Badge "Fontes Governamentais", Título, Descrição, Input de Busca e Botão "Verificar Atualização")
├── Seção de Tópicos Quentes ("Atualizações 2025–2026 de Alto Impacto" - 4 cards rápidos via TOP_2026_HOT_TOPICS)
├── Loading Skeleton ("Consultando Bases Governamentais Oficiais...")
├── Mensagem de Erro (Tratamento de falha com AlertTriangle)
├── Resultado da Pesquisa Oficial (Card Principal)
│   ├── Header do Protocolo (Nome, Órgão, Ano de Vigência, Badges e Botão "Copiar Ficha")
│   ├── Grid de 4 Blocos Clínicos:
│   │   ├── 1. Mudança Relevante (O que Mudou + Conduta Anterior)
│   │   ├── 2. Impacto no Revalida INEP (Pegadinha de Prova / Distratores)
│   │   ├── 3. Conduta Padrão-Ouro no SUS (APS/RAS)
│   │   └── 4. Fontes Oficiais Verificadas (Links externos gov.br com ExternalLink)
│   ├── Análise Clínica Estruturada Completa (Markdown detalhado)
│   └── Footer com Telemetria e Data/Hora da Auditoria
└── Diretório de Domínios Governamentais Auditados (saude.gov.br, bvsms, conitec, inep, anvisa, sociedades)
```

---

## 3. Diagnóstico e Inventário Técnico

### A. Source of Truth e Status Funcional
- **`OFFICIAL_MATERIAL_SOURCE`**: **`AI_GENERATED + SEARCH_ENGINE_GROUNDING + LOCAL_CURATED_FALLBACK`**.
  - O motor primário consulta a API `/api/ai/official-medical-search` com **Gemini 3.7 Flash + Google Search Grounding** restrito a domínios oficiais (.gov.br, conitec.gov.br, saude.gov.br, inep.gov.br, anvisa.gov.br e sociedades médicas).
  - Em caso de indisponibilidade da API ou temas clássicos pré-catalogados, utiliza o banco estático `CURATED_2026_DATABASE` (HPV, Câncer de Colo Uterino, Dengue, Hipertensão, Tuberculose) e `TOP_2026_HOT_TOPICS`.
- **`MATERIALS_STATUS`**: **`FUNCTIONAL`** (Busca ativa operacional com extração de links governamentais reais e síntese estruturada).

### B. IA e Google Search Grounding
- **`AI_USED`**: **`YES`**.
- **Provider & Model**: Google Gemini (`gemini-3.7-flash`) com ferramenta nativa `googleSearch: {}`.
- **Restrição de Domínios**: `OFFICIAL_DOMAINS` filtra buscas direcionadas (`site:gov.br OR site:saude.gov.br OR site:conitec.gov.br OR site:inep.gov.br OR site:anvisa.gov.br OR site:sbp.com.br...`).
- **Grounding Chunks**: O backend extrai as URLs reais dos candidatos retornados pelo Google Search e as injeta em `officialSources`.

### C. Armazenamento e Abertura de Documentos
- **`DOCUMENT_STORAGE`**: **`EXTERNAL_ONLY`** (O sistema não armazena arquivos PDF localmente nem no Firestore; fornece links diretos para as fontes primárias oficiais).
- **Abertura de Documentos**: Ao clicar em uma fonte verificada, abre a página oficial em **nova aba** (`target="_blank" rel="noopener noreferrer"`).
- **Preview de Documento**: É uma **ficha clínica estruturada** em 4 quadrantes clínicos + síntese em Markdown, e não um visualizador de PDF embutido.

---

## 4. Tipologia Documental e Distinção de Autoridade

### A. O que o Módulo Consulta Hoje
1. **PCDT (Protocolos Clínicos e Diretrizes Terapêuticas)** — *Ministério da Saúde / CONITEC*
2. **Notas Técnicas e Portarias** — *Ministério da Saúde / PNI / SVSA*
3. **Relatórios de Recomendação** — *CONITEC*
4. **Manuais e Guias de Manejo Clínico** — *Ministério da Saúde / BVSMS*
5. **Diretrizes Clínicas de Especialidade** — *Sociedades Médicas (SBC, FEBRASGO, SBP, SBD, SBPT)*
6. **Matriz e Editais** — *INEP Revalida*

### B. Distinção Semântica Necessária: Governo vs Sociedades Médicas
- **PCDTs e Portarias do SUS:** São normas vinculantes de conduta na rede pública de saúde, de alta relevância para as provas do Revalida INEP.
- **Diretrizes de Sociedades Médicas:** Representam consensos científicos de especialistas, podendo divergir pontualmente do rol de tecnologias incorporadas pelo SUS/RENAME.
- **Recomendação:** A interface deve manter clara a distinção entre *"Protocolo Oficial do SUS/Ministério da Saúde"* e *"Diretriz de Sociedade Médica"*.

---

## 5. Comparativo com o Módulo "Atualizações & Diretrizes" (REVISAR)

| Módulo | Localização | Propósito | Source of Truth |
| :--- | :--- | :--- | :--- |
| **Materiais Oficiais** | `ESTUDAR -> Materiais oficiais` | **Buscador ativo / Consulta documental on-demand** para qualquer protocolo, conduta ou tema clínico. | Gemini Search Grounding + `CURATED_2026_DATABASE` + `TOP_2026_HOT_TOPICS`. |
| **Atualizações & Diretrizes** | `REVISAR -> Atualizações` | **Feed curado de mudanças normativas 2025-2026** que alteram gabaritos de questões históricas. | `SEED_MEDICAL_GUIDELINES` ([`src/data/guidelinesData.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/data/guidelinesData.ts)). |

*Conclusão:* Os dois módulos possuem finalidades complementares e não colidentes.

---

## 6. Densidade Visual e Primeira Viewport

- **Primeira Viewport:**
  - Hero Header escuro com barra de busca e botão "Verificar Atualização".
  - Grid com 4 tópicos em destaque ("🔥 Atualizações 2025–2026").
  - Diretório de domínios governamentais no rodapé.
- **`MATERIAIS_HOME_DENSITY`**: **`MEDIUM`** (Layout espaçado, focado na barra de busca e nos 4 tópicos em destaque).
- **`RESULTS_DENSITY`**: **`MEDIUM`** (Card único de 4 quadrantes bem delimitados).
- **`DOCUMENT_CARD_VISIBLE_DATA_POINTS`**: **8** (Nome do protocolo, órgão emissor, ano/vigência, status, mudança relevante, impacto INEP, conduta SUS, links com domínio).

---

## 7. Resumo Obrigatório das Métricas

```
============================================================
RESUMO DA AUDITORIA DE MATERIAIS OFICIAIS (ETAPA 1.19A):
============================================================
OFFICIAL_MATERIAL_SOURCE                     = AI_GENERATED + SEARCH_ENGINE_GROUNDING + LOCAL_CURATED_FALLBACK
MATERIALS_STATUS                             = FUNCTIONAL
SEARCH                                       = FUNCTIONAL
AI_USED                                      = YES (Gemini 3.7 Flash + Google Search Grounding)

DOCUMENT_STORAGE                             = EXTERNAL_ONLY
DOCUMENT_DATE_RELIABILITY                    = RELIABLE (Extraído via Grounding e curadoria 2024-2026)
DOCUMENT_VERSIONING                          = PARTIAL (Indica vigência e status, sem histórico de diff)
STALE_DOCUMENT_RISK                          = MEDIUM

CANONICAL_TOPIC_LINK                         = PARTIAL
AREA_VISUAL_THEME_REUSABLE                   = YES
DOCUMENT_CARD_VISIBLE_DATA_POINTS            = 8

MATERIAIS_HOME_DENSITY                       = MEDIUM
RESULTS_DENSITY                              = MEDIUM

LEGACY_QUESTION_DATA_DEPENDENCY              = NO (100% Desacoplado de questões legadas)
OFFICIAL_CLAIMS_REVIEW_REQUIRED              = 2 (Distinção SUS/PCDT vs Sociedades Médicas)

NPM_TEST_SUITE                               = 241/241 PASS
CONSOLE_ERRORS                               = 0
============================================================
CLASSIFICAÇÃO FINAL:
OFFICIAL_MATERIALS_ARCHITECTURE_AUDITED
============================================================
```
