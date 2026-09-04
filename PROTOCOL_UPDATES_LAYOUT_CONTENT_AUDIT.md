# PROTOCOL_UPDATES_LAYOUT_CONTENT_AUDIT.md
# Relatório de Auditoria Visual, Pedagógica e Documental — Atualizações & Diretrizes
**Etapa:** 1.20D — Auditoria Visual, Pedagógica e Documental do Módulo Atualizações & Diretrizes  
**Componente Auditado:** `src/components/protocols/ProtocolUpdatesHubView.tsx`  
**Dataset Auditado:** `src/data/protocolUpdatesData.ts`  
**Data da Auditoria:** 03 de Setembro de 2026  
**Status Final:** `PROTOCOL_UPDATES_LAYOUT_CONTENT_AUDITED`  
**Baseline de Testes:** 253/253 PASS (34 test suites)  

---

## 1. RESUMO EXECUTIVO E ESCOPO

A presente auditoria avaliou a fundo o submódulo **REVISAR → Atualizações & Diretrizes**, inspecionando tanto sua base de dados curada (`src/data/protocolUpdatesData.ts`) quanto a arquitetura de apresentação e interação (`src/components/protocols/ProtocolUpdatesHubView.tsx`).

### Diagnósticos-Chave:
1. **Curadoria Editorial Sólida:** O módulo opera com um dataset curado estático de 15 atualizações protocolares de alta relevância clínica para o Revalida INEP, com 100% de rastreabilidade para órgãos emissores oficiais (Ministério da Saúde, CONITEC, FEBRASGO, SBC, SBD, ILAS, etc.).
2. **Definição Clara de Mudança de Conduta:** Cada registro detalha explicitamente a conduta anterior (*pre-2025*), a alteração introduzida (*2025/2026*) e a conduta vigente, eliminando ambiguidade clínica.
3. **Hiperdensidade de Superfície (VERY_HIGH):** O componente `ProtocolUpdatesHubView.tsx` (1.238 linhas) acumula 7 sub-abas internas, modalidades de filtros múltiplos, modais de estudo, renderizador de flashcards e simulador de questões inéditas, gerando alta carga cognitiva inicial.
4. **Embeds Isolados em Modo Preview:** Os submódulos de *Flashcards* e *Questões Inéditas* contidos na tela funcionam em regime de preview/estudo focalizado local, sem duplicar nem interferir nos agendamentos globais do motor central FSRS ou nas estatísticas persistidas do QuestõesView.

---

## 2. ORIGEM E AUDITORIA DO DATASET

- **Arquivo Canônico:** `src/data/protocolUpdatesData.ts`
- **Tamanho do Dataset:** 15 registros completos (`PROTOCOL_UPDATES_2025_2026`).
- **Distribuição Temporal (`tag_ano`):**
  - `ATUALIZADO_2025_E_2026`: 2 registros (13,3%) — Ex: *Rastreamento de Câncer de Colo Uterino por DNA-HPV* e *Manejo Clínico e Estadiamento da Dengue*.
  - `ATUALIZACAO_2025`: 12 registros (80,0%) — Ex: *Classificação de PA/HAS*, *DM2 SGLT2/GLP1*, *IC com Fração de Ejeção Preservada*, *Sepse Pediátrica Fênix*, *Apendicite Não Operatória*, etc.
  - `ATUALIZACAO_2026`: 1 registro (6,7%) — Ex: *Diretrizes Farmacológicas Emergentes de TEP/TVP*.

### Distribuição por Grande Área Médica:
| Grande Área | Registros | Percentual | Exemplos Temáticos |
| :--- | :---: | :---: | :--- |
| **Ginecologia e Obstetrícia** | 4 | 26,7% | Rastreamento HPV, Pré-Eclâmpsia Aspirina precoce, Hemorragia Pós-Parto (Índice de Choque), DMG |
| **Clínica Médica** | 4 | 26,7% | HAS Nova Classificação, DM2 Terapia Combinada Inicial, IC iSGLT2 Quádrupla, TEP DOACs |
| **Cirurgia Geral** | 3 | 20,0% | Apendicite Aguda Não Operatória, Colecistite Tóquio 2018/2024, Trauma ATLS 10ª/11ª Edição |
| **Pediatria** | 3 | 20,0% | Critérios de Fênix para Sepse Pediátrica, Bronquiolite Viral Aguda, Suplementação de Ferro |
| **Medicina de Família e SUS** | 1 | 6,7% | Dengue Manejo e Classificação Grupos A/B/C/D |

---

## 3. AUDITORIA DA ESTRUTURA DE DADOS (`ProtocolUpdate`)

