# Relatório Técnico: Fundação de Rascunhos Privados do Catálogo Canônico (Etapa 1.22M)

## 1. Visão Geral da Implementação

Nesta etapa, implementamos a infraestrutura e a API segura para a criação e edição de **Rascunhos Privados (Working Drafts)** do Catálogo Canônico de Flashcards StaziaMed.

### Princípios de Segurança e Isolamento Assegurados:
- **`PRIVATE_WORKFLOW_COLLECTION`**: `/flashcardWorkflows/{contentId}`
- **Isolamento Absoluto do Catálogo Público:** Criar ou atualizar um rascunho de trabalho **não toca** a coleção pública `/flashcardContents` e **não altera** o documento de projeção pública.
- **Identidade Gerada no Servidor:** O `contentId` é gerado exclusivamente no backend (`c_fc_<uuid_hex>`) no momento de criação do rascunho.
- **Controle de Concorrência Otimista:** Atualizações em rascunhos exigem o envio de `expectedDraftRevision` e são executadas dentro de uma transação Firestore atômica, prevenindo sobreposição de edições (*stale update conflict* -> `409 Conflict`).
- **Proteção contra Mass Assignment:** O payload do rascunho passa por uma allowlist estrita de campos de conteúdo; metadados críticos (`contentId`, `workflowStatus`, `draftRevision`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`) são controlados exclusivamente pelo servidor.

---

## 2. Detalhamento dos Componentes Implementados

### 2.1 Tipos de Domínio (`src/types/canonicalWorkflow.ts` e `src/types/index.ts`)
- **`CanonicalWorkflowStatus`**: `"DRAFT"`
- **`DraftFlashcardPayload`**: Campos permitidos para redação (`front`, `back`, `keyMnemonic`, `canonicalTopicId`, `areaId`, `area`, `cardPurpose`, `assessmentSource`, `medicalEvidence`, `contentFingerprint`, `contentFingerprintVersion`).
- **`CanonicalFlashcardWorkflow`**: Contrato do documento de workflow privado no Firestore.

### 2.2 Validador e Sanitizador de Rascunhos (`server/workflow/draftValidator.ts`)
- **`validateAndSanitizeDraftPayload(rawInput)`**:
  - Permissivo para campos opcionais/incompletos (compatível com a natureza de trabalho em progresso).
  - Valida tipos e limites de caracteres (`front`/`back` <= 4000 caracteres, `keyMnemonic` <= 200).
  - Valida `canonicalTopicId` contra os 75 Grandes Temas (`getGrandeTemaById`) e deriva `areaId` e `area` deterministicamente.
  - Valida `cardPurpose` contra os enums oficiais permitidos.
  - Deriva automaticamente o `contentFingerprint` SHA-256 (`fc_fp_v1_<hash>`) quando `front` e `back` são informados.
  - Elimina silenciosamente tentativas de injeção de campos internos (`workflowStatus`, `draftRevision`, `createdBy`, `updatedBy`).

### 2.3 Serviço de Workflow (`server/workflow/canonicalDraftService.ts`)
- **`createDraft(principal, rawDraft)`**:
  - Gera `contentId` opaco com prefixo `c_fc_`.
  - Inicializa `workflowStatus: "DRAFT"` e `draftRevision: 1`.
  - Atribui `createdBy` e `updatedBy` com base no `ServerPrincipal` autenticado.
  - Grava o documento em `/flashcardWorkflows/{contentId}` via `.create()` (falha se o ID já existir).
- **`updateDraft(principal, contentId, expectedDraftRevision, rawDraftUpdates)`**:
  - Executa transação Firestore (`adminDb.runTransaction`).
  - Verifica existência do rascunho (`404 DRAFT_NOT_FOUND` se inexistente).
  - Verifica status (`400 DRAFT_NOT_EDITABLE` se `workflowStatus !== "DRAFT"`).
  - Verifica revisão esperada (`409 DRAFT_REVISION_CONFLICT` se `storedDraftRevision !== expectedDraftRevision`).
  - Incrementa `draftRevision` ($+1$) e atualiza `updatedBy` e `updatedAt`.
  - Grava as alterações atomicamente.
- **`getDraftById(contentId)`**: Leitura segura de um rascunho privado para curadoria.

### 2.4 Endpoints Administrativos (`server/routes/adminFlashcardDrafts.ts` e `server.ts`)
- Rotas montadas sob `/api/admin/flashcards/drafts`:
  - `POST /`: Criação de rascunho (Retorna `201 Created`).
  - `PATCH /:contentId`: Atualização de rascunho com concorrência (Retorna `200 OK` ou `409 Conflict`).
  - `GET /:contentId`: Consulta de rascunho individual (Retorna `200 OK` ou `404 Not Found`).
- **Segurança de Acesso:** Protegido por `authenticateFirebaseRequest` e `requireServerRole("ADMIN")`.
- **Mapeamento de Erros:** Respostas estruturadas em JSON com códigos de erro semânticos (`DRAFT_INVALID`, `DRAFT_NOT_FOUND`, `DRAFT_REVISION_CONFLICT`, `DRAFT_NOT_EDITABLE`, `DRAFT_INTERNAL_ERROR`).

### 2.5 Regras de Segurança no Firestore (`firestore.rules`)
```firestore
// -------------------------------------------------------------
// WORKFLOW PRIVADO DE FLASHCARDS CANÔNICOS (Acesso Direto pelo Cliente DENIED)
// -------------------------------------------------------------
match /flashcardWorkflows/{contentId} {
  allow read, write: if false; // Todo acesso deve ocorrer exclusivamente através do backend seguro (Admin SDK)
}
```

---

## 3. Matriz de Segurança e Não-Interferência

| Operação | Invariante de Segurança | Status |
|----------|-------------------------|--------|
| **Criação de Rascunho** | Não cria e não modifica `/flashcardContents/{contentId}` | **Garantido (0 writes públicos)** |
| **Atualização de Rascunho** | Não altera versão pública e mantém integridade concorrente | **Garantido (409 em conflito)** |
| **Acesso Direto via Firestore Client SDK** | Bloqueado por `allow read, write: if false;` | **Garantido (DENY)** |
| **Injeção de `workflowStatus: 'PUBLISHED'`** | Sanitizador de payload elimina o campo | **Garantido (Bloqueado)** |
| **Falsificação de Autor (`createdBy`)** | Derivado estritamente do `req.principal.uid` | **Garantido (Imutável)** |
| **Armazenamento Local V4 / FSRS** | 100% independente do workflow de rascunhos | **Inalterado** |

---

## 4. Contabilidade da Suíte de Testes

- **Arquivos de Teste Anteriores:** 41 arquivos.
- **Novo Arquivo de Teste:** `src/__tests__/canonicalFlashcardDraftWorkflow.test.ts` (8 novos casos de teste).
- **Total de Arquivos de Teste Atuais:** 42 arquivos.
- **Total de Casos de Teste Atuais:** 334 casos de teste ($326 + 8 = 334$).
- **Testes de Autenticação do Servidor:** 11/11 PASS.
- **Testes de Workflow do Servidor:** 8/8 PASS.
- **Invariantes das Regras do Firestore:** 15/15 verificados.
- **Erros no Console:** 0.

---

## 5. Conclusão

A fundação para gestão privada de rascunhos de flashcards canônicos foi implementada com arquitetura transacional, proteção total contra escalada de privilégios e isolamento estrito em relação ao catálogo público e aos dados locais dos estudantes.

**Classificação:** `CANONICAL_FLASHCARD_PRIVATE_DRAFT_FOUNDATION_READY`.
