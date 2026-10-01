# Relatório de Auditoria do Motor de Planejamento (Etapa 1.14B)

**Data da Auditoria:** 03 de Setembro de 2026  
**Status do Sistema:** 153/153 Testes PASS • 0 Erros de Console  
**Escopo:** Auditoria Técnica Read-Only do Motor de Planejamento, Calendário, Plano Semanal e Agendamento  

---

## 1. O que é `ADAPTIVE_SCHEDULE_DAYS`
- **Arquivo de Origem:** `src/data/adaptiveCalendarData.ts` (linhas 90 a 716).
- **Tipo:** `ScheduledDayItem[]` (derivado de `RAW_SCHEDULE_DAYS`).
- **Quantidade de Entradas:** Exatamente **14 entradas estáticas pré-programadas** (IDs de `day-2026-08-31` a `day-2026-09-13`).
- **Estrutura:** Cada entrada contém:
  - `id`, `date`, `dayOfWeek`, `dayNumber`, `month`, `phase` (`FASE_3_RETA_FINAL`).
  - `allocatedMinutes`, `primaryArea`, `primaryTopicName`, `focusTheme`, `topicIrs`, `ppsScore`.
  - `blocks: CalendarBlock[]` (ex: `GRANDE_TEMA`, `QUESTOES_OFICIAIS`, `FLASHCARDS`, `EXECUCAO_PROVA`).
- **Mapeamento:** No `WeeklyPlanView`, os próximos 7 dias são indexados pelo operador módulo (`i % scheduleDays.length`) para obter o template curricular de temas e questões.
- **Dependência do Usuário:** **Nenhuma**. Trata-se de uma grade curricular estática que simula um ciclo de reta final para o Revalida INEP.

---

## 2. Fonte dos Temas de `ESTUDAR`
- **Origem:** `STATIC_CONSTANT` (`RAW_SCHEDULE_DAYS` em `adaptiveCalendarData.ts` e `INITIAL_KNOWLEDGE_GRAPH` em `knowledgeGraphData.ts`).
- **Exemplos de Temas:**
  - `Pré-Eclâmpsia & Esquema de Zuspan` (Ginecologia/Obstetrícia)
  - `Síndrome Coronariana Aguda (SCASST / SCACST)` (Clínica Médica)
  - `Arboviroses: Dengue Grupos A/B/C/D & PNI` (Preventiva/MFC)
  - `Calendário PNI 100% VIP & Desidratação Infantil` (Pediatria)
  - `Trauma Torácico (ATLS) & Abdome Agudo` (Cirurgia Geral)
- **Classificação:** Não são gerados dinamicamente por histórico nem por IA. São blocos curriculares canônicos fixos baseados na alta incidência histórica do INEP.

---

## 3. Fonte das Atividades de `PRATICAR`
- **Origem:** `STATIC_CONSTANT` definida dentro dos blocos de cada dia em `RAW_SCHEDULE_DAYS`.
- **Exemplos:**
  - `Questões Oficiais INEP + Irmãs` (16 questões, 45 min)
  - `Simulado Padrão INEP 1 (50 Questões Intercaladas)` (50 questões, 240 min)
  - `100 Questões Objetivas de Múltipla Escolha` (100 questões, 300 min)

---

## 4. Origem da Quantidade de Questões
- **Classificação:** **FIXA / HARDCODED**.
- A quantidade de questões em cada bloco (`questionCount`: 10, 14, 16, 20, 50, 100) vem codificada na constante do template do dia. Não é calculada em tempo real pela disponibilidade diária do usuário ou pelo número de dias restantes até o exame.

---

## 5. Uso do Desempenho do Aluno
| Dado de Desempenho | Leitura no App | Uso no Planejamento Semanal / Calendário | Classificação |
| :--- | :--- | :--- | :--- |
| `attempts` / `questionAttempts` | `AppContext.tsx` | Não altera a grade de temas de estudo do calendário/plano semanal | `DISPLAY_ONLY` / `DASHBOARD` |
| `accuracyPercentage` | `DashboardView.tsx` | Apenas exibido no card de estatísticas | `DISPLAY_ONLY` |
| `knowledgeGraph.userMastery` | `AppContext.tsx` | Atualizado (+3 / -2), usado em `StudyForMeModal` / `AdaptiveEngine.calculateReadiness` | `PARTIAL` (fora do plano semanal) |
| `readinessData.score` | `DashboardView.tsx` | Exibido no gauge de prontidão geral | `DISPLAY_ONLY` |
| `ErrorAutopsy` | `ErrorNotebookView.tsx` | Registro isolado para consulta no Caderno de Erros | `DISPLAY_ONLY` |

