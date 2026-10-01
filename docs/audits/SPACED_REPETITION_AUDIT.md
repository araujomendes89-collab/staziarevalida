# AUDITORIA TÉCNICA DO ALGORITMO DE REPETIÇÃO ESPAÇADA (FLASHCARDS)
**Projeto:** StaziaMed Revalida  
**Data:** 03 de Setembro de 2026  
**Status da Auditoria:** Concluída (Somente Leitura — Sem alterações de código)

---

## 1. Classificação Técnica do Algoritmo Atual

### Classificação Final:
# **`SIMPLIFIED_INTERVAL_SYSTEM`**

A implementação em execução no módulo de Flashcards **NÃO** é FSRS (Free Spaced Repetition Scheduler) e **NÃO** é SM-2 real. Trata-se de um **sistema simplificado de intervalos progressivos com multiplicadores estáticos** inspirado superficialmente em mecânicas de repetição espaçada.

---

## 2. Mapa dos Componentes e Funções Reais

| Arquivo | Função / Componente | Responsabilidade Técnica Real |
| :--- | :--- | :--- |
| `src/context/AppContext.tsx` | `updateFlashcardScore(cardId, rating)` | **Coração do cálculo dos flashcards**: atualiza `intervalDays`, `dueDate`, `masteryLevel` e `repetitionCount`. Salva em LocalStorage. |
| `src/components/review/SpacedReviewView.tsx` | `SpacedReviewView` | Interface de visualização, virada do cartão e disparo das notas (`AGAIN`, `HARD`, `MEDIUM`, `EASY`). |
| `src/services/storageService.ts` | `saveFlashcards` / `getFlashcards` | Persistência local no navegador via `localStorage` (`staziamed_flashcards_v1`). |
| `src/services/spacedRepetitionEngine.ts` | `SpacedRepetitionEngine` | Módulo isolado contendo cálculo de retenção FSRS (`R = (1 + factor * t / S)^decay`), utilizado **exclusivamente** pelo Calendário Adaptativo (`AdaptiveCalendarView` / `studyPlannerEngine.ts`), **sem qualquer conexão com a tela de Flashcards**. |

---

## 3. Auditoria de Conformidade FSRS

**`FSRS_IMPLEMENTED = NO`** *(no módulo de Flashcards)*

### Evidências no Código:
1. **Bibliotecas:** Não há importação de `ts-fsrs`, `fsrs` ou pacotes externos de FSRS.
2. **Campos FSRS:** O schema `Flashcard` não possui `stability` ($S$), `difficulty` ($D$), `retrievability` ($R$), `lapses` ou `state`.
3. **Desconexão do SpacedRepetitionEngine:** Embora exista o arquivo `src/services/spacedRepetitionEngine.ts` que implementa fórmulas conceituais de FSRS para estimativa de risco no calendário, o `updateFlashcardScore` em `AppContext.tsx` **não consome** este serviço.

---

## 4. Auditoria de Conformidade SM-2

**`SM2_IMPLEMENTED = NO (Inspirado superficialmente)`**

### Evidências no Código:
1. **Ausência do cálculo de EF (Ease Factor):** No SM-2 clássico de SuperMemo (Piotr Wozniak), o fator de facilidade é recalculado dinamicamente a cada resposta:
   $$\text{EF}' = \text{EF} + (0.1 - (5 - q) \times (0.08 + (5 - q) \times 0.02))$$
   No StaziaMed, o campo `easeFactor` está fixado em `2.5` e **nunca é lido nem atualizado**.
2. **Multiplicadores Estáticos:** Os multiplicadores são valores fixos (`1.2`, `2.0`, `2.8`) em vez de baseados no histórico cognitivo do cartão.
3. **Intervalos Iniciais:** O SM-2 preconiza $I(1) = 1$, $I(2) = 6$, $I(n) = I(n-1) \times \text{EF}$. O sistema atual multiplica o intervalo anterior diretamente.

---

## 5. Fórmulas Reais Utilizadas (`AppContext.tsx`)

