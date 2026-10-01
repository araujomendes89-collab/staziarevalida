# RELATÓRIO DE AUDITORIA DE ARQUITETURA — ETAPA 1.25B

## AUTH CAPABILITIES & PLAN CATALOG AUDIT

**Classificação:** `AUTH_CAPABILITIES_PLAN_CATALOG_AUDIT_COMPLETE`  
**Data:** 04 de setembro de 2026  
**Ambiente:** StaziaMed Revalida v1.0.0  
**Modo:** READ-ONLY / AUDITORIA (Zero alterações em código produtivo)

---

### 1. MATRIZ DE AUDITORIA OBRIGATÓRIA

| Parâmetro | Valor Auditado |
| :--- | :--- |
| `GOOGLE_AUTH_IMPLEMENTED` | **YES** |
| `EMAIL_PASSWORD_LOGIN_CODE_EXISTS` | **YES** |
| `EMAIL_PASSWORD_SIGNUP_CODE_EXISTS` | **YES** |
| `PASSWORD_RESET_CODE_EXISTS` | **YES** |
| `DISPLAY_NAME_UPDATE_CODE_EXISTS` | **YES** |
| `EMAIL_PASSWORD_PROVIDER_CONSOLE_STATUS` | **UNKNOWN** |
| `CURRENT_LOGIN_COMPONENT` | `src/components/auth/LoginView.tsx` |
| `NEW_USER_DETECTION_PROVIDER_AGNOSTIC` | **YES** |
| `USERPROFILE_DEFAULT_FIELDS` | `id`, `name`, `email`, `role: "STUDENT"`, `tier: "TRIAL"`, `plan: "trial"`, `trialStartedAt`, `trialEndsAt` (+7 dias), `isOnboardingCompleted: false`, `onboarding` |
| `ROLE_IS_AUTHORIZATION_CONCEPT` | **YES** (`STUDENT` \| `EDITOR` \| `ADMIN`) |
| `TIER_VALUES_IN_CODE` | `["TRIAL", "EXPIRED", "FREE", "PRO", "PRO_PLUS", "ADMIN"]` |
| `TIER_CURRENT_SEMANTICS` | Gating de recursos comerciais e inteligência artificial |
| `PLAN_FIELD_EXISTS` | **YES** (`UserProfile.plan`) |
| `PLAN_CATALOG_EXISTS` | **NO** |
| `PLAN_CATALOG_LOCATION` | `NOT_DEFINED` (UI estática em `PricingModal.tsx` e `PlanSelectionView.tsx`) |
| `PLAN_VALUES` | `["trial", "expired", "pro", "pro_plus", "admin"]` |
| `SUBSCRIPTION_MODEL_EXISTS` | **PARTIAL** |
| `CURRENT_SUBSCRIPTION_FIELDS` | `subscriptionExpiresAt`, `trialStartedAt`, `trialEndsAt`, `planUpdatedAt` |
| `TRIAL_CURRENTLY_ACTIVE_CONCEPT` | **YES** |
| `TRIAL_DURATION_DEFINED` | **YES** |
| `TRIAL_DURATION` | `7 days` |
| `PRICING_UI_EXISTS` | **YES** |
| `CURRENT_PRICING_VALUES` | `R$ 0` (Trial), `R$ 67/mês` (PRO), `R$ 119/mês` (PRO+ OSCE) |
| `CURRENT_PLAN_NAMES` | `["TRIAL 7 DIAS", "PRO", "PRO+ OSCE"]` / `["Plano Padrão", "Plano Completo"]` |
| `PAYMENT_PROVIDER_IMPLEMENTED` | **NONE** |
| `CHECKOUT_IMPLEMENTED` | **NO** |
| `NEW_USER_PLAN_FLOW_READINESS` | **PARTIAL** |
| `ACCOUNT_LINKING_IMPLEMENTED` | **NO** |
| `ACCOUNT_COLLISION_HANDLING` | Mensagens amigáveis de erro capturadas no LoginView |
| `PASSWORD_STORED_IN_FIRESTORE` | **NO** |
| `PASSWORD_STORED_IN_LOCALSTORAGE` | **NO** |
| `PASSWORD_STORED_IN_APP_STATE` | **NO** |
| `ROLE_CLIENT_CONTROLLED` | **NO** |
| `TIER_CLIENT_CONTROLLED` | **NO** |
| `PLAN_CLIENT_CONTROLLED` | **NO** |
| `SUBSCRIPTION_CLIENT_CONTROLLED` | **NO** |
| `ADMIN_SPECIAL_AUTH_FLOW_REQUIRED` | **NO** |
| `GUEST_PUBLIC_OPTION_EXISTS` | **YES** |
| `PROFILE_LOADING_FAIL_CLOSED` | **PARTIAL** |
| `RECOMMENDED_NEXT_ACTION` | **`IMPLEMENT_LOGIN_SIGNUP_FIRST_PLAN_LATER`** |

---

### 2. AUDITORIA DETALHADA POR COMPONENTE

