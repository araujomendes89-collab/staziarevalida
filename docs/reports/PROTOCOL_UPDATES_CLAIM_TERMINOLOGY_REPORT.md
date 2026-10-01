# PROTOCOL_UPDATES_CLAIM_TERMINOLOGY_REPORT.md
# Relatório de Normalização Terminológica e de Claims — Atualizações & Diretrizes
**Etapa:** 1.20F — Claim & Terminology Normalization for Protocol Updates  
**Componente Auditado e Normalizado:** `src/components/protocols/ProtocolUpdatesHubView.tsx`  
**Dataset Auditado:** `src/data/protocolUpdatesData.ts` (100% íntegro e inalterado)  
**Data:** 03 de Setembro de 2026  
**Status Final:** `PROTOCOL_UPDATES_CLAIMS_NORMALIZED`  
**Baseline de Testes:** 258/258 PASS (35 suítes de teste, 0 erros no console)  

---

## 1. RESUMO EXECUTIVO

Esta microetapa auditou e normalizou todas as alegações institucionais (*claims*) e terminologias visíveis no submódulo **REVISAR → Atualizações & Diretrizes**. O objetivo foi blindar a plataforma contra afirmações infundadas que pudessem atribuir ao INEP, ao Ministério da Saúde ou a Sociedades Científicas um caráter "oficial" ou "empiricamente comprovado" onde a fonte de verdade é, na realidade, a curadoria pedagógica e a síntese editorial da StaziaMed.

---

## 2. AUDITORIA E NORMALIZAÇÃO DE CLAIMS

### 2.1 Cores das Grandes Áreas
- **Classificação:** `AREA_COLORS_CLASSIFICATION = STAZIAMED_SEMANTIC_SYSTEM`
- **Diagnóstico:** As cores dos temas em `src/config/areaThemes.ts` não são "cores oficiais do INEP ou das áreas médicas", mas sim o sistema cromático semântico proprietário da StaziaMed para rápida identificação cognitiva das 5 Grandes Áreas.
- **Ajuste:** Textos e documentação referem-se estritamente a "acentos cromáticos semânticos da StaziaMed por Grande Área".

### 2.2 Revalida e "Como o INEP cobra"
- **Status:** `"COMO O INEP COBRA" VISIBLE = NO`
- **Classificação:** `IMPACTO_REVALIDA_CLASSIFICATION = EDITORIAL_SYNTHESIS`
- **Diagnóstico:** O atributo `impacto_revalida` reflete a síntese pedagógica da equipe médica StaziaMed. Como a Matriz de Engenharia Reversa das provas ainda não está operando de forma quantitativa automatizada, o label foi normalizado para:
  > **🎯 Como isso pode aparecer no Revalida:**
- **Integridade dos Dados:** O conteúdo textual de `impacto_revalida` foi 100% preservado no dataset sem modificação.

### 2.3 Classificação de Prioridade
- **Status:** `PRIORITY_INTERPRETED_AS_INEP_WEIGHT = NO`
- **Diagnóstico:** As categorias `PRIORIDADE_1_MUITO_ALTA` e `PRIORIDADE_2_ALTA` são classificações pedagógicas internas, não pesos oficiais atribuídos pela banca examinadora.
- **Ajuste Visual:** Labels ajustados para:
  - `Prioridade de revisão: Muito Alta`
  - `Prioridade de revisão: Alta`

### 2.4 Classificação e Proveniência de Fontes
- **Status:** `SCIENTIFIC_SOCIETY_LABELED_AS_SUS_OFFICIAL = NO`
- **Status:** `SOURCE_TYPE_MODEL_REUSED = YES`
- **Diagnóstico:** A tela foi equipada com a função `getSourceClassificationLabel(instituicao)`, que categoriza com precisão:
  - **Fonte Governamental:** Ministério da Saúde, CONITEC, INCA, PNI, ANVISA, SVSA, OPAS.
  - **Documento INEP:** Portarias e matrizes emitidas pelo INEP.
  - **Diretriz de Sociedade Científica:** FEBRASGO, SBC, SBD, ILAS, SBPT, SBMFC, CFM.
  - **Fonte Primária / Referência:** Outros emissores.