Ao avaliar um cartão com `intervalDays` atual, `masteryLevel` (0–100) e `repetitionCount`:

| Rating | Ação em `intervalDays` | Ação em `masteryLevel` | Ação em `repetitionCount` | Nova `dueDate` |
| :---: | :--- | :--- | :---: | :--- |
| **`AGAIN`** | `nextInterval = 1` | $\max(10, \text{mastery} - 15)$ | $+1$ | `Hoje + 1 dia` |
| **`HARD`** | $\max(1, \text{round}(\text{interval} \times 1.2))$ | $\min(100, \text{mastery} + 5)$ | $+1$ | `Hoje + nextInterval dias` |
| **`MEDIUM`** | $\max(2, \text{round}(\text{interval} \times 2.0))$ | $\min(100, \text{mastery} + 15)$ | $+1$ | `Hoje + nextInterval dias` |
| **`EASY`** | $\max(4, \text{round}(\text{interval} \times 2.8))$ | $\min(100, \text{mastery} + 25)$ | $+1$ | `Hoje + nextInterval dias` |

---

## 6. Simulação de Sequências (Cartão Novo: `interval = 1`, `mastery = 25`)

### Cenário 1: 5 avaliações seguidas de `EASY`
- **Início:** Intervalo = 1 dia | Domínio = 25%
- **Repetição 1 (EASY):** $\max(4, \text{round}(1 \times 2.8)) =$ **4 dias** | Domínio = 50%
- **Repetição 2 (EASY):** $\max(4, \text{round}(4 \times 2.8)) =$ **11 dias** | Domínio = 75%
- **Repetição 3 (EASY):** $\max(4, \text{round}(11 \times 2.8)) =$ **31 dias** | Domínio = 100%
- **Repetição 4 (EASY):** $\max(4, \text{round}(31 \times 2.8)) =$ **87 dias** | Domínio = 100%
- **Repetição 5 (EASY):** $\max(4, \text{round}(87 \times 2.8)) =$ **244 dias** | Domínio = 100%

---

### Cenário 2: 5 avaliações seguidas de `MEDIUM`
- **Início:** Intervalo = 1 dia | Domínio = 25%
- **Repetição 1 (MEDIUM):** $\max(2, \text{round}(1 \times 2.0)) =$ **2 dias** | Domínio = 40%
- **Repetição 2 (MEDIUM):** $\max(2, \text{round}(2 \times 2.0)) =$ **4 dias** | Domínio = 55%
- **Repetição 3 (MEDIUM):** $\max(2, \text{round}(4 \times 2.0)) =$ **8 dias** | Domínio = 70%
- **Repetição 4 (MEDIUM):** $\max(2, \text{round}(8 \times 2.0)) =$ **16 dias** | Domínio = 85%
- **Repetição 5 (MEDIUM):** $\max(2, \text{round}(16 \times 2.0)) =$ **32 dias** | Domínio = 100%

---

### Cenário 3: 5 avaliações seguidas de `HARD`
- **Início:** Intervalo = 1 dia | Domínio = 25%
- **Repetição 1 (HARD):** $\max(1, \text{round}(1 \times 1.2)) =$ **1 dia** | Domínio = 30%
- **Repetição 2 (HARD):** $\max(1, \text{round}(1 \times 1.2)) =$ **1 dia** | Domínio = 35%
- **Repetição 3 (HARD):** $\max(1, \text{round}(1 \times 1.2)) =$ **1 dia** | Domínio = 40%
- **Repetição 4 (HARD):** $\max(1, \text{round}(1 \times 1.2)) =$ **1 dia** | Domínio = 45%
- **Repetição 5 (HARD):** $\max(1, \text{round}(1 \times 1.2)) =$ **1 dia** | Domínio = 50%
> ⚠️ **Achado Crítico:** Como $\text{round}(1 \times 1.2) = 1$, um cartão novo avaliado repetidamente como `HARD` entra em loop de intervalo estagnado em 1 dia, embora o `masteryLevel` suba.

---

