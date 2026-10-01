# ONBOARDING INTEGRATION & PERSISTENCE ARCHITECTURE AUDIT
**Etapa 1.24A — Onboarding Integration & Persistence Architecture Audit**
**Data:** 2026-09-04
**Modo:** `READ-ONLY / AUDITORIA`
**Classificação:** `ONBOARDING_INTEGRATION_ARCHITECTURE_AUDIT_COMPLETE`

---

## 1. Executive Summary & Required Metrics

AUTH_FLOW = FIREBASE_AUTH_SUBSCRIBER_TO_FIRESTORE_USER_PROFILE
USERPROFILE_CREATION_EXISTS = YES
USERPROFILE_CREATION_LOCATION = src/context/AppContext.tsx:397-414 (via src/services/firebaseService.ts:179-211)
FIRST_PROFILE_CREATION_DETECTABLE = YES
USER_CREATED_AT = ABSENT
LEGACY_USER_ACCIDENTAL_ONBOARDING_RISK = LOW
ABSENCE_OF_FIELD_MUST_NOT_FORCE_ONBOARDING = YES
ADMIN_ONBOARDING_BYPASS = YES
ADMIN_ROLE_SOURCE = FIRESTORE_USERS_COLLECTION_ROLE_FIELD
GUEST_MODE_MODEL = LOCALSTORAGE_FLAG_WITH_ANONYMOUS_MEMORY_SCOPE
AUTH_LOADING_FAIL_CLOSED = YES
PROFILE_LOADING_FAIL_CLOSED = PARTIAL
RECOMMENDED_ONBOARDING_STATUS_MODEL = EXPLICIT_ENUM_NOT_REQUIRED_REQUIRED_IN_PROGRESS_COMPLETED
VERSIONING_RECOMMENDED = YES
CURRENT_STEP_PERSISTENCE_RECOMMENDED = PARTIAL
RECOMMENDED_SAVE_STRATEGY = CHECKPOINT_SECTION_AND_FINAL_COMPLETION
RECOMMENDED_SOURCE_OF_TRUTH = FIRESTORE
LOCALSTORAGE_AS_ONBOARDING_AUTHORITY = NO
SELF_REPORTED_WEAK_AREAS_SEMANTICS = SELF_REPORTED_ONLY
EXAM_INTENT_SEPARATE_FROM_CANONICAL_EDITION = YES
DEMO_RESPONSE_MUST_REMAIN_NON_ACADEMIC = YES
CURRENT_ROOT_DESTINATION = / (DashboardView via NavTab "home")
RECOMMENDED_POST_ONBOARDING_DESTINATION = /
PROFILE_WRITE_MODEL = CLIENT_MERGED_UPDATE_ALLOWED_BY_FIRESTORE_RULES
LEGACY_BULK_MIGRATION_REQUIRED = NO
RACE_CONDITION_RISK = MEDIUM
RECOMMENDED_ROLLOUT_SEQUENCE = SCHEMA_DEFINITION_THEN_NEW_USER_INIT_THEN_PERSISTENCE_THEN_ROUTING_ACTIVATION
FILES_CHANGED = 0
PRODUCTION_CODE_CHANGED = NO
FIRESTORE_CHANGED = NO
AUTH_CHANGED = NO
ROUTES_CHANGED = NO
TESTS_CHANGED = NO
DEPLOY_PERFORMED = NO

---

## 2. Auditoria Detalhada do Fluxo de Autenticação & Perfil

