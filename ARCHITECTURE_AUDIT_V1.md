# ARCHITECTURE_AUDIT_V1.md
# StaziaMed Revalida — Auditoria Técnica Completa
**Data:** 2026-09-03  
**Auditor:** Antigravity Engine  
**Status:** READ-ONLY. Nenhum arquivo foi modificado.

---

## A. ARQUITETURA REAL ENCONTRADA

```
STACK TÉCNICA
├── Runtime: Node.js v24 / macOS (Portable SSD)
├── Frontend: React 19 + Vite 6 + TypeScript 5.8 + TailwindCSS 4
├── Backend: Express 4 (server.ts) servindo o Vite em dev
├── Banco de Dados: Cloud Firestore (staziamed-revalida-prod / southamerica-east1)
├── Auth: Firebase Auth (Google OAuth, Email/Password, Anônimo, Guest)
├── Storage: Firebase Storage (buckets: questions-images/, source-pdfs/)
├── IA (Backend): Claude Sonnet/Opus (Anthropic/Vertex AI) + Gemini (Google AI)
├── IA (Proxy): Todas as chamadas de IA passam por /api/ai/generate — SEM chaves no frontend
├── Imagens Clínicas: /public/images/{ano_edicao}/ servido localmente pelo Vite
├── Estado Global: AppContext.tsx (Context API) + localStorage (StorageService)
└── Dados: Dual-source — Firestore (cloud) + LocalStorage (fallback offline)
```

---

## B. ROTAS

### Mapeamento Completo via routeMapping.ts + App.tsx

| Rota URL | Tab Interna | Componente Principal |
|---|---|---|
| `/` | `home` | `DashboardView` |
| `/estudar` | `estudar` | `EstudarView` |
| `/estudar/plano-hoje` | `estudar-plano-hoje` | `EstudarView (sub: PLANO_HOJE)` |
| `/estudar/aulas` | `estudar-aulas` | `EstudarView (sub: AULAS)` |
| `/estudar/grandes-temas` | `estudar-grandes-temas` | `EstudarView (sub: GRANDES_TEMAS)` |
| `/estudar/materiais` | `estudar-materiais` | `EstudarView (sub: MATERIAIS)` |
| `/praticar/questoes` | `praticar-questoes` | `PraticarView → QuestionsView → StudentQuestionsGeneratorView` |
| `/praticar/simulados` | `praticar-simulados` | `PraticarView → SimuladosHubView` |
| `/praticar/provas-completas` | `praticar-provas` | `PraticarView → ProvasCompletasView → FullExamSelectorView + InepPrintableExam` |
| `/praticar/questoes-ia` | `praticar-questoes-ia` | `PraticarView → QuestoesIAView` |
| `/revisar/flashcards` | `revisar-flashcards` | `RevisarView → SpacedReviewView` |
| `/revisar/erros` | `revisar-erros` | `RevisarView → ErrorNotebookView` |
| `/revisar/atualizacoes` | `revisar-atualizacoes` | `RevisarView → ProtocolUpdatesHubView` |
| `/revisar/radar` | `revisar-radar` | `RevisarView → GroundedGuidelineRadarView` |
| `/revisar/audio` | `revisar-audio` | `RevisarView → AudioReviewView` |
| `/planejamento` | `planejamento` | `PlanejamentoView → AdaptiveCalendarView` |
| `/desempenho` | `desempenho` | `DesempenhoView` |
| `/tutor-ia` | `tutor-ia` | `TutorIaView` |
| `/osce` | `osce` | `UnifiedOsceView` |
| `/admin` | `admin` | `AdminEditorialView` |
| `/profile` | `profile` | `ProfileSettingsView` |
| `/export` | `export` | `DataExportView` |

### Detalhamento de Rotas Críticas do Praticar

#### `/praticar/questoes`
- **Componente:** `QuestionsView` → `StudentQuestionsGeneratorView`
- **Hooks usados:** `useApp()`, `useNavigate()`
- **Contextos:** `AppContext` (questions, attempts, recordQuestionAttempt, user)
- **Serviços externos:** `AiService.generateTutorResponse()` via `/api/ai/generate`
- **Firestore:** `questions` (leitura via syncQuestionsFromFirestore), `errors` (escrita via recordErrorAutopsy), `sessions` (escrita)

