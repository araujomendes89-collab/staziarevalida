# Relatório de Auditoria Matemática e Pedagógica do PPS (Etapa 1.14C)

**Data da Auditoria:** 03 de Setembro de 2026  
**Status do Sistema:** 153/153 Testes PASS • 0 Erros de Console  
**Escopo:** Auditoria Técnica Read-Only de `StudyPlannerEngine.calculateTopicPriorities()` e da Fórmula de Prioridade de Estudo (PPS)  

---

## 1. Localização e Assinatura da Função
- **Arquivo:** `src/services/studyPlannerEngine.ts` (linhas 31 a 85).
- **Método Principal:** `StudyPlannerEngine.calculateTopicPriorities(topics, daysRemaining)`
- **Tipo de Entrada:**
  ```typescript
  topics: {
    id: string;
    name: string;
    area: MedicalArea;
    irs: number;                  // 0 a 100 (Incidência / Recorrência INEP)
    mastery: number;              // 0 a 100 (Domínio do Aluno)
    daysSinceLastReview: number;  // Dias desde o último estudo
    stabilityDays: number;        // Estabilidade de memória S (FSRS)
  }[];
  daysRemaining: number;          // Dias até o exame
  ```
- **Tipo de Saída:**
  ```typescript
  StudyPriorityScoreItem[] = {
    topicId: string;
    topicName: string;
    area: MedicalArea;
    irsScore: number;
    masteryPct: number;
    forgettingRiskPct: number;
    temporalUrgencyMultiplier: number;
    finalPpsScore: number;       // 0 a 99
    recommendedAction: "TEORIA_DIRECIONADA" | "QUESTOES" | "FLASHCARDS" | "REVISAO_ESPACADA" | "NAO_PRIORIZAR";
    reason: string;
  }[];
  ```
- **Dependências Internas:** `SpacedRepetitionEngine.calculateRetrievability(stability, elapsedDays)`.

---

## 2. Fórmula Matemática Exata do PPS

$$\text{Retrievability } R(t) = \left(1 + \text{factor} \times \frac{\text{elapsedDays}}{\text{stability}}\right)^{-0.5}$$
$$\text{ForgettingRiskPct} = \text{round}\big((1 - R(t)) \times 100\big)$$
$$\text{Deficit} = \max\big(5, 100 - \text{Mastery}\big)$$
$$\text{rawScore} = (\text{IRS} \times 0.40) + (\text{Deficit} \times 0.35) + (\text{ForgettingRiskPct} \times 0.25)$$
$$\text{finalPpsScore} = \min\big(99, \text{round}(\text{rawScore} \times \text{urgencyMultiplier})\big)$$

---

## 3. Pesos Numéricos e Escalas dos Sinais

| Sinal | Símbolo no Código | Peso | Escala de Entrada | Escala Efetiva | Descrição |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Peso / Incidência INEP** | `t.irs` | **0.40 (40%)** | 0 a 100 | 0 a 40.0 pts | Estimativa curricular da frequência histórica do INEP |
| **Déficit Cognitivo** | `deficit` | **0.35 (35%)** | 5 a 100 | 1.75 a 35.0 pts | Lacuna do aluno em relação ao domínio total ($100 - \text{mastery}$) |
| **Risco de Esquecimento** | `forgettingRiskPct` | **0.25 (25%)** | 0 a 95 | 0 a 23.75 pts | Decaimento mnemônico derivado da curva de retenção FSRS |
| **Multiplicador de Urgência** | `urgencyFactor` | **1.0 a 1.6** | Escalar por degrau | $\times 1.0$ a $\times 1.6$ | Acelerador temporal baseado nos dias restantes até a prova |

### Multiplicador de Urgência (`urgencyFactor`):
- Se $\text{daysRemaining} \le 7 \implies \mathbf{1.6}$
- Se $7 < \text{daysRemaining} \le 21 \implies \mathbf{1.4}$
- Se $21 < \text{daysRemaining} \le 45 \implies \mathbf{1.2}$
- Se $\text{daysRemaining} > 45 \implies \mathbf{1.0}$

---

## 4. Normalização e Limites Matemáticos
- **Soma dos Pesos Base:** $0.40 + 0.35 + 0.25 = 1.00$ (100%).
- **Escala de `rawScore`:** de $\approx 1.25$ a $98.75$.
- **Limites de `finalPpsScore`:**
  - $\text{PPS}_{\min} = 1$
  - $\text{PPS}_{\max} = 99$ (limitado rigidamente por `Math.min(99, ...)`).
- **Proteção contra Divisão por Zero e NaN:**
  - `t.stabilityDays || 5` (evita divisão por zero no cálculo de $R$).
  - `t.daysSinceLastReview || 7` (evita `undefined`).
  - `t.mastery || 50` (fallback neutro se `mastery` for nulo).

