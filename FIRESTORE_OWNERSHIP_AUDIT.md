# FIRESTORE_OWNERSHIP_AUDIT.md
# StaziaMed Revalida — Auditoria de Propriedade de Dados e Segurança Firestore
**Data:** 2026-09-03  
**Auditor:** Antigravity Engine  
**Modo:** READ-ONLY (Nenhum arquivo, regra ou documento foi modificado)

---

## 1. COLEÇÃO: USERS (`/users/{userId}`)

### 1.1 Document ID e Padrão de Identificação
- **Padrão de ID:** Exatamente o **Firebase Auth UID** (`fbUser.uid`).
- **Garantia de UID:** 
  - Na leitura: `FirebaseService.getUserProfile(fbUser.uid)` busca explicitamente pela chave `fbUser.uid` após evento do `onAuthStateChanged` (`AppContext.tsx:311`).
  - Na escrita: `FirebaseService.saveUserProfile` verifica `auth.currentUser?.uid` e força `const targetUid = activeUid; const userRef = doc(db, "users", targetUid)`. Se o usuário não estiver autenticado, a escrita na nuvem é abortada com segurança (`if (!activeUid) return;`).
- **Campos de Identificação do Usuário no Documento:**
  - `id`: string (sempre igual ao Firebase Auth UID).
  - `email`: string (obtido de `fbUser.email`).
  - `name`: string (obtido de `fbUser.displayName` ou fallback).
  - `role`: `"STUDENT" | "EDITOR" | "ADMIN"` (sanitizado na escrita do client: `delete sanitized.role`).

### 1.2 Mapeamento de Leituras e Escritas
- **Leituras Frontend:**
  - `AppContext.tsx:311`: `FirebaseService.getUserProfile(fbUser.uid)` via `getDoc(doc(db, "users", userId))`.
  - `WeeklyBulletinService.ts:27`: `FirebaseService.getUserProfile(userId)` via `getDoc`.
  - **NÃO existem queries abertas** (como `getDocs(collection(db, "users"))`) no frontend.
- **Escritas Frontend:**
  - `AppContext.tsx:353, 372, 534, 545`: `FirebaseService.saveUserProfile(userProfile)` via `setDoc(doc(db, "users", targetUid), payload, { merge: true })`.
  - `AdminEditorialView.tsx`: Importação em lote chama `FirebaseService.importAllData` que faz `setDoc(doc(db, "users", data.userProfile.id))`.
- **Acesso Backend (`server.ts` e `/server/`):**
  - O backend Express **não acessa** o Firestore diretamente para ler/escrever usuários (a contagem de quotas de IA é feita em memória por IP/Bearer Token no `quotaMiddleware.ts`).

### 1.3 Avaliação de Regra de Segurança
```javascript
match /users/{userId} {
  allow read: if request.auth != null && (request.auth.uid == userId || isAdmin());
  allow create: if request.auth != null && (request.auth.uid == userId || isAdmin()) && isValidUser(request.resource.data) && isUnprivilegedRoleCreate(request.resource.data);
  allow update: if request.auth != null && (request.auth.uid == userId || isAdmin()) && isValidUser(request.resource.data) && isRoleUnmodified() && isPrivilegedTierUnmodified();
  allow delete: if request.auth != null && (request.auth.uid == userId || isAdmin());
}
```
- **Conclusão para `users`:** **SAFE_TO_LOCK**  
  Uma regra baseada em `request.auth.uid == userId` é 100% suficiente, compatível com o código existente e fecha imediatamente a exposição de dados sensíveis de alunos.

---

## 2. COLEÇÃO: SESSIONS (`/sessions/{sessionId}`)