Cada item da interface implementa a interface tipada estrita com os seguintes atributos:
1. `id`: Identificador único serial (ex: `upd_001_hpv_dna`).
2. `tema` & `subtema`: Título do assunto médico e delimitação clínica.
3. `area`: Área de especialidade associada.
4. `tag_ano`: Enum temporal (`ATUALIZACAO_2025`, `ATUALIZACAO_2026`, `ATUALIZADO_2025_E_2026`).
5. `nivel_prioridade`: Classificação de probabilidade no Revalida (`ALTA` / `CRITICA`).
6. `data_publicacao`: Timestamp formal da publicação da diretriz.
7. `instituicao`: Órgão técnico emissor.
8. `nome_documento`: Título oficial da diretriz/portaria/protocolo.
9. `url_oficial`: Link direto para o documento primário.
10. `recomendacao_pre_2025`: Descrição detalhada do paradigma anterior.
11. `atualizacao_2025` / `atualizacao_2026`: Descrição da inovação clínica.
12. `conduta_vigente`: Síntese imperativa da conduta que deve ser assinalada na prova.
13. `impacto_clinico`: Relevância epidemiológica e assistencial.
14. `impacto_revalida`: Análise de como a banca INEP formula a cobrança do tema.
15. `pegadinha`: Alerta pedagógico contra vícios de conduta antiga.
16. `ultima_verificacao`: Data de validação curatorial (2025/2026).
17. `status`: `CONFIRMADO_VIGENTE` / `EM_REVISAO`.
18. `affected_exam_questions`: Array de questões pregressas do INEP que foram impactadas/desatualizadas pela nova regra, com gabarito histórico vs gabarito atualizado.
19. `flashcards`: Cards com frente/verso/foco para fixação imediata.
20. `ineditas`: Questões no formato padrão INEP (enunciado clínico, 4 alternativas, gabarito e justificativa por alternativa).

---

## 4. PROVENIÊNCIA E METADADOS DE ORIGEM

- `UPDATES_WITH_SOURCE_URL`: 15 / 15 (100%)
- `UPDATES_WITH_PUBLISHER`: 15 / 15 (100%)
- `UPDATES_WITH_PUBLICATION_DATE`: 15 / 15 (100%)
- `SOURCE_MODEL_COMPATIBILITY`: **HIGH** (Totalmente alinhado aos tipos primários `GOVERNMENT_HEALTH`, `INEP`, `SCIENTIFIC_SOCIETY`).
- `STALE_DOCUMENT_RISK`: **LOW** (Todos os 15 protocolos possuem verificação recente e referenciam normas ativas no ciclo avaliativo vigente).

---

## 5. DENSIDADE VISUAL E SUB-ABAS DE NAVEGAÇÃO

### Análise de Densidade:
- **Classificação:** `UPDATES_DENSITY = VERY_HIGH`
- **Elementos no 1º Viewport:** ~18 elementos interativos simultâneos (KPI cards, pílulas de filtros rápidos, campo de busca com autocomplete, seletor de áreas, seletor de sub-abas, badges de status).
- **Profundidade de Superfícies Aninhadas:** `UPDATE_NESTED_SURFACE_DEPTH = 4` (Container Geral $\to$ Painel de Sub-aba $\to$ Card de Protocolo $\to$ Bloco Comparativo / Modal de Estudo).

### As 7 Sub-abas Internas:
1. `overview`: Feed unificado de atualizações com cards expansíveis e ficha de estudo em modal.
2. `mudou_2025`: Visão filtrada restrita às inovações implementadas em 2025.
3. `mudou_2026`: Visão filtrada restrita às diretrizes consolidadas para 2026.
4. `tabela_comparativa`: Matriz tabular bidimensional comparando "Como era antes" vs "Como prescrever/conduzir agora".
5. `questoes_antigas`: Catálogo de itens reais do Revalida INEP cujos gabaritos originais ficaram obsoletos devido às novas diretrizes.
6. `questoes_ineditas`: Simulador local de questões clínicas inéditas modeladas sobre as novas diretrizes.
7. `flashcards`: Visor de cartões de repetição rápida com efeito de flip para memorização de condutas.

---

## 6. AUDITORIA DE EMBEDS E ISOLAMENTO DE MOTORES

- `FLASHCARD_EMBED_TYPE`: **PREVIEW**  
  *Justificativa:* Os flashcards incorporados em `ProtocolUpdatesHubView` operam como fichas de leitura rápida para o tópico aberto; não competem nem corrompem a fila de repetição espaçada agendada pelo algoritmo FSRS no submódulo `FlashcardsView`.
- `UPDATE_QUESTION_EMBED_TYPE`: **PREVIEW / LOCAL_INEDITAS_VIEWER**  
  *Justificativa:* As questões inéditas utilizam estado de resolução em memória do componente local para feedback pedagógico instantâneo, com justificativas completas por alternativa, sem poluir a tabela de tentativas globais (`attempts`) do banco de questões principal.

---

## 7. RELAÇÃO COM MATERIAIS OFICIAIS

