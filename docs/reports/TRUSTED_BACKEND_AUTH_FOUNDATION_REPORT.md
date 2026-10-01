# Relatório Técnico: Fundação de Autenticação e Autorização Segura no Servidor (Etapa 1.22L)

## 1. Visão Geral da Implementação

Nesta etapa, implementamos a fundação confiável de **Autenticação e Autorização no Backend (Node.js/Express)** para proteger futuras operações privilegiadas do Catálogo Canônico de Flashcards StaziaMed.

O princípio central de segurança estabelecido é:
- **Autenticação Baseada em Token Criptográfico:** O cliente deve fornecer um Firebase ID Token válido no cabeçalho `Authorization: Bearer <token>`.
- **Validação com Verificação de Revogação:** O servidor valida o token utilizando `firebase-admin.auth().verifyIdToken(token, true)` (`checkRevoked = true`).
- **Autorização Baseada Exclusivamente no Banco de Dados Server-Side:** O papel (`role`) e plano (`tier`) do usuário são lidos diretamente de `/users/{uid}` via Firebase Admin Firestore, ignorando completamente qualquer declaração de autoridade enviada no corpo da requisição, parâmetros de consulta, headers customizados ou estado local do cliente.

---

## 2. Detalhamento dos Componentes Implementados

### 2.1 Singleton do Firebase Admin SDK (`server/firebaseAdmin.ts`)
- **Padrão:** Singleton idempotente (`getAdminApp()`, `getAdminAuth()`, `getAdminDb()`).
- **Resolução de Projeto:** Utiliza `staziamed-revalida-prod` (ou variáveis de ambiente `GOOGLE_CLOUD_PROJECT` / `GCP_PROJECT_ID`).
- **Estratégia de Credenciais:** Application Default Credentials (ADC) em produção/GCP e variáveis de ambiente padrão de emulador em desenvolvimento/testes, sem adição de chaves privadas ou arquivos `serviceAccount.json` no repositório.

### 2.2 Tipagem do Principal de Segurança (`server/auth/types.ts`)
- **`AuthenticatedUser`**: Identidade verificada da sessão (`uid`, `email`, `token`).
- **`ServerPrincipal`**: Identidade autorizada pelo servidor (`uid`, `email`, `role: "STUDENT" | "EDITOR" | "ADMIN"`, `tier`, `disabled`).
- **`AuthErrorCode`**: Códigos padronizados de erro (`AUTH_MISSING_TOKEN`, `AUTH_INVALID_TOKEN`, `AUTH_REVOKED_TOKEN`, `AUTH_PROFILE_NOT_FOUND`, `AUTH_USER_DISABLED`, `AUTH_FORBIDDEN`, `AUTH_INTERNAL_ERROR`).
- **Extensão Tipada do Express**: Augmentation da interface `Express.Request` com `req.auth` e `req.principal`.

### 2.3 Middlewares de Autenticação e Autorização (`server/auth/authMiddleware.ts`)
1. **`authenticateFirebaseRequest`**:
   - Extrai o token do cabeçalho `Authorization: Bearer <token>`.
   - Rejeita requisições sem token ou com formatação incorreta com status `401 AUTH_MISSING_TOKEN` / `AUTH_INVALID_TOKEN`.
   - Rejeita tokens revogados com `401 AUTH_REVOKED_TOKEN`.
   - Popula `req.auth = { uid, email, token }` e repassa para o próximo middleware.
   - **Privacidade:** Nunca registra tokens brutos nos logs do servidor.
2. **`requireServerCapability(allowedRoles)` / `requireServerRole(role)`**:
   - Executa leitura server-side de `/users/{req.auth.uid}`.
   - Rejeita usuários sem perfil com `403 AUTH_PROFILE_NOT_FOUND`.
   - Rejeita contas desabilitadas com `403 AUTH_USER_DISABLED`.
   - Normaliza os papéis e valida se o usuário possui os privilégios exigidos.
   - Rejeita usuários com permissões insuficientes com `403 AUTH_FORBIDDEN`.
   - Bloqueia tentativas de injeção de `role: "ADMIN"` ou falsificação de `userId` no corpo da requisição.

---

## 3. Matriz de Segurança e Proteção contra Escalada de Privilégios

| Cenário de Ataque / Teste | Entrada do Cliente | Comportamento do Servidor | Status |
|----------------------------|--------------------|---------------------------|--------|
| **Requisição Anônima sem Header** | Sem `Authorization` | Rejeitada antes de qualquer processamento | **401 AUTH_MISSING_TOKEN** |
| **Token com Formatação Inválida** | `Authorization: Basic ...` | Rejeitada imediatamente | **401 AUTH_INVALID_TOKEN** |
| **Token Revogado pelo Firebase** | Token antigo com sessão revogada | `verifyIdToken(token, true)` detecta e bloqueia | **401 AUTH_REVOKED_TOKEN** |
| **Tentativa de Escalada de Role** | Token STUDENT + `body: { role: "ADMIN" }` | O body é sumariamente ignorado; o servidor lê `/users/{uid}` e detecta `STUDENT` | **403 AUTH_FORBIDDEN** |
| **Tentativa de Escalada via Header** | Token STUDENT + `X-Role: ADMIN` | O header customizado é ignorado | **403 AUTH_FORBIDDEN** |
| **Tentativa de Spoofing de UID** | Token de Alice + `body: { userId: "bob_admin" }` | O servidor consulta o banco usando `req.auth.uid` (Alice); Bob não é afetado | **Protegido** |
| **Perfil Inexistente no Banco** | Token válido sem documento `/users/{uid}` | Bloqueia acesso privilegiado (fail-closed) | **403 AUTH_PROFILE_NOT_FOUND** |
| **Conta Desabilitada no Firestore** | Token válido de usuário com `disabled: true` | Bloqueia acesso privilegiado | **403 AUTH_USER_DISABLED** |

---

## 4. Auditoria de Rotas Existentes e Legado

- **Rotas de IA e Health Check:** Permanecem inalteradas, sem regressão de comportamento.
- **Padrão de Tier em IA:** O padrão `CLIENT_PASSED_NORMALIZED_TIER` continua restrito aos limites de consumo de IA e **NÃO** é utilizado pela camada de autenticação privilegiada do catálogo.
- **CORS:** O servidor opera no modelo same-origin (SPA servida na mesma porta e domínio dos endpoints `/api/*`), sem headers `Access-Control-Allow-Origin: *` em rotas privilegiadas.
- **Escritas no Catálogo:** Nenhuma mutação ou escrita em coleções de catálogo foi implementada nesta etapa (`CATALOG_SERVER_WRITES_ADDED = 0`).

---

## 5. Contabilidade da Suíte de Testes

- **Arquivos de Teste Anteriores:** 40 arquivos.
- **Novo Arquivo de Teste:** `src/__tests__/serverAuthFoundation.test.ts` (11 novos casos de teste).
- **Total de Arquivos de Teste Atuais:** 41 arquivos.
- **Total de Casos de Teste Atuais:** 326 casos de teste ($315 + 11 = 326$).
- **Testes de Invariantes das Regras do Firestore:** 14/14 verificados.
- **Erros no Console:** 0.

---

## 6. Conclusão

A fundação de autenticação e autorização segura no servidor está concluída, testada e pronta para sustentar com rigor absoluto os futuros fluxos de curadoria e publicação do Catálogo Canônico.

**Classificação:** `TRUSTED_BACKEND_AUTH_FOUNDATION_READY`.
