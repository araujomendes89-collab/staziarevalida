# Relatório de Arquitetura Técnica: Schema Firestore, Versionamento e Publicação de Flashcards Canônicos (Etapa 1.22H)

## 1. Visão Geral da Arquitetura Firestore

Esta etapa estabelece o design arquitetural definitivo para a persistência em nuvem (Firestore), governança de publicação e ciclo de vida do **Catálogo Canônico de Flashcards StaziaMed** e seu relacionamento com a memória individual do estudante (`UserFlashcardState`).

A separação conceitual entre **Conteúdo Global Compartilhado** e **Estado do Usuário** é mantida com rigor absoluto:
- Conteúdo Canônico vive na raiz global: `/flashcardContents/{contentId}`
- Estado FSRS do Usuário vive no escopo do estudante: `/users/{uid}/flashcardStates/{contentId}`

---

## 2. Identidade Global de Conteúdo (`contentId`)

- **Estratégia Recomendada:** `CANONICAL_CONTENT_ID_IMPLEMENTATION_RECOMMENDATION = KSUID_OR_UUIDV4_SERVER_GENERATED`.
- **Formato:** Identificador imutável com prefixo tipado gerado no servidor confiável (ex: `c_fc_01h8x9p0qr3stuv...`).
- **Desacoplamento Semântico:** O `contentId` não é derivado de texto, fingerprint ou número de questão, garantindo imutabilidade caso enunciados ou metadados sofram ajustes editoriais.
- **Índice Determinístico Secundário:**
  - `sourceIdentityKey = hash(sourceDocumentId + cardPurpose + canonicalTopicId)` indexado para lookup determinístico e prevenção de duplicatas durante geração assistida por IA.

---

## 3. Modelo de Armazenamento de Versões (`CONTENT_VERSION_STORAGE_STRATEGY`)

**Recomendação:** `ROOT_CURRENT_INLINE_PLUS_VERSIONS_SUBCOLLECTION`.

1. **Documento Raiz (`/flashcardContents/{contentId}`):**
   - Contém o snapshot da **versão publicada ativa (current content inline)** e metadados globais.
   - *Vantagem:* Leitura de catálogo ultra-otimizada (1 única leitura de documento por cartão no Firestore para estudantes, sem queries em cascata).
2. **Subcoleção de Histórico (`/flashcardContents/{contentId}/versions/{revisionNumber}`):**
   - Contém snapshots imutáveis e auditáveis de cada versão histórica publicada.

---

## 4. Imutabilidade e Estados de Rascunho

- **`PUBLISHED_VERSION_IMMUTABLE = YES`:** Uma vez publicado, um snapshot de versão nunca sofre overwrite in-place. Toda modificação clínica gera uma nova versão auditável.
- **`DRAFT_EDITABLE = YES`:** Enquanto estiver no estado `DRAFT`, o documento preliminar de trabalho (ou working draft) pode ser editado livremente pelos autores e revisores antes de ingressar nos portões formais de revisão.

---

## 5. Máquina de Estados e Portões de Publicação

### Enums Desacoplados
```typescript
export type ReviewStatus = 
  | 'UNREVIEWED'          // Conteúdo recém-criado
  | 'AUTO_VALIDATED'      // Validado sintaticamente por schemas/linters
  | 'MEDICAL_REVIEWED';   // Homologado clinicamente por médico

export type EditorialReviewStatus =
  | 'PENDING'
  | 'EDITORIAL_REVIEWED'
  | 'REJECTED';

export type PublicationStatus = 
  | 'DRAFT'               // Rascunho de trabalho
  | 'READY'               // Homologado em todos os gates, pronto para publicar
  | 'PUBLISHED'           // Ativo no catálogo global
  | 'SUPERSEDED'          // Substituído por nova versão ou novo card
  | 'ARCHIVED';           // Descontinuado
```

### Portões Obrigatórios para o Estado `READY`
1. `schemaValid === true` (Estrutura JSON e campos obrigatórios preenchidos).
2. `reviewStatus === 'MEDICAL_REVIEWED'` (Médico especialista assinou a conduta).
3. `editorialStatus === 'EDITORIAL_REVIEWED'` (Clareza, atomicidade e conformidade de *Active Recall*).
4. `canonicalTopicId` válido (1 a 75 da taxonomia StaziaMed).
5. `primarySource` válida (Documento oficial/PCDT/Diretriz verificado).
6. `noBlockingDuplicate` (Triagem de duplicatas aprovada).

---

## 6. Versionamento Semântico e Auditoria

- **Separação de Revisão e Versão Semântica:** `REVISION_AND_SEMANTIC_VERSION_SPLIT = YES`.
  - `revisionNumber` (inteiro monotônico $1, 2, 3...$): Incrementado em **qualquer** publicação, incluindo correções ortográficas (*non-semantic*).
  - `contentVersion` / `semanticVersion` (inteiro monotônico): Incrementado **apenas** quando há alteração no conhecimento médico ensinado.
