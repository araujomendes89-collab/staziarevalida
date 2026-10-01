# Relatório de Arquitetura Técnica: Trusted Flashcard Publisher Backend (Etapa 1.22K)

## 1. Visão Geral e Objetivo

Esta auditoria técnica define o design arquitetural definitivo para a execução de operações privilegiadas do **Catálogo Canônico de Flashcards StaziaMed**. 

O princípio norteador é o **desacoplamento estrito entre a autoridade de publicação e o cliente web do estudante**:
- **Clients (Navegador/App):** Possuem acesso exclusivamente de leitura a documentos em estado `PUBLISHED` via Cloud Firestore. Qualquer escrita direta (`create`, `update`, `delete`) é bloqueada pelas Security Rules (`allow write: if false;`).
- **Trusted Publisher (Servidor Seguro):** Executa em ambiente backend autenticado com Firebase Admin SDK, aplicando todas as validações médicas, taxonômicas e editoriais de forma transacional e atômica.

---

## 2. Inventário do Backend Atual

| Item | Situação Atual no Projeto |
|------|---------------------------|
| **Runtime Server-Side** | Node.js + Express (`server.ts`, compilado para `dist/server.cjs` via esbuild) |
| **Papel do `server.ts`** | Backend unificado: serve Vite SSR/dev em desenvolvimento, arquivos estáticos da SPA em produção e todos os endpoints `/api/*` (rotas de IA, quotas, busca médica oficial, health check) |
| **Firebase Admin SDK** | Dependência declarada no `package.json` (`"firebase-admin": "^14.3.0"`), pronta para inicialização no backend |
| **Região de Operação** | `southamerica-east1` (São Paulo) configurada como padrão |
| **Modelo de Confiança Atual** | Rotas de IA usam middleware de quota baseado em `userId`/`userTier` |
| **Risco de Fragmentação** | **BAIXO** se o publisher for integrado ao Express existente; **ALTO** se um segundo backend desacoplado for introduzido sem necessidade |

**Recomendação de Runtime:** `TRUSTED_PUBLISHER_RUNTIME_RECOMMENDATION = EXISTING_EXPRESS_BACKEND`.

---

## 3. Modelo de Autenticação e Autoridade de Papéis (RBAC)

1. **Autenticação Fail-Closed:**
   - Todo endpoint de curadoria/publicação exige o cabeçalho `Authorization: Bearer <Firebase ID Token>`.
   - O middleware executa `admin.auth().verifyIdToken(token, true)` (com verificação de revogação de credenciais).
   - Requisições com token ausente, expirado ou inválido são rejeitadas com status `401 UNAUTHENTICATED`.

2. **Autoridade de Papéis:**
   - **Recomendação:** `PUBLISHER_ROLE_AUTHORITY_RECOMMENDATION = SERVER_FIRESTORE_USER_PROFILE_LOOKUP_WITH_OPTIONAL_CUSTOM_CLAIMS`.
   - O servidor verifica a role do usuário no documento `/users/{uid}` ou nos custom claims emitidos (`ADMIN`, `PUBLISHER`, `MEDICAL_REVIEWER`, `EDITOR`).
   - O payload do body jamais determina os privilégios do autor.

3. **Matriz de Privilégios Mínimos (Least Privilege):**
   - `EDITOR`: Criação e edição de rascunhos (`CREATE_DRAFT`, `EDIT_DRAFT`).
   - `MEDICAL_REVIEWER`: Homologação clínica de conduta e evidência (`MEDICAL_REVIEW`).
   - `PUBLISHER` / `ADMIN`: Aprovação de portões e publicação global no catálogo (`PUBLISH`, `SUPERSEDE`, `ARCHIVE`).

---

## 4. Estrutura de Armazenamento: Desacoplamento entre Drafts e Projeção Pública

### O Desafio da Projeção Pública no Root
Na Etapa 1.22I, estabelecemos que `/flashcardContents/{contentId}` representa a **`CURRENT_PUBLISHED_PROJECTION`** consumida diretamente pelos estudantes.
Se um novo rascunho (versão 2) de um cartão já publicado (versão 1) fosse salvo diretamente no root com status `DRAFT`, o cartão existente sumiria instantaneamente do catálogo dos alunos devido à regra `publicationStatus == 'PUBLISHED'`.

### Arquitetura de Isolamento de Rascunhos
- **Coleção de Rascunhos e Workflow:** `/flashcardDrafts/{contentId}` (ou `/flashcardWorkflows/{contentId}`).
  - Apenas editores e revisores autenticados têm acesso.
  - Armazena notas editoriais, justificativas clínicas, flags de duplicata e revisões em andamento.
- **Coleção Pública do Catálogo:** `/flashcardContents/{contentId}`.
  - Permanece apontando para a versão atualmente publicada durante todo o período em que uma nova revisão está sendo redigida.
