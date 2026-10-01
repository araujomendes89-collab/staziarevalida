# Relatório Técnico: Fundação de Leitura do Catálogo Canônico de Flashcards no Firestore (Etapa 1.22I)

## 1. Visão Geral da Implementação

Nesta etapa, implementamos a infraestrutura fundacional de leitura do **Catálogo Canônico de Flashcards StaziaMed** no Cloud Firestore, garantindo desacoplamento estrito entre conteúdo editorial de referência e a memória individual do estudante.

### Princípios Arquiteturais Assegurados:
- **`CANONICAL_COLLECTION`**: `/flashcardContents/{contentId}`
- **`CANONICAL_CONTENT_ID_CONTRACT`**: `OPAQUE_IMMUTABLE_SERVER_GENERATED_ID` (Identificador imutável e opaco, sem semântica exposta no client).
- **`ROOT_DOCUMENT_ROLE`**: `CURRENT_PUBLISHED_PROJECTION` (Snapshot denormalizado da versão publicada ativa para leitura eficiente em 1 única operação).
- **`VERSION_HISTORY_LOCATION`**: `/flashcardContents/{contentId}/versions/{versionId}` (Subcoleção append-only imutável).
- **`STUDENT_GLOBAL_CONTENT_WRITE`**: `DENIED` (Escrita direta pelo cliente é estritamente proibida; publicação futura via Cloud Functions / Admin SDK).
- **`LOCAL_V4_INDEPENDENCE`**: Preservação total de `praxis_flashcards_v4` e do agendador FSRS.

---

## 2. Detalhamento dos Componentes Implementados

### 2.1 Tipos e Interfaces (`src/types/canonicalFlashcard.ts` e `src/types/index.ts`)
- **`CanonicalCardPurpose`**: Categorização pedagógica (`DIAGNOSIS`, `MANAGEMENT`, `TREATMENT`, `DIAGNOSTIC_WORKUP`, `CONTRAINDICATION`, `RED_FLAG`, `EPIDEMIOLOGY_PREVENTION`, `MNEMONIC`, `OTHER`).
- **`CanonicalReviewStatus`**: `UNREVIEWED` | `AUTO_VALIDATED` | `MEDICAL_REVIEWED`.
- **`CanonicalEditorialReviewStatus`**: `PENDING` | `EDITORIAL_REVIEWED` | `REJECTED`.
- **`CanonicalPublicationStatus`**: `DRAFT` | `READY` | `PUBLISHED` | `SUPERSEDED` | `ARCHIVED`.
- **`AssessmentSourceReference`**: Metadados do exame de origem (`examYear`, `examEdition`, `originalNumber`, `itemCode`, `sourceQuestionFingerprint`).
- **`MedicalEvidenceReference`**: Evidência primária de suporte com reutilização de `OfficialSourceType` (`title`, `publisher`, `publicationYear`, `url`, `versionStatus`, `verificationStatus`).
- **`CanonicalFlashcardContent`**: Contrato do documento raiz no Firestore com projeção atual.
- **`CanonicalFlashcardVersion`**: Contrato de versão histórica imutável.

### 2.2 Validador e Parser (`src/services/canonicalFlashcardValidator.ts`)
- **`validateCanonicalFlashcardDocument(data, fallbackId)`**:
  - Valida presença e tipo de `contentId`, `front`, `back`.
  - Valida `canonicalTopicId` contra a taxonomia oficial de 75 Grandes Temas (`getGrandeTemaById`). Se o tópico não existir, rejeita o documento com erro `INVALID_CANONICAL_TOPIC`.
  - Deriva deterministicamente `areaId` e `area` a partir do Grande Tema correspondente.
  - Valida enums de propósito, revisão, revisão editorial e publicação.
  - Tolerância a campos desconhecidos seguros (compatibilidade futura).
  - Rejeição estrita de payloads malformados ou nulos sem falhas de runtime e sem efetuar mutações ou auto-repairs no Firestore.
- **`parseCanonicalFlashcard(data, fallbackId)`**: Função pura para conversão segura de snapshots.

### 2.3 Serviço Centralizado de Leitura (`src/services/canonicalFlashcardCatalogService.ts`)
- **`getPublishedFlashcardById(contentId)`**:
  - Executa `getDoc` no documento `/flashcardContents/{contentId}`.
  - Verifica `publicationStatus === 'PUBLISHED'`. Documentos em `DRAFT`, `READY`, `SUPERSEDED` ou `ARCHIVED` retornam `null` por padrão no fluxo estudantil.
- **`getPublishedFlashcardsByTopic(canonicalTopicId)`**:
  - Consulta filtrada por `publicationStatus == 'PUBLISHED'` e `canonicalTopicId`.
