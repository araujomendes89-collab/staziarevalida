# RELATÓRIO DE AUDITORIA DE MIGRAÇÃO E PERSISTÊNCIA FSRS
**Projeto:** StaziaMed Revalida  
**Data:** 03 de Setembro de 2026  
**Status da Auditoria:** Concluída com Sucesso (100% de Integridade Verificada)

---

## 1. Mapeamento de Chaves de Armazenamento (`LocalStorage`)

| Chave | Leitura | Escrita | Finalidade | Status |
| :--- | :---: | :---: | :--- | :---: |
| **`praxis_flashcards_v2`** | Sim | Sim | **Active Flashcard Storage Key (Fonte da Verdade dos Flashcards)** | **ATIVA** |
| **`praxis_flashcards_v1_backup`** | Sim | Sim | **Backup Preventivo Imutável dos Flashcards Legados** (criado antes da 1ª migração) | **BACKUP** |
| `praxis_user_profile_v2` | Sim | Sim | Perfil e preferências do aluno | ATIVA |
| `praxis_questions_v3` | Sim | Sim | Cache local de questões médicas | ATIVA |
| `praxis_attempts_v2` | Sim | Sim | Histórico de tentativas de questões | ATIVA |
| `praxis_knowledge_graph_v2` | Sim | Sim | Nós do grafo de conhecimento médico | ATIVA |
| `praxis_osce_attempts_v2` | Sim | Sim | Histórico de estações práticas OSCE | ATIVA |
| `praxis_study_mission_v2` | Sim | Sim | Missão diária de estudos | ATIVA |
| `praxis_theme_mode_v2` | Sim | Sim | Tema de interface (light/dark) | ATIVA |

### Origem do Prefixo `praxis_`:
O prefixo `praxis_` é o namespace legado de armazenamento local originado nas fases fundacionais da base de código antes da consolidação da marca StaziaMed Revalida. Não representa bug, mas sim a convenção canônica do StorageService local.

---

## 2. Identificação da Fonte da Verdade e Backup

- **`ACTIVE_FLASHCARD_STORAGE_KEY`:** `praxis_flashcards_v2`
- **`BACKUP_STORAGE_KEY`:** `praxis_flashcards_v1_backup`
- **`MIGRATION_MARKER`:** `schedulerVersion: "FSRS_V1"`

---

## 3. Estratégia de Migração dos Flashcards Legados (`SpacedRepetitionService.migrateLegacyFlashcards`)

A migração foi desenhada com critério de **inicialização segura (`SAFE_INITIALIZATION`)** para não fabricar histórico cognitivo inexistente:

| Parâmetro FSRS | Valor Inicial na Migração | Justificativa Técnica |
| :--- | :--- | :--- |
| **`schedulerVersion`** | `"FSRS_V1"` | Marcador explícito que impede remigração. |
| **`stability` ($S$)** | `reps > 0 ? Math.max(1.0, intervalDays * 0.8) : 0` | Estimativa conservadora baseada estritamente no intervalo decorrido anterior, evitando superestimar a retenção da memória. |
| **`difficulty` ($D$)** | `5.0` | Ponto médio neutro na escala padrão 1–10 do FSRS. |
| **`elapsedDays`** | `0` | Inicializado em zero para a nova fase FSRS. |
| **`scheduledDays`** | `intervalDays` | Preservado do agendamento legado. |
| **`reps`** | `repetitionCount || 0` | Preserva a contagem factual de revisões realizadas. |
| **`lapses`** | `0` | **Não fabrica lapsos inexistentes** (o schema antigo não registrava falhas separadas). |
| **`state`** | `reps > 0 ? State.Review (2) : State.New (0)` | Cartões com revisões entram em Review; sem revisões iniciam como New. |
| **`dueDate`** | `card.dueDate` *(inalterado)* | **Preserva com exatidão a data de vencimento pregressa**. |

---

## 4. Auditoria de Due Date Legado (Exemplos Práticos)

| Cenário de Teste | `dueDate` Antes da Migração | `dueDate` Após a Migração | Status na Fila FSRS |
| :--- | :--- | :--- | :---: |
| **Cartão Devido Ontem** | `2026-09-02T12:00:00Z` | `2026-09-02T12:00:00Z` *(preservado)* | **Vencido (entra na fila)** |
| **Cartão Devido Hoje** | `2026-09-03T12:00:00Z` | `2026-09-03T12:00:00Z` *(preservado)* | **Vencido (entra na fila)** |
| **Cartão Devido Amanhã** | `2026-09-04T12:00:00Z` | `2026-09-04T12:00:00Z` *(preservado)* | **Futuro (não entra)** |
| **Cartão em 30 dias** | `2026-10-03T12:00:00Z` | `2026-10-03T12:00:00Z` *(preservado)* | **Futuro (não entra)** |

---

## 5. Auditoria de Idempotência e Backup

1. **Idempotência (100%):** Testes automatizados executando 10 carregamentos sucessivos confirmaram que `stability`, `difficulty`, `reps`, `lapses`, `state` e `dueDate` permanecem rigorosamente idênticos.
2. **Imutabilidade do Backup:** O backup `praxis_flashcards_v1_backup` é gravado apenas uma vez, antes da primeira mutação, e não é sobrescrito em reloads ou avaliações subsequentes.
3. **Projeções Side-Effect Free:** O cálculo de intervalos dos 4 botões (`Again`, `Hard`, `Good`, `Easy`) via `previewFSRSNextIntervals` é puramente funcional e não altera o estado persistido do cartão.

---

## 6. Auditoria de Usos de `masteryLevel` e Multiplicadores Antigos

| Campo / Lógica | Ocorrências Restantes | Classificação | Impacto no Scheduling |
| :--- | :---: | :---: | :---: |
| **`masteryLevel`** | 3 locais (badges visuais e stats de progresso) | `VISUAL_ONLY` | **`SCHEDULING = 0`** (nenhum impacto no agendamento) |
| **Multiplicadores `1.2`, `2.0`, `2.8`** | **0** | `DESATIVADOS` | **`0%`** (100% removidos da engine de Flashcards) |

---

## 7. Validação Automatizada e Navegador

- **Resultado `npm test` Antes:** **94/94 PASS**
- **Resultado `npm test` Depois:** **104/104 PASS** (14 arquivos de teste, 3.47s)
  - `A. Migração 100% idempotente através de múltiplos passes` ✅
  - `B. Backup preserva dataset legado original sem mutação` ✅
  - `C. dueDates legados são estritamente preservados (ontem, hoje, amanhã, 30 dias)` ✅
  - `D. Reload preserva todos os parâmetros FSRS sem mutação` ✅
  - `E. Projeção de intervalos é totalmente side-effect free` ✅
  - `F. Avaliação de nota persiste exatamente uma atualização de estado` ✅
  - `G. Serialização/deserialização preserva tipos nativos Date e números` ✅
  - `H. masteryLevel não controla agendamento de revisão` ✅
  - `I. Marcador schedulerVersion impede remigração redundante` ✅
  - `J. Reload simples no navegador não altera parâmetros FSRS` ✅
- **Erros no Console:** **0**

---

### Classificação Final

# **`FSRS_MIGRATION_INTEGRITY_VERIFIED`**