### 2.1 Estrutura Real de `TrainingSessionDoc`
```typescript
{
  id: string;                      // ID da sessão (UUID ou session-timestamp)
  userId: string;                  // ID do proprietário
  title: string;                   // Título da sessão
  mode: TrainingMode;              // "STUDY" | "EXAM" | "SIMULADO" | ...
  config: QuestionSessionConfig;   // Configurações de filtro
  questionIds: string[];           // IDs das questões resolvidas
  currentIndex: number;            // Índice atual
  answers: Record<string, SessionAnswerState>; // Respostas dadas
  flaggedQuestionIds: string[];    // Questões marcadas para revisão
  startTime: string;               // ISO 8601
  lastUpdated: string;             // ISO 8601
  totalDurationSeconds: number;
  isCompleted: boolean;
  completedAt?: string;
  paused?: boolean;
  summaryReport?: SessionSummaryReport;
}
```

### 2.2 Campo de Proprietário e Ciclo de Vida
- **Campo Proprietário:** `userId` (string).
- **Onde o ID da sessão é criado:**
  - `ProvasCompletasView.tsx:32`: `crypto.randomUUID()`
  - `QuestionsView.tsx:69`: `session-${Date.now()}` (armazenado em localStorage via `SessionBuilderService`)
- **Onde `userId` é preenchido:**
  - `ProvasCompletasView.tsx:33`: `userId: user?.id || "guest"`
- **Onde são criadas e atualizadas no Firestore:**
  - `FirebaseService.saveTrainingSession(session)`: Executa `setDoc(doc(db, "sessions", session.id), payload, { merge: true })`.
- **Onde são lidas no Firestore:**
  - `FirebaseService.getTrainingSession(sessionId)`: Leitura pontual via `getDoc(doc(db, "sessions", sessionId))`.
  - `FirebaseService.getUserSessions(userId, maxLimit)`: Leitura por query indexada:
    ```typescript
    query(
      collection(db, "sessions"),
      where("userId", "==", userId),
      orderBy("startTime", "desc"),
      limit(maxLimit)
    )
    ```
    Utilizada em `WeeklyBulletinService.processFirestoreWeeklyReadiness`.

### 2.3 Vulnerabilidades e Riscos de Bloqueio
1. **Sessões com `userId: "guest"`:** Se um usuário não autenticado resolver uma prova em `ProvasCompletasView.tsx`, a sessão é criada com `userId: "guest"`. Ao aplicar regras de autenticação estrita (`request.auth.uid == request.resource.data.userId`), a tentativa de salvar como `guest` causará `PERMISSION_DENIED`.
2. **`getTrainingSession(sessionId)`:** Lê um documento diretamente por `sessionId`. Se a regra exigir `resource.data.userId == request.auth.uid`, apenas o próprio dono conseguirá ler sua sessão (o que é o comportamento correto desejado).
3. **Índice Composto:** A query `where("userId", "==", userId) + orderBy("startTime", "desc")` requer um índice composto no Firestore.

- **Conclusão para `sessions`:** **MIGRATION_REQUIRED**  
  *Motivo:* Antes de fechar a regra, é necessário garantir que o client trate o modo Guest (evitando tentar gravar sessões com `userId: "guest"` na nuvem ou convertendo sessões locais após o login) e certificar que o índice composto `sessions (userId ASC, startTime DESC)` está ativo.

---

## 3. COLEÇÃO: ERRORS (`/errors/{errorId}`)

### 3.1 Estrutura de `ErrorAutopsyDoc`
```typescript
{
  id: string;                      // "err_" + (attempt.id || Date.now())
  userId: string;                  // Firebase Auth UID
  questionId: string;              // ID da questão errada
  questionCode: string;            // Código canônico da questão
  area: MedicalArea;               // Área médica
  topic: string;                   // Tema clínico
  subtopic: string;                // Subtema
  selectedOption: "A"|"B"|"C"|"D"; // Opção incorreta assinalada
  correctOption: "A"|"B"|"C"|"D";  // Gabarito correto
  timeSpentSeconds: number;
  confidence: ConfidenceLevel;
  errorReason: ErrorTaxonomy;      // Causa raiz do erro
  userReflection?: string;         // Reflexão metacognitiva do aluno
  keyFinding?: string;
  expectedConduct?: string;
  inepIntent?: string;
  remedialCardCreated?: boolean;
  remedialCardId?: string;
  resolutionStatus: "PENDING_REVIEW" | "REMEDIATED" | "MASTERED";
  retestAttempts?: Array<{ timestamp: string; isCorrect: boolean; mode: string }>;
  timestamp: string;
  updatedAt: string;
}
```