### 2.1 Mapeamento Factual do Fluxo de Autenticação
1. **Trigger de Login:**
   - Google: [`signInWithGooglePopup()`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/lib/firebase.ts#L260-L272) em `src/lib/firebase.ts`.
   - Email/Senha: [`loginWithEmail()`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/lib/firebase.ts#L288-L301) ou [`registerWithEmail()`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/lib/firebase.ts#L304-L337).
2. **Auth State Listener:**
   - [`subscribeToAuthState()`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/lib/firebase.ts#L251-L257) encapsula `onAuthStateChanged(auth, callback)`.
   - Escutado em [`AppContext.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/context/AppContext.tsx#L333-L434).
3. **Resolução de UserProfile:**
   - Consulta: [`FirebaseService.getUserProfile(fbUser.uid)`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20%281%29/src/services/firebaseService.ts#L161-L177) executa `getDoc(doc(db, "users", userId))`.
   - **Caso `snap.exists() === true` (Usuário Existente):**
     - Sincroniza dados da nuvem (`cloudProfile`), calcula expiração de trial ou plano pago e atualiza `user` no React State e `StorageService.saveUserProfile`.
   - **Caso `snap.exists() === false` (Primeira Criação / Novo Usuário):**
     - Cria `newUserProfile` em `AppContext.tsx:397-414` com trial de 7 dias e grava via `FirebaseService.saveUserProfile(newUserProfile)`.

### 2.2 Criação do UserProfile
- **`USERPROFILE_CREATION_EXISTS = YES`**
- **Arquivo/Linha:** `src/context/AppContext.tsx:397-414` e `src/services/firebaseService.ts:179-211`.
- **Método Utilizado:** `setDoc(doc(db, "users", targetUid), payload, { merge: true })`.
- **Distinção de Primeiro Acesso:**
  - `snap.exists() === false` é a fronteira determinística onde o documento ainda não existe no Firestore.
  - Portanto, `FIRST_PROFILE_CREATION_DETECTABLE = YES`.

### 2.3 Status do Campo `createdAt`
- **Classificação:** `USER_CREATED_AT = ABSENT`.
- O schema atual de `UserProfile` e `UserProfileDoc` contém `updatedAt`, `trialStartedAt`, `planUpdatedAt`, mas NÃO possui um campo canônico `createdAt`.
- **Decisão Arquitetural:** O controle de onboarding NÃO deve depender de comparações frágeis de datas (ex: `createdAt == hoje`), mas sim de metadados explícitos de ciclo de vida (`onboarding.status`).

---

## 3. Backward Compatibility & Usuários Legados

### 3.1 O Princípio Fundamental de Fail-Safe
> [!IMPORTANT]
> `ABSENCE_OF_FIELD_MUST_NOT_FORCE_ONBOARDING = YES`
> Usuários antigos que já utilizam a plataforma possuem documentos em `/users/{uid}` sem o campo `onboarding`. A ausência desse campo **DEVE** ser interpretada como `NOT_REQUIRED` / `BYPASS`.

### 3.2 Avaliação de Risco
- **`LEGACY_USER_ACCIDENTAL_ONBOARDING_RISK = LOW`** (sob a regra acima).
- Se a regra fosse "campo ausente = precisa de onboarding", o risco seria **HIGH**, bloqueando todos os alunos existentes e administradores na próxima inicialização.
- Sob a política proposta, apenas novos perfis explicitamente inicializados com `onboarding.status = "REQUIRED"` serão direcionados ao onboarding.

---

## 4. Política para Administradores & Guest Mode

### 4.1 Bypass de Administrador
- **`ADMIN_ONBOARDING_BYPASS = YES`**
- **Fonte da Autoridade:** `user.role === "ADMIN"`, resolvido no Firestore a partir do documento autenticado `/users/{uid}`.
- As regras de segurança (`firestore.rules:16-22`) e o frontend (`AppContext.tsx`) já validam o role `ADMIN`.
- Administradores devem ser imediatamente liberados de qualquer barreira de onboarding.

### 4.2 Guest Mode (Modo Convidado)
- **`GUEST_MODE_MODEL = LOCALSTORAGE_FLAG_WITH_ANONYMOUS_MEMORY_SCOPE`**
- LocalStorage flag: `praxis_guest_mode === "true"`.
- `firebaseUser = null`.
- `guestId = guest_xxxxxxxx` isolado no escopo local.
- **Diretriz de Produto:** O Guest entra diretamente na plataforma para explorar o produto ou pode acessar a prévia visual sob demanda. Nenhuma resposta do Guest é gravada em Firestore ou associada a um UID autenticado.

---

## 5. Roteamento & Fail-Closed Loading

### 5.1 Diagnóstico do Loading Atual
- `AppRoot` em `src/App.tsx:315-347` renderiza o splash screen seguro (`Carregando ambiente seguro...`) enquanto `isAuthLoading === true`.
- No entanto, em `AppContext.tsx:342`, `setIsAuthLoading(false)` é invocado antes do término assíncrono do `await FirebaseService.getUserProfile(fbUser.uid)`.
- **Risco Identificado:** Durante alguns milissegundos, `firebaseUser` já está definido mas `user` ainda contém os dados do cache local anterior enquanto a chamada de rede ao Firestore está em trânsito.
- **Recomendação:** Para a futura etapa de integração de roteamento, o estado de carregamento do perfil deve ser síncrono ou explicitamente aguardado (`isProfileLoading`), garantindo um roteamento 100% fail-closed.

---

## 6. Proposta de Schema & Persistência

### 6.1 Modelo de Dados Recomendado (Design Only — Sem Implementação)

```typescript
// Sub-objeto dentro de /users/{userId}
export interface UserOnboardingMetadata {
  version: number; // 1
  status: "NOT_REQUIRED" | "REQUIRED" | "IN_PROGRESS" | "COMPLETED";
  startedAt?: string;   // ISO timestamp
  completedAt?: string; // ISO timestamp
  currentStep?: "WELCOME" | "ECOSYSTEM" | "EXPERIENCE" | "PERSONALIZE" | "PREVIEW" | "FINISH";
}

export interface UserPersonalizationMetadata {
  preparationStage: "COMECO" | "JA_ESTUDO" | "JA_FIZ_PROVAS" | "JA_PRESTEI_REVALIDA";
  dailyStudyAvailability: "ATE_1H" | "1_A_2H" | "2_A_4H" | "MAIS_4H" | "INDEFINIDO";
  studyDays: ("SEG" | "TER" | "QUA" | "QUI" | "SEX" | "SAB" | "DOM")[];
  variableRoutine: boolean;
  selfReportedWeakAreas: string[];
  dontKnowWeakAreas: boolean;
  examIntent: "PROXIMA" | "FUTURA" | "INDEFINIDO";
  submittedAt: string;
}
```

### 6.2 Classificação dos Campos de Personalização
| Campo | Tipo | Classificação | Justificativa |
|---|---|---|---|
| `preparationStage` | Enum | **A (Persistência)** | Contextualiza ritmo inicial |
| `dailyStudyAvailability` | Enum | **A (Persistência)** | Informa restrição de capacidade horária |
| `studyDays` | Array | **A (Persistência)** | Define dias planejáveis |
| `variableRoutine` | Boolean | **A (Persistência)** | Indica necessidade de flexibilidade |
| `selfReportedWeakAreas` | Array | **A (Persistência - Autopercepção)** | **NUNCA** tratado como PPS ou diagnóstico |
| `dontKnowWeakAreas` | Boolean | **A (Persistência)** | Evita hipóteses falsas sobre áreas |
| `examIntent` | Enum | **A (Persistência)** | Intenção temporal; separado de `examEdition` canônico |

---

## 7. Estratégia de Salvamento, Multi-Device & Resumo

### 7.1 Estratégia de Gravação
- **Recomendação:** `CHECKPOINT_SECTION_AND_FINAL_COMPLETION`.
- Gravação 1 (Checkpoint): Ao avançar da Tela 04 (Personalização), grava `personalization` e atualiza `onboarding.status = "IN_PROGRESS"`.
- Gravação 2 (Finalização): Ao clicar no CTA da Tela 06 ("Entrar na StaziaMed"), atualiza `onboarding.status = "COMPLETED"` e `onboarding.completedAt`.

### 7.2 Semântica Estrita de Conclusão
> [!NOTE]
> `ONBOARDING COMPLETED` significa exclusivamente:
> *"O aluno concluiu a jornada de orientação visual inicial e suas preferências declaradas foram salvas."*
> **NÃO** significa: criação de plano, cálculo de PPS, inicialização de FSRS, criação de tarefas de hoje ou previsão de aprovação.

---

## 8. Segurança & Autoridade de Escrita no Firestore

### 8.1 Análise das Firestore Rules Atuais
- Em `firestore.rules:167-180`:
  ```
  allow update: if isAdmin() || (
    isOwner(userId) &&
    isValidUser(request.resource.data) &&
    isAdministrativeFieldUnmodified()
  );
  ```
- A função `isAdministrativeFieldUnmodified()` bloqueia mutações em `role`, `tier`, `plan`, `subscriptionExpiresAt`, `trialStartedAt`, `trialEndsAt`, `planUpdatedAt`.
- **Conclusão:** Novos campos em `onboarding` e `personalization` **já são 100% permitidos** pelas regras de segurança vigentes para o proprietário autenticado (`isOwner(userId)`), sem necessidade de alterar as regras ou usar endpoints privilegiados.

---

## 9. Matriz de Cenários para Validação Futura

| Cenário | Condição Auth / Perfil | Comportamento Esperado |
|---|---|---|
| **Novo Aluno** | `snap.exists() === false` | Cria perfil com `onboarding.status = "REQUIRED"` → Redireciona para `/onboarding/welcome` |
| **Aluno Legado** | `snap.exists() === true` e sem campo `onboarding` | `onboarding.status` avaliado como `NOT_REQUIRED` → Acesso direto ao Dashboard (`/`) |
| **Aluno Onboarding Em Progresso** | `onboarding.status === "IN_PROGRESS"` | Retoma no checkpoint da jornada de onboarding |
| **Aluno Onboarding Concluído** | `onboarding.status === "COMPLETED"` | Acesso direto ao Dashboard (`/`) |
| **Admin** | `user.role === "ADMIN"` | Bypass total e imediato de onboarding |
| **Convidado (Guest)** | `isGuestMode === true` | Acesso direto ao Dashboard sem gravação de Firestore |
| **Carregamento (Loading)** | `isAuthLoading \|\| isProfileLoading` | Splash screen seguro (fail-closed) |
| **Logout Durante Onboarding** | `signOut()` acionado | Redireciona para `LoginView` com reset de estado efêmero |
| **Multi-Dispositivo** | Inicia no Device A, loga no Device B | Sincroniza estado `IN_PROGRESS` via Firestore |

---

## 10. Sequência Recomendada de Rollout (Sem Alterações no Momento)

1. **Fase A:** Adição dos tipos TypeScript (`UserOnboardingMetadata`, `UserPersonalizationMetadata`) sem ativar rotas.
2. **Fase B:** Inicialização de `onboarding.status = "REQUIRED"` apenas na ramificação de criação de novos perfis em `AppContext`.
3. **Fase C:** Conexão da persistência no fluxo visual existente (`personalize` → `finish`).
4. **Fase D:** Ativação do guard central de roteamento em `AppRoot` com fail-closed estrito.

---

## 11. Conclusão da Auditoria

A arquitetura do StaziaMed Revalida é sólida e perfeitamente compatível com uma transição suave e segura para o onboarding real de primeiro acesso:
- **Zero risco de regressão para usuários existentes** adotando `ABSENCE_OF_FIELD_MUST_NOT_FORCE_ONBOARDING = YES`.
- **Zero necessidade de migração em massa no Firestore**.
- **Regras de segurança atuais do Firestore já protegem os campos administrativos** e permitem a persistência dos metadados de onboarding pelo próprio usuário autenticado.
- **Nenhum código foi alterado nesta etapa de auditoria.**