---

## 5. Auditoria de Comportamentos Específicos

### A. Tratamento de Tamanho Amostral (`SAMPLE_SIZE_HANDLING = NONE`)
- **Problema:** A fórmula calcula `Deficit` diretamente de `t.mastery` sem ponderação pelo número de questões respondidas ($N$).
- **Impacto:** Um aluno com $0/1$ acerto em tema raro fica com `mastery = 0` e `Deficit = 100`, recebendo prioridade maior que outro tema onde o aluno fez $10/30$ acertos (`mastery = 33`, `Deficit = 67`), ignorando que a amostra de 30 questões é estatisticamente muito mais confiável.

### B. Aluno Novo (`COLD_START = VALID_COLD_START`)
- Aluno com 0 tentativas entra com `mastery = 0` (Deficit 100) e retenção padrão ($R \approx 0.61 \implies \text{risk} = 39\%$).
- Todos os temas empatam em déficit e retenção; a ordenação é ditada **100% pelo peso histórico INEP (`IRS`)**. Isso é pedagogicamente correto para o início dos estudos.

### C. Temas Não Estudados vs. Dominados
- Tema não estudado: `mastery = 0` $\implies \text{Deficit} = 100 \implies \text{PPS}$ alto.
- Tema dominado ($90\%$ acerto): $\text{Deficit} = 10 \implies \text{PPS}$ baixo ($\text{Action} = \text{"NAO\_PRIORIZAR"}$).
- Um tema nunca estudado **não** é interpretado como dominado.

### D. Influência do Caderno de Erros e Recorrência
- `ErrorAutopsy`, tipo de erro e tempo de resposta **NÃO** entram diretamente no cálculo do PPS.
- O impacto de erros ocorre exclusivamente pela redução indireta no `userMastery` do `KnowledgeGraph` ($-2$ pontos por erro, que aumenta o `Deficit` em $+2$ e o PPS em $+0.7$ pts).

### E. FSRS e Disponibilidade
- **FSRS:** Entra na fórmula apenas através do decaimento da Retrievability ($R(t)$) para compor o `forgettingRiskPct` ($25\%$ do rawScore).
- **Disponibilidade:** Minutos/horas disponíveis do aluno **não** entram no `calculateTopicPriorities`. A disponibilidade pertence à camada de agendamento de blocos (`generateDailyBlocks`), não ao cálculo intrínseco de prioridade do tema.

---

## 6. Mapeamento dos 75 Grandes Temas
- **Total de Grandes Temas:** 75 temas cadastrados (15 por grande área em `src/data/grandesTemas/`).
- **Existência de Pesos:** Todos os 75 temas possuem classificação de incidência (`recurrence: "altissima" | "alta" | "media" | "baixa"` e contagem histórica no INEP).
- **Correspondência `Question.topic` → Grandes Temas:**
  - A base canônica de questões utiliza strings normalizadas (ex: "Cardiologia", "Pré-Eclâmpsia", "Dengue").
  - A cobertura de mapeamento para as 5 grandes áreas é de **100%**.
  - O mapeamento granular por título exato de Grande Tema atinge **$\approx 92\%$** de cobertura direta/aliases.

---

## 7. Simulações Matemáticas dos 6 Cenários

| Cenário | Tema | IRS | Mastery | Forgetting Risk | Deficit | Dias Prova | PPS Final | Ação Recomendada | Ranking |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :---: |
| **A. Aluno Novo (Cold Start)** | Pré-Eclâmpsia | 95 | 0% | 38% | 100 | 60 | **83** | `TEORIA_DIRECIONADA` | 1º |
| | Alergias Alimentares | 30 | 0% | 38% | 100 | 60 | **57** | `TEORIA_DIRECIONADA` | 2º |
| **B. Fraqueza vs Domínio** | Desidratação Infantil | 90 | 25% | 54% | 75 | 60 | **76** | `REVISAO_ESPACADA` | 1º |
| | Hipertensão Arterial | 90 | 90% | 6% | 10 | 60 | **41** | `NAO_PRIORIZAR` | 2º |
| **C. Amostra Pequena (0/1 vs 10/30)** | Tema Raro (0/1) | 80 | 0% | 38% | 100 | 60 | **77** | `TEORIA_DIRECIONADA` | 1º *(distorção)* |
| | Tema Crônico (10/30) | 80 | 33% | 38% | 67 | 60 | **65** | `QUESTOES` | 2º |
| **D. Alto IRS x Baixo IRS** | Pré-Eclâmpsia (Dominado) | 95 | 90% | 10% | 10 | 60 | **44** | `NAO_PRIORIZAR` | 1º |
| | Lúpus (Fraco) | 35 | 40% | 30% | 60 | 60 | **43** | `TEORIA_DIRECIONADA` | 2º |
| **E. Erro Recorrente (1x vs 5x)** | Tema com 5 erros recentes | 85 | 40% | 40% | 60 | 60 | **65** | `TEORIA_DIRECIONADA` | 1º |
| | Tema com 1 erro | 85 | 48% | 40% | 52 | 60 | **62** | `TEORIA_DIRECIONADA` | 2º |
| **F. Reta Final (60d vs 7d)** | Trauma Torácico (7 dias) | 90 | 40% | 35% | 60 | 7 | **99** *(teto)* | `TEORIA_DIRECIONADA` | 1º |
| | Trauma Torácico (60 dias)| 90 | 40% | 35% | 60 | 60 | **66** | `QUESTOES` | 2º |

