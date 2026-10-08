# Termo de Aceite obrigatório, cadastro com WhatsApp e aceite dos Tutores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aluno só usa o app novo depois de aceitar o Termo de Aceite e Uso v1.0 e informar o WhatsApp (no cadastro por e-mail, pelo Google ou numa tela de aceite), e só usa o Tutor depois do aceite do §34; a prova fica no banco, gravada só pelo servidor; Termo e Política ganham páginas públicas; os endereços do app antigo levam ao app novo.

**Architecture:** Uma migração cria `profiles.phone`, as versões vigentes e a tabela de aceites (escrita só por funções `security definer`, prova mantida após apagar a conta), estende o gatilho de cadastro, cria `app_accept_terms` e amplia `app_bootstrap`, `app_update_profile` e `app_export_my_data`. Uma segunda migração tranca as funções do Tutor sem o aceite do §34, e as rotas Express do Tutor recusam com o código `tutor_consent`. No app, `Root` serve as páginas públicas antes de qualquer lógica de sessão e mostra a tela de aceite antes de qualquer tela; cadastro, Minha conta e Tutor ganham os campos e o cartão.

**Tech Stack:** React (src/novo, design system em src/novo/ds), Express + TypeScript (server/tutor), migrações Postgres do Supabase (PGlite nos testes e no modo dev), Vitest + Testing Library, vercel.json.

**Spec:** `docs/superpowers/specs/2026-10-07-termo-aceite-cadastro-design.md` + decisão do dono (2026-10-07): a Política de Privacidade sai a atual, sem mudanças; o parágrafo do áudio (Termo §24) vem depois, antes da voz nova do Tutor.

## Global Constraints
- **Texto do Termo:** copiar sem mudar nada de `/Volumes/Samsung/STAZIAMED REVALIDA/StaziaMed Revalida/.superpowers/termo/termo-aceite-uso-v1.0-2026-10.md` para `src/novo/app/legal/termo-uso-v1.0.md`. SHA-256 obrigatório `21611cdab66939edeae1bef6c12c034b4660ea214a96ce116dbf9f1b119ee548` (2.545 palavras). Nunca editar o arquivo.
- **Política de Privacidade:** as mesmas palavras de `src/components/legal/PrivacyPolicyView.tsx` (inclusive as datas "04 de setembro de 2026"). Não mexer no arquivo antigo nem em `TermsOfUseView.tsx` (os testes antigos dependem deles).
- **Frase do §33 (exata):** "Declaro que li e compreendi os Termos de Aceite e Uso e a Política de Privacidade do StaziaMed Revalida e concordo com suas condições."
- **Frase do §34 (exata):** "Estou ciente de que os Tutores do StaziaMed Revalida utilizam Inteligência Artificial e podem cometer erros. Entendo que alguns perfis possuem linguagem informal, humor, ironia, cobrança e, quando selecionados por mim, podem utilizar expressões mais intensas ou palavrões dentro do contexto educacional." Caixa "Li e concordo", botão "Continuar".
- **Documentos e versões:** `termo_uso` → `1.0`; `tutor_ia` → `1.0`. **Origens:** `cadastro`, `google`, `tela_aceite`, `tutor`.
- **"Aluno"** (tela de aceite e cartão do Tutor valem): papel `student` **e** nenhuma linha em `ch_reviewer_areas`. Administrador, editor e revisor médico ficam dispensados. Calculado pelo servidor a cada abertura.
- **WhatsApp (spec §5.3):** seletor começa em +55; lista: Brasil +55, Argentina +54, Bolívia +591, Chile +56, Colômbia +57, Cuba +53, Equador +593, Espanha +34, Estados Unidos +1, Paraguai +595, Peru +51, Portugal +351, Uruguai +598, Venezuela +58 e "Outro" (a pessoa digita o código). Brasil: DDD (2 dígitos) + 8 ou 9 dígitos, zero antes do DDD retirado; outros: 6 a 13 dígitos depois do código. Aceita espaços, parênteses e traços. Guardado como `+` e de 8 a 15 dígitos, primeiro de 1 a 9 (`^\+[1-9][0-9]{7,14}$`).
- **Prova:** sem endereço de internet (IP); navegador até 300 caracteres; `email_hash` = SHA-256 em hexadecimal de `lower(btrim(email))`; ao apagar a conta, `user_id` vira nulo e o resto fica.
- **A criação da conta nunca pode falhar** por causa da parte nova do gatilho.
- **Funções só do servidor:** helpers e `ch_worker_*` com `revoke execute … from public, anon, authenticated` (funções novas nascem executáveis por todos). O app só chama `app_*` com argumentos `p_*`.
- **Migrações:** `supabase/migrations/20261003005300_termo_aceite.sql` e `supabase/migrations/20261003005400_tutor_aceite.sql`. Toda redefinição parte da última definição existente (`grep -n "function public.<nome>" supabase/migrations/*.sql | tail -1`), sem perder campos nem regras.
- **Mensagens (pt-BR):** as do spec §11; as novas estão nas tarefas, texto exato.
- **Visual:** cadastro e tela de aceite com as classes da nova tela de login (`src/novo/app/auth/login.css`); o resto com componentes do design system.
- **Testes e commits:** `npx vitest run <arquivos> --maxWorkers=1`; commits em português sem acentos terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `git add` só de caminhos explícitos.
- **Fora:** mudar a Política, guardar IP, WhatsApp em Administração › Usuários, retirar o aceite do Tutor, trancar no servidor o que não é Tutor.