#### 2.1. Provedor Google OAuth
- **Implementação:** [`src/lib/firebase.ts`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/lib/firebase.ts#L262-L272) exporta `signInWithGooglePopup()`, instanciando `GoogleAuthProvider` com `prompt: "select_account"` e disparando `signInWithPopup(auth, provider)`.
- **Integração de Estado:** [`src/context/AppContext.tsx`](file:///Volumes/PortableSSD/STAZIAMED%20REVALIDA/staziamed-revalida%20(1)/src/context/AppContext.tsx#L496-L499) fornece o método assíncrono `signInWithGoogle()`.
- **Detecção e Sessão:** O listener `subscribeToAuthState` captura a sessão do Firebase Auth e verifica `FirebaseService.getUserProfile(fbUser.uid)`.

#### 2.2. Provedor E-mail e Senha
- **Login:** `loginWithEmail(email, pass)` invoca `signInWithEmailAndPassword(auth, email, pass)`.
- **Cadastro:** `registerWithEmail(email, pass, displayName)` invoca `createUserWithEmailAndPassword(auth, email, pass)` e executa `updateProfile(user, { displayName })`.
- **Recuperação:** `resetPasswordWithEmail(email)` invoca `sendPasswordResetEmail(auth, email)`.
- **Verificação:** `sendUserEmailVerification()` gerencia o envio de confirmação de e-mail.
- **Configuração no Console:** Como o código do cliente não possui acesso às configurações internas do Firebase Console, o status remoto é auditado estritamente como **`UNKNOWN`**.

#### 2.3. Detecção de Novo Usuário e Criação de Perfil
- **Fluxo Agnóstico:** O pipeline `subscribeToAuthState` opera independentemente do provedor utilizado (`google.com` ou `password`).
- **Verificação:** Executa consulta a `FirebaseService.getUserProfile(uid)`.
- **Criação de Perfil:** Se o documento não existir, instancia o perfil padrão com `role: "STUDENT"`, `tier: "TRIAL"`, `plan: "trial"`, `trialStartedAt: nowIso`, `trialEndsAt: now + 7d`, `isOnboardingCompleted: false`.

#### 2.4. Segregação entre Autorização (Role) e Acesso Comercial (Tier / Plan)
- **Autorização:** `role` (`STUDENT`, `EDITOR`, `ADMIN`) define privilégios de sistema e acesso a ferramentas editoriais.
- **Acesso Comercial:** `tier` (`TRIAL`, `EXPIRED`, `FREE`, `PRO`, `PRO_PLUS`) e `plan` controlam limites de consultas de IA e acesso ao simulador OSCE.
- **Regras de Segurança (`firestore.rules`):** As funções `isUnprivilegedCreate` e `isAdministrativeFieldUnmodified` bloqueiam qualquer tentativa de escalação de privilégios ou alteração arbitrária de `role`, `tier`, `plan` ou datas de assinatura pelo cliente.

#### 2.5. Catálogo Comercial, Preços e Pagamentos
- **Catálogo:** Não há tabela de preços oficial em banco de dados ou integração com gateway de pagamento (Stripe, Mercado Pago, Asaas, PIX).
- **Pricing Modal:** Contém valores demonstrativos (`R$ 67/mês` e `R$ 119/mês`) que apenas simulam localmente a alteração do perfil do usuário.
- **PlanSelectionView:** Protótipo visual pós-cadastro em modo claro na rota `/auth/select-plan`, sem precificação arbitrária imposta.
- **Diretriz de Segurança:** `DO_NOT_IMPLEMENT_FAKE_PLAN_CATALOG` deve ser estritamente respeitada.

#### 2.6. Auditoria de Senhas e Segurança
- **Armazenamento:** Nenhuma senha é armazenada em Firestore, localStorage ou AppContext. As senhas trafegam apenas no estado efêmero do componente de formulário até a entrega segura à API do Firebase Auth.

---

### 3. RECOMENDAÇÃO E DECISÃO TÉCNICA

```text
DECISÃO RECOMENDADA: IMPLEMENT_LOGIN_SIGNUP_FIRST_PLAN_LATER
```

**Justificativa:**
A base de autenticação (Google, E-mail/Senha, Recuperação de Senha, Verificação e Proteção de Privilégios) encontra-se totalmente estruturada e segura. No entanto, o catálogo comercial e a contratação de gateways de pagamento dependem de definições de negócio ainda não consolidadas. A abordagem recomendada é consolidar e ativar o fluxo completo de entrada e autenticação primeiro, postergando o checkout comercial até que as credenciais e provedores de pagamento oficiais estejam definidos.

---

### 4. MÉTRICAS DE INTEGRIDADE E BASELINE

- **Arquivos Alterados:** `0` (Operação estritamente Read-Only)
- **Código de Produção Alterado:** `NO`
- **Testes Alterados:** `NO`
- **Auth Alterado:** `NO`
- **Firestore Alterado:** `NO`
- **Deploy Realizado:** `NO`
- **Status da Suíte:** `54/54` test files PASS (`447/447` testes)
- **Build de Produção:** `SUCCESS` (0 erros)
- **Console Errors:** `0`