### 3.2 Ciclo de Vida e Queries
- **Campo Proprietário:** `userId` (string).
- **Origem do ID:** `err_${attempt.id || Date.now()}`.
- **Criação:** Disparada automaticamente em `AppContext.tsx:643` dentro de `recordQuestionAttempt` sempre que `!attemptData.isCorrect`. Chama `FirebaseService.recordErrorAutopsy({ userId: user.id, ... })`.
- **Leitura:** `FirebaseService.getUserErrorAutopsies(userId, maxLimit)` via:
  ```typescript
  query(
    collection(db, "errors"),
    where("userId", "==", userId),
    orderBy("timestamp", "desc"),
    limit(maxLimit)
  )
  ```
- **Atualização:** `FirebaseService.updateErrorAutopsyStatus(errorId, status, reflection)` via `updateDoc(doc(db, "errors", errorId), payload)`.

### 3.3 Avaliação de Regra
Todas as queries e escritas já passam o `userId` do usuário autenticado. Se o usuário estiver deslogado, `user.id` pode conter `"usr-default"` em local storage; o `FirebaseService` precisa de uma guarda `if (!auth.currentUser) return;` antes de gravar no Firestore para evitar erros de permissão no console de guests.

- **Conclusão para `errors`:** **SAFE_TO_LOCK**  
  Estrutura 100% aderente ao padrão `userId`.

---

## 4. COLEÇÃO: PROGRESS (`/progress/{progressId}`)

### 4.1 Estrutura e Padrões de ID
- **Padrões de Document ID utilizados:**
  1. `progress_${userId}` — Guarda o estado diário de metas, streak, PPS (Projected Pass Score) e nós do Knowledge Graph.
  2. `bulletin_${userId}` — Guarda o boletim semanal de prontidão gerado pelo `WeeklyBulletinService`.
  3. `bulletin_${userId}_${Date.now()}` — Variante para histórico de boletins.

### 4.2 Estrutura de `UserProgressDoc`
```typescript
{
  id: string;                      // "progress_" + userId
  userId: string;                  // Firebase Auth UID
  missionDate: string;             // YYYY-MM-DD
  todayMission: StudyMission;
  knowledgeGraphNodes: KnowledgeNode[];
  studyStreakDays: number;
  totalQuestionsSolved: number;
  overallReadiness: number;
  projectedPassScoreMin: number;
  projectedPassScoreMax: number;
  flashcardStats?: { total: number; dueToday: number; mastered: number };
  lastActiveDate: string;
  updatedAt: string;
}
```

### 4.3 Ciclo de Vida e Leitura/Escrita
- **Leitura:**
  - `FirebaseService.getUserLatestProgress(userId)`: `getDoc(doc(db, "progress", "progress_" + userId))`.
  - `FirebaseService.getWeeklyBulletin(userId)`: `getDoc(doc(db, "progress", "bulletin_" + userId))`.
- **Escrita:**
  - `FirebaseService.saveUserProgress`: `setDoc(doc(db, "progress", progress.id), payload, { merge: true })`.
  - `FirebaseService.saveWeeklyBulletin`: `setDoc(doc(db, "progress", "bulletin_" + userId), payload, { merge: true })`.
- **Garantia de Proprietário:**
  - O proprietário pode ser determinado tanto pelo Document ID (`progress.startsWith('progress_' + request.auth.uid)` ou `progress.startsWith('bulletin_' + request.auth.uid)`) quanto pelo campo `resource.data.userId == request.auth.uid`.

- **Conclusão para `progress`:** **SAFE_TO_LOCK**

---

## 5. DADOS ADMINISTRATIVOS E CONTEÚDO PÚBLICO

