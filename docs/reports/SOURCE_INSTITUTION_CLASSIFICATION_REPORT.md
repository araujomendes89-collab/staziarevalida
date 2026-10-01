# SOURCE_INSTITUTION_CLASSIFICATION_REPORT.md
# Relatório de Normalização Institucional de Fontes Médicas
**Etapa:** 1.20G — Source Institution Type Normalization  
**Arquivos Atualizados:** `src/services/officialSearchService.ts`, `src/components/protocols/ProtocolUpdatesHubView.tsx`  
**Testes:** `src/__tests__/officialMaterialsEvidenceIntegrity.test.ts`, `src/__tests__/protocolUpdatesVisualRedesign.test.tsx`  
**Data:** 03 de Setembro de 2026  
**Status Final:** `SOURCE_INSTITUTION_CLASSIFICATION_NORMALIZED`  
**Baseline de Testes:** 258/258 PASS (35 suítes de teste, 0 erros no console)  

---

## 1. RESUMO EXECUTIVO

Esta etapa normalizou a classificação institucional de fontes em todo o sistema StaziaMed, separando estritamente a **natureza institucional do emissor** de sua **qualidade técnica ou vigência normativa**.

### Correções Cruciais:
1. **OPAS (Organização Pan-Americana da Saúde):** Desvinculada de órgãos governamentais brasileiros e classificada como `INTERNATIONAL_HEALTH_ORGANIZATION`.
2. **CFM (Conselho Federal de Medicina):** Desvinculado de sociedades científicas de especialidade médica e classificado como `PROFESSIONAL_REGULATORY_BODY`.
3. **ILAS (Instituto Latino Americano de Sepse):** Desvinculado de sociedades científicas associativas e classificado como `OTHER_PRIMARY_SOURCE` (instituto técnico-científico independente).
4. **Centralização Reutilizável:** A função `classifySourceAuthority()` em `src/services/officialSearchService.ts` tornou-se a fonte única de classificação consumida tanto por `OfficialMedicalSearchView` quanto por `ProtocolUpdatesHubView`.

---

## 2. TAXONOMIA DAS 6 CATEGORIAS INSTITUCIONAIS (`OfficialSourceType`)

```typescript
export type OfficialSourceType =
  | "GOVERNMENT_HEALTH"
  | "INEP"
  | "SCIENTIFIC_SOCIETY"
  | "PROFESSIONAL_REGULATORY_BODY"
  | "INTERNATIONAL_HEALTH_ORGANIZATION"
  | "OTHER_PRIMARY_SOURCE";
```

### Detalhamento por Categoria:

| Categoria | Descrição | Emissores Mapeados (Exemplos) | Label Visual |
| :--- | :--- | :--- | :--- |
| **`GOVERNMENT_HEALTH`** | Órgãos e programas governamentais brasileiros (SUS) | Ministério da Saúde, CONITEC, ANVISA, INCA, PNI, SVSA, domínios `.gov.br` | Fonte Governamental (SUS / MS) |
| **`INEP`** | Autarquia avaliadora do Revalida | INEP, editais, matrizes de competência, provas e gabaritos oficiais | Documento INEP |
| **`SCIENTIFIC_SOCIETY`** | Sociedades e associações médicas de especialidade | SBC, SBP, FEBRASGO, SBD, SBPT, SBMFC, AMB, SBIM, SBN | Diretriz de Sociedade Científica |
| **`PROFESSIONAL_REGULATORY_BODY`** | Conselhos de fiscalização profissional e ética médica | CFM (Conselho Federal de Medicina), CRMs | Conselho Profissional / Regulador |
| **`INTERNATIONAL_HEALTH_ORGANIZATION`** | Organizações internacionais de saúde pública | OPAS / PAHO, OMS / WHO, CDC | Organização Internacional de Saúde |
| **`OTHER_PRIMARY_SOURCE`** | Institutos técnicos, comitês de consenso, diretrizes multiprofissionais | ILAS, ATLS (American College of Surgeons), consórcios de pesquisa | Fonte Primária / Referência |

---

## 3. SEPARAÇÃO ENTRE NATUREZA E HIERARQUIA DE EVIDÊNCIA

- **Princípio Fundamental:** A natureza institucional responde apenas *"Quem é o emissor do documento?"*.
- Não é utilizada para inferir automaticamente que uma fonte governamental é clinicamente superior a um consenso internacional, nem para deduzir status de vigência (`versionStatus`).
- Vigência (`CURRENT_VERIFIED`, `SUPERSEDED`, etc.) e aplicabilidade no Revalida continuam desacopladas da natureza do emissor.

---

## 4. SUMÁRIO DE MÉTRICAS OBRIGATÓRIAS

```yaml
1. SOURCE_TYPES_FINAL:
   - GOVERNMENT_HEALTH
   - INEP
   - SCIENTIFIC_SOCIETY
   - PROFESSIONAL_REGULATORY_BODY
   - INTERNATIONAL_HEALTH_ORGANIZATION
   - OTHER_PRIMARY_SOURCE
2. OPAS_CLASSIFICATION: INTERNATIONAL_HEALTH_ORGANIZATION
3. CFM_CLASSIFICATION: PROFESSIONAL_REGULATORY_BODY
4. ILAS_CLASSIFICATION: OTHER_PRIMARY_SOURCE
5. GOVERNMENT_HEALTH_ISSUERS: "Ministério da Saúde, CONITEC, ANVISA, INCA, PNI, SVSA"
6. SCIENTIFIC_SOCIETY_ISSUERS: "SBC, SBP, FEBRASGO, SBD, SBPT, SBMFC, AMB, SBIM, SBN"
7. PROFESSIONAL_REGULATORY_BODY_ISSUERS: "CFM, CRM"
8. INTERNATIONAL_HEALTH_ORGANIZATION_ISSUERS: "OPAS, PAHO, OMS, WHO, CDC"
9. UNIVERSAL_OFFICIAL_BADGE_USED: NO
10. SOURCE_TYPE_USED_AS_VERSION_STATUS: NO
11. UI_LAYOUT_CHANGED: NO
12. FSRS_CHANGES: 0
13. PPS_CHANGES: 0
14. FIRESTORE_CHANGES: 0
15. NPM_TEST_BEFORE: 258 / 258 PASS
16. NPM_TEST_AFTER: 258 / 258 PASS
17. CONSOLE_ERRORS: 0
18. INSTITUTIONAL_SOURCE_CLASSIFICATION_ACCURATE: YES
19. OPAS_AS_BRAZILIAN_GOVERNMENT: NO
20. CFM_AS_SCIENTIFIC_SOCIETY: NO
21. SOURCE_NATURE_AND_VERSION_STATUS_SEPARATED: YES
22. FUNCTIONALITY_REMOVED: 0
23. ROUTES_REMOVED: 0
24. FINAL_CLASSIFICATION: SOURCE_INSTITUTION_CLASSIFICATION_NORMALIZED
```

---

## 5. CONCLUSÃO

A taxonomia de fontes institucionais do StaziaMed foi concluída com precisão metodológica e sem sobreposição terminológica, garantindo reutilização consistente em todos os módulos da plataforma.

**Classificação:** `SOURCE_INSTITUTION_CLASSIFICATION_NORMALIZED`