---

## 6. Uso do Caderno de Erros no Planejamento
- **Impacto no Planejamento:** **Nenhum**.
- Quando o aluno erra uma questão, é criado um registro em `errors` no Firestore e um flashcard FSRS. O Caderno de Erros **não** altera dinamicamente os grandes temas agendados em `ADAPTIVE_SCHEDULE_DAYS`.

---

## 7. Uso do FSRS
- **Impacto:** **REVISÃO EXCLUSIVAMENTE**.
- O FSRS governa 100% da carga de `REVISAR` via `SpacedRepetitionService.getFlashcardReviewLoadByDate` e `getDueFlashcards`.
- O FSRS **NÃO** escolhe temas teóricos de `ESTUDAR`, nem altera filtros ou volumes de `PRATICAR`.

---

## 8. Uso da Disponibilidade do Aluno
- **Status:** `MOCK` / `PARTIAL`.
- Na aba *Disponibilidade* (`PlanejamentoView.tsx`), existe um slider de horas/dia e input de data alvo. Ao clicar em "Salvar", é executado apenas um `setTimeout(1200ms)` de simulação com feedback visual. Os minutos diários não recalcula a lista de blocos diários de `ADAPTIVE_SCHEDULE_DAYS`.

---

## 9. Uso dos Dias até a Prova
- **Status:** `DISPLAY_ONLY`.
- O cálculo `daysRemaining` é feito com precisão pelo `ExamEngine.getExamInfo` (ex: "46 dias restantes"), porém ele **não** compacta ou altera a grade de blocos curriculares no Plano Semanal ou no Calendário.

---

## 10. Distribuição por Grandes Áreas
- **Origem:** `HARDCODED / EQUILIBRADA`.
- A grade pré-programada de 14 dias faz um rodízio estático pelas 5 grandes áreas:
  1. Ginecologia/Obstetrícia
  2. Clínica Médica
  3. Preventiva/MFC
  4. Pediatria
  5. Cirurgia Geral
  - Finais de semana dedicados a Simulados Gerais e Revisão.

---

## 11. `KnowledgeGraph` Real
- **Estrutura:** Array de `KnowledgeNode` (`id`, `area`, `name`, `parentTopic`, `incidenceWeight`, `userMastery`, `riskLevel`).
- **Atualização:** Quando o aluno responde questões (`recordQuestionAttempt`), `userMastery` varia (+3 acerto / -2 erro).
- **Relação com o Plano Semanal:** O `KnowledgeGraph` alimenta o `StudyForMeModal` (sessões rápidas 15/30/60/120 min), mas **não** redefine a sequência semanal de dias.

---

## 12. `todayMission` Real
- **Origem:** Inicializado com `INITIAL_MISSION` ("Diagnóstico Clínico Inicial — Matriz INEP") em `StorageService.getTodayMission()`.
- **Persistência:** `localStorage` (`staziamed_study_mission`) e sincronizado com o documento de progresso no Firestore.
- **Ciclo:** Não é regenerado automaticamente por data ou por erro; é atualizado apenas quando o aluno clica em "Gerar Sessão Rápida" via `AdaptiveEngine.generateQuickSession`.

---

## 13. Persistência do Plano
| Módulo | Tipo de Armazenamento | Fonte da Verdade |
| :--- | :--- | :--- |
| **Revisões FSRS** | `localStorage` (`praxis_flashcards_v2`) | `Flashcard[]` persistido |
| **Grade de Temas (`ESTUDAR`/`PRATICAR`)** | `STATIC_CONSTANT` em memória | `ADAPTIVE_SCHEDULE_DAYS` |
| **Missão do Dia (`todayMission`)** | `localStorage` + Firestore `progress` | `StudyMission` |

---