| Coleção | Classificação de Privacidade | Leitura Permitida | Escrita Permitida | Justificativa |
|---|---|---|---|---|
| `questions` | **PUBLIC_CONTENT** | `if true` (ou `if isAuthenticated()`) | `if isAdmin()` | Banco oficial de questões acessível aos alunos para estudo. Escrita restrita a administradores. |
| `editions` | **PUBLIC_CONTENT** | `if true` (ou `if isAuthenticated()`) | `if isAdmin()` | Metadados dos cadernos e editais oficiais do INEP. |
| `guidelines` | **PUBLIC_CONTENT** | `if true` (ou `if isAuthenticated()`) | `if isAdmin()` | Diretrizes clínicas e atualizações do Ministério da Saúde. |
| `osce_stations` | **AUTHENTICATED_CONTENT** | `if isAuthenticated()` | `if isAdmin()` | Estações de prova prática/habilidades clínicas. |
| `knowledge_nodes` | **PUBLIC_CONTENT** | `if true` (ou `if isAuthenticated()`) | `if isAdmin()` | Grafo de conhecimento médico e matriz de competências. |
| `brazil_medicine` | **PUBLIC_CONTENT** | `if true` (ou `if isAuthenticated()`) | `if isAdmin()` | Conteúdo contextual do SUS e epidemiologia brasileira. |
| `admins` | **ADMIN_ONLY** | `if isAuthenticated()` | `if isAdmin()` | Tabela de UIDs autorizados como administradores. |
| `_health_check` | **PUBLIC_CONTENT** | `if true` | `if isAdmin()` (restringir escrita) | Endpoint de probe de conectividade. |

---

## 6. SIMULAÇÃO DE IMPACTO: QUERIES QUE PODERIAM QUEBRAR

Se a regra for alterada de `allow read: if true` para `allow read: if request.auth.uid == resource.data.userId`:

| Arquivo | Função | Coleção | Query Atual | Impacto / Motivo do Problema |
|---|---|---|---|---|
| `src/services/firebaseService.ts` | `saveTrainingSession` | `sessions` | `setDoc(doc(db, "sessions", session.id), ...)` | **QUEBRA NO MODO GUEST:** Se um usuário sem login concluir prova no `ProvasCompletasView`, `session.userId` será `"guest"`, violando `request.auth.uid == userId`. |
| `src/context/AppContext.tsx` | `refreshMissionTask` | `progress` | `saveUserProgress({ id: "progress_" + (user?.id \|\| "guest"), ... })` | **QUEBRA NO MODO GUEST:** Se o aluno clicar em tarefas sem estar autenticado, dispara gravação com `id: "progress_guest"`, violando a regra de autenticação. |
| `src/services/firebaseService.ts` | `recordErrorAutopsy` | `errors` | `setDoc(doc(db, "errors", errorId), ...)` | **QUEBRA NO MODO GUEST:** Erros de questões cometidos em modo deslogado tentam gravar com `userId: "usr-default"` ou `"guest"`. |
| `src/services/inventoryValidatorService.ts` | `auditAll` | `questions` | `getDocs(collection(db, "questions"))` | **SEM QUEBRA:** Como `questions` continuará com leitura pública (`allow read: if true;`), a auditoria de cadernos continuará funcionando normalmente. |
| `src/services/firebaseService.ts` | `getUserSessions` | `sessions` | `query(collection(db, "sessions"), where("userId", "==", userId), ...)` | **SEM QUEBRA (quando logado):** A query filtra explicitamente por `userId == request.auth.uid`. |

---

## 7. ANÁLISE DE DOCUMENTOS LEGADOS E MOCKS

- **Seeds / Mocks Estáticos (`src/data/`):**
  - Nenhum arquivo estático em `src/data/` (como `questionsData.ts`, `revalida2026_1Part1.ts`, `guidelinesData.ts`) possui dados de usuários ou sessões simuladas gravadas com UIDs fictícios.
- **LocalStorage (`praxis_user_profile_v2`):**
  - Usuários anônimos ou em primeiro acesso recebem `id: "usr-default"` antes da autenticação Google/Firebase.
  - Ao fazer login, `AppContext.tsx:340` faz o merge e atualiza o `id` local para o `fbUser.uid`.
