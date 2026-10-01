# Relatório de Integridade Documental e Classificação Semântica de Fontes (Etapa 1.19B)

**Data da Implementação:** 03 de Setembro de 2026  
**Status da Suíte:** 244/244 Testes PASS (32 arquivos de teste) • 0 Erros de Console  
**Componentes Refinados:**
- [`src/services/officialSearchService.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/services/officialSearchService.ts)
- [`src/components/search/OfficialMedicalSearchView.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/components/search/OfficialMedicalSearchView.tsx)
- [`server/ai/officialMedicalSearch.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/server/ai/officialMedicalSearch.ts)
- [`src/__tests__/officialMaterialsEvidenceIntegrity.test.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/__tests__/officialMaterialsEvidenceIntegrity.test.ts)

---

## 1. Princípio Fundamental de Integridade Implementado

Separou-se explicitamente a proveniência dos dados em quatro camadas independentes:

1. **Fonte Original & Autoridade:** Domínio verificado (`gov.br`, `conitec.gov.br`, `cardiol.br`, etc.), URI original e classificação de autoridade institucional.
2. **Metadados Documentais:** Título do protocolo/diretriz, órgão emissor, ano/data de publicação e data da última revisão curatorial StaziaMed (`reviewedAt`).
3. **Status de Versão & Verificação:** Modelo analítico *Fail-Closed* (`CURRENT_VERIFIED`, `CURRENT_UNVERIFIED`, `SUPERSEDED`, `UNKNOWN`).
4. **Síntese StaziaMed / IA:** Claramente identificada como análise clínica e pedagógica, nunca apresentada como trecho textual puro do documento original.

---

## 2. Modelo de Classificação de Fontes (`OfficialSourceType`)

| Tipo Semântico | Emissores / Domínios | Label Visual | Natureza da Autoridade |
| :--- | :--- | :--- | :--- |
| **`GOVERNMENT_HEALTH`** | Ministério da Saúde, CONITEC, ANVISA, SVSA, PNI (`*.gov.br`, `saude.gov.br`) | **Fonte Governamental (SUS / MS)** | Normas vinculantes, PCDTs, incorporações SUS e RENAME. |
| **`INEP`** | Instituto Nacional de Estudos e Pesquisas Educacionais (`inep.gov.br`) | **Documento INEP** | Matrizes de habilidades, editais e gabaritos do Revalida. |
| **`SCIENTIFIC_SOCIETY`** | SBC, SBP, FEBRASGO, SBD, SBPT, AMB, CFM | **Diretriz de Sociedade Científica** | Consensos e evidências de especialidades médicas. |
| **`OTHER_PRIMARY_SOURCE`** | BVSMS, indexadores e bibliotecas virtuais | **Fonte Primária / Referência** | Repositórios normativos e documentais. |

---

## 3. Separação: Data de Publicação vs Vigência Atual

- **Data de Publicação (`publicationDate` / `publicationYear`):** Informação cronológica extraída da fonte (ex: *Publicado em 2024*). Confiabilidade: **`RELIABLE`**.
- **Vigência Atual (`versionStatus`):** Atestação de que a norma não foi revogada ou substituída. Confiabilidade: **`PARTIAL`** (*Fail-Closed*: classificada como `CURRENT_UNVERIFIED` até confirmação determinística de vigência contínua).
- **Regra de Portão para "Conduta SUS":** Apenas fontes governamentais (`GOVERNMENT_HEALTH`) exibem o título *"Conduta Padrão-Ouro no SUS"*. Diretrizes de sociedades médicas exibem *"Recomendação Clínica / Diretriz de Especialidade"*.
- **"Impacto no Revalida INEP":** Identificado como síntese pedagógica/editorial StaziaMed, não declaração oficial da banca.

---

## 4. Auditoria do Banco Curado (`CURATED_2026_DATABASE`)

- Todos os registros curados e tópicos em destaque (`TOP_2026_HOT_TOPICS`) agora contam com:
  - `sourceType`: Classificação institucional precisa.
  - `reviewedAt: "2026-08-31"`: Carimbo de auditoria curatorial.
  - `versionStatus: "CURRENT_UNVERIFIED"` (ou `CURRENT_VERIFIED` quando há portaria expressa).

---

## 5. Resumo Executivo e Classificação

```
============================================================
STATUS DA INTEGRIDADE DOCUMENTAL DE MATERIAIS (ETAPA 1.19B):
============================================================
SOURCE_CLASSIFICATION_IMPLEMENTED            = YES
SOURCE_TYPES                                 = GOVERNMENT_HEALTH, INEP, SCIENTIFIC_SOCIETY, OTHER_PRIMARY_SOURCE

PUBLICATION_DATE_RELIABILITY                 = RELIABLE
CURRENT_VERSION_RELIABILITY                  = PARTIAL (Fail-Closed)
VERSION_STATUS_MODEL                         = CURRENT_VERIFIED, CURRENT_UNVERIFIED, SUPERSEDED, UNKNOWN

AI_SYNTHESIS_SEPARATED_FROM_SOURCE_METADATA  = YES
SCIENTIFIC_SOCIETY_CLASSIFIED_AS_GOVERNMENT  = NO
"FONTE OFICIAL" UNIVERSAL_BADGE              = NO (Substituído por labels semânticos)

"CONDUTA PADRÃO SUS" SOURCE_GATED            = YES (Conduta SUS para Gov; Diretriz para Sociedades)
"IMPACTO NO REVALIDA INEP" CLASSIFICATION    = EDITORIAL_SYNTHESIS (Síntese Pedagógica StaziaMed)
CURATED_FALLBACK_VERIFICATION_STATUS         = PARTIALLY_VERIFIED (reviewedAt: 2026-08-31)

STALE_DOCUMENT_RISK_BEFORE                   = MEDIUM
STALE_DOCUMENT_RISK_AFTER                    = LOW/MEDIUM (Fail-Closed com links originais)

FIRESTORE_CHANGES                            = 0
PPS_CHANGES                                  = 0
FSRS_CHANGES                                 = 0

NPM_TEST_BEFORE                              = 241/241 PASS
NPM_TEST_AFTER                               = 244/244 PASS
CONSOLE_ERRORS                               = 0
============================================================
CLASSIFICAÇÃO FINAL:
OFFICIAL_MATERIALS_EVIDENCE_INTEGRITY_READY
============================================================
```