#### `/praticar/simulados`
- **Componente:** `SimuladosHubView`
- **Hooks:** `useApp()`
- **Contextos:** `AppContext` (questions, attempts, user)
- **Serviços externos:** Nenhum externo direto
- **Firestore:** `sessions` (leitura e escrita), `questions` (leitura)

#### `/praticar/provas-completas`
- **Componentes:** `ProvasCompletasView` → `FullExamSelectorView` + `ActiveSessionResolutionView` + `InepPrintableExam`
- **Hooks:** `useApp()`
- **Contextos:** `AppContext` (questions, user, firebaseUser)
- **Serviços externos:** `window.print()` nativo do browser
- **Firestore:** `questions` (leitura filtrada por examEdition), `editions` (leitura via inventoryValidatorService)
- **Imagens:** Renderiza tags `[IMAGEM: filename]` mapeando para `/public/images/{edicao}/`

#### `/praticar/questoes-ia`
- **Componente:** `QuestoesIAView` → `QuestionAuditLab` / `ReverseEngineeringFlow`
- **Hooks:** `useApp()`
- **Contextos:** `AppContext` (addGeneratedQuestion)
- **Serviços externos:** `AiService.generate()` → `/api/ai/generate` (backend proxy)
- **Firestore:** `questions` (escrita via addBatchQuestions / BookletIngestionModal)

---

## C. COLEÇÕES FIRESTORE

### Coleções CONFIRMADAS no código

| Coleção | Lida em | Escrita em | ID Pattern |
|---|---|---|---|
| `questions` | `firebaseService.ts`, `syncQuestionsFromFirestore`, `inventoryValidatorService.ts`, `BookletIngestionModal.tsx`, `BatchQuestionExtractorModal.tsx` | `firebaseService.ts (saveQuestion, importAllData)`, `BookletIngestionModal.tsx`, `BatchQuestionExtractorModal.tsx`, `inventoryValidatorService.ts` | `REV-{ANO}.{ED}-Q{NUM}` |
| `users` | `firebaseService.ts (getUserProfile)` | `firebaseService.ts (saveUserProfile)` | Firebase Auth UID |
| `users/{uid}/usage/{date}` | Regras permitem | `quotaMiddleware.ts (server)` | `users/{uid}/usage/YYYY-MM-DD` |
| `sessions` | `firebaseService.ts (getUserSessions)` | `firebaseService.ts (saveTrainingSession)` | UUID gerado no cliente |
| `progress` | `firebaseService.ts (getUserLatestProgress, getWeeklyBulletin)` | `firebaseService.ts (saveUserProgress, saveWeeklyBulletin)` | `progress_{userId}`, `bulletin_{userId}` |
| `errors` | `firebaseService.ts (getUserErrorAutopsies)` | `firebaseService.ts (recordErrorAutopsy)` | `err_{attemptId}` |
| `editions` | `inventoryValidatorService.ts` | `inventoryValidatorService.ts` | Ex: `CAD-01-AZUL-2026-1` |
| `guidelines` | `firebaseService.ts (importAllData)` | `firebaseService.ts (importAllData)` | Ex: `guideline-pce-2025` |
| `osce_stations` | `firebaseService.ts (importAllData)` | `firebaseService.ts (importAllData)` | Ex: `osce-01-pec` |
| `knowledge_nodes` | `firebaseService.ts (importAllData)` | `firebaseService.ts (importAllData)` | Ex: `node-cm-sca` |
| `admins` | `firestore.rules (isAdmin check)` | Admin SDK apenas | Firebase Auth UID |
| `_health_check` | `firebase.ts (testFirestoreConnection)` | `firebase.ts` | `connection` |

### Coleções ESPERADAS mas NÃO encontradas no código
- `question_attempts` — **NÃO EXISTE** no Firestore; tentativas são salvas em `localStorage` (StorageService)
- `training_sessions` — **NÃO EXISTE** com esse nome; o nome real é `sessions`
- `flashcards` — **NÃO EXISTE** no Firestore; flashcards são salvos apenas em `localStorage`
- `study_plans` — **NÃO EXISTE** no Firestore; planos são salvos em `localStorage`

---

