# Onboarding Demo Question Experience Report (Etapa 1.23C)

## 1. Executive Summary

This report documents the implementation and verification of **TELA 03 — EXPERIÊNCIA DEMONSTRATIVA DE QUESTÃO** for the StaziaMed Revalida onboarding experience.

The demonstrative experience allows new students to sample clinical question resolution and reasoning feedback in seconds, in a 100% ephemeral and reversible environment, without affecting the student's academic history, persistence, statistics, FSRS scheduler, PPS priority, or error notebook.

---

## 2. Invariants & Isolation Verification Audit

| Invariant / Check | Status | Verification Detail |
| :--- | :---: | :--- |
| `ONBOARDING_DEMO_QUESTION_IMPLEMENTED` | **YES** | Standalone demo resolution screen at `/onboarding/experience`. |
| `DEMO_ROUTE` | **/onboarding/experience** | Prototype preview route for interactive resolution. |
| `DEMO_DATA_SOURCE` | **LOCAL_STATIC_EDITORIAL_FIXTURE** | Static, local fixture (`onboardingDemoQuestionData.ts`). |
| `REAL_QUESTION_BANK_READ` | **NO** | No access to canonical or legacy question datasets. |
| `FIRESTORE_READ` | **NO** | Zero database read operations. |
| `FIRESTORE_WRITE` | **NO** | Zero database write operations. |
| `LOCALSTORAGE_WRITE` | **NO** | Verified zero localStorage access during resolution. |
| `BACKEND_REQUEST` | **NO** | Zero HTTP or network calls. |
| `ATTEMPT_CREATED` | **NO** | Zero `QuestionAttempt` records generated or stored. |
| `TIMING_STARTED` | **NO** | Zero active timer, elapsed timer, or idle tracking loops. |
| `PPS_MUTATED` | **NO** | Predictive Preparation Score calculations untouched. |
| `FSRS_MUTATED` | **NO** | Spaced repetition engine and user state untouched. |
| `ERROR_NOTEBOOK_MUTATED` | **NO** | Incorrect answer does NOT create `ErrorCase` or raw attempts. |
| `PERFORMANCE_MUTATED` | **NO** | Zero mutations to accuracy, study time, streak, or metrics. |
| `DEMO_STATE` | **EPHEMERAL_REACT_LOCAL_STATE** | `selectedOptionId` and `isFeedbackVisible` stored only in local component state. |
| `ANSWER_REVEALED_ONLY_AFTER_EXPLICIT_ACTION` | **YES** | Correct answer is only revealed after user clicks *"Ver explicação"*. |
| `DEMO_LABEL_VISIBLE` | **YES** | Badge *"Questão demonstrativa"* displayed prominently. |
| `NOT_COUNTED_FOR_PERFORMANCE_MESSAGE_VISIBLE` | **YES** | Disclaimer *"Sua resposta aqui não conta para o seu desempenho."* clearly visible. |
| `MOTION_SYSTEM_REUSED` | **YES** | Reuses `motionTokens.ts` (`TRANSITION_EASE`, `createFadeUpVariant`). |
| `REDUCED_MOTION_SUPPORTED` | **YES** | Instant state transition when `useReducedMotion()` is active. |
| `ECOSYSTEM_CTA_CONNECTED_TO_DEMO` | **YES** | CTA in `/onboarding/ecosystem` (*"Quero experimentar"*) routes to `/onboarding/experience`. |
| `AUTH_FLOW_CHANGED` | **NO** | Auth flows, tokens, and gates remain untouched. |
| `USERPROFILE_CHANGED` | **NO** | User profile schema and defaults unchanged. |
| `FIRESTORE_SCHEMA_CHANGED` | **NO** | Zero Firestore collection or security rules changes. |
| `SIDEBAR_CHANGED` | **NO** | Sidebar and navigation untouched. |
| `PERSONALIZATION_IMPLEMENTED` | **NO** | Study personalization deferred to subsequent stages. |
| `ONBOARDING_PERSISTENCE_IMPLEMENTED` | **NO** | Zero persistent onboarding flags. |
| `APP_TEST_FILES` | **46** | 46 test files passing cleanly. |
| `APP_TEST_CASES` | **373** | 373 test cases passing (including isolation proof assertions). |
| `CONSOLE_ERRORS` | **0** | Zero console errors or warnings. |

---

## 3. Demonstration Question Details

```
ORIGIN: DEMO_EDITORIAL
CASO CLÍNICO:
"Um homem de 24 anos procura atendimento com dor abdominal iniciada há cerca de 12 horas. A dor começou em região periumbilical e posteriormente migrou para a fossa ilíaca direita. Apresenta náuseas, inapetência e dor à palpação da região, com maior intensidade no ponto de McBurney."

PERGUNTA:
"Qual é o diagnóstico mais provável?"

ALTERNATIVAS:
A — Gastroenterite aguda
B — Apendicite aguda (CORRETA)
C — Colecistite aguda
D — Pancreatite aguda

RESPOSTA CORRETA:
B — Apendicite aguda

EXPLICAÇÃO CLÍNICA:
"A migração da dor da região periumbilical para a fossa ilíaca direita, associada a náuseas, inapetência e dor no ponto de McBurney, é uma apresentação clássica de apendicite aguda."

PONTO-CHAVE:
"Dor que migra para a fossa ilíaca direita é um achado clássico na apresentação da apendicite aguda."

NOTA DE VALOR:
"Na StaziaMed, cada questão ajuda você a entender o raciocínio e identificar o conteúdo que precisa revisar."
```

---

## 4. Component Structure

- **`src/components/onboarding/onboardingDemoQuestionData.ts`**: Fixture estático e imutável da questão demonstrativa.
- **`src/components/onboarding/OnboardingDemoFeedback.tsx`**: Painel de feedback pedagógico (banner construtivo, explicação clínica, ponto-chave, valor do produto).
- **`src/components/onboarding/OnboardingDemoQuestionCard.tsx`**: Card interativo com alternativas acessíveis via radio group.
- **`src/components/onboarding/OnboardingDemoQuestionView.tsx`**: View em tela cheia na rota `/onboarding/experience`.
- **`src/__tests__/onboardingDemoQuestionPrototype.test.tsx`**: Suíte de testes com testes funcionais, de acessibilidade e de isolamento estrito contra persistência.

---

## 5. Final Classification

```
ONBOARDING_DEMO_QUESTION_EXPERIENCE_READY
```