## Review Focus
1. **Confirmação de e-mail ligada no Supabase** (sem sessão depois do cadastro): aceite e WhatsApp só chegam pelos metadados do cadastro, pelo gatilho; a pessoa entra depois sem ver a tela de aceite. Teste na Tarefa 1 (insere `auth.users` com metadados, sem sessão).
2. **Volta do Google depois de 30 min, em outro aparelho ou com versão velha:** a tela de aceite pede a caixa normalmente. Teste na Tarefa 8.
3. **WhatsApp digitado de vários jeitos** (espaços, parênteses, traços, `0` antes do DDD, `+55` dentro do número, tamanhos de outros países): normaliza ou mostra o erro no campo. Testes na Tarefa 5.
4. **Termo atualizado com a tela aberta:** o servidor recusa a versão velha; a tela recarrega o texto e pede o aceite de novo. Testes nas Tarefas 1 e 8.
5. **Papel muda** (editor vira aluno; revisor perde as áreas): tela de aceite e cartão do Tutor passam a valer na próxima abertura; equipe e revisor nunca veem. Testes nas Tarefas 2 e 3.

## Arquivos
| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261003005300_termo_aceite.sql` | telefone, versões, aceites, gatilho, `app_accept_terms`, bootstrap, perfil, exportação |
| `supabase/migrations/20261003005400_tutor_aceite.sql` | trava do §34 nas funções do Tutor |
| `server/tutor/{engine,realtime,speech,router}.ts` | recusa `tutor_consent` nas rotas do Tutor |
| `src/novo/data/{backend,supabaseBackend,devServerBackend,localCore,localBackend}.ts`, `server/devDb/router.ts` | cadastro leva WhatsApp, versão do termo e navegador |
| `src/novo/app/session.jsx` | `acceptTerms` |
| `src/novo/app/legal/` (novo) | textos, páginas públicas, tela de aceite, campo de WhatsApp, janela do documento, aceite do Google |
| `src/novo/app/AuthScreens.jsx`, `auth/LoginScreen.jsx`, `auth/login.css` | cadastro novo e links |
| `src/novo/app/App.jsx` | páginas públicas e tela de aceite no `Root` |
| `src/novo/app/account/AccountScreen.jsx` | WhatsApp e aceites |
| `src/novo/app/tutor/{TutorConsentCard.jsx,TutorScreen.jsx,TutorDrawer.jsx,api.js}` | cartão do §34 |
| `vercel.json` | redirecionamentos do app antigo |

---

### Task 1: Banco — telefone, tabela de aceites e cadastro

**Files:**
- Create: `supabase/migrations/20261003005300_termo_aceite.sql`
- Create: `src/__tests__/termoAceiteBanco.test.ts` (setup igual a `src/__tests__/supabaseAccountApi.test.ts:15-35`: PGlite + `supabase/tests/bootstrap.sql` + todas as migrações; helper `rpc(uid, fn, args)`)
- Modify: `docs/superpowers/specs/2026-10-07-termo-aceite-cadastro-design.md` (tirar a linha 3 "Escrito para…"; na linha da Política em §4, acrescentar: "Decisão do dono (2026-10-07): sai assim nesta etapa; o parágrafo do áudio (Termo §24) vem depois, antes da voz nova do Tutor.")

**Interfaces:**
- Produces:
  - `profiles.phone text` com `check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$')`.
  - `public.legal_versions(document text primary key check (document in ('termo_uso','tutor_ia')), version text not null, updated_at timestamptz not null default now())`, com `('termo_uso','1.0')` e `('tutor_ia','1.0')`; RLS ligada, sem políticas.
  - `public.legal_acceptances(id bigint generated always as identity primary key, user_id uuid references auth.users(id) on delete set null, document text not null check (…mesma lista…), version text not null, accepted_at timestamptz not null default now(), origin text not null check (origin in ('cadastro','google','tela_aceite','tutor')), user_agent text check (char_length(user_agent) <= 300), email_hash text not null, unique (user_id, document, version))`; RLS ligada, só a política de leitura `user_id = (select auth.uid())`.
  - `public.legal_email_hash(p_email text) returns text` (imutável; mesmo estilo de `ch_hash`, `content_hub.sql:368-370`).
  - `public.legal_is_student(p_user uuid) returns boolean`.
  - `public.legal_record(p_user uuid, p_document text, p_version text, p_origin text, p_user_agent text) returns void` — versão diferente da vigente: `raise exception 'Versão desatualizada do termo.' using errcode = '22023'`; repetir não duplica.
  - `public.handle_new_user()` (nova versão de `20261003001300_admin.sql:70-83`): faz o mesmo de hoje e, num bloco `begin … exception when others then null; end`, grava o telefone dos metadados `phone` (se válido) e o aceite `cadastro` quando os metadados `terms_version` forem a versão vigente (`user_agent` também dos metadados).
  - `public.app_accept_terms(p_document text, p_version text, p_origin text default 'tela_aceite', p_phone text default null, p_user_agent text default null) returns jsonb` — sem login: `'Entre na sua conta.'` (`28000`); origem só `google`, `tela_aceite` ou `tutor`; `tutor_ia` só com `tutor`; telefone inválido: `'Informe o WhatsApp com código do país.'` (`22023`); devolve `public.app_bootstrap()`.
  - `public.app_update_profile` aceita `phone` (mesma validação e mensagem; vazio é inválido).
  - Revogados: `legal_email_hash`, `legal_is_student`, `legal_record`.