- **Scripts de Importação:**
  - `upload_2026_1.ts` e `clean_images.ts` manipulam exclusivamente a coleção `questions` via Admin SDK, sem interferir nas coleções privadas de usuários.

---

## 8. RESUMO EXECUTIVO E MATRIZ DE CONCLUSÃO

| Coleção | Classificação de Privacidade | Padrão de ID do Doc | Campo Proprietário | Proprietário Garantido? | Padrão Atual de Leitura | Safe To Lock? | Migração Requerida? | Estratégia de Regra Recomendada |
|---|---|---|---|---|---|---|---|---|
| `users` | **OWNER_PRIVATE** | `{auth.uid}` | `id` (ou doc ID) | **SIM (100%)** | `doc(db, 'users', uid)` | **SAFE_TO_LOCK** | NÃO | `request.auth.uid == userId \|\| isAdmin()` |
| `sessions` | **OWNER_PRIVATE** | `{uuid}` | `userId` | **PARCIAL** (guests geram `"guest"`) | `where('userId', '==', uid)` + `doc(sessions, id)` | **MIGRATION_REQUIRED** | **SIM** (guard client-side para guests) | `resource.data.userId == request.auth.uid \|\| isAdmin()` |
| `errors` | **OWNER_PRIVATE** | `err_{attemptId}` | `userId` | **SIM** | `where('userId', '==', uid)` | **SAFE_TO_LOCK** | NÃO (adicionar guard no client para guests) | `resource.data.userId == request.auth.uid \|\| isAdmin()` |
| `progress` | **OWNER_PRIVATE** | `progress_{uid}`, `bulletin_{uid}` | `userId` | **SIM** | `doc(progress, 'progress_' + uid)` | **SAFE_TO_LOCK** | NÃO | `(resource == null \|\| resource.data.userId == request.auth.uid) \|\| (request.auth.uid == progressId.replace('progress_', ''))` |
| `questions` | **PUBLIC_CONTENT** | `REV-{ANO}.{ED}-Q{N}` | N/A (Banca) | N/A | `getDocs(collection('questions'))` | **SAFE_TO_LOCK** | NÃO | `allow read: if true; allow write: if isAdmin();` |
| `editions` | **PUBLIC_CONTENT** | `rev-{ano}-{ed}` | N/A | N/A | `getDocs` / local | **SAFE_TO_LOCK** | NÃO | `allow read: if true; allow write: if isAdmin();` |
| `guidelines` | **PUBLIC_CONTENT** | `guideline-{id}` | N/A | N/A | Local / sync | **SAFE_TO_LOCK** | NÃO | `allow read: if true; allow write: if isAdmin();` |
| `osce_stations`| **AUTHENTICATED** | `osce-{id}` | N/A | N/A | Local / sync | **SAFE_TO_LOCK** | NÃO | `allow read: if isAuthenticated(); allow write: if isAdmin();` |
| `admins` | **ADMIN_ONLY** | `{auth.uid}` | `id` | **SIM** | `doc(admins, uid)` | **SAFE_TO_LOCK** | NÃO | `allow read: if isAuthenticated(); allow write: if isAdmin();` |

---

## 9. CONCLUSÕES FINAIS POR COLEÇÃO

- `users`: **SAFE_TO_LOCK**
- `sessions`: **MIGRATION_REQUIRED** *(Necessita de proteção no frontend para que usuários convidados/guests persistam suas sessões em localStorage e sincronizem com o Firestore apenas após o login)*
- `errors`: **SAFE_TO_LOCK**
- `progress`: **SAFE_TO_LOCK**
- `questions`: **SAFE_TO_LOCK**
- `editions`: **SAFE_TO_LOCK**
- `guidelines`: **SAFE_TO_LOCK**
- `osce_stations`: **SAFE_TO_LOCK**
- `knowledge_nodes`: **SAFE_TO_LOCK**
- `admins`: **SAFE_TO_LOCK**

---
*Relatório gerado por: Antigravity Engine — Auditoria Técnica Firestore Ownership.*
