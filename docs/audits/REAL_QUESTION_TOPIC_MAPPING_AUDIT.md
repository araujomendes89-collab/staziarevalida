# Relatório de Auditoria do Dataset Real de Questões e Validação Question → Topic (Etapa 1.14F)

**Data da Auditoria:** 03 de Setembro de 2026  
**Status da Suíte:** 179/179 Testes PASS • 0 Erros de Console  
**Escopo:** Auditoria Read-Only do Dataset Real de Questões em Produção (Firestore `staziamed-revalida-prod`) e Medição da Cobertura Real `Question → canonicalTopicId`.

---

## 1. Source of Truth Real das Questões
- **Fonte Real em Runtime:** **`FIRESTORE`** (Coleção `/questions` na base de dados `staziamed-revalida-prod`).
- **Mecanismo de Carregamento:** O `AppContext` executa `syncQuestionsFromFirestore()`, consultando a coleção `/questions` e sobrepondo o cache local no `StorageService` (`localStorage: staziamed_questions`).
- **Causa do `TOTAL_QUESTIONS = 0` na Etapa 1.14E:** Os arquivos estáticos de seed local (`src/data/allOfficialQuestions.ts` e agregadores `revalida*_CompiledQuestions.ts`) continham arrays vazios (`[]`) como placeholders. A aplicação em runtime consome o Firestore.

---

## 2. Inventário do Dataset Real de Questões
- **TOTAL_REAL_QUESTIONS:** **300 questões oficiais completas**.
- **Distribuição por Edição Oficial:**
  - `Revalida INEP 2025/1 — Caderno 01`: **100 questões**
  - `Revalida INEP 2025/2 — Caderno 01`: **100 questões**
  - `Revalida INEP 2026/1 — Caderno 01`: **100 questões**

---

## 3. Cobertura Real de Mapeamento (`TopicTaxonomyService`)

| Métrica | Contagem | Percentual |
| :--- | :---: | :---: |
| **TOTAL_REAL_QUESTIONS** | **300** | **100.00%** |
| **MAPPED_REAL_QUESTIONS** | **109** | **36.33%** |
| **UNMAPPED_REAL_QUESTIONS** | **164** | **54.67%** |
| **AMBIGUOUS_REAL_QUESTIONS** | **11** | **3.67%** |
| **AREA_MISMATCH_REAL_COUNT** | **16** | **5.33%** |

---

## 4. Distribuição dos Match Types
- `DIRECT_ID`: **0 (0.00%)** — Nenhuma questão do Firestore possui atualmente o campo `canonicalTopicId` persistido diretamente no schema.
- `CANONICAL_NAME`: **26 (8.67%)** — Questões onde o campo `topic` é idêntico ao título canônico de um dos 75 Grandes Temas.
- `EXPLICIT_ALIAS`: **83 (27.67%)** — Questões mapeadas através da tabela de aliases clínicos seguros.
- `SUBTOPIC_ALIAS`: **0 (0.00%)** — Subtópicos sem match exato na tabela direta.
- `AREA_MISMATCH`: **16 (5.33%)** — Casos onde o tema clínico apontou para uma Grande Área diferente da área etiquetada na prova.
- `AMBIGUOUS`: **11 (3.67%)** — Questões com `topic: "Trauma"` genérico em Cirurgia Geral.
- `UNMAPPED`: **164 (54.67%)** — Questões onde o `topic` é uma especialidade médica ampla (ex: *"Pneumologia"*, *"Psiquiatria"*, *"Neonatologia"*, *"Infectologia Pediátrica"*).

---

## 5. Cobertura por Prova / Edição Oficial

| Edição da Prova | Total de Questões | Mapeadas | Unmapped | Ambíguas | Mismatch | Cobertura Real |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Revalida INEP 2025/1 — Caderno 01** | 100 | 35 | 55 | 5 | 5 | **35.0%** |
| **Revalida INEP 2025/2 — Caderno 01** | 100 | 34 | 55 | 5 | 6 | **34.0%** |
| **Revalida INEP 2026/1 — Caderno 01** | 100 | 40 | 54 | 1 | 5 | **40.0%** |

---

## 6. Cobertura por Grande Área Médica

| Grande Área | Total | Mapeadas | Unmapped | Ambíguas | Mismatch | Cobertura |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Medicina de Família e Comunidade / Preventiva** | 62 | 33 | 22 | 0 | 7 | **53.2%** |
| **Cirurgia Geral e Trauma** | 46 | 20 | 15 | 11 | 0 | **43.5%** |
| **Ginecologia e Obstetrícia** | 55 | 23 | 31 | 0 | 1 | **41.8%** |
| **Pediatria e Puericultura** | 60 | 16 | 42 | 0 | 2 | **26.7%** |
| **Clínica Médica** | 65 | 17 | 45 | 0 | 3 | **26.2%** |
| *Variações de Nomenclatura de Área (ex: MEDICINA_PREVENTIVA)* | 12 | 0 | 9 | 0 | 3 | **0.0%** |

