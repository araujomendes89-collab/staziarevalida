# Relatório Técnico: Identidade de Conteúdo e Contrato de Proveniência de Flashcards (Etapa 1.22C)

## 1. Visão Geral e Separação Conceitual

Nesta etapa, estabelecemos a infraestrutura de tipagem e serviços para responder formalmente às perguntas:
- *"De onde veio este Flashcard?"* (Source Provenance)
- *"Quais dados permitem reconhecer e reconciliar seu conteúdo médico no futuro?"* (Content Identity)

A arquitetura agora separa claramente quatro conceitos fundamentais:
1. **FLASHCARD INSTANCE ID (`flashcard.id`):** Identificador de tempo de execução da instância do cartão (`TIMESTAMP_PLUS_RANDOM`). Mantido intacto, sem migração ou alteração de IDs históricos.
2. **CONTENT IDENTITY & FINGERPRINT (`contentFingerprint`):** Sinal técnico determinístico derivado do texto pedagógico normalizado (`front`, `back`, `keyMnemonic`), com versionamento explícito (`contentFingerprintVersion = 1`).
3. **SOURCE PROVENANCE (`provenance: FlashcardProvenance`):** Estrutura tipada que registra a origem factual do cartão (`QUESTION_DERIVED`, `AI_GENERATED`, `IMPORTED_LEGACY`, `LEGACY_LOCAL`, etc.) e preserva os metadados da questão-fonte.
4. **USER FSRS STATE:** Parâmetros matemáticos de agendamento FSRS (`stability`, `difficulty`, `dueDate`, `reps`, `lapses`, `state`), preservados 100% inalterados.

---

## 2. Detalhamento dos 23 Itens de Auditoria e Implementação

1. **Current ID:**
   - Mantido como `fc-<timestamp>-<random>` ou `fc-auto-<timestamp>`.
2. **Runtime Identity:**
   - O `id` do Flashcard é uma identidade de runtime operacional da instância do cartão no deck do usuário, e não o ID canônico imutável de conteúdo.
3. **Provenance Contract:**
   - Implementado o tipo centralizado `FlashcardProvenance` em `src/types/index.ts`.
   - Suporta origens estruturadas: `QUESTION_DERIVED`, `AI_GENERATED`, `MANUAL`, `IMPORTED_LEGACY`, `LEGACY_LOCAL`, `UNKNOWN`.
4. **Question-Derived Cards:**
   - No fluxo de erro na resolução de questões (`recordQuestionAttempt`), ao gerar o cartão de autópsia do erro, a proveniência é automaticamente capturada via `FlashcardProvenanceService.createQuestionDerivedProvenance(question)`.
5. **Question Identity Fields:**
   - Captura `sourceQuestionId`, `sourceCanonicalQuestionId` e `sourceQuestionFingerprint`.
6. **Canonical Topic ID:**
   - Quando a questão fonte possui `canonicalTopicId` válido, é copiado para `provenance.canonicalTopicId` e `flashcard.canonicalTopicId`. Quando ausente, permanece estritamente `undefined` (sem inferências heurísticas ou backfills ad-hoc).
7. **Area & Topic:**
   - Preserva `sourceArea`, `sourceTopic` e `sourceSubtopic` da questão fonte.
8. **AI Provenance:**
   - Mapeado com metadados de modelo, versão de prompt e trace ID (`aiGeneratedMetadata`), ativado apenas mediante evidência real de geração por IA.
9. **Human Review:**
   - Campo `contentReviewStatus` (`UNREVIEWED`, `AUTO_VALIDATED`, `MEDICAL_REVIEWED`, `APPROVED`) separado do estado FSRS do estudante. Não inventa aprovações automáticas.
10. **Legacy Cards:**
    - Cartões preexistentes sem proveniência são classificados de forma segura como `LEGACY_LOCAL` ou `UNKNOWN`, sem adivinhação baseada em texto.
11. **Legacy Import:**
    - Cartões importados de `praxis_flashcards_v2` recebem proveniência `IMPORTED_LEGACY` e geram seu `contentFingerprint` determinístico.
12. **Content Fingerprint:**
    - Algoritmo 64-bit FNV-1a com normalização Unicode NFKC, trim e colapso de espaços em branco.
    - Não é usado como ID autoritativo (não altera `id`, não funde cartões).