- **`getPublishedFlashcardsByArea(area)`**:
  - Consulta filtrada por `publicationStatus == 'PUBLISHED'` e `area`.
- **`getPublishedFlashcards(maxResults)`**:
  - Consulta paginada com limite de documentos publicados.
- **Isolamento e Resiliência**: Todos os métodos capturam erros do Firebase e retornam fallbacks seguros (`null` ou `[]`), assegurando que instabilidades de rede ou Firestore nunca afetem os flashcards locais V4 ou a experiência de estudo.

### 2.4 Regras de Segurança (`firestore.rules`)
```firestore
// -------------------------------------------------------------
// CATÁLOGO CANÔNICO DE FLASHCARDS (Leitura PUBLISHED / Escrita Restrita a Servidor Confiável)
// -------------------------------------------------------------
match /flashcardContents/{contentId} {
  allow read: if resource.data.publicationStatus == 'PUBLISHED';
  allow write: if false; // Escrita direta pelo cliente é estritamente proibida (publicação futura via trusted backend / Admin SDK)

  match /versions/{versionId} {
    allow read, write: if false; // Histórico de versões é interno/backoffice
  }

  match /audit/{auditId} {
    allow read, write: if false; // Trilha de auditoria é interna
  }
}
```

---

## 3. Matriz de Segurança e Acesso

| Ator | Operação | Alvo | Status | Regra / Justificativa |
|------|----------|------|--------|-----------------------|
| Estudante | `read` (get/list) | `/flashcardContents/{id}` (`PUBLISHED`) | **ALLOW** | `resource.data.publicationStatus == 'PUBLISHED'` |
| Estudante | `read` (get/list) | `/flashcardContents/{id}` (`DRAFT`) | **DENY** | `publicationStatus != 'PUBLISHED'` |
| Estudante | `read` (get/list) | `/flashcardContents/{id}` (`READY`) | **DENY** | `publicationStatus != 'PUBLISHED'` |
| Estudante | `read` (get/list) | `/flashcardContents/{id}` (`SUPERSEDED`) | **DENY** | Protege biblioteca ativa de conteúdo descontinuado |
| Estudante | `create` | `/flashcardContents/{id}` | **DENY** | `allow write: if false;` |
| Estudante | `update` | `/flashcardContents/{id}` | **DENY** | `allow write: if false;` |
| Estudante | `delete` | `/flashcardContents/{id}` | **DENY** | `allow write: if false;` |
| Admin (Client) | `write` | `/flashcardContents/{id}` | **DENY** | Client-side admin bypass bloqueado (`allow write: if false;`) |
| Qualquer | `read`/`write` | `/flashcardContents/{id}/versions/{v}` | **DENY** | Subcoleção interna restrita a backend |
| Qualquer | `read`/`write` | `/flashcardContents/{id}/audit/{a}` | **DENY** | Trilha de auditoria interna restrita a backend |

---

## 4. Auditoria de Não-Interferência Local

- **Armazenamento V4 Local:** Inalterado. Chaves `praxis_flashcards_v4:user:${uid}` e `praxis_flashcards_v4:guest:${guestId}` permanecem ativas e autônomas.
- **FSRS Scheduler:** 100% preservado. Zero alterações matemáticas ou temporais.
- **Plano de Hoje / Calendário / Planejamento Semanal:** Continuam consumindo exclusivamente os flashcards devidos do usuário ativo via `AppContext`.
- **UI / Sidebar:** Nenhuma rota removida, nenhuma tela alterada.

---

## 5. Arquivos Modificados e Criados

1. `src/types/canonicalFlashcard.ts` (Novo - tipos e contratos do catálogo canônico)
2. `src/types/index.ts` (Modificado - re-exportação dos tipos canônicos)
3. `src/services/canonicalFlashcardValidator.ts` (Novo - validação e parsing resiliente)
4. `src/services/canonicalFlashcardCatalogService.ts` (Novo - consultas de leitura no Firestore)
5. `firestore.rules` (Modificado - regras de segurança para `flashcardContents`)
6. `src/__tests__/canonicalFlashcardCatalog.test.ts` (Novo - suíte de testes unitários e de integração)
7. `CANONICAL_FLASHCARD_READONLY_FOUNDATION_REPORT.md` (Novo - relatório técnico)

---

## 6. Conclusão

A fundação de leitura do Catálogo Canônico no Firestore foi estabelecida com segurança máxima, validação estrita da taxonomia dos 75 Grandes Temas e isolamento completo da operação local dos estudantes.

**Classificação:** `CANONICAL_FLASHCARD_READONLY_FOUNDATION_READY`.