---

## 7. Diagnóstico das Principais Causas de Não-Mapeamento

1. **Tópicos Genéricos por Especialidade ao Invés de Tema Clínico:**
   - Cerca de 60% das questões não mapeadas usam especialidades como tópico:
     - `topic: "Pneumologia"`, `subtopic: "DPOC Exacerbado"` (Deveria mapear para `cm-08`: Asma e DPOC)
     - `topic: "Infectologia Pediátrica"`, `subtopic: "Prevenção de VSR (Palivizumabe)"` (Deveria mapear para `ped-11`: Bronquiolite)
     - `topic: "Neonatologia"`, `subtopic: "Infecções Congênitas"` (Deveria mapear para `go-12`: Infecções na Gestação / TORCH)
     - `topic: "Ginecologia da Infância e Adolescência"`, `subtopic: "Amenorreia Primária"`
     - `topic: "Psiquiatria"`, `subtopic: "Síndrome de Abstinência Alcoólica"`
2. **Ambivalência de "Trauma":**
   - 11 questões de Cirurgia têm `topic: "Trauma"` genérico. O resolver determinístico corretamente as isolou como `AMBIGUOUS` (requerem avaliar o `subtopic` para direcionar a `cir-01` ATLS, `cir-02` TCE ou `cir-03` Trauma Torácico).
3. **Variações na String de Grande Área:**
   - 12 questões usam variações como `"MEDICINA_PREVENTIVA"`, `"MEDICINA_PREVENTIVA_SOCIAL"` e `"GINECOLOGIA_E_OBSTETRICIA"`.
4. **Temas Multidisciplinares / Mismatches:**
   - 16 questões abordam temas de fronteira (ex: Tuberculose cobrada sob o prisma da Atenção Básica vs. Clínica Médica).

---

## 8. Distribuição nos 75 Grandes Temas
- **TOPICS_WITH_REAL_QUESTIONS:** **50 de 75 temas (66.7%)** possuem questões oficiais mapeadas.
- **TOPICS_WITH_ZERO_REAL_QUESTIONS:** **25 de 75 temas (33.3%)** ainda não possuem questões associadas nas 3 provas auditadas.

---

## 9. Performance do Resolver em Runtime
- **Tempo para processar 300 questões:** **51ms** ($\approx 0.170\text{ms}$ por questão).
- **Consumo de Memória:** Tabela indexada em `Map<string, Entry>` com acesso $O(1)$.

---

## 10. Segurança e Auditoria de Produção
- **PRODUCTION_READS:** **300 documentos** (1 query de leitura no Firestore).
- **PRODUCTION_WRITES:** **0** (Nenhuma mutação, escrita ou deleção em produção).

---

## 11. Classificação Obrigatória

```
============================================================
STATUS DO DATASET REAL DE QUESTÕES:
============================================================
QUESTION_RUNTIME_SOURCE       = FIRESTORE
TOTAL_REAL_QUESTIONS          = 300

MAPPED_REAL_QUESTIONS         = 109
UNMAPPED_REAL_QUESTIONS       = 164
AMBIGUOUS_REAL_QUESTIONS      = 11
AREA_MISMATCH_REAL_COUNT      = 16

REAL_QUESTION_MAPPING_COVERAGE = 36.33%

DIRECT_ID_PERCENT             = 0.00%
CANONICAL_NAME_PERCENT        = 8.67%
EXPLICIT_ALIAS_PERCENT        = 27.67%
SUBTOPIC_ALIAS_PERCENT        = 0.00%

PPS_TOPIC_INPUT_COMPATIBLE    = YES (estrutura pronta, aguardando enriquecimento)

PRODUCTION_READS              = 300
PRODUCTION_WRITES             = 0

PPS_CHANGES                   = 0
FSRS_CHANGES                  = 0
FIRESTORE_DATA_CHANGES        = 0
============================================================
CLASSIFICAÇÃO FINAL:
REAL_QUESTION_MAPPING_REQUIRES_CORRECTION
============================================================
```

> **Conclusão:** O dataset real de 300 questões foi localizado com precisão no Firestore. A cobertura real é de **36.33%** (109/300), demonstrando que o motor de mapeamento necessita de uma etapa de enriquecimento de aliases para subtemas clínicos e normalização de especialidades médicas antes que o PPS possa alimentar o Planner com 100% de confiança nas questões reais.