- [ ] **Step 1: Write the failing tests** (nomes e conferências)

```ts
it("cadastro com metadados grava telefone e aceite 'cadastro' da versão vigente (sem sessão)", ...)
  // insert auth.users (id, email, raw_user_meta_data) values (U, ' Ana@Teste.dev ', '{"name":"Ana","phone":"+5541999998888","terms_version":"1.0","user_agent":"Teste/1"}')
  // profiles.phone === '+5541999998888'; 1 linha em legal_acceptances: document 'termo_uso', version '1.0', origin 'cadastro',
  // user_agent 'Teste/1', email_hash === sha256 hex de 'ana@teste.dev'
it("versão errada ou metadados ruins não gravam aceite e não impedem a conta", ...)
  // terms_version '0.9' → 0 aceites; phone 'abc' → phone null; raw_user_meta_data null → perfil, papel e teste criados
it("app_accept_terms: login, versão vigente, origem, telefone e repetição", ...)
  // anon → 'Entre na sua conta.'; ('termo_uso','0.9') → 'Versão desatualizada do termo.'; origem 'cadastro' → recusa;
  // ('tutor_ia','1.0','tela_aceite') → recusa; p_phone '123' → 'Informe o WhatsApp com código do país.';
  // ('termo_uso','1.0','tela_aceite','+5541999998888') duas vezes → 1 linha, phone gravado, devolve objeto com 'profile'
it("ninguém grava aceite pelo navegador e cada um só lê os próprios", ...)
  // insert direto como authenticated → erro; select como Ana vê só as dela; legal_record/legal_is_student como authenticated → sem permissão
it("telefone fora do formato não entra nem direto pela tabela", ...)
  // update profiles set phone = '5541999' como authenticated (política 'perfil: editar o próprio') → viola a check
it("app_update_profile aceita phone válido e recusa vazio ou inválido", ...)
it("conta apagada mantém a prova sem a pessoa", ...)
  // app_delete_my_account → legal_acceptances.user_id null, document/version/origin/email_hash iguais
it("conta criada de novo com o mesmo e-mail aceita de novo e a prova antiga continua", ...)
  // depois de apagar, novo auth.users com o mesmo e-mail e terms_version '1.0' → 2 linhas com o mesmo email_hash (uma sem user_id)
```

- [ ] **Step 2: Run tests to verify they fail**
Run: `npx vitest run src/__tests__/termoAceiteBanco.test.ts --maxWorkers=1`
Expected: FAIL (a coluna `phone` e as funções não existem)

- [ ] **Step 3: Write the migration** com as interfaces acima. `legal_is_student`: `exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'student') and not exists (select 1 from public.ch_reviewer_areas a where a.user_id = p_user)`. `legal_record` pega o e-mail em `auth.users`.

- [ ] **Step 4: Run tests to verify they pass** (mesmo comando) e também `src/__tests__/supabaseSchema.test.ts src/__tests__/novoLocalBackend.test.ts src/__tests__/supabaseAccountApi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20261003005300_termo_aceite.sql src/__tests__/termoAceiteBanco.test.ts docs/superpowers/specs/2026-10-07-termo-aceite-cadastro-design.md
git commit -m "Termo: telefone, tabela de aceites, cadastro grava o aceite e funcao de aceitar"
```

### Task 2: Banco — dados de abertura e exportação

**Files:**
- Modify: `supabase/migrations/20261003005300_termo_aceite.sql`
- Modify: `src/__tests__/termoAceiteBanco.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `app_bootstrap()` (nova versão a partir de `20261003003800_stazia_play.sql:1762-1801`) ganha a chave `legal`:
  `{ termo_uso: { current: text, accepted: text|null, accepted_at: timestamptz|null }, tutor_ia: { …igual… }, student: boolean, phone_missing: boolean, gate_required: boolean }`, com `gate_required = student and (termo_uso.accepted is distinct from termo_uso.current or phone is null)`. Sem login, `legal` é `null`.
  `app_export_my_data()` (a partir de `20261003001200_account_api.sql:7-44`) ganha `acceptances`: `[{document, version, accepted_at, origin}]` da pessoa, em ordem de data.

- [ ] **Step 1: Write the failing tests**
```ts
it("abertura: aluno sem aceite ou sem WhatsApp precisa da tela; com os dois, não", ...)
  // gate_required true sem aceite; true com aceite e phone null; false com os dois; termo_uso.accepted '1.0' e accepted_at preenchido
it("abertura: equipe e revisor médico nunca precisam; quem volta a ser aluno passa a precisar", ...)
  // admin e editor: student false, gate_required false; aluno com ch_reviewer_areas: false;
  // editor rebaixado com app_admin_set_role(…, 'student'): gate_required true
it("abertura mantém todas as chaves de antes", ...)
  // profile, role, reviewer_areas, subscription, has_pro, streak_days, flashcards_due, days_to_exam, totals, play continuam