## D. MODELO ATUAL DE Question

### Campos Obrigatórios (TypeScript)
```typescript
id: string                          // Ex: "REV-2026.1-Q1"
canonicalQuestionId: string         // Deduplicação entre cadernos
questionFingerprint: string         // Hash das primeiras 100 palavras
code: string                        // Ex: "REV-2026.1-Q1"
origin: QuestionOrigin              // "INEP_OFICIAL" | "INEDITA" | "AI_GENERATED" | ...
area: MedicalArea                   // "CLINICA_MEDICA" | "CIRURGIA_GERAL" | "PEDIATRIA" | ...
topic: string
subtopic: string
competencyId: string
competencyDescription: string
difficulty: "FACIL" | "MEDIO" | "DIFICIL"
clinicalCase: string                // Texto integral do enunciado
options: QuestionOption[]           // Array de 4 alternativas A,B,C,D
correctAnswer: "A"|"B"|"C"|"D"
answerFinal: "A"|"B"|"C"|"D"|"ANNULLED"
officialStatus: "valid"|"annulled"|"changed_after_appeal"|"pending_validation"
extractionConfidence: "HIGH"|"MEDIUM"|"LOW"
keyFinding: string
expectedConduct: string
inepIntent: string
sources: QuestionSource[]
stats: { totalAttempts, successRate, averageTimeSeconds }
```

### Campos Opcionais relevantes
```typescript
images?: QuestionImage[]            // Imagens médicas vinculadas
examYear?: number                   // Ex: 2026
examEdition?: string                // Ex: "Revalida INEP 2026/1 — Caderno 01"
originalNumber?: number             // Número no caderno original
itemCode?: string                   // "ITEM 169056 - V. 941166"
```

### ⚠️ INCONSISTÊNCIA CRÍTICA — QuestionImage

O tipo TypeScript `QuestionImage` define:
```typescript
export interface QuestionImage {
  file: string;           // campo "file"
  caption?: string;
  position: "after_stem" | "in_option" | "clinical_exam";
  originalPage: number;
  url?: string;
}
```

Mas os componentes `ActiveSessionResolutionView.tsx` e `InepPrintableExam.tsx` acessam campos **não declarados no tipo**:
- `img.relativePath`  ← NÃO EXISTE em QuestionImage
- `img.filename`      ← NÃO EXISTE em QuestionImage

Os documentos do Firestore (inseridos pelo script de upload) contêm `url`, `caption` e `filename`, mas **não `file`, `position`, `originalPage`** — que são os campos canônicos do TypeScript. Há ruptura entre tipo TypeScript e dados reais no Firestore.

---

## E. MODELO ATUAL DE UserProfile

### Campos Principais
```typescript
id: string                          // Firebase Auth UID
name: string
email: string
graduationCountry: string
graduationUniversity: string
graduationYear: number
targetEdition: string
examDate: string
role: "STUDENT" | "EDITOR" | "ADMIN"
tier: "TRIAL" | "EXPIRED" | "FREE" | "PRO" | "PRO_PLUS" | "ADMIN"
plan?: "trial" | "expired" | "pro" | "pro_plus" | "admin"
trialStartedAt?: string
trialEndsAt?: string
subscriptionExpiresAt?: string
isOnboardingCompleted: boolean
studyStreakDays: number
totalQuestionsSolved: number
overallReadiness: number            // 0-100
projectedPassScoreMin: number
projectedPassScoreMax: number
weakAreas: MedicalArea[]
dailyStudyMinutes: number
availableDaysPerWeek: number
```

---

## F. APPCONTEXT

### Responsabilidades Mapeadas

#### Autenticação
- `firebaseUser`, `isAuthLoading`, `isGuestMode`, `isGoogleProvider`, `isEmailVerified`
- `signInWithGoogle`, `signInWithEmail`, `signUpWithEmail`, `signInAnonymously`
- `enterGuestMode`, `exitGuestMode`, `logout`
- `resendVerificationEmail`, `reloadUserAuth`, `sendPasswordReset`

#### Dados do Servidor / Sincronização
- `syncQuestionsFromFirestore()` — baixa todas as questões do Firestore
- `saveSessionToFirestore()` — persiste sessão de estudo na nuvem
- `updateErrorAutopsyReflection()` — atualiza autópsia de erro