- **Invariante:** `ROOT_REMAINS_PUBLISHED_DURING_NEW_DRAFT = YES`.

---

## 5. Transação de Publicação (`PUBLISH_WRITE_PRIMITIVE = TRANSACTION`)

A operação de publicação é executada através de uma transação atômica ACID (`db.runTransaction`):

```
                      [ Client Publisher / Admin ]
                                   │
                                   ▼
              [ POST /api/admin/canonical-flashcards/:id/publish ]
                                   │
                    (1) Verify Firebase ID Token & Roles
                    (2) Run Domain Validation (Zod/Validator)
                    (3) Check Portões: Schema + Medical + Editorial + Topic + Source
                                   │
                                   ▼
                      ┌────────────────────────┐
                      │  Firestore Transaction │
                      └────────────┬───────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
  (A) Create Immutable    (B) Update/Create      (C) Update Draft &
      Version Snapshot        Root Projection        Append Audit Log
  /flashcardContents/{id}  /flashcardContents/{id}  /flashcardDrafts/{id}
  /versions/{rev}          (publicationStatus:      /flashcardContents/{id}
                           'PUBLISHED')             /audit/{eventId}
                                   │
                                   ▼
                         [ Commit Transaction ]
```

### Prevenção de Conflitos e Idempotência
- **`PUBLISH_IDEMPOTENCY_MODEL = DRAFT_REVISION_TOKEN_AND_TRANSACTIONAL_STATUS_CHECK`**:
  - A transação lê o estado atual do rascunho e a última revisão pública.
  - Se o rascunho já estiver marcado como publicado ou se o `draftRevisionToken` for inválido, a transação aborta com `VERSION_CONFLICT` ou `ALREADY_PUBLISHED`.
  - Garante que múltiplos cliques ou retries nunca gerem revisões duplicadas com o mesmo número.

---

## 6. Portões Obrigatórios de Publicação (Enforced no Servidor)

O backend valida de forma estrita:
1. **`SCHEMA_VALID`:** Validação estrutural via `validateCanonicalFlashcardDocument`.
2. **`MEDICAL_REVIEWED`:** Identificação do médico revisor (`medicalReviewedBy`), CRM/especialidade e data de revisão.
3. **`EDITORIAL_REVIEWED`:** Validação de atomicidade, Active Recall estrito e formatação.
4. **`CANONICAL_TOPIC_VALID`:** Validação do `canonicalTopicId` contra a taxonomia dos 75 Grandes Temas via `getGrandeTemaById`.
5. **`PRIMARY_SOURCE_VALID`:** Citação de fonte primária oficial com `OfficialSourceType` padronizado.
6. **`NO_BLOCKING_DUPLICATE`:** Confirmação de ausência de duplicidade não justificada.

---

## 7. Reutilização de Domínio e Camada Compartilhada

- **`CATALOG_VALIDATOR_SERVER_REUSE = FUNCTIONAL`:** O validador puro `canonicalFlashcardValidator.ts` é 100% agnóstico de ambiente (Node.js e browser) e pode ser importado diretamente no backend.
- **`SHARED_CATALOG_DOMAIN_LAYER = READY`:** Os tipos TypeScript em `src/types/canonicalFlashcard.ts` e os utilitários de taxonomia em `src/services/topicTaxonomyService.ts` formam uma camada de domínio compartilhada pronta para o servidor.

---

## 8. Testabilidade no Firebase Emulator

- **`TRUSTED_PUBLISHER_EMULATOR_TESTABILITY = HIGH`:**
  - O backend Express pode ser executado contra as portas locais do Firestore Emulator (`8899`) e Auth Emulator (`9099`).
  - Suítes de integração automatizadas com `vitest` e `supertest` poderão testar cenários de permissão negada, validação de portões e transações atômicas de publicação sem tocar no banco de produção.

---

## 9. Fases Recomendadas para Implementação Futura

1. **Etapa Atual (1.22K):** Auditoria de Arquitetura do Trusted Publisher (Concluída - Read Only).
2. **Etapa Futura 1:** Configuração do `firebase-admin` e middleware de autenticação/RBAC em `server.ts`.
3. **Etapa Futura 2:** Coleção `/flashcardDrafts` e endpoints de criação/edição de rascunhos.
4. **Etapa Futura 3:** Endpoints de revisão médica e editorial com auditoria.
5. **Etapa Futura 4:** Transação de publicação atômica (`/publish`) com geração de snapshots de versão e atualização da projeção pública.
6. **Etapa Futura 5:** Suíte de testes de integração do Publisher com o Emulator.

---

## 10. Conclusão da Auditoria

A arquitetura do Trusted Publisher foi delineada com máxima precisão técnica, aproveitando o runtime Express existente e garantindo que o catálogo público permaneça íntegro, imutável e imune a manipulações indevidas.

**Classificação:** `FLASHCARD_TRUSTED_PUBLISHER_ARCHITECTURE_READY`.