- **Tipos de Mudança (`ChangeType`):**
  - `NON_SEMANTIC`: Correção tipográfica/layout. (Sem impacto no aluno).
  - `MINOR_SEMANTIC`: Melhoria de redação ou acréscimo de mnemônico.
  - `MAJOR_SEMANTIC`: Mudança de conduta, nova droga de escolha, alteração de diretriz.
  - `SOURCE_UPDATE`: Atualização de protocolo oficial de suporte.
  - `CORRECTION`: Retificação de gabarito ou erro conceitual prévio.

---

## 7. Impacto no FSRS e Rerevisão Obrigatória

- **Invariante FSRS:** `AUTOMATIC_STABILITY_MUTATION_ON_CONTENT_CHANGE = NO` (A estabilidade matemática não é zerada cegamente sem uma política FSRS adaptativa formal).
- **Semântica de `contentVersionSeen`:** Representa a última versão semântica de conteúdo que o estudante **efetivamente respondeu e avaliou** no fluxo de estudo.
- **Detecção de Versões Puladas:** Se o aluno viu a versão 1 e o catálogo está na versão 4, o sistema avalia a severidade máxima entre todas as transições intermediárias ($v1 \to v2 \to v3 \to v4$). Se qualquer transição foi `MAJOR_SEMANTIC` ou `requiresRereview = true`, o estado do usuário é marcado com `requiresUserRereview = true` com agendamento prioritário no Plano de Hoje.

---

## 8. Tratamento de Cartões Substituídos (`SUPERSEDED`)

- Quando um conceito médico é reestruturado, o cartão anterior é marcado como `publicationStatus: 'SUPERSEDED'` e recebe `supersededByContentId: string`.
- **Novos Alunos:** Nunca recebem cartões `SUPERSEDED`.
- **Alunos Antigos:** Mantêm histórico, mas a UI apresenta o cartão substituto com badge contextual de atualização ("Diretriz Atualizada").

---

## 9. Segurança, Autorização e Publicação no Servidor

- **`STUDENT_GLOBAL_CONTENT_WRITE = DENIED`:** Alunos possuem permissão estritamente de **leitura** (`get`, `list`) em `/flashcardContents` para documentos com `publicationStatus == 'PUBLISHED'`.
- **Arquitetura de Publicação:** `PUBLISH_AUTH_ARCHITECTURE_RECOMMENDATION = TRUSTED_BACKEND_OR_CALLABLE_CLOUD_FUNCTION_WITH_CUSTOM_CLAIMS`.
  - Operações de promoção para `PUBLISHED` e escrita na subcoleção de histórico de versões são executadas exclusivamente por Cloud Functions autenticadas com verificação de Custom Claims (`role: 'admin' | 'publisher' | 'medical_reviewer'`).
- **Trilha de Auditoria:** Gravada em subcoleção append-only `/flashcardContents/{contentId}/audit/{eventId}` com timestamp do servidor (`FieldValue.serverTimestamp()`), `userId`, `role`, `action` e `changeReason`.

---

## 10. Localização e Conflitos do Estado do Usuário na Nuvem

- **Localização:** `/users/{uid}/flashcardStates/{contentId}` (Subcoleção direta do usuário).
  - *Vantagens:* Regras de segurança triviais (`request.auth.uid == uid`), isolamento total de dados, exclusão atômica em cascata e queries de planejamento velozes.
- **ID do Documento:** `CANONICAL_USER_STATE_DOCUMENT_ID = MATCHES_CANONICAL_CONTENT_ID`.
- **Risco de Conflitos em Múltiplos Dispositivos:** `USER_STATE_CONFLICT_RISK = MEDIUM` (Resolução de revisões concorrentes offline).
- **Estratégia de Log de Eventos de Revisão:** `USER_REVIEW_EVENT_LOG_RECOMMENDED = LATER` (Iniciar com documento de estado consolidado; introduzir log de eventos append-only caso cenários multi-dispositivo offline exijam reconciliação fina de repetições).

---

## 11. Fases Recomendadas de Implementação

1. **Fase 1 (Atual - 1.22H):** Auditoria e Contrato de Design (Concluída - Read Only).
2. **Fase 2:** Declaração de Types TypeScript e Schemas de validação Zod para Firestore.
3. **Fase 3:** Coleção `/flashcardContents` e Backend de Curadoria/Publicação com Cloud Functions.
4. **Fase 4:** Subcoleção `/users/{uid}/flashcardStates` para sincronização de progresso FSRS.
5. **Fase 5:** Mecanismo de matching determinístico e migração opcional `LOCAL_BRIDGE_ID` $\to$ `contentId`.

---

## 12. Conclusão da Auditoria

A arquitetura para o Catálogo Canônico no Firestore, versionamento imutável e governança de publicação está formalizada e consistente com todos os princípios de integridade clínica do StaziaMed Revalida.

**Classificação:** `FLASHCARD_CANONICAL_FIRESTORE_ARCHITECTURE_READY`.
