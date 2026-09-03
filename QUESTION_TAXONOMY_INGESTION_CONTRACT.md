# Contrato Canônico de Taxonomia e Ingestão de Questões (Etapa 1.14G)

**Data da Implementação:** 03 de Setembro de 2026  
**Status da Suíte:** 184/184 Testes PASS (20 arquivos de teste) • 0 Erros de Console  
**Escopo:** Definição do Contrato de Ingestão Canônica `Question → canonicalTopicId` para Novas Questões e Isolamento do Dataset Provisório.

---

## 1. Papel dos 75 Grandes Temas
- **Source of Truth:** Os 75 Grandes Temas (`src/data/grandesTemas/`) representam a matriz curricular canônica do Revalida INEP.
- **Distribuição:** 15 temas em cada uma das 5 Grandes Áreas (`cm-01..15`, `cir-01..15`, `ped-01..15`, `go-01..15`, `prev-01..15`).
- **Imutabilidade:** Nenhuma questão nova pode inventar um tema fora dessa matriz sem aprovação editorial.

---

## 2. Papel dos Campos de Taxonomia

| Campo | Papel no Sistema | Source of Truth |
| :--- | :--- | :--- |
| **`canonicalTopicId`** | **Identidade Estrutural Unívoca** (ex: `"go-02"`). Usado pelo PPS, FSRS, Caderno de Erros, agregação de desempenho e agendador. | **Obrigatório para Publicação** |
| **`area`** | **Grande Área Médica** (`CLINICA_MEDICA`, `CIRURGIA_GERAL`, `PEDIATRIA`, `GINECOLOGIA_OBSTETRICIA`, `MEDICINA_FAMILIA_COMUNIDADE`). Deve ser 100% compatível com a área canônica do `canonicalTopicId`. | **Validação Estrita** |
| **`topic`** | Título descritivo/editorial do Grande Tema (ex: *"Síndromes Hipertensivas da Gestação"*). | Descritivo / UI |
| **`subtopic`** | Granularidade clínica fina (ex: *"Pré-Eclâmpsia e Esquema de Zuspan"*). Não substitui o `canonicalTopicId`. | Descritivo / UI |

---

## 3. Papel do `TopicTaxonomyService`
1. **Validador de Ingestão (`validateQuestionTaxonomy`):** Bloqueia a publicação de questões em staging que não possuam `canonicalTopicId` válido ou que tenham conflito de área.
2. **Resolver de Compatibilidade Legada (`resolveCanonicalTopic`):** Resolve questões antigas sem ID explícito através de nomes canônicos e aliases seguros.
3. **Não-Adivinhação:** Não realiza deduções clínicas arbitrárias (*fuzzy* ou por similaridade rasa).

---

## 4. Tratamento do Dataset Legado Provisório (`LEGACY_TEMPORARY_DATASET`)
- As 300 questões existentes no Firestore pertencem a um lote preliminar de extração.
- **Política:** **NÃO** enriquecer a tabela permanente de aliases com termos corrompidos ou inconsistentes desse lote temporário.
- Esse dataset será progressivamente revalidado e substituído pelo novo pipeline oficial de ingestão.

---

## 5. Estados do Pipeline de Ingestão em Staging

```
OCR_RAW ────────► STRUCTURED ──────► ANSWER_KEY_MATCHED ──────► TAXONOMY_PENDING
(Texto Bruto)     (Enunciado/Itens)  (Gabarito Oficial)        (Validação Canônica)
                                                                       │
                                              ┌────────────────────────┴────────────────────────┐
                                              ▼                                                 ▼
                                       REVIEW_REQUIRED                                       VERIFIED
                                  (Dúvida/Área Divergente)                           (canonicalTopicId OK)
                                                                                                │
                                                                                                ▼
                                                                                            PUBLISHED
                                                                                        (Coleção /questions)
```

---

## 6. Regras Rígidas para Publicação de Novas Questões

Uma questão nova **NÃO** poderá transitar para `VERIFIED` / `PUBLISHED` caso:
1. `canonicalTopicId` esteja ausente ou não pertença à lista dos 75 Grandes Temas;
2. `area` médica seja divergente da área do tema canônico;
3. `options` não possuam exatamente uma alternativa correta com gabarito oficial;
4. `clinicalCase` possua texto truncado ou resquícios de OCR corrompido.

---

## 7. Compatibilidade com o Motor PPS
- O `StudyPlannerEngine` recebe diretamente a identidade canônica (`canonicalTopicId` / `GrandeTema.id`).
- O PPS opera sobre os 75 IDs estáveis sem depender de strings soltas ou variações de digitação.
- A conexão do PPS ao Planner aguardará a publicação de dados verificados.

---

## 8. Validações e Testes Automatizados

- **Testes Unitários:** [`src/__tests__/topicTaxonomyService.test.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/__tests__/topicTaxonomyService.test.ts)
  - Validação de `canonicalTopicId` válido e compatibilidade de área médica.
  - Rejeição de IDs inexistentes e áreas incompatíveis.
  - Sinalização de questões legadas sem ID explícito.
  - Garantia de determinismo e imutabilidade do objeto `Question`.
- **Resultado da Suíte:** **184 PASS** (20 arquivos de teste, 3.53s).
- **Erros de Console:** 0.

---

## 9. Classificação Final

```
============================================================
STATUS DO CONTRATO CANÔNICO DE INGESTÃO:
============================================================
CANONICAL_TAXONOMY_SOURCE    = 75 Grandes Temas
CANONICAL_TOPIC_ID_MANDATORY = YES (para novas questões VERIFIED)
VALIDATOR_IMPLEMENTED        = YES (TopicTaxonomyService.validateQuestionTaxonomy)
LEGACY_DATASET_STATUS        = LEGACY_TEMPORARY_DATASET (isolado)

PRODUCTION_WRITES            = 0
FIRESTORE_DATA_CHANGES       = 0
PPS_CHANGES                  = 0
FSRS_CHANGES                 = 0
============================================================
CLASSIFICAÇÃO FINAL:
QUESTION_TAXONOMY_CONTRACT_READY
============================================================
```