- **CTA do Link:** `[Abrir fonte original ↗]`, descrevendo a ação sem atribuir falsamente chancela governamental a consensos de sociedades privadas.

### 2.5 Questões Históricas da Prova
- **Status:** `HISTORICAL_OFFICIAL_ANSWER_PRESERVED = YES`
- **Diagnóstico:** O rótulo `Gabarito Original Oficial da Prova:` é legítimo e foi rigorosamente preservado, pois refere-se ao gabarito formal publicado pelo INEP no ano de aplicação do exame.
- **Aviso de Atualização:** Mantido o destaque informativo de que o protocolo médico mudou posteriormente à data daquela prova.

---

## 3. FUTURA MATRIZ DE ENGENHARIA REVERSA

- `REVERSE_ENGINEERING_MATRIX_IMPLEMENTED = NO`
- **Nota Técnica:** Quando a Matriz de Engenharia Reversa estiver operacional com a extração e indexação completa das 1.500 questões históricas oficiais, afirmações quantitativas (como *"Cobrado em 6 de 10 edições"* ou *"Incidência de 12% no bloco de Ginecologia"*) serão suportadas por dados empíricos. Até lá, todas as análises de impacto permanecem devidamente rotuladas como síntese editorial de revisão.

---

## 4. IMPACTO ARQUITETURAL E DE SISTEMA

- `UI_LAYOUT_CHANGED = NO` (Estrutura de 0 subtabs e Antes × Agora protagonista 100% mantida)
- `FSRS_CHANGES = 0`
- `PPS_CHANGES = 0`
- `FIRESTORE_CHANGES = 0`
- `ROTAS_REMOVIDAS = 0`

---

## 5. SUMÁRIO DE MÉTRICAS OBRIGATÓRIAS

```yaml
1. AREA_COLORS_CLASSIFICATION: STAZIAMED_SEMANTIC_SYSTEM
2. "COMO O INEP COBRA" VISIBLE: NO
3. IMPACTO_REVALIDA_CLASSIFICATION: EDITORIAL_SYNTHESIS
4. PRIORITY_INTERPRETED_AS_INEP_WEIGHT: NO
5. SCIENTIFIC_SOCIETY_LABELED_AS_SUS_OFFICIAL: NO
6. SOURCE_TYPE_MODEL_REUSED: YES
7. HISTORICAL_OFFICIAL_ANSWER_PRESERVED: YES
8. REVERSE_ENGINEERING_MATRIX_IMPLEMENTED: NO
9. UI_LAYOUT_CHANGED: NO
10. FSRS_CHANGES: 0
11. PPS_CHANGES: 0
12. FIRESTORE_CHANGES: 0
13. NPM_TEST_BEFORE: 258 / 258 PASS
14. NPM_TEST_AFTER: 258 / 258 PASS
15. CONSOLE_ERRORS: 0
16. UNSUPPORTED_INEP_CLAIMS: 0
17. AREA_COLOR_OFFICIAL_CLAIMS: 0
18. SOURCE_CLASSIFICATION_SEMANTICALLY_CORRECT: YES
19. HISTORICAL_ANSWER_INTEGRITY: YES
20. FINAL_CLASSIFICATION: PROTOCOL_UPDATES_CLAIMS_NORMALIZED
```

---

## 6. CONCLUSÃO

A terminologia e as alegações institucionais do módulo de Atualizações & Diretrizes estão agora 100% alinhadas com as fontes de verdade do projeto, com transparência pedagógica total.

**Classificação:** `PROTOCOL_UPDATES_CLAIMS_NORMALIZED`