#### Estado de UI
- `activeTab`, `setActiveTab` — navegação entre seções
- `isStudyForMeOpen`, `isExamConfigOpen`, `isOnboardingOpen`, `isWhatIfOpen`
- `isSubscriptionModalOpen`, `isOfficialSearchOpen`, `officialSearchQuery`
- `selectedOSCEId`, `isDarkMode`, `addToast`

#### Sessões / Questões
- `questions` (array completo em memória, ~300+ questões)
- `activeQuestionIndex`, `questionFilterArea`, `questionFilterYear`, `questionFilterStatus`, `questionFilterOrigin`
- `questionMode` ("STUDY"|"EXAM"|"PRESSURE"|"DUEL")
- `recordQuestionAttempt()`, `addGeneratedQuestion()`, `addBatchQuestions()`

#### Progresso
- `attempts` (histórico local de respostas)
- `osceAttempts`, `knowledgeGraph`, `flashcards`
- `todayMission`, `readinessData`
- `updateFlashcardScore()`, `generateCustomStudySession()`, `refreshMissionTask()`

#### Desempenho
- `readinessData` — calculado via `AdaptiveEngine.calculateReadiness()`

#### Planejamento / Editorial
- `editionsInventory`, `guidelines`, `guidelineAlerts`, `guidelineAuditLogs`
- `approveGuidelineAlert()`, `approveIneditaQuestion()`, `rejectIneditaQuestion()`, `editIneditaQuestion()`

### Responsabilidades candidatas a migrar para TanStack Query (NÃO REFATORAR AGORA)
- `syncQuestionsFromFirestore` → `useQuery(['questions'])`
- `saveSessionToFirestore` → `useMutation`
- `getUserSessions` → `useInfiniteQuery`
- `readinessData` → `useQuery(['readiness', userId])`
- `flashcards` → `useLocalStorage hook` separado

---

## G. CHAMADAS IA

### Backend (server.ts e /server/ai/)