it("exportação inclui os aceites da pessoa", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/termoAceiteBanco.test.ts --maxWorkers=1` — Expected: FAIL nos novos.
- [ ] **Step 3: Implement** as duas redefinições na mesma migração.
- [ ] **Step 4: Run** o arquivo e `src/__tests__/novoLocalBackend.test.ts src/__tests__/supabasePlayApi.test.ts src/__tests__/supabasePlanningApi.test.ts src/__tests__/supabaseAccountApi.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `git add` dos dois arquivos; mensagem "Termo: abertura do app diz se falta o aceite ou o WhatsApp e exportacao leva os aceites".

### Task 3: Banco — Tutor só com o aceite do §34

**Files:**
- Create: `supabase/migrations/20261003005400_tutor_aceite.sql`
- Create: `src/__tests__/helpers/aceites.ts`
- Create: `src/__tests__/termoAceiteTutor.test.ts` (setup igual a `src/__tests__/tutorV2.test.ts`: `openDevDatabaseForTests` + `buildEngineStatements`, helper `rpc`)
- Modify: os testes do Tutor cujos alunos usam o Tutor sem aceitar (no mínimo `tutorV2.test.ts`, `tutor.test.ts`, `tutorVoiceMode.test.ts`, `tutorGeminiVoice.test.ts`, `equipeAcessoCompleto.test.ts`; rodar a lista do Step 4 para achar os outros) e `scripts/tutor/preflight.ts` (o aluno novo dele aceita antes)

**Interfaces:**
- Consumes: Task 1 (`legal_is_student`, `legal_acceptances`, `legal_versions`).
- Produces:
  - `public.tutor_consent_pending(p_user uuid) returns boolean` = `legal_is_student(p_user)` e sem aceite `tutor_ia` na versão vigente; revogada.
  - Mensagem única: `'Aceite do Tutor pendente.'` com `errcode = '42501'`.
  - `app_tutor_status()` ganha `consent_required boolean` e `consent_version text` (o resto igual).
  - `app_tutor_start`, `app_tutor_session`, `tutor_next_for`, `tutor_answer_for` recusam com a mensagem logo depois de conferir o login.
  - `app_tutor_sessions` devolve `'[]'::jsonb` enquanto o aceite estiver pendente.
  - `ch_worker_tutor_context` e `ch_worker_tutor_speech` ganham a chave `consent_pending boolean`.
  - `src/__tests__/helpers/aceites.ts`: `export async function aceitarTermos(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, userId: string): Promise<void>` (grava os dois aceites vigentes direto na tabela, origem `cadastro` e `tutor`).

- [ ] **Step 1: Write the failing tests**
```ts
it("aluno sem aceite: status pede o aceite, lista vazia, começar/abrir/responder/próxima recusam", ...)
  // consent_required true, consent_version '1.0'; app_tutor_sessions → []; app_tutor_start → 'Aceite do Tutor pendente.';
  // app_tutor_session, app_tutor_answer, app_tutor_next_question → mesma mensagem
it("depois do app_accept_terms('tutor_ia','1.0','tutor') o Tutor abre", ...)
it("equipe e revisor médico usam sem aceitar", ...)
it("contexto do servidor e leitura de voz trazem consent_pending", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/termoAceiteTutor.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração (cada função a partir da última definição).
- [ ] **Step 4: Run** `npx vitest run src/__tests__/termoAceiteTutor.test.ts src/__tests__/tutorV2.test.ts src/__tests__/tutor.test.ts src/__tests__/tutorVoiceMode.test.ts src/__tests__/tutorGeminiVoice.test.ts src/__tests__/equipeAcessoCompleto.test.ts --maxWorkers=1` — Expected: PASS depois de chamar `aceitarTermos` nos alunos de cada configuração.
- [ ] **Step 5: Commit** os arquivos tocados; mensagem "Tutor: sem o aceite do paragrafo 34 o banco recusa comecar, abrir, responder e proxima".

### Task 4: Servidor do Tutor recusa sem o aceite

**Files:**
- Modify: `server/tutor/engine.ts`, `server/tutor/realtime.ts`, `server/tutor/speech.ts`, `server/tutor/router.ts`
- Modify: `src/__tests__/termoAceiteTutor.test.ts` (parte HTTP, como `tutorV2.test.ts:138-151`)

**Interfaces:**
- Consumes: `consent_pending` da Task 3.
- Produces: em `engine.ts`, `export const TUTOR_CONSENT_PENDING = "Aceite do Tutor pendente."` e `export function consentError(): TutorError & { code: "tutor_consent" }` (status 403). `tutorTurn` lança antes das conferências de plano (`engine.ts:243-248`); `startVoice` e `tutorSpeech` também (em `speech.ts`, antes da regra `requires_pro`). As respostas de `/turn` e `/speech` passam a levar `code` quando o erro tiver (como já faz o `voiceRoute`, `router.ts:141-143`).

- [ ] **Step 1: Write the failing tests**
```ts
it("rotas do Tutor respondem 403 tutor_consent para aluno sem aceite", ...)
  // POST /turn, /voice/start, /voice/delegate e /speech → status 403, body { error: 'Aceite do Tutor pendente.', code: 'tutor_consent' }
it("depois do aceite as mesmas rotas voltam a funcionar", ...)
```
- [ ] **Step 2: Run** o arquivo — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e os testes do Tutor da Task 3 — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor: rotas do servidor recusam com tutor_consent sem o aceite".

### Task 5: Dados do app — cadastro com WhatsApp e aceite; regras do WhatsApp

**Files:**
- Modify: `src/novo/data/backend.ts`, `src/novo/data/supabaseBackend.ts`, `src/novo/data/devServerBackend.ts`, `server/devDb/router.ts`, `src/novo/data/localCore.ts`, `src/novo/data/localBackend.ts`, `src/novo/app/session.jsx`
- Create: `src/novo/app/legal/phone.js`, `src/novo/app/legal/versions.js`
- Create: `src/__tests__/termoTelefone.test.ts`, `src/__tests__/termoCadastroDados.test.ts` (padrão de `src/__tests__/novoLocalBackend.test.ts:16-35`)

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces:
  - `signUp(name: string, email: string, password: string, extra?: { phone?: string; termsVersion?: string; userAgent?: string }): Promise<{ needsEmailConfirmation: boolean }>` em todos os backends; metadados `{ name, phone, terms_version, user_agent }` (Supabase: `options.data`; dev: corpo do POST `/api/dev-db/auth/signup`; local: `createAccount(name, email, password, admin?, meta?)` grava em `raw_user_meta_data`).
  - `session.acceptTerms({ document, version, origin, phone }): Promise<void>` → `rpc("app_accept_terms", { p_document, p_version, p_origin, p_phone: phone ?? null, p_user_agent: navigator.userAgent.slice(0, 300) })` e troca o `boot` (como `updateProfile`, `session.jsx:81-84`).
  - `versions.js`: `export const TERMO_VERSAO = "1.0"; export const TUTOR_IA_VERSAO = "1.0";`
  - `phone.js`: `export const COUNTRIES` (lista do Global Constraints, `{ code: "+55", label: "Brasil +55" }` …, `{ code: "outro", label: "Outro" }`); `export function normalizePhone(code: string, number: string): string | null`; `export function phoneError(code: string, number: string): string | null`; `export function splitPhone(e164: string | null): { code: string; number: string }`.
  - Mensagens: vazio → "Informe seu WhatsApp."; Brasil inválido → "Informe o WhatsApp com DDD."; outros inválidos ou código "Outro" inválido → "Informe o WhatsApp com código do país."

- [ ] **Step 1: Write the failing tests**
```ts
// termoTelefone.test.ts
expect(normalizePhone("+55", "(41) 99999-8888")).toBe("+5541999998888");
expect(normalizePhone("+55", "041 3333-4444")).toBe("+554133334444");
expect(normalizePhone("+55", "+55 41 99999-8888")).toBe("+5541999998888");
expect(phoneError("+55", "9999-8888")).toBe("Informe o WhatsApp com DDD.");
expect(normalizePhone("+351", "912 345 678")).toBe("+351912345678");
expect(phoneError("+1", "12345")).toBe("Informe o WhatsApp com código do país.");
expect(normalizePhone("+598", "12345678901234")).toBeNull(); // 14 dígitos depois do código
expect(phoneError("+55", "")).toBe("Informe seu WhatsApp.");
expect(splitPhone("+5541999998888")).toEqual({ code: "+55", number: "41999998888" });
// termoCadastroDados.test.ts
it("cadastro local com WhatsApp e versão do termo já abre sem a tela de aceite", ...)
  // backend.signUp("Ana Lima", "ana@teste.dev", "senha-segura", { phone: "+5541999998888", termsVersion: "1.0", userAgent: "T" })
  // boot.profile.phone === "+5541999998888"; boot.legal.gate_required === false
it("cadastro sem versão do termo pede a tela de aceite", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/termoTelefone.test.ts src/__tests__/termoCadastroDados.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.** O `0` antes do DDD só é retirado no Brasil; `+55` digitado no número é retirado quando igual ao código escolhido.
- [ ] **Step 4: Run** os dois arquivos e `src/__tests__/novoLocalBackend.test.ts src/__tests__/contentHubPipeline.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Termo: cadastro leva WhatsApp e versao do termo; funcao de aceitar na sessao; regras do WhatsApp".

### Task 6: Textos legais e páginas públicas

**Files:**
- Create: `src/novo/app/legal/termo-uso-v1.0.md` (cópia exata, Global Constraints), `src/novo/app/legal/LegalText.jsx`, `src/novo/app/legal/privacidade.js`, `src/novo/app/legal/LegalPage.jsx`, `src/novo/app/legal/legal.css`
- Modify: `src/novo/app/App.jsx` (`Root`)
- Create: `src/__tests__/termoPaginas.test.tsx`

**Interfaces:**
- Produces:
  - `LegalText({ source: string })`: desenha o subconjunto usado pelo termo — `# ` e `## ` (títulos), `- ` (itens de lista; seguidos viram uma lista), `---` (separador), `**negrito**`, parágrafos (linhas seguidas não vazias; cada linha termina numa quebra de linha). Não muda, não junta nem tira palavras.
  - `privacidade.js`: `export const PRIVACIDADE = { atualizada: "…", vigente: "…", rodape: "…", blocos: [...] }` com os textos de `PrivacyPolicyView.tsx` (seções, títulos, parágrafos, listas, subtítulos 5.1–5.3 e negritos), sem Tailwind e sem `lucide-react`.
  - `LegalPage({ doc: "termos" | "privacidade" })`: página pública com o logo do app novo, título, versão ("Versão 1.0" no termo; as datas na política), o texto e o link "Voltar para o app" (`/novo`).
  - Em `Root` (`App.jsx:221`), antes do bloco de carregamento (linha 224): `useLocation()`; `/termos` → `<LegalPage doc="termos"/>`, `/privacidade` → `<LegalPage doc="privacidade"/>`, com ou sem login, também carregando ou com erro.
  - Termo importado com `?raw` (como `src/novo/data/localBackend.ts:8`).

- [ ] **Step 1: Write the failing tests**
```ts
it("o arquivo do termo é o texto do dono", ...)
  // sha256 de readFileSync("src/novo/app/legal/termo-uso-v1.0.md") === "21611cdab66939edeae1bef6c12c034b4660ea214a96ce116dbf9f1b119ee548"
it("a página do termo mostra todas as palavras do arquivo", ...)
  // palavras do textContent da página (sem cabeçalho/rodapé da página) === palavras do arquivo sem '#', '**', '- ', '---' (2.545)
it("a política nova tem as mesmas palavras da antiga", ...)
  // palavras de PrivacyPolicyView (só <section id>, dentro de MemoryRouter) === palavras dos blocos da LegalPage privacidade;
  // a página mostra "Última atualização: 04 de setembro de 2026", "Vigente a partir de 04/09/2026" e "Versão vigente a partir de 04 de setembro de 2026."
it("/termos e /privacidade abrem sem login, carregando e logado", ...)
  // session.status "signed-out", "loading" e "ready": a página aparece em vez do login/splash/app (padrão de segundaFaseEmBreve.test.tsx:94-105)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/termoPaginas.test.tsx --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.** Leitura confortável no celular (largura de leitura e rolagem da página); sem rolagem horizontal em 390 px.
- [ ] **Step 4: Run** o arquivo e `src/__tests__/segundaFaseEmBreve.test.tsx src/__tests__/privacyPolicyLegalPage.test.tsx src/__tests__/termsOfUseLegalPage.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** "Termo: paginas publicas do Termo v1.0 e da Politica atual no app novo".

### Task 7: Cadastro com WhatsApp, conferir senha e aceite obrigatório

**Files:**
- Modify: `src/novo/app/AuthScreens.jsx` (Signup `:116-171`, rodapé `:110`, frase passiva `:167`, constante sem uso `legal` `:63-68`), `src/novo/app/auth/login.css`
- Create: `src/novo/app/legal/PhoneField.jsx`, `src/novo/app/legal/DocumentModal.jsx`, `src/novo/app/legal/googleAcceptance.js`
- Create: `src/__tests__/cadastroTermo.test.tsx` (sessão simulada como `src/__tests__/loginScreen.test.tsx:11-12`)

**Interfaces:**
- Consumes: Task 5 (`signUp` com `extra`, `phone.js`, `TERMO_VERSAO`), Task 6 (`LegalText`, `PRIVACIDADE`).
- Produces:
  - `PhoneField({ code, number, onChange: ({ code, number }) => void, error })` (seletor de país + número; "Outro" mostra um campo para o código).
  - `DocumentModal({ doc: "termos" | "privacidade", onClose })` (janela por cima; o formulário continua com o que foi digitado).
  - `googleAcceptance.js`: `rememberGoogleAcceptance(version: string): void` grava `localStorage["smn-aceite-google"] = { version, at }`; `takeGoogleAcceptance(current: string): boolean` devolve `true` só se existir, tiver menos de 30 min e for da versão `current`, e sempre apaga.
  - Ordem da tela: Nome completo, E-mail, WhatsApp, Senha, Conferir senha, caixa com a frase do §33 ("Termos de Aceite e Uso" e "Política de Privacidade" abrem o `DocumentModal`), "Criar conta", divisor, "Criar conta com Google". Envio: `backend.signUp(nome, email, senha, { phone, termsVersion: TERMO_VERSAO, userAgent })`.
  - Mensagens: "Informe seu nome.", "As senhas não são iguais.", as do WhatsApp (Task 5), as de e-mail e senha de hoje, e caixa sem marcar: "Para criar a conta, é preciso aceitar o Termo de Aceite e Uso e a Política de Privacidade." (no Google também).
  - Sai a frase "Ao continuar, você concorda…"; os links do rodapé abrem o `DocumentModal`.

- [ ] **Step 1: Write the failing tests**
```ts
it("mostra os campos na ordem e a frase do §33, sem a frase passiva", ...)
it("cada erro aparece no próprio campo e nada é enviado", ...)  // senhas diferentes, WhatsApp sem DDD, caixa desmarcada
it("tudo certo: signUp com WhatsApp normalizado, versão 1.0 e navegador", ...)
  // backend.signUp.mock.calls[0] === ["Ana Lima", "ana@teste.dev", "senha-segura", { phone: "+5541999998888", termsVersion: "1.0", userAgent: expect.any(String) }]
it("Google só com a caixa marcada e guarda o aceite por 30 min", ...)
  // sem caixa: mensagem e signInWithGoogle não chamado; com caixa: localStorage["smn-aceite-google"] tem version "1.0" e signInWithGoogle chamado
it("o link do termo abre a janela e o que foi digitado continua", ...)
it("cada campo e a caixa têm rótulo e o foco vai para o primeiro campo com erro", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/cadastroTermo.test.tsx --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** com as classes de `login.css` (caixa no estilo de `.lg-remember`/`.lg-check`, `login.css:96-97`).
- [ ] **Step 4: Run** o arquivo e `src/__tests__/loginScreen.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** "Cadastro: WhatsApp, conferir senha e aceite obrigatorio do Termo (tambem no Google)".

### Task 8: Tela de aceite antes de todas as telas

**Files:**
- Create: `src/novo/app/legal/AcceptanceScreen.jsx` (+ regras em `src/novo/app/legal/legal.css`)
- Modify: `src/novo/app/App.jsx` (`Root`, entre a linha 245 `signed-out` e o `<Routes>` da 247)
- Create: `src/__tests__/telaAceite.test.tsx` (padrão de `segundaFaseEmBreve.test.tsx:94-105`)

**Interfaces:**
- Consumes: `boot.legal` (Task 2), `session.acceptTerms` (Task 5), `PhoneField`, `takeGoogleAcceptance` (Task 7), `LegalText` (Task 6).
- Produces: `AcceptanceScreen()` — aparece quando `boot.legal?.gate_required`; título "Termo de Aceite e Uso", "Versão 1.0", o texto inteiro com rolagem, o WhatsApp quando `phone_missing`, a caixa do §33 quando falta o aceite, "Aceitar e continuar" (só com tudo preenchido) e "Sair" (`session.signOut()`). Ao abrir, se falta o aceite e `takeGoogleAcceptance(legal.termo_uso.current)` for `true`, aceita sozinho com origem `google` e fica só o WhatsApp (se faltar).
  - Erro "Versão desatualizada do termo." → `session.refresh()` e aviso "O termo foi atualizado. Leia a nova versão e aceite de novo."
  - Outra falha → continua na tela com o aviso "Não foi possível registrar o aceite agora. Tente de novo."

- [ ] **Step 1: Write the failing tests**
```ts
it("aluno sem aceite vê a tela em qualquer rota, inclusive sessao e admin", ...)
it("equipe e revisor não veem a tela", ...)
it("só falta o WhatsApp: a tela pede só o WhatsApp", ...)
it("aceitar chama acceptTerms com termo_uso, 1.0, tela_aceite e o WhatsApp normalizado", ...)
it("volta do Google com aceite guardado aceita sozinho com origem google", ...)
it("aceite do Google vencido (mais de 30 min) ou de outra versão: pede a caixa", ...)
it("versão desatualizada recarrega e avisa; falha de rede avisa e deixa tentar de novo", ...)
it("Sair encerra a sessão", ...)
it("o texto do termo é navegável por teclado e os campos têm rótulo", ...)  // área do texto com tabIndex 0 e nome acessível
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/telaAceite.test.tsx --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e `src/__tests__/segundaFaseEmBreve.test.tsx src/__tests__/equipeAcessoTelas.test.tsx` — Expected: PASS (nos testes antigos, o `boot` sem `legal` não mostra a tela).
- [ ] **Step 5: Commit** "Termo: tela de aceite antes de todas as telas para aluno sem aceite ou sem WhatsApp".

### Task 9: Minha conta — WhatsApp e aceites

**Files:**
- Modify: `src/novo/app/account/AccountScreen.jsx` (`SECTIONS:15-21`, `AccountSection:94-121`, `PrivacySection:243-314`)
- Create: `src/__tests__/contaTermo.test.tsx` (padrão de `equipeAcessoTelas.test.tsx:11-22`)

**Interfaces:**
- Consumes: `PhoneField`, `phone.js`, `boot.legal`.
- Produces: resumo da seção "Nome, e-mail, WhatsApp e aparência"; campo WhatsApp editável (mesmas regras; grava `phone` normalizado por `updateProfile`); em Privacidade e dados, as linhas "Termo de Aceite e Uso v1.0 — aceito em dd/mm/aaaa às hh:mm" e "Aceite dos Tutores de IA v1.0 — aceito em dd/mm/aaaa às hh:mm" (ou "ainda não aceito"), com links para `/novo/termos` e `/novo/privacidade`. Data e hora no fuso de Brasília.

- [ ] **Step 1: Write the failing tests**
```ts
it("Minha conta mostra e salva o WhatsApp", ...)  // updateProfile({ phone: "+5541999998888" })
it("WhatsApp inválido mostra o erro e não salva", ...)
it("Privacidade e dados mostra os aceites com data e hora", ...)
  // legal.termo_uso.accepted_at "2026-10-07T21:05:00Z" → "aceito em 07/10/2026 às 18:05"; tutor_ia sem aceite → "ainda não aceito"
it("o resumo da seção diz Nome, e-mail, WhatsApp e aparência", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/contaTermo.test.tsx --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e `src/__tests__/equipeAcessoTelas.test.tsx src/__tests__/segundaFaseEmBreve.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** "Minha conta: WhatsApp e aceites com data e hora".

### Task 10: Tutor — cartão do aceite (§34)

**Files:**
- Create: `src/novo/app/tutor/TutorConsentCard.jsx`
- Modify: `src/novo/app/tutor/TutorScreen.jsx` (antes do bloco `!status.available`, linha 92), `src/novo/app/tutor/TutorDrawer.jsx` (efeito `:48-70` e aviso `:82-87`), `src/novo/app/tutor/api.js` (`parse`, `:10-21`, guarda o `code`)
- Create: `src/__tests__/tutorAceite.test.tsx` (padrão de `tutorScreen.test.tsx` e `tutorRealtime.test.tsx`)

**Interfaces:**
- Consumes: `status.consent_required` e `status.consent_version` (Task 3); `session.acceptTerms` (Task 5).
- Produces: `TutorConsentCard({ version, onAccepted })` com a frase do §34, "Li e concordo" e "Continuar" (só com a caixa marcada); chama `acceptTerms({ document: "tutor_ia", version, origin: "tutor" })` e depois `onAccepted()`. A tela do Tutor (inclusive Análise, que usa a mesma tela) mostra o cartão no lugar de tudo enquanto `consent_required`, e o cartão vem antes do aviso de plano pago. A gaveta mostra o cartão sem criar sessão; depois do aceite o efeito roda de novo.

- [ ] **Step 1: Write the failing tests**
```ts
it("aluno sem aceite vê o cartão do §34 na tela do Tutor, não o aviso de plano", ...)
it("Continuar só com a caixa marcada; depois do aceite a tela recarrega e mostra o início", ...)
it("na gaveta (de Correção, Flashcards, Temas, Desempenho) o cartão aparece e nenhuma sessão é criada antes", ...)
  // app_tutor_start não chamado antes do aceite; chamado depois
it("status sem consent_required continua como hoje", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorAceite.test.tsx --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e `src/__tests__/tutorScreen.test.tsx src/__tests__/tutorRealtime.test.tsx src/__tests__/tutorVoiceModeScreen.test.tsx src/__tests__/tutorGeminiVoiceScreen.test.tsx src/__tests__/equipeAcessoTelas.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor: cartao do aceite do paragrafo 34 antes do primeiro uso".

### Task 11: Links legais e endereços do app antigo

**Files:**
- Modify: `src/novo/app/auth/LoginScreen.jsx` (`:403-407`), `src/__tests__/loginScreen.test.tsx` (`:42-43`), `vercel.json`
- Create: `src/__tests__/vercelRedirects.test.ts`

**Interfaces:**
- Produces: links do login para `/novo/termos` e `/novo/privacidade`. Em `vercel.json`, `redirects` nesta ordem (todos `permanent: false`): `/termos-de-uso` → `/novo/termos`; `/politica-de-privacidade` → `/novo/privacidade`; `/login` → `/novo/login`; `/` → `/novo`; e por último `{"source": "/:path((?!api(?:/|$)|novo|assets/|ds-icons/|question-assets/|images/|\\.well-known/|_vercel/).+)", "destination": "/novo"}`. `rewrites` e `crons` continuam.

- [ ] **Step 1: Write the failing tests**
```ts
it("os quatro redirecionamentos fixos vêm antes do geral, na ordem", ...)
it("o redirecionamento geral pega o app antigo e deixa passar o app novo, os arquivos e a API", ...)
  // regex de teste: new RegExp("^/" + <grupo de :path>.replace(/^\(|\)$/g, "") + "$") sobre:
  // pega: /questoes, /app/inicio, /onboarding/splash, /pagamento/sucesso, /admin, /tutor-ia
  // não pega: /api, /api/tutor/voice/sweep, /novo, /novo/termos, /novo.html, /novo-assets/logo-mark.png, /assets/novo-x.js,
  //           /ds-icons/a.svg, /question-assets/q.png, /images/x.png, /.well-known/x, /_vercel/insights
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/vercelRedirects.test.ts src/__tests__/loginScreen.test.tsx --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** os mesmos e `src/__tests__/vercelBuild.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "App antigo: enderecos levam ao app novo e links legais apontam para as paginas novas".

### Task 12: Conferência final e material de publicação

**Files:**
- Create (fora do repositório, na pasta Downloads do dono): `termo_aceite_supabase.sql` com `begin;`, as migrações `20261003005300` e `20261003005400`, os dois `insert into supabase_migrations.schema_migrations (version, name) … on conflict (version) do nothing;` e `commit;` (mesmo formato do arquivo da Central de IAs)

- [ ] **Step 1:** suíte completa (`npx vitest run --maxWorkers=1`); tudo verde (o teste `questionKnowledge` de "reaplicar a carga" pode estourar o tempo sob carga e passa sozinho).
- [ ] **Step 2:** `npm run build:vercel` sem erro.
- [ ] **Step 3:** conferência no navegador com servidor temporário isolado (porta própria, banco novo, sem `.env`), no computador (1440 px) e no celular (390 px): cadastro com todos os campos e a janela do termo; aluno antigo sem aceite cai na tela de aceite; aceite e entrada no app; cartão do Tutor e depois o início do Tutor; Minha conta com WhatsApp e aceites; `/novo/termos` e `/novo/privacidade` sem login; nenhuma rolagem horizontal.
- [ ] **Step 4:** gerar o arquivo SQL para o dono e conferir que o corpo é igual às duas migrações.
- [ ] **Step 5:** publicar só com ordem do dono: SQL no Supabase → envio da main → conferência no ar (cadastro com e-mail, Google, tela de aceite de um aluno antigo, Tutor, `/termos-de-uso` → `/novo/termos`, `/questoes` → `/novo`, arquivos e API respondendo).