### Cenário 4: Sequência Mista (`EASY` → `EASY` → `AGAIN` → `MEDIUM` → `EASY`)
- **Início:** Intervalo = 1 dia | Domínio = 25%
- **Rep 1 (EASY):** Intervalo = **4 dias** | Domínio = 50%
- **Rep 2 (EASY):** Intervalo = **11 dias** | Domínio = 75%
- **Rep 3 (AGAIN):** Intervalo = **1 dia** | Domínio = 60% *(queda de 15%)*
- **Rep 4 (MEDIUM):** Intervalo = **2 dias** | Domínio = 75%
- **Rep 5 (EASY):** $\max(4, \text{round}(2 \times 2.8)) =$ **6 dias** | Domínio = 100%

---

## 7. Auditoria dos Campos do Schema `Flashcard`

1. **`easeFactor`:**
   - **Classificação:** `DEAD_OR_DECORATIVE_FIELD`.
   - **Situação:** Inicializado como `2.5` na criação automática de flashcards por erro, mas nunca é lido nem modificado por `updateFlashcardScore`.
2. **`masteryLevel`:**
   - **Classificação:** Heurística linear acumulativa (0 a 100).
   - **Situação:** Aumenta/diminui em passos fixos (`+25`, `+15`, `+5`, `-15`). Utilizado apenas para segmentação visual (`Consolidados` se $\ge 70\%$).
3. **`repetitionCount`:**
   - **Classificação:** Contador simples de execuções ($+1$ a cada avaliação).
4. **`dueDate`:**
   - Calculado adicionando `nextInterval` dias à data/hora atual (`new Date().setDate(...)`) e gravado como string ISO (`toISOString()`).
   - Não sofre truncamento para a meia-noite (`00:00:00`), mantendo o horário exato da revisão anterior.

---

## 8. Persistência de Dados e Fonte da Verdade

- **Fonte da Verdade:** `LocalStorage` do navegador (`staziamed_flashcards_v1`).
- **Firestore:** Os flashcards individuais **não são persistidos no Firestore**. Apenas a coleção `errors` (Autópsias de Erro) é gravada na nuvem pelo método `FirebaseService.recordErrorAutopsy`.

---

## 9. Nomenclatura na Interface do Usuário

- **Textos em Componentes:**
  - Em `AdaptiveCalendarView.tsx`, `DashboardView.tsx`, `PlanoDeHojeView.tsx` e modais do calendário, existem referências textuais a `"Repetição espaçada FSRS"` e `"Revisões FSRS"`.
  - No módulo de Flashcards reorganizado (`SpacedReviewView.tsx`), foi utilizada a expressão neutra e correta: **"Repetição Espaçada"** / **"Algoritmo de Repetição Espaçada Ativo"**.

---

## 10. Limitações Técnicas e Recomendações Futuras

1. **Estagnação do `HARD` a partir de 1 dia:** A fórmula $\text{round}(1 \times 1.2)$ resulta em $1$. Recomenda-se futuramente garantir acréscimo mínimo ($\max(2, \dots)$ ou modelo aditivo).
2. **Desacoplamento do `SpacedRepetitionEngine`:** O motor FSRS existente em `src/services/spacedRepetitionEngine.ts` está ocioso em relação aos flashcards e poderia, em etapa posterior de evolução algorítmica, ser unificado como o scheduler oficial de toda a plataforma.
3. **Persistência na Nuvem:** Integrar a coleção de flashcards à sincronização Firestore para evitar perda de dados em limpeza de cache do navegador.

---

### Resumo Executivo da Auditoria

| Item Auditado | Resultado |
| :--- | :--- |
| **Algoritmo Real** | `SIMPLIFIED_INTERVAL_SYSTEM` |
| **FSRS no Flashcard** | `NO` |
| **SM-2 no Flashcard** | `NO (Inspirado)` |
| **`easeFactor`** | `DEAD_OR_DECORATIVE_FIELD` |
| **Persistência** | `LOCALSTORAGE` |
| **Integridade dos Testes** | 86/86 PASS |