13. **Fingerprint Version:**
    - Versão explícita `contentFingerprintVersion = 1` com prefixo `fc_fp_v1_<hash>`.
14. **Deduplication Status:**
    - `FLASHCARD_DEDUPLICATION = NONE`. Nenhuma fusão ou exclusão automática de duplicatas é realizada nesta etapa.
15. **Content Version:**
    - `contentVersion = 1` adicionado para versionamento futuro de atualizações de conteúdo.
16. **Review Terminology:**
    - Desambiguação terminológica rigorosa: `contentReviewStatus` (revisão editorial/médica) $\neq$ `FSRS State` (revisão de repetição espaçada do aluno).
17. **Storage Compatibility:**
    - Totalmente compatível com as chaves `praxis_flashcards_v3:user:${uid}` e `praxis_flashcards_v3:guest:${guestId}`. Nenhuma migração destrutiva de storage foi necessária.
18. **FSRS Preservation:**
    - Todos os campos FSRS (`stability`, `difficulty`, `dueDate`, `state`, etc.) e a biblioteca `ts-fsrs` v5.4.2 continuam intocados.
19. **Future Content/State Split:**
    - Contratos `FlashcardContent` e `UserFlashcardState` declarados e documentados em `src/types/index.ts`.
20. **Future Content Identity Strategy:**
    - Classificação: `DETERMINISTIC_SOURCE_ID_OR_HYBRID` (para ligar no futuro o catálogo mestre de conteúdos ao estado FSRS do aluno).
21. **Files Changed:**
    - `src/types/index.ts`
    - `src/services/flashcardProvenanceService.ts` (novo)
    - `src/services/spacedRepetitionService.ts`
    - `src/services/storageService.ts`
    - `src/context/AppContext.tsx`
    - `src/__tests__/flashcardProvenanceAndIdentity.test.ts` (novo)
22. **Tests:**
    - 294/294 testes PASS (+11 novos testes dedicados de proveniência e identidade).
23. **Console Errors:**
    - 0 erros no console.

---

## 3. Resumo Obrigatório de Métricas e Estados

```
FLASHCARD_RUNTIME_INSTANCE_ID =
fc-${timestamp}-${random}

FLASHCARD_ID_GENERATION =
TIMESTAMP_PLUS_RANDOM

FLASHCARD_ID_CHANGED =
NO

FLASHCARD_PROVENANCE_CONTRACT =
IMPLEMENTED

FLASHCARD_ORIGIN_TYPES =
QUESTION_DERIVED | AI_GENERATED | MANUAL | IMPORTED_LEGACY | LEGACY_LOCAL | UNKNOWN

QUESTION_DERIVED_PROVENANCE =
FUNCTIONAL

SOURCE_QUESTION_ID_CAPTURE =
YES

SOURCE_CANONICAL_QUESTION_ID_CAPTURE =
YES

SOURCE_QUESTION_FINGERPRINT_CAPTURE =
YES

SOURCE_CANONICAL_TOPIC_ID_CAPTURE =
YES

LEGACY_CARD_PROVENANCE =
LEGACY_LOCAL

AI_CARD_PROVENANCE =
AI_GENERATED

FLASHCARD_CONTENT_FINGERPRINT =
IMPLEMENTED

CONTENT_FINGERPRINT_AUTHORITATIVE_ID =
NO

CONTENT_FINGERPRINT_VERSION =
1

FLASHCARD_DEDUPLICATION =
NONE

CONTENT_VERSION_MODEL =
1

CONTENT_REVIEW_STATUS_MODEL =
UNREVIEWED | AUTO_VALIDATED | MEDICAL_REVIEWED | APPROVED

FLASHCARD_STORAGE_VERSION =
praxis_flashcards_v3

FLASHCARD_LOCAL_ACCOUNT_ISOLATION =
PRESERVED

FLASHCARD_CARD_CROSS_DEVICE_SYNC =
NO

CONTENT_AND_USER_STATE_SEPARATION =
NO

FUTURE_FLASHCARD_CONTENT_ID_STRATEGY =
DETERMINISTIC_SOURCE_ID_OR_HYBRID

FSRS_ALGORITHM_CHANGED =
NO

FIRESTORE_SCHEMA_CHANGES =
0
```

---

## 4. Classificação Final

```
FLASHCARD_CONTENT_IDENTITY_PROVENANCE_READY
```