## 14. Ciclo de Atualização (Teste Conceitual)
- *Aluno erra 15 de 20 questões de Pediatria:* **O Plano Semanal Teórico muda?** `NO` (apenas a contagem de Flashcards FSRS aumenta).
- *Aluno acerta 20/20 em Cardiologia:* **O Plano muda?** `NO`.
- *Aluno tem 50 Flashcards vencidos:* **A parte ESTUDAR/PRATICAR muda?** `NO`. A parte **REVISAR** de hoje passa a exibir 50 flashcards devidos imediatamente.

---

## 15. Replanejamento
- **Status:** `MOCK` (`NOT_FUNCTIONAL`).
- A aba *Replanejamento* em `PlanejamentoView.tsx` renderiza cards de "2 blocos atrasados" e um botão "Executar Replanejamento Automático" que simula processamento em 1.2s sem modificar os arrays de dados.

---

## 16. Disponibilidade
- **Status:** `MOCK` (`NOT_FUNCTIONAL`).
- Não há conexão ativa entre o formulário de horas diárias e os minutos alocados nos blocos da semana.

---

## 17. Dados Fictícios / Hardcoded Encontrados
1. `priorityListSample` em `AdaptiveCalendarView.tsx` (linhas 173-200) — lista estática de prioridades.
2. `NEXT_BEST_ACTION` em `adaptiveCalendarData.ts` (linhas 43-87) — recomendação estática de Pré-Eclâmpsia com PPS 96.
3. `WEEKLY_ROUTE_REPORT` em `adaptiveCalendarData.ts` (linhas 770-820) — boletim com dados pré-fixados.
4. `COVERAGE_FORECAST_SAMPLE` e `DEPRIORITIZED_TOPICS_SAMPLE` em `adaptiveCalendarData.ts` — projeções estáticas.

---

## 18. Uso Atual de IA no Planejamento
- **`AI_PLANNING_CURRENTLY_USED = NO`**.
- As chamadas de IA (`AiService` / Gemini) são restritas à tutoria socrática de questões, simulação de estações de OSCE e auditoria de itens. O agendamento e o planejamento não fazem chamadas de LLM.

---

## 19. Sinais Reais Prontos para um Futuro Motor Adaptativo
| Sinal Clínico/Pedagógico | Disponibilidade Atual | Confiabilidade |
| :--- | :--- | :--- |
| **Carga de Revisão FSRS por Data** | `READY` | 100% Confiável (`ts-fsrs` calibrado) |
| **Dias até a Prova / Edição Alvo** | `READY` | 100% Confiável (`ExamEngine`) |
| **Histórico de Tentativas (`QuestionAttempt`)** | `READY` | 100% Confiável (Persistido) |
| **Autópsias de Erros com Taxonomia** | `READY` | 100% Confiável (Firestore `errors`) |
| **Matriz Curricular dos Grandes Temas** | `READY` | 100% Confiável (75 Grandes Temas) |
| **Pesos e Recorrência INEP (IRS)** | `READY` | 100% Confiável |
| **Disponibilidade Real por Dia da Semana** | `PARTIAL` | Requer salvar perfil do usuário |
| **Algoritmo de Priorização Dinâmica (PPS)** | `READY` (Código em `StudyPlannerEngine`) | Pronto para ser plugado |

---

## 20. Principais Lacunas para a Próxima Etapa
1. Conectar o `StudyPlannerEngine.calculateTopicPriorities` diretamente aos dados reais de tentativas do usuário (`attempts`) e `knowledgeGraph`.
2. Substituir o ciclo estático de 14 dias por um gerador dinâmico de blocos baseado na real disponibilidade semanal do aluno e nas suas lacunas com maior ganho de pontos (IRS x Deficit).
3. Persistir as configurações de disponibilidade (`weeklySchedule` / horas por dia) no perfil do usuário no Firestore.

---

## 21. Classificação Final

```
============================================================
CLASSIFICAÇÃO DO MOTOR DE PLANEJAMENTO ATUAL:
STATIC_CURRICULUM_WITH_DYNAMIC_REVIEW
============================================================

PERSONALIZATION_LEVEL         = LOW
AI_PLANNING_CURRENTLY_USED    = NO
PERFORMANCE_DRIVEN            = NO (ESTUDAR/PRATICAR) / YES (FSRS REVISAR)
ERROR_DRIVEN                  = NO (ESTUDAR/PRATICAR) / YES (FSRS REVISAR)
AVAILABILITY_DRIVEN           = NO
FSRS_DRIVEN_REVIEW            = YES
```
