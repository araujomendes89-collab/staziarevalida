# Relatório Técnico: Separação Local de Conteúdo e Estado dos Flashcards V4 (Etapa 1.22E)

## 1. Visão Geral da Arquitetura V4

Nesta etapa, implementamos com sucesso o desacoplamento arquitetural entre:
- **`FlashcardContent`**: O que o cartão ensina (enunciado, conduta, taxonomia, mnemônico, proveniência e fingerprint).
- **`UserFlashcardState`**: A memória individual do estudante (parâmetros do algoritmo FSRS: estabilidade $S$, dificuldade $D$, repetições, esquecimentos, data de revisão devida).

A persistência local é realizada através do padrão **`SINGLE_ENVELOPE`** sob as chaves com escopo `praxis_flashcards_v4:user:${uid}` e `praxis_flashcards_v4:guest:${guestId}`. Esse padrão assegura gravação atômica em nível de aplicação (*single-key application-level atomic write*), eliminando riscos de inconsistência por gravação parcial entre múltiplas chaves.

---

## 2. Detalhamento dos 26 Itens de Implementação

1. **Tipos Desacoplados (`src/types/index.ts`):**
   - Declarados `FlashcardContent`, `UserFlashcardState` e `FlashcardStorageEnvelopeV4`.
2. **Storage Envelope V4:**
   - Envelope estruturado em formato `{ schemaVersion: 4, updatedAt: string, contents: Record<string, FlashcardContent>, userStates: Record<string, UserFlashcardState> }`.
3. **Local Bridge ID:**
   - O `flashcard.id` histórico (`fc-<timestamp>-<random>`) atua como `LOCAL_BRIDGE_ID` que vincula o conteúdo ao estado do usuário na fase local.
4. **Conteúdo Pedagógico (`FlashcardContent`):**
   - Agrega `front`, `back`, `keyMnemonic`, `canonicalTopicId`, `area`, `topic`, `contentFingerprint`, `contentFingerprintVersion`, `contentVersion`, `provenance` e `contentReviewStatus`.
5. **Estado FSRS do Usuário (`UserFlashcardState`):**
   - Agrega `schedulerVersion`, `stability`, `difficulty`, `elapsedDays`, `scheduledDays`, `reps`, `lapses`, `state`, `lastReviewed`, `dueDate`, `intervalDays`, `easeFactor`, `repetitionCount` e `masteryLevel`.
6. **Proveniência:**
   - Pertence exclusivamente a `FlashcardContent`. Não é duplicada em `UserFlashcardState`.
7. **Decisão de `masteryLevel`:**
   - Mantido no `UserFlashcardState` e no adapter de compatibilidade para preservar 100% de consistência visual nos componentes consumidores.
8. **Migração $v3 \to v4$:**
   - Migração determinística automática executada no primeiro acesso por escopo (`praxis_flashcards_v3` $\to$ `praxis_flashcards_v4`).
9. **Validação de Integridade:**
   - A migração valida a igualdade exata de contagens antes da confirmação.
10. **Idempotência:**
    - Execuções subsequentes da migração são 100% idempotentes, não duplicam cartões e não alteram datas de vencimento ou repetições.
11. **Rollback Seguro:**
    - Se a gravação ou validação da V4 falhar, a V3 permanece intacta e funcional como fallback.
12. **Preservação da V3:**
    - A chave V3 original não é deletada após a migração, servindo como backup de segurança.
13. **Importação Legada V2:**
    - Cartões de `praxis_flashcards_v2` com consentimento explícito são normalizados e gravados diretamente no envelope V4 do usuário ativo.
14. **Isolamento de Visitante (Guest):**
    - Chaves `guest:${guestId}` permanecem estritamente isoladas de contas autenticadas.
15. **Isolamento de Contas:**
    - Cada usuário autenticado possui seu próprio envelope V4 isolado.
16. **Compatibility Adapter (`FlashcardStorageAdapter`):**
    - Implementada a função pura `hydrateFlashcardItem(content, state)` que reconstitui o view model `Flashcard` em memória para os 11 componentes consumidores.
17. **AppContext:**
    - Continua fornecendo `Flashcard[]` hidratado via adapter, evitando refatorações monolíticas arriscadas nas views.
18. **Fluxo de Criação:**
    - Na criação de cartões de erro, `FlashcardContent` e o `UserFlashcardState` inicial são gerados e salvos no envelope V4.
19. **Fluxo de Revisão:**
    - Durante a avaliação FSRS (rating), **apenas** o `UserFlashcardState` é atualizado. O `FlashcardContent` permanece 100% imutável.
20. **Invariantes do FSRS:**
    - FSRS v5.4.2 permanece inalterado. Nenhum recálculo matemático de $S$, $D$ ou `dueDate` é executado na migração.
21. **Integrações de Planejamento:**
    - `PlanoDeHojeView`, `AdaptiveCalendarView` e `WeeklyPlanView` continuam funcionando com dados idênticos e sem quebras de temporalidade.
22. **Tratamento de Falhas:**
    - Falhas de parse ou quota são tratadas sem corrupção ou perda do último envelope válido.
23. **Escalabilidade:**
    - Estrutura indexada em `Record<string, ...>` garante lookups $O(1)$ por ID de cartão.
24. **Arquivos Alterados:**
    - `src/types/index.ts`
    - `src/services/storageService.ts`
    - `src/services/flashcardStorageAdapter.ts` (novo)
    - `src/__tests__/flashcardUserScopedStorage.test.ts`
    - `src/__tests__/flashcardContentStateSplitV4.test.ts` (novo)
25. **Testes:**
    - 300/300 testes PASS (+6 novos testes cobrindo V4, imutabilidade e migração).
26. **Console Errors:**
    - 0 erros no console.

---

## 3. Resumo Obrigatório de Métricas e Estados

```
FLASHCARD_STORAGE_VERSION_BEFORE =
v3

FLASHCARD_STORAGE_VERSION_AFTER =
v4

V4_STORAGE_SHAPE =
RECORD_MAPS_WITHIN_SINGLE_ENVELOPE

V4_WRITE_MODEL =
SINGLE_KEY_ENVELOPE

V4_ACID_DATABASE =
NO

LOCAL_CONTENT_STATE_LINK_KEY =
existing flashcard.id / LOCAL_BRIDGE_ID

GLOBAL_CONTENT_ID_IMPLEMENTED =
NO

CONTENT_FINGERPRINT_USED_AS_PRIMARY_KEY =
NO

FLASHCARD_CONTENT_STATE_SPLIT =
IMPLEMENTED

MONOLITHIC_FLASHCARD_PERSISTED_IN_V4 =
NO

COMPATIBILITY_VIEW_MODEL =
YES

V3_TO_V4_MIGRATION =
IMPLEMENTED

MIGRATION_IDEMPOTENT =
YES

V3_ROLLBACK_SOURCE_PRESERVED =
YES

V2_IMPORT_TO_V4 =
DIRECT_TO_V4

FSRS_STATE_RECOMPUTED =
NO

FLASHCARD_IDS_CHANGED =
NO

CONTENT_MUTATED_BY_RATING =
NO

USER_STATE_MUTATED_BY_RATING =
YES

ACCOUNT_ISOLATION =
PRESERVED

CROSS_ACCOUNT_MEMORY_FLASH =
NO

FLASHCARD_CARD_CROSS_DEVICE_SYNC =
NO

FIRESTORE_SCHEMA_CHANGES =
0

APPROVED_STATUS_GOVERNANCE_FOLLOWUP =
YES
```

---

## 4. Classificação Final

```
FLASHCARD_CONTENT_STATE_SPLIT_V4_READY
```