| Arquivo | Provedor | Modelo | Variável de Ambiente | Endpoint | Chave no Frontend? |
|---|---|---|---|---|---|
| `server/ai/modelRouter.ts` | Anthropic / Vertex AI | claude-sonnet-5, claude-opus-5 | `ANTHROPIC_API_KEY`, `ANTHROPIC_VERTEX_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` | `/api/ai/generate` | ❌ Não |
| `server/ai/claudeVertexClient.ts` | Anthropic via Vertex AI | claude-sonnet | `ANTHROPIC_VERTEX_PROJECT_ID`, `CLOUD_ML_REGION` | Vertex AI REST | ❌ Não |
| `server.ts` (getGenAI) | Google AI | Gemini 3.7 Flash | `GEMINI_API_KEY` | Google GenAI SDK | ❌ Não |
| `server/ai/questionAuditPipeline.ts` | Anthropic + Google | Sonnet + Gemini | `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | `/api/ai/audit` | ❌ Não |
| `server/ai/voiceTutor.ts` | Anthropic / Google | Claude/Gemini | Herdadas | `/api/voice-tutor` | ❌ Não |
| `server/ai/functionCalling.ts` | Google AI | Gemini | `GEMINI_API_KEY` | `/api/agent` | ❌ Não |
| `server/ai/officialMedicalSearch.ts` | Google AI | Gemini (Grounding) | `GEMINI_API_KEY` | `/api/ai/search` | ❌ Não |

### Frontend (src/)

| Arquivo | Chamada | Endpoint | Chave no Frontend? |
|---|---|---|---|
| `src/services/aiService.ts` | `AiService.generate()` | `/api/ai/generate` (PROXY) | ❌ Não — proxy seguro |
| `src/services/aiService.ts` | `fetchRadarUpdates()` | `/api/radar/updates` | ❌ Não |
| `src/services/questionFactoryService.ts` | `AiService.generate()` | `/api/ai/generate` | ❌ Não |
| `src/services/batchQuestionExtractor.ts` | Via endpoint backend | `/api/ai/extract` | ❌ Não |

### ✅ CONCLUSÃO SEGURANÇA IA
**Nenhuma chave de IA é exposta ao frontend.** Todas as chamadas passam pelo proxy Express em `/api/ai/generate`. A Firebase API Key (usada para Auth/Firestore, não IA) é pública por design e protegida pelas Security Rules.

---

## H. IMAGENS

### Estrutura em /public/images/

```
public/images/
├── 2025_1/                         ← Provas INEP 2025/1 (imagens médicas)
│   ├── q4_img6.png   (446 KB)      ← Imagem real (ECG, etc)
│   ├── q79_img5.jpeg (172 KB)
│   └── q100_img5.png (31 KB)
├── 2025_2/                         ← Provas INEP 2025/2
│   ├── q5_img0.jpeg  (181 KB)      ← Imagem real
│   ├── q58_img0.jpeg (305 KB)
│   ├── q91_img0.jpeg (283 KB)
│   └── q100_img0.jpeg (412 KB)
├── 2026_1/                         ← Provas INEP 2026/1
│   ├── q5_img0.jpeg  (15 KB)       ← Lesão larva migrans
│   ├── q11_img0.png  (34 KB)       ← Partograma
│   ├── q27_img0.png  (31 KB)       ← Diagrama dengue
│   └── q67_img0.jpeg (22 KB)       ← TC abdome
└── page{N}_img{N}.jpeg             ← ⚠️ IMAGENS ÓRFÃS (não mapeadas a questões)
```

### Componentes que dependem dessas URLs

| Componente | Como Acessa |
|---|---|
| `InepPrintableExam.tsx` | `[IMAGEM: filename]` tag no clinicalCase → `img.url || /${img.relativePath}` |
| `ActiveSessionResolutionView.tsx` | Mesmo parsing regex `[IMAGEM: ...]` |
| `src/data/revalida2026_1Part1.ts` | URL hardcoded `/images/2026_1/q5_img0.jpeg` |

### ⚠️ PROBLEMAS

1. **Imagens Órfãs:** `public/images/page{N}_img{N}.jpeg` — cerca de 27 imagens na raiz da pasta sem associação a questões específicas.
2. **Campo inconsistente:** O tipo `QuestionImage` usa `file` (string), mas os componentes acessam `filename` e `relativePath`, que são campos extras não declarados no tipo TypeScript.

---

## I. FIREBASE SECURITY

### firestore.rules — Análise

```
questions:  allow read: if true;  ← Leitura pública
questions:  allow write: if isAdmin(); ← Escrita apenas para admins

users:      allow read: if true;  ← ⚠️ HIGH RISK — Leitura de qualquer usuário é pública
users:      allow create: if isOwner || isAdmin
users:      allow update: if isOwner || isAdmin (com proteção de role e tier)
users:      allow delete: if isOwner || isAdmin