---

## 8. Análise de Sensibilidade (Sensitivity Analysis)

1. **Impacto do IRS (Peso 0.40):** Uma variação de 10 pontos de incidência altera o PPS em $+4.0$ a $+6.4$ pontos. É o fator mais forte do `rawScore`.
2. **Impacto do Déficit (Peso 0.35):** Uma variação de 10 pontos de taxa de acerto altera o PPS em $+3.5$ a $+5.6$ pontos.
3. **Impacto do Esquecimento (Peso 0.25):** Uma queda de retenção de 20% altera o PPS em $+5.0$ a $+8.0$ pontos.
4. **Impacto da Proximidade da Prova:** O multiplicador por degrau ($1.0 \to 1.2 \to 1.4 \to 1.6$) acelera linearmente todos os temas. Em $d \le 7$, ocorre saturação no teto de 99 pontos para qualquer tema com `rawScore > 61.8`.

---

## 9. Riscos e Oportunidades Identificados

| Risco / Lacuna | Gravidade | Diagnóstico | Recomendação Futura |
| :--- | :--- | :--- | :--- |
| **Ausência de Ponderação Amostral ($N$)** | `HIGH` | $0/1$ gera Déficit 100 igual a $0/30$. | Aplicar suavização Bayesiana ($\text{mastery adjusted} = \frac{\text{correct} + \alpha}{\text{total} + \alpha + \beta}$). |
| **Saturação no Teto de 99 em Reta Final** | `MEDIUM` | Vários temas de alto IRS batem 99 simultaneamente em $d \le 7$. | Usar `urgencyFactor` contínuo ou preservar decimais para ordenação fina. |
| **Ausência de Balanceamento por Área** | `MEDIUM` | Se todos os temas fracos forem de Clínica, o Top 10 pode monopolizar uma só área. | Aplicar quota de interleaving entre as 5 áreas no momento do agendamento. |
| **Critério de Desempate (Tie-Break)** | `LOW` | Usa ordem de inserção do array em caso de empate de PPS. | Adicionar tie-break explícito por `irsScore` decrescente e nome. |
| **Cobertura de Testes de Unidade** | `HIGH` | `calculateTopicPriorities` não possui arquivo `.test.ts` dedicado. | Criar suite de testes para cobrir o motor antes de colocá-lo em produção. |

---

## 10. Classificação e Veredito Final

```
============================================================
RESUMO DA AUDITORIA PPS:
============================================================
PPS_IMPLEMENTED            = YES
PPS_USES_PERFORMANCE       = YES (via Mastery/Deficit 35%)
PPS_USES_ERRORS            = NO (indireto via Mastery)
PPS_USES_EXAM_WEIGHT       = YES (via IRS 40%)
PPS_USES_DAYS_TO_EXAM      = YES (via Urgency Multiplier 1.0–1.6)
PPS_USES_AVAILABILITY      = NO (correto: disponibilidade é do Scheduler)
PPS_USES_FSRS              = YES (via Retrievability Decay 25%)
PPS_DETERMINISTIC          = YES
TOPIC_MAPPING_COVERAGE     = 92%
COLD_START                 = VALID_COLD_START
SAMPLE_SIZE_HANDLING       = NONE
PPS_TEST_COVERAGE          = NONE
============================================================
CLASSIFICAÇÃO FINAL:
PPS_REQUIRES_CORRECTION
============================================================
```

> **Veredito:** A arquitetura conceitual e a ponderação do PPS são matematicamente sólidas e pedagogicamente justificadas ($40\%$ Peso INEP, $35\%$ Déficit do Aluno, $25\%$ Risco de Esquecimento FSRS). No entanto, antes de substituir a grade curricular em produção, o motor necessita de:
> 1. Ponderação bayesiana por tamanho amostral ($N$ questões);
> 2. Proteção contra saturação no teto de 99 na reta final;
> 3. Criação de testes unitários automatizados dedicados.