| Dimensão | Materiais Oficiais (`OfficialMedicalSearchView`) | Atualizações & Diretrizes (`ProtocolUpdatesHubView`) |
| :--- | :--- | :--- |
| **Finalidade** | Busca documental de acervo primário e PCDT | Síntese de mudanças de conduta clínica para a prova |
| **Formato** | Metadados documentais, links externos, síntese de IA | Comparativo Antes vs Depois, Impacto na Banca, Questões |
| **Origem** | Indexação/Busca Grounded com IA | Curadoria editorial médica estática focada no edital |
| **Público-alvo** | Consulta de consulta aprofundada da diretriz integral | Treinamento direcionado para não errar conduta alterada |

---

## 8. SUMÁRIO DE MÉTRICAS OBRIGATÓRIAS (52 INDICADORES)

```yaml
1. COMPONENT_PATH: src/components/protocols/ProtocolUpdatesHubView.tsx
2. DATASET_PATH: src/data/protocolUpdatesData.ts
3. TOTAL_PROTOCOL_RECORDS: 15
4. TOTAL_AREAS_COVERED: 5
5. GO_RECORDS_COUNT: 4
6. CM_RECORDS_COUNT: 4
7. CG_RECORDS_COUNT: 3
8. PED_RECORDS_COUNT: 3
9. MFC_RECORDS_COUNT: 1
10. TAG_2025_COUNT: 12
11. TAG_2026_COUNT: 1
12. TAG_2025_2026_COUNT: 2
13. PRIORITY_ALTA_COUNT: 9
14. PRIORITY_CRITICA_COUNT: 6
15. UPDATES_WITH_SOURCE_URL: 15
16. UPDATES_WITH_PUBLISHER: 15
17. UPDATES_WITH_PUBLICATION_DATE: 15
18. UPDATES_WITH_EXPLICIT_PRE_RECOMMENDATION: 15
19. UPDATES_WITH_EXPLICIT_CURRENT_RECOMMENDATION: 15
20. UPDATES_WITH_REVALIDA_IMPACT: 15
21. UPDATES_WITH_PITFALL_ALERT: 15
22. UPDATES_WITH_AFFECTED_QUESTIONS: 15
23. UPDATES_WITH_FLASHCARDS: 15
24. UPDATES_WITH_INEDITAS: 15
25. TOTAL_AFFECTED_QUESTIONS_CATALOGED: 21
26. TOTAL_EMBEDDED_FLASHCARDS: 30
27. TOTAL_EMBEDDED_INEDITAS: 15
28. LINES_OF_CODE_HUB_VIEW: 1238
29. INTERNAL_SUBTABS_COUNT: 7
30. SUBTAB_1_ID: overview
31. SUBTAB_2_ID: mudou_2025
32. SUBTAB_3_ID: mudou_2026
33. SUBTAB_4_ID: tabela_comparativa
34. SUBTAB_5_ID: questoes_antigas
35. SUBTAB_6_ID: questoes_ineditas
36. SUBTAB_7_ID: flashcards
37. FIRST_VIEWPORT_ELEMENTS_COUNT: 18
38. UPDATE_NESTED_SURFACE_DEPTH: 4
39. UPDATES_DENSITY: VERY_HIGH
40. FLASHCARD_EMBED_TYPE: PREVIEW
41. UPDATE_QUESTION_EMBED_TYPE: PREVIEW
42. ISOLATED_FROM_FSRS_SCHEDULER: YES
43. ISOLATED_FROM_GLOBAL_QUESTION_ATTEMPTS: YES
44. SOURCE_MODEL_COMPATIBILITY: HIGH
45. STALE_DOCUMENT_RISK: LOW
46. DOCUMENT_DATE_RELIABILITY: HIGH
47. UPDATE_CANONICAL_TOPIC_LINK: PARTIAL
48. OUTDATED_CONTENT_TRACKING: COMPREHENSIVE
49. UPDATE_DEFINITION: EXPLICIT_CHANGE
50. UI_FRAMEWORK: TailwindCSS / Lucide Icons
51. TEST_SUITE_BASELINE: 253/253 PASS
52. AUDIT_CLASSIFICATION: PROTOCOL_UPDATES_LAYOUT_CONTENT_AUDITED
```

---

## 9. RECOMENDAÇÕES PARA ETAPAS FUTURAS

1. **Refinamento da Densidade Visual:** Na etapa de layout, priorizar o modo tabular comparativo e a lista mestre como visualizações primárias, permitindo navegação progressiva para reduzir a carga de estímulos no primeiro viewport.
2. **Harmonização Visual com o Design System:** Aplicar a paleta oficial das 5 Grandes Áreas (Cores canônicas) nos cabeçalhos dos cards de protocolos.
3. **Link Canônico de Tópicos:** Mapear os temas dos protocolos diretamente para os identificadores de tópicos do `GrandesTemasView` para navegação cruzada contínua.