sessions:   allow read: if true;  ← ⚠️ HIGH RISK — Sessões de treino de qualquer usuário são públicas
errors:     allow read: if true;  ← ⚠️ HIGH RISK — Autópsias de erro de qualquer usuário são públicas
progress:   allow read: if true;  ← ⚠️ HIGH RISK — Progresso de qualquer usuário é público
guidelines: allow read: if true; write: if isAdmin ← OK (conteúdo público)
admins:     allow read: if isAuthenticated; write: if isAdmin ← OK
```

### ⚠️ Riscos de Segurança em firestore.rules

| Risco | Nível | Detalhe |
|---|---|---|
| `users` read public | HIGH | Qualquer pessoa pode ler dados de qualquer aluno (nome, email, score, tier, datas) |
| `sessions` read public | HIGH | Histórico de simulados de qualquer aluno é legível por qualquer pessoa |
| `errors` read public | HIGH | Caderno de erros de qualquer aluno é público |
| `progress` read public | HIGH | Progresso e score de qualquer aluno é público |
| `sessions` sem validação owner na leitura | HIGH | Qualquer usuário pode ler sessões de outro |
| `questions` read public | LOW | Aceitável para conteúdo educacional |

### storage.rules — Análise
```
questions-images/: read public, write admin ← OK
source-pdfs/:      read public, write admin ← Potencial leak de PDFs oficiais (baixo risco)
/*:                read/write false ← ✅ Bloqueio correto como fallback
```

---

## J. DEPENDÊNCIAS

### package.json — Produção

| Dependência | Versão | Uso Real |
|---|---|---|
| `react` | ^19.0.1 | Core |
| `react-dom` | ^19.0.1 | Core |
| `react-router-dom` | ^7.18.3 | Roteamento |
| `firebase` | ^12.18.0 | Auth, Firestore (client SDK) |
| `firebase-admin` | ^14.3.0 | Admin SDK (server.ts, scripts de upload) |
| `@google/genai` | ^2.4.0 | Gemini (BACKEND apenas) |
| `@anthropic-ai/sdk` | ^0.123.0 | Claude direto (BACKEND) |
| `@anthropic-ai/vertex-sdk` | ^0.19.6 | Claude via Vertex AI (BACKEND) |
| `express` | ^4.21.2 | Servidor HTTP |
| `recharts` | ^3.10.1 | Gráficos de desempenho |
| `lucide-react` | ^0.546.0 | Ícones |
| `motion` | ^12.23.24 | Animações (Framer Motion) |
| `dotenv` | ^17.2.3 | Variáveis de ambiente |
| `vite` | ^6.2.3 | Bundler |
| `tailwindcss` | ^4.1.14 | CSS utilitário |

### Dependências Ausentes / Notáveis
- ❌ **Sem biblioteca PDF:** Impressão feita via `window.print()` nativo — sem jsPDF, pdfmake ou similar
- ❌ **Sem TanStack Query:** Estado de servidor gerenciado manualmente no AppContext
- ❌ **Sem Zustand/Jotai:** Único estado global via Context API (risco de re-renders)
- ❌ **Sem framework de testes:** Nenhum Vitest, Jest ou Testing Library instalado

---

## K. RISCOS CRÍTICOS

| ID | Risco | Nível | Detalhe |
|---|---|---|---|
| R01 | `users`, `sessions`, `errors`, `progress` com leitura pública | **CRITICAL** | Dados pessoais de alunos (email, nome, score, histórico de erros) são legíveis por qualquer pessoa com acesso ao projeto Firebase |
| R02 | `QuestionImage.filename` e `.relativePath` não declarados no tipo TypeScript | **HIGH** | Os componentes acessam campos não-tipados que existem nos dados do Firestore mas não no tipo. Qualquer refactoring do tipo quebrará silenciosamente a renderização de imagens |
| R03 | Imagens clínicas servidas pelo Vite dev server local | **HIGH** | Em produção, `/public/images/` não está mapeado para nenhum CDN. Se o Vite não estiver rodando, todas as imagens quebram |
| R04 | `public/images/page{N}_img{N}.jpeg` órfãs | **MEDIUM** | 27 imagens sem mapeamento a questões específicas no diretório raiz de imagens |
| R05 | AppContext com 40+ responsabilidades | **HIGH** | Qualquer mudança num item (ex: user auth) pode causar re-render de toda a árvore React. Performance degrada com 300+ questões em memória |
| R06 | Sem testes automatizados | **HIGH** | Zero testes no código da aplicação (src/). Qualquer migração é feita às cegas |
| R07 | `firebase-applet-config.json` contém a API Key do Firebase | **MEDIUM** | É normal a Firebase Web API Key ser pública. O risco é se não houver App Check ou restrições por domínio no Console do Firebase |
| R08 | Dual-source data (LocalStorage + Firestore) sem sincronização bidirecional confiável | **HIGH** | Dados podem divergir entre dispositivos. Tentativas (attempts) ficam apenas no localStorage |
| R09 | `BookletIngestionModal.tsx` e `BatchQuestionExtractorModal.tsx` podem escrever em `questions` diretamente do cliente | **HIGH** | A escrita do cliente na coleção `questions` exige role=ADMIN, mas não há validação dos campos escritos (schema-less) |

---

## L. RISCOS DE MIGRAÇÃO

| ID | Risco | Nível | Impacto |
|---|---|---|---|
| M01 | AppContext tem 40+ consumidores — qualquer split causará tree-shaking de dependências | **HIGH** | Componentes como DashboardView, ProfileSettingsView, SpacedReviewView podem quebrar se AppContext for dividido |
| M02 | `questions` array em memória (300+ itens) — migrar para paginação Firestore exige refactoring de todos os filtros | **HIGH** | Filtros atuais usam `.filter()` JavaScript em memória. Query Firestore precisa de índices compostos |
| M03 | Imagens clínicas com URLs hardcoded no Firestore | **HIGH** | URLs como `/images/2025_1/q79_img5.jpeg` são relativas ao servidor local. Em produção (Firebase Hosting ou CDN), o path muda |
| M04 | LocalStorage como source-of-truth para tentativas e flashcards | **HIGH** | Migrar para Firestore requer criar coleções `question_attempts` e `flashcards`, e tratar dados legados do localStorage |
| M05 | `revalida2026_1Part1.ts` com dados estáticos | **MEDIUM** | Se as questões do Firestore divergirem do arquivo estático, a `StorageService.getQuestions()` pode sobrepor dados do Firestore |
| M06 | Nenhum versionamento de schema Firestore | **MEDIUM** | Não há campo `schemaVersion` nos documentos. Migrações futuras não têm rollback seguro |
| M07 | `sessions` read sem validação de owner | **MEDIUM** | Na migração v2, se as rules forem corrigidas, sessões salvas sem userId correto quebrarão a leitura |

---

## M. ARQUIVOS QUE NÃO DEVEM SER ALTERADOS SEM TESTES

| Arquivo | Por quê |
|---|---|
| `src/context/AppContext.tsx` | Controla toda a árvore de estado. Quebras não são detectadas sem testes de integração |
| `src/services/firebaseService.ts` | Todas as escritas no Firestore passam aqui. Bug = perda de dados de usuários |
| `src/services/storageService.ts` | Todos os dados locais passam aqui. Bug = perda de tentativas e flashcards |
| `src/lib/firebase.ts` | Inicialização do Firebase. Erro aqui = app não carrega |
| `firestore.rules` | Erro aqui = dados expostos ou app inacessível |
| `src/components/questions/InepPrintableExam.tsx` | Renderização crítica de provas. Erro visual não é detectável sem comparação visual com PDF oficial |
| `src/components/questions/ActiveSessionResolutionView.tsx` | Lógica de resolução de questões. Erro aqui quebra o fluxo principal do produto |
| `src/services/aiService.ts` | Proxy de IA. Erro aqui = chamadas de IA param de funcionar para todos os usuários |
| `server.ts` | Servidor Express. Erro aqui = app inteiro cai |
| `server/ai/modelRouter.ts` | Roteamento de IA. Erro = falha silenciosa em todos os tutores |

---

## N. RECOMENDAÇÕES PARA ARQUITETURA V2

### Prioridade CRITICAL

1. **Corrigir Security Rules:** Mudar `allow read: if true` para `allow read: if isOwner(userId) || isAdmin()` em `users`, `sessions`, `errors`, `progress`.

### Prioridade HIGH

2. **Normalizar QuestionImage:** Adicionar `filename?: string` e `relativePath?: string` ao tipo TypeScript para refletir a realidade dos dados no Firestore.

3. **Mover imagens para Firebase Storage:** Substituir `/public/images/` por URLs do Firebase Storage com download tokens. Isso permite acesso de qualquer host de produção.

4. **Adicionar Vitest + React Testing Library:** Antes de qualquer migração, cobertura mínima dos fluxos de resolução de questão, simulado e autenticação.

5. **Criar coleção `question_attempts` no Firestore:** Migrar tentativas do localStorage para Firestore para suporte multi-dispositivo.

6. **Splittar AppContext:** Separar em 4 contextos menores: `AuthContext`, `QuestionsContext`, `UIContext`, `ProgressContext`.

### Prioridade MEDIUM

7. **TanStack Query para dados do servidor:** `questions`, `sessions`, `userProfile`, `errors` são candidatos naturais a `useQuery/useMutation`.

8. **Campo `schemaVersion` em documentos Firestore:** Facilita migrações futuras com rollback seguro.

9. **Limpar imagens órfãs:** `public/images/page{N}_img{N}.jpeg` precisam ser mapeadas ou deletadas.

10. **App Check no Firebase:** Proteger API Key pública com domínios autorizados e Firebase App Check.

---

*Relatório gerado por: Antigravity Engine em 2026-09-03 — Read-Only, nenhum arquivo foi alterado.*
