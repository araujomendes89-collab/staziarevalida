# Tutor Nexus: tela única, escolha do professor e voz pelo motor Stazia — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** O Tutor vira só a tela Nexus: o aluno escolhe Tranquilo, Durona ou Direto antes de começar, fala, o servidor transcreve, o motor Stazia responde com personalidade e emoção, o Speech Director escolhe a atuação e a ElevenLabs só lê o texto já conferido; sem voz aprovada ou sem limite, a Nexus segue na voz ao vivo de hoje (reserva) ou por escrito.

**Arquitetura:** Quatro migrações novas (5500–5800) refazem os três professores com as conversas antigas marcadas como só leitura, gravam a escolha do professor junto com a conversa, guardam aprovações e audições, contam caracteres com reserva e estorno sob trava e criam a chamada `tts` (trava de turno e `client_turn_id`). No servidor, rotas novas `/voice/transcribe`, `/voice/open`, `/voice/say` e `/nexus` usam o mesmo motor do chat; `/speech` passa a seguir o direito do Tutor, os limites por plano e a aprovação por voz, com a emoção com que cada resposta foi escrita. Na tela, `NexusScreen` (entrada, conversa, resumo, histórico) substitui a tela antiga e a gaveta, reaproveitando a esfera (`StaziaVoiceMode`) e a voz ao vivo (`useRealtimeVoice`) como reserva.

**Tecnologias:** React (src/novo, design system em src/novo/ds), Express + TypeScript (server/tutor), migrações Postgres do Supabase (PGlite nos testes), Supabase Storage, Vitest + Testing Library, MediaRecorder e Web Audio no navegador.

**Spec:** docs/superpowers/specs/2026-10-07-tutor-nexus-voz-design.md

## Global Constraints
- **Professores (só três):** Tranquilo (id técnico `acolhedor`, jeito do Professor Preguiçoso, nunca xinga), Durona (`durona`), Direto (`direto`). Vozes `ELEVENLABS_VOICE_TRANQUILO`, `ELEVENLABS_VOICE_DURONA`, `ELEVENLABS_VOICE_DIRETO` (os ids ficam só no ambiente; o painel aprova, mas não escolhe a voz). O Questionador não entra. Uma conversa nunca troca de professor.
- **Escalada (valores iniciais, ajustáveis na audição):** Durona 1º erro **firme**, irritação entre 0,25 e 0,40, sem sorteio nesse passo; 2º erro seguido frustrada, ~0,45; 3º erro seguido no mesmo conceito irritada, ~0,70; acerto logo depois de ≥1 erro seguido: **alívio**, irritação cai para no máximo 0,40, com palavrão sobre a situação ("Ufa, porra, até que enfim!"); acerto sem erro antes: reconhece do jeito dela, como hoje. Direto: solto desde a primeira fala ("pô", "putz"); comemora com palavrão ("Isso, porra. Essa era difícil."). Palavrão sempre sobre a situação, nunca contra o aluno; vale o teto do painel (abaixo de "moderado", a mesma emoção com palavras mais leves).
- **Marcações de voz:** só o Speech Director escolhe (`[angry]` etc.); o prompt proíbe a IA de escrever marcações entre colchetes e o servidor troca `[`/`]` por `(`/`)` antes de enviar. Modelo `eleven_v3` primeiro (estabilidade fixa); a troca para `eleven_multilingual_v2` é decidida na audição. Formato `mp3_44100_128`.
- **Limites:** 5 minutos de fala do professor por aluno por dia (~4.500 caracteres) no teste grátis e no plano pago; **900 caracteres = 1 minuto** ("Voz hoje: X min"); tetos da conta **30.000 por mês e 4.500 por dia**; todos editáveis no painel do Tutor. Dia = dia de Brasília (vira à meia-noite); mês = mês do calendário em Brasília. Reserva antes de gerar, estorno se a voz não sair; fala interrompida conta inteira. A voz do professor não depende nem gasta o tempo da voz ao vivo. Audições do painel não contam no limite de quem ouviu nem nos tetos.
- **Turno:** fala cortada em ~450 caracteres num fim de frase (o texto inteiro fica na legenda e no chat); gravação até 45 s; no computador e no Android a gravação para depois de 1,5 s de silêncio; no iPhone e no iPad (qualquer navegador) "Falar" e "Enviar"; áudio até 4 MB, só na memória do servidor (nunca banco nem registros); trava de turno no banco de 60 s; `client_turn_id` contra repetição; cada resposta do motor gasta 1 interação de texto (no teste, 40 por dia), com a devolução de hoje se a IA falhar.
- **Computador (web) = a mesma experiência do celular** (dono, 2026-10-08): a Nexus em tela cheia com a mesma esfera (`StaziaVoiceOrb`, vídeo `stazia-voice-orb.mp4`) e os mesmos passos; entrada com os três professores lado a lado; conversa com a esfera grande no centro, legenda embaixo e botões centralizados; modo Questões com esfera e legenda à esquerda e o cartão da questão à direita (no celular, empilhados). Nunca gaveta pequena. Referência visual: https://claude.ai/artifact/T7LWmnX7eDmNnzVr8y2Vuv (telas 1–5 celular, 7–9 computador). As Tarefas 12, 13, 14 e 16 conferem em 1440 px e 390 px.
- **Cor da esfera pela emoção** (dono, 2026-10-08): gradual com a irritação: calma azul/ciano (como hoje) → firme roxo → irritada magenta → com raiva **vermelho** (vídeo com sobreposição de cor, brilho e anéis vermelhos, proporcional à intensidade a partir de ~0,7); alívio e comemoração voltam ao azul/verde-água. Substitui a regra atual de `voiceMode.css` (raiva em roxo/magenta, "não para vermelho"). Vale no celular e no computador, voz do professor e reserva. Referência: tela 8 de https://claude.ai/artifact/T7LWmnX7eDmNnzVr8y2Vuv. Implementar na Tarefa 13 (esfera da conversa), com teste de classe/variável por emoção e intensidade.
- **Mensagens exatas:** "Você usou sua voz de hoje" · "A voz da plataforma acabou por hoje" · "A voz da plataforma acabou neste mês" · "Não entendi, pode repetir ou digitar?" · "O professor não conseguiu responder, tente de novo" · "Este professor mudou. Comece uma conversa nova." · "Voz hoje: X min" / "Voz reserva hoje" · "Começar com a Durona" (o nome muda) · microfone negado: o aviso que já existe ("O navegador bloqueou o microfone…", `realtimeErrorMessage({ kind: "mic" })`) · letra marcada: a frase fixa que já existe (`phraseText("marked")`: "Marquei a B. Diga confirmo para responder, ou fale outra alternativa.").
- **Aviso antes do primeiro uso da voz (exato, da Política de 07/10/2026, seção 3):** "Interações com recursos de IA e voz podem ser processadas para responder, sintetizar áudio e adaptar a experiência. Fornecedores de IA recebem somente o necessário para executar a solicitação."
- **Sem nomes de fornecedores** (OpenAI, Google, Gemini, ElevenLabs) em nenhum texto que o aluno vê (telas, avisos, erros devolvidos pelas rotas do aluno). O jeito "Voz ElevenLabs" do §7 aparece na tela como **"Voz do professor"**. O painel de administração pode nomear.
- **Variáveis novas:** `TUTOR_STT_ALLOW_EXTERNAL=1` (trava própria da transcrição) e `TUTOR_VOICE_APPROVERS` (e-mail do dono). `TUTOR_VOICE_PROVIDER` deixa de decidir a voz; saem `TUTOR_VOICE_DAILY_CHARS` e `ELEVENLABS_PRICE_PER_MIN` (preços vão para o painel).
- **Migrações:** `20261003005500` em diante (a `20261003005000` é reservada; não usar). Toda redefinição parte da última definição (`grep -n "function public.<nome>(" supabase/migrations/*.sql | grep -v revoke | tail -1`), sem perder campos nem regras (inclusive a recusa `Aceite do Tutor pendente.` logo depois do login). Funções novas nascem executáveis por todos: `ch_worker_*` e apoios com `revoke execute … from public, anon, authenticated`; `app_*` com `from public, anon`.
- **Rotas novas do aluno** recusam quem não tem o aceite do Tutor (§34) com 403 `{ error: "Aceite do Tutor pendente.", code: "tutor_consent" }` (`consentError()`), antes de gastar IA, voz ou transcrição. Nenhuma chave de fornecedor vai ao navegador.
- **Liberação (§11):** equipe primeiro (interruptor "só equipe" ligado por padrão) → audição e aprovação no painel de produção → plano ElevenLabs maior, preços preenchidos, tetos conferidos → alunos. Nada é publicado sem ordem do dono.

## Review Focus
1. **iPhone e iPad (Safari e Chrome do iOS):** a gravação sai `audio/mp4`, o iPad se apresenta como Mac (`MacIntel` com toque) e o som só toca se liberado no toque do "Começar" → o servidor aceita `audio/mp4` e `audio/webm;codecs=opus`; o aparelho detecta o iPad-Mac como "toque para falar" e escolhe mp4 sem webm. Testes nas Tarefas 9 e 13.
2. **Rede que cai ou toque duplo:** o mesmo turno reenviado com o mesmo `client_turn_id` e o "Começar" tocado duas vezes → uma resposta, uma interação, uma conversa. Testes nas Tarefas 10 e 12.
3. **Duas abas ou dois aparelhos:** a segunda Nexus encontra a chamada `tts` da primeira → aviso com "Assumir aqui" (sem duas chamadas); abrir a reserva encerra a `tts` sozinha. Testes nas Tarefas 4, 10 e 12.
4. **Virada do dia e do mês em Brasília:** o que foi gasto ontem (ou no mês passado) em Brasília não conta hoje (nem neste mês), mesmo quando em UTC já é outro dia. Teste na Tarefa 3.
5. **Aprovação revogada ou versão da voz mudada no meio da conversa:** a próxima fala recusa na hora (sem cache de aprovação) e a Nexus passa para a reserva mantendo a legenda. Testes nas Tarefas 7 e 13.

## Decisões do plano onde a spec não fixou (o dono pode mudar)
- **Nome do jeito na tela:** o §7 chama de "Voz ElevenLabs", mas a decisão de 2026-10-08 proíbe o nome para o aluno: na tela fica "Voz do professor".
- **Chamada `tts` por escrito:** o §16 pede "limite de caracteres" para abrir a chamada, mas o jeito "por escrito" (§7) transcreve a fala justamente quando os caracteres acabaram. A abertura tem `p_spoken`: só a voz do professor exige caracteres.
- **Textos que a spec não deu** (mínimos, no tom dos de hoje): "A voz do professor não está disponível agora.", "Professor por escrito hoje", "A transcrição não está ligada no servidor.", "Áudio acima de 45 segundos ou de 4 MB.", "Amostra indisponível.", os textos dos três cenários novos (frases do §4 e exemplos já no banco) e os rótulos do painel.
- **Tranquilo:** a migração mantém os dados do Preguiçoso como no 25c079d, inclusive a atuação de voz "lento, sonolento, com bocejos", que vale só na voz reserva ao vivo.
- **Durona no 2º erro:** com os números de hoje, um 2º erro em outro ponto fica abaixo de 0,41 (só o repetido chega a "frustrada"); no nível "sem filtro" o 3º erro chega a ~0,84. Ajuste na audição.
- **Saem por consequência do §16** ("`TUTOR_VOICE_PROVIDER` deixa de decidir a voz"): as classes de voz por texto da OpenAI e do Gemini, a classe antiga `ElevenLabsSpeech` e o laboratório `nexus-lab` (encaminha para a produção e não registra audição).
- **Aprovação sem cache** (lida a cada fala) para "Revogar desliga na hora"; revogar também exige estar em `TUTOR_VOICE_APPROVERS`.
- **Aviso da Política:** sempre visível na entrada da Nexus (cumpre "antes do primeiro uso" sem guardar nada no aparelho).

## Arquivos
| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261003005500_tutor_tres_professores.sql` | três professores (do 25c079d) e conversas antigas marcadas (`legacy_persona`) |
| `supabase/migrations/20261003005600_tutor_nexus_conversa.sql` | começar com o professor, só leitura, limites/preços/"só equipe", aprovações e audições, depósito das amostras, texto da Durona |
| `supabase/migrations/20261003005700_tutor_nexus_caracteres.sql` | uso de caracteres (reserva, estorno, tetos), registro `tutor_stt`/`tutor_tts_audicao`, leitura da voz |
| `supabase/migrations/20261003005800_tutor_nexus_chamada.sql` | chamada `tts`, trava de turno, varredura e métricas |
| `server/tutor/{emotion,engine,prompts,realtime,settings}.ts` | motor: firme, alívio, comemoração, colchetes, entusiasmo, cobrança do turno `tts` |
| `server/tutor/{speechDirector,elevenlabsTts,officialVoices,speech}.ts`, `src/shared/tutor/officialVoices.ts` | direção de voz, cenários por voz, versão da voz, `/speech` |
| `server/tutor/nexus.ts` (novo) | acesso à voz do professor, jeitos, `/nexus` e `/voice/open` |
| `server/tutor/stt.ts` (novo) | transcrição |
| `server/tutor/delegate.ts`, `server/tutor/router.ts` | `/voice/say` e as rotas novas |
| `server/tutor/voicePreview.ts`, `server.ts` | audição, aprovação, amostra |
| `src/novo/app/admin/{OfficialVoicesPanel.jsx,AdminPanels.jsx}` | "Vozes do Nexus" e painel do Tutor |
| `src/novo/app/tutor/nexus/*` (novo), `voice/audioPlayer.js` (novo), `voice/StaziaVoiceMode.jsx`, `api.js`, `TutorDrawer.jsx`, `ReportScreen.jsx` (novo), `App.jsx` | a tela única |

---

### Tarefa 1: Trazer o 25c079d e refazer a migração dos três professores

**Files:**
- `git cherry-pick -n 25c079d` (só esse commit; nunca `4b2649a`, `88a2031` nem `4367f04`). Conflitos: `src/novo/ds/components/components.css` e `src/novo/ds/components/navigation/Tabs.jsx` ficam como no ramo (`git checkout --ours`, a correção `wrap` de f775983); `src/novo/app/admin/AdminScreen.jsx` fica como no ramo **mais** o import `OfficialVoicesPanel`, a aba `{ value: "vozes", label: "Vozes do Nexus", icon: "volume-2", admin: true }` depois de `config`, o filtro `t.admin ? isAdmin : isAdmin || (isStaff && t.staff) || (!isStaff && t.reviewer)` e `{tab === "vozes" && <OfficialVoicesPanel />}` (sem o `<div style={{ overflowX: "auto" }}>` do 25c079d).
- Delete: `supabase/migrations/20261007000100_nexus_questionador.sql`, `supabase/migrations/20261007000100_tutor_speech_director.sql` (refeita na Tarefa 3).
- Rename: `supabase/migrations/20261007000200_tutor_three_professors.sql` → `supabase/migrations/20261003005500_tutor_tres_professores.sql` (e modificar, abaixo).
- Modify: `server/tutor/emotion.ts` (tirar `questionador` de `PERSONA_ENGINE`, `ESCALATION` e `avatarOf`), `server/tutor/prompts.ts` (nota 2.6.0 sem "Questionador"), `.env.example` (só as linhas `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_TRANQUILO`, `ELEVENLABS_VOICE_DURONA`, `ELEVENLABS_VOICE_DIRETO`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_OUTPUT_FORMAT` do 4367f04, logo depois de `OPENAI_API_KEY=""`).
- Test: Create `src/__tests__/tutorTresProfessores.test.ts` (PGlite puro, como `supabaseAnswerKey.test.ts:23-31`, aplicando só as migrações de nome `< "20261003005500"`, gravando os dados e depois aplicando a 5500). Modify `src/__tests__/tutorVoiceMode.test.ts` (linha `engineFor("acolhedor", {}, "sem_filtro").frustration_multiplier` → `0.45`; **muda de propósito**, §16) e `src/__tests__/adminAbasVisiveis.test.tsx` (14 abas; `vi.mock("../novo/app/admin/OfficialVoicesPanel.jsx", () => ({ OfficialVoicesPanel: () => null }))`).

**Interfaces:**
- Produces: `tutor_sessions.legacy_persona jsonb` (`check (legacy_persona is null or jsonb_typeof(legacy_persona) = 'object')`), preenchida **antes** de o Acolhedor virar Tranquilo, com `{ name, emoji }` originais, para toda conversa cujo professor não é `durona` nem `direto`. Depois, o conteúdo do 000200 do 25c079d (Tranquilo no `acolhedor`, ordem 1/2/3, outros desligados, preferências aposentadas → `acolhedor` + `off`, `app_admin_tutor_personalities` e `app_admin_tutor_set_personality` só dos três; o comentário "Conversas existentes mantêm o professor original" passa a explicar a marca de só leitura).

- [ ] **Step 1: Write the failing tests**
```ts
it("conversas antigas do Acolhedor e dos perfis desligados ficam marcadas com o nome e o emoji originais; Durona e Direto não", ...)
  // antes da 5500: sessões (mode 'livre', title 'x', intensity 3) com acolhedor, preguicoso, durona, direto; emoji do acolhedor lido antes
  // depois: legacy_persona = { name: "Acolhedor", emoji: <lido> }; preguicoso = { name: <nome dele>, emoji }; durona e direto: null
it("Tranquilo (id acolhedor) com o jeito do Preguiçoso; ordem Tranquilo, Durona, Direto; os outros desligados", ...)
  // name 'Tranquilo', emoji '😌', style_notes igual ao do preguicoso; position 1/2/3; active só os três
it("preferência num perfil desligado passa para o Tranquilo sem palavrão; Durona e Direto ficam como estavam", ...)
it("conversa nova do Tranquilo, depois da migração, nasce sem a marca", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorTresProfessores.test.ts --maxWorkers=1` — Expected: FAIL (a coluna `legacy_persona` não existe).
- [ ] **Step 3: Implement** o cherry-pick, as remoções e a migração 5500 (o `alter table … add column legacy_persona` e o `update … set legacy_persona = jsonb_build_object('name', t.name, 'emoji', t.emoji) from public.tutor_personalities t where t.id = s.personality_id and s.personality_id not in ('durona', 'direto')` vêm antes do `update … where target.id = 'acolhedor'`).
- [ ] **Step 4: Run** o arquivo e `src/__tests__/tutor.test.ts src/__tests__/tutorV2.test.ts src/__tests__/tutorVoiceMode.test.ts src/__tests__/tutorOfficialVoices.test.ts src/__tests__/tutorOfficialVoicesPanel.test.tsx src/__tests__/tutorRealtimePlayback.test.tsx src/__tests__/tutorVoiceLanguage.test.ts src/__tests__/tutorRealtime.test.tsx src/__tests__/tutorScreen.test.tsx src/__tests__/tutorVoiceModeScreen.test.tsx src/__tests__/tutorGeminiVoiceScreen.test.tsx src/__tests__/termoAceiteTutor.test.ts src/__tests__/tutorAceite.test.tsx src/__tests__/adminAbasVisiveis.test.tsx src/__tests__/supabaseSchema.test.ts` — Expected: PASS (corrigir só o que a junção quebrou). O `expect(moods[0]).toBe("neutral")` de `tutor.test.ts` falha ~1 em 11 por sorteio já existente: rodar de novo; a Tarefa 5 o reescreve.
- [ ] **Step 5: Commit** `git add` dos arquivos tocados (inclusive os do 25c079d); mensagem "Tutor Nexus: traz o trabalho guardado (25c079d) e refaz a migracao dos tres professores com as conversas antigas marcadas".

### Tarefa 2: Banco — começar com o professor, conversas só leitura, limites e aprovações

**Files:**
- Create: `supabase/migrations/20261003005600_tutor_nexus_conversa.sql`
- Modify: `server/tutor/engine.ts` (`Context.session.read_only`; recusa logo depois do aceite, `engine.ts:253`), `server/tutor/realtime.ts` (`startVoice`, logo depois de `consentError()`), `server/tutor/settings.ts` (`TutorSettings` e `DEFAULT_SETTINGS`)
- Create: `src/__tests__/tutorNexusBanco.test.ts` (setup de `tutorVoiceMode.test.ts:96-121`: `openDevDatabaseForTests` + `buildEngineStatements` + `aceitarTermos` + `rpc`; HTTP com `createTutorRouter`)

**Interfaces:**
- Consumes: `legacy_persona` (Tarefa 1).
- Produces:
  - `app_tutor_start(p_mode text, p_topic text default null, p_question_id text default null, p_context jsonb default null, p_personality text default null) returns jsonb` — `drop function public.app_tutor_start(text, text, text, jsonb)` antes; `revoke … from public, anon` depois (a conferência de permissões de `termoAceiteTutor.test.ts:92-130` tem de continuar `aberta`). Aceite pendente continua a primeira recusa. Com `p_personality`: só `acolhedor`, `durona` ou `direto` **ativos**, senão `'Professor não encontrado.'` (`22023`); na mesma transação grava a preferência como `app_tutor_save_preferences` faz hoje (`…3500_tutor_v2.sql:393-408`: `intensity 3`, `profanity` = `max_profanity` do painel se `(params->>'profanity')::int >= 20`, senão `'off'`) e usa esse professor. Sem `p_personality`: como hoje.
  - Só leitura = `s.legacy_persona is not null or not t.active`. `app_tutor_sessions` ganha `read_only` e `personality_id`; `persona` e `personality` (emoji) vêm de `legacy_persona` quando houver. `app_tutor_session` ganha `read_only`; `personality.name/emoji` de `legacy_persona` quando houver. `ch_worker_tutor_context` ganha `session.read_only`.
  - `engine.ts`: `export const PROFESSOR_CHANGED = "Este professor mudou. Comece uma conversa nova."`; `tutorTurn` e `startVoice` lançam `new TutorError(PROFESSOR_CHANGED, 409)` logo depois do aceite.
  - `tutor_config` ganha: `tts_team_only boolean not null default true`, `tts_trial_daily_chars integer not null default 4500 check (0..100000)`, `tts_paid_daily_chars integer not null default 4500 check (0..100000)`, `tts_account_daily_chars integer not null default 4500 check (0..10000000)`, `tts_account_monthly_chars integer not null default 30000 check (0..100000000)`, `tts_price_per_1k_chars_usd numeric(10,6) not null default 0 check (>= 0)`, `stt_price_per_min_usd numeric(10,6) not null default 0 check (>= 0)`. `app_admin_tutor_save_config` (a partir de `…4900:38`) aceita as sete chaves; `ch_worker_tutor_settings` (a partir de `…4400:68`) devolve as sete; `TutorSettings` ganha os mesmos nomes (padrões `true/4500/4500/4500/30000/0/0`).
  - `tutor_voice_approvals (voice text primary key check (voice in ('tranquilo','durona','direto')), fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'), approved_by uuid references auth.users on delete set null, approved_at timestamptz not null default now(), revoked_at timestamptz, revoked_by uuid references auth.users on delete set null, sample_path text)` e `tutor_voice_listen_log (id bigint generated always as identity primary key, user_id uuid not null references auth.users on delete cascade, voice text not null, fingerprint text not null, scenario text not null, heard_at timestamptz not null default now())`; RLS ligada, sem políticas.
  - `ch_worker_tutor_voice_listened(p_user uuid, p_voice text, p_fingerprint text, p_scenario text) returns void`; `ch_worker_tutor_voice_approve(p_user uuid, p_voice text, p_fingerprint text, p_scenarios text[], p_sample_path text) returns jsonb`; `ch_worker_tutor_voice_revoke(p_user uuid, p_voice text) returns jsonb`; `ch_worker_tutor_voice_panel(p_user uuid) returns jsonb` = `{ approvals: { <voz>: { fingerprint, approved_at, revoked_at, sample_path } }, heard: [{ voice, fingerprint, scenario }] }` (audições de `p_user` nas últimas 24 h). Todas exigem `p_user` com papel `admin` (`'Acesso restrito a administradores.'`, `42501`); voz fora das três: `'Voz inválida.'` (`22023`); aprovar sem todas as `p_scenarios` ouvidas por `p_user` para essa `p_fingerprint` nas últimas 24 h: `'Ouça todos os cenários desta voz antes de aprovar.'` (`22023`). Aprovar faz upsert (zera `revoked_at`); revogar grava `revoked_at`; os dois inserem em `admin_audit_log` (`actor_id = p_user`, ações `tutor.voice.approve` / `tutor.voice.revoke`). Devolvem o `ch_worker_tutor_voice_panel(p_user)`.
  - Depósito privado `tutor-voice-samples` (mesmo bloco de `…4700_podcasts.sql:16-25`; `file_size_limit` 5242880; `array['audio/mpeg']`).

- [ ] **Step 1: Write the failing tests**
```ts
it("começar com o professor escolhido grava a conversa e a última escolha juntas; o palavrão da conversa segue a regra de hoje", ...)
  // ('livre', null, null, {type:'free'}, 'durona') → personality.id 'durona'; tutor_preferences durona + max_profanity; 'acolhedor' → 'off'
it("só os três professores ativos: desligado ou inexistente recusa sem criar conversa", ...)
  // 'preguicoso', 'xyz' e o Direto desligado no painel → /Professor não encontrado/; contagem de tutor_sessions igual
it("sem p_personality vale a preferência salva; o aceite pendente continua vindo antes do professor", ...)
it("conversa marcada ou de professor desligado: lista e abertura dizem só leitura com o nome original; turno e voz recusam com 409", ...)
  // legacy_persona {name:'Acolhedor', emoji:'🤗'} → item {read_only:true, persona:'Acolhedor'}; session.personality.name 'Acolhedor'
  // tutorTurn → 409 PROFESSOR_CHANGED; POST /voice/start → 409 { error: "Este professor mudou. Comece uma conversa nova." }
it("painel: 'só equipe', limites e preços com os padrões 4500/4500/4500/30000/0/0/true; salvos com motivo e lidos pelo servidor", ...)
it("aprovação só de administrador e só depois de ouvir todos os cenários da mesma versão nas últimas 24 h; revogar uma não mexe nas outras", ...)
  // sem ouvir → recusa; um cenário só → recusa; outra versão → recusa; heard_at há 25 h → recusa; todos → aprova; aluno → 'Acesso restrito a administradores.'
  // revogar durona: direto continua aprovado; admin_audit_log com tutor.voice.approve e tutor.voice.revoke
it("aprovações e audições: o navegador não lê nem grava; as funções novas são só do servidor", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorNexusBanco.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração e as duas recusas no servidor.
- [ ] **Step 4: Run** o arquivo e `src/__tests__/termoAceiteTutor.test.ts src/__tests__/tutorV2.test.ts src/__tests__/tutor.test.ts src/__tests__/tutorVoiceMode.test.ts src/__tests__/supabaseSchema.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: comecar com o professor escolhido, conversas antigas so leitura, limites no painel e aprovacao das vozes no banco".

### Tarefa 3: Banco — caracteres da voz e leitura da voz pelo direito do Tutor

**Files:**
- Create: `supabase/migrations/20261003005700_tutor_nexus_caracteres.sql`
- Modify: `server/tutor/speech.ts` (só a troca da regra "só assinante": `if (src.config!.requires_pro && !src.is_pro)` vira `if (src.quota?.mode === "blocked") throw new TutorError(TRIAL_OVER, 403)` e `src.used_chars` vira `src.quota?.used_today`; o resto de `/speech` muda na Tarefa 7)
- Create: `src/__tests__/tutorNexusCaracteres.test.ts` (mesmo setup da Tarefa 2; funções `ch_worker_*` chamadas como serviço, como `termoAceiteTutor.test.ts` faz com `asService`)
- Modify (**muda de propósito**, §16 `:1076-1077`): `src/__tests__/tutor.test.ts` — o trecho `update public.tutor_config set voice_enabled = true, requires_pro = true` deixa de esperar 403: o aluno do teste grátis ouve a voz

**Interfaces:**
- Consumes: colunas do painel e `tutor_voice_approvals` (Tarefa 2).
- Produces:
  - `ai_usage_ledger_feature_check` = a lista de `…4900:22-24` mais `'tutor_stt', 'tutor_tts_audicao'`.
  - `tutor_tts_usage (id bigint identity pk, user_id uuid not null references auth.users on delete cascade, session_id uuid references tutor_sessions on delete set null, day date not null default (now() at time zone 'America/Sao_Paulo')::date, month date not null default date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, chars integer not null check (chars between 1 and 4000), status text not null default 'reserved' check (status in ('reserved','spent','refunded')), created_at timestamptz not null default now(), settled_at timestamptz)`; RLS ligada, sem políticas. Contam `reserved` e `spent`.
  - `tutor_tts_quota(p_user uuid) returns jsonb` (apoio, revogado) e `ch_worker_tutor_tts_quota(p_user uuid)` = `{ consent_pending, enabled, mode, staff, voice_enabled, team_only, limit_today, used_today, remaining_today, account_day_left, account_month_left, reserve_can, reserve_remaining_s, approvals: { <voz>: { fingerprint, approved_at, sample_path } } }` — `mode`/`staff`/`enabled` de `tutor_entitlement`; `limit_today` = `tts_paid_daily_chars` (pago e equipe), `tts_trial_daily_chars` (teste), `0` (bloqueado); `reserve_can`/`reserve_remaining_s` = `can_voice` e `voice.remaining_s` do direito; `approvals` só as não revogadas.
  - `ch_worker_tutor_tts_reserve(p_user uuid, p_session_id uuid, p_chars integer) returns jsonb` — travas nesta ordem: `pg_advisory_xact_lock(hashtextextended('tutor-tts:' || p_user::text || ':' || v_day::text, 0))` e `pg_advisory_xact_lock(hashtextextended('tutor-tts-conta', 0))`; `p_chars` fora de 1–4000: `'Texto de voz inválido.'` (`22023`); motivos, nesta ordem: `disabled`, `trial_expired`, `voice_disabled`, `student_limit`, `account_day`, `account_month` → `{ ok: false, reason, quota }`; senão `{ ok: true, reservation, quota }`.
  - `ch_worker_tutor_tts_settle(p_user uuid, p_reservation bigint, p_spent boolean, p_entry jsonb) returns void` — só muda linha `reserved` do próprio aluno (repetir não faz nada); gasto: `spent` + uma linha `tutor_tts` no `ai_usage_ledger` com `characters` = os reservados, `provider`, `model`, `estimated_cost_usd` e `meta {reservation}` de `p_entry` (mesmas colunas e `greatest(0, …)` de `ch_worker_tutor_ledger`, `…3500:824-840`); estorno: `refunded`, sem registro.
  - `ch_worker_tutor_speech` (a partir de `…5400:350`): mesmas regras de aceite e "não achou"; saem `requires_pro`, `is_pro` e `used_chars`; entram `quota` (`tutor_tts_quota`), `session_id` e `direction` = `m.meta -> 'personality'` para `kind = 'message'` (nulo para `question` e `phrase`).

- [ ] **Step 1: Write the failing tests**
```ts
it("teste grátis e plano pago: 4.500 caracteres por dia; o que passar recusa com student_limit", ...)
it("tetos da conta (4.500 por dia e 30.000 por mês) valem para todos juntos", ...)
  // dois alunos com 3.000 → o segundo recebe account_day; linhas 'spent' noutros dias do mês somando 29.000 → 1.500 recusa account_month
it("dois pedidos ao mesmo tempo não passam do limite", ...)  // Promise.all de dois reserve(3000) com limite 4500 → exatamente um ok
it("estorno devolve; gasto vira uma linha tutor_tts (a Central de IAs soma) e sobe ai_usage.voice_chars; acertar de novo não duplica", ...)
it("dia de Brasília e mês do calendário: o de ontem não conta hoje; o do mês passado não conta no mês", ...)  // Review Focus 4
  // linhas com day = today_br() - 1 e month = date_trunc('month', today_br() - 31); e uma linha nova cujo day padrão = today_br()
it("audição (tutor_tts_audicao) e transcrição (tutor_stt) entram no registro por ch_worker_tutor_ledger e não contam nos limites nem nos tetos", ...)
it("teste terminado, Tutor desligado e voz desligada recusam antes de reservar", ...)
it("leitura da voz: a fala traz o estado com que foi escrita (meta.personality), não o humor atual; frase fixa sem estado; sem requires_pro/is_pro/used_chars", ...)
it("funções novas só do servidor; tutor_tts_usage sem leitura pelo navegador", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorNexusCaracteres.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração e a troca em `speech.ts`.
- [ ] **Step 4: Run** o arquivo e `src/__tests__/termoAceiteTutor.test.ts src/__tests__/tutor.test.ts src/__tests__/supabaseSchema.test.ts` — Expected: PASS (o "aceite antes do plano" de `termoAceiteTutor.test.ts` continua: `TRIAL_OVER` também diz "planos pagos").
- [ ] **Step 5: Commit** "Tutor Nexus: caracteres da voz com reserva, estorno e tetos da conta; leitura da voz com o estado da fala".

### Tarefa 4: Banco — a chamada `tts` (abrir, manter, encerrar, trava de turno)

**Files:**
- Create: `supabase/migrations/20261003005800_tutor_nexus_chamada.sql`
- Create: `src/__tests__/tutorNexusChamada.test.ts`

**Interfaces:**
- Consumes: `tutor_tts_quota` (Tarefa 3), `legacy_persona` (Tarefa 1).
- Produces:
  - `tutor_voice_calls.provider` aceita `'tts'`; colunas `turn_id text check (turn_id ~ '^[A-Za-z0-9_-]{8,64}$')`, `turn_until timestamptz`, `turn_result jsonb`.
  - `tutor_voice_seconds` (a partir de `…3500:188`) ignora `provider = 'tts'`.
  - `ch_worker_tutor_tts_open(p_user uuid, p_session_id uuid, p_force boolean, p_spoken boolean) returns jsonb` — mesma trava por aluno de `ch_worker_tutor_voice_start` (`…4400:91-136`), mesma limpeza de reservas vencidas; motivos `not_found`, `session_closed`, `read_only`, `busy` (outra chamada ativa sem `p_force`), `disabled`, `trial_expired`, `voice_disabled`; com `p_spoken` também `student_limit`/`account_day`/`account_month` (pela `tutor_tts_quota`). **Não** olha o tempo da voz ao vivo. Com `p_force`, encerra a anterior como `replaced` (segundos só se ela não for `tts`). Grava `provider 'tts'`, `model 'tts'`, `lease_until = now() + voice_lease_seconds`; chama `tutor_begin_trial`. Devolve `{ ok: true, voice_call_id, lease_seconds, replaced_call_id, replaced_provider }` ou `{ ok: false, reason }`.
  - `ch_worker_tutor_voice_start` (`…4400:91`): chamada ativa `tts` do mesmo aluno é encerrada como `replaced`, **sem** `p_force` e sem segundos.
  - `ch_worker_tutor_voice_renew` (`…4400:139`): para `tts`, só renova `lease_until` por `voice_lease_seconds` (para com `stop` se o Tutor estiver desligado, bloqueado ou com a voz desligada); `ch_worker_tutor_voice_end` (`…4400:192`) e `ch_worker_tutor_voice_sweep` (`…4400:216`): `tts` termina com `consumed_seconds = 0`, sem linha no registro e sem somar em `tutor_sessions.voice_seconds`; `ch_worker_tutor_voice_attach` (`…4900:26`) aceita `'tts'`.
  - `ch_worker_tutor_tts_turn_begin(p_user uuid, p_voice_call uuid, p_turn_id text) returns jsonb` — `for update` na chamada; não ativa/não `tts`/de outro aluno: `{ ok: false, reason: 'closed' }`; `turn_id = p_turn_id` com `turn_result` gravado: `{ ok: false, reason: 'repeat', result: turn_result }`; `turn_until > now()`: `{ ok: false, reason: 'busy' }`; senão grava `turn_id`, `turn_until = now() + interval '60 seconds'`, `turn_result = null` → `{ ok: true }`.
  - `ch_worker_tutor_tts_turn_end(p_user uuid, p_voice_call uuid, p_turn_id text, p_result jsonb) returns void` — só se `turn_id = p_turn_id`: `turn_until = null`, `turn_result = p_result` (nulo na falha, para a nova tentativa rodar).
  - `ch_worker_tutor_voice_metrics` (`…4400:247`) aceita também `stt_ms_avg`, `engine_ms_avg`, `tts_ms_avg`, `play_start_ms_avg` (números).

- [ ] **Step 1: Write the failing tests**
```ts
it("abrir tts não depende do tempo da voz ao vivo (dia e teste inteiro esgotados) e não gasta segundos ao renovar e encerrar", ...)
it("abrir tts exige Tutor ligado, voz ligada e direito ao Tutor; com p_spoken, também caracteres; sem p_spoken, abre sem caracteres", ...)
it("uma chamada ativa por aluno: a segunda aba recebe busy; com p_force assume; abrir a voz ao vivo encerra a tts sozinha", ...)  // Review Focus 3
it("tts não cai enquanto renova; sem renovar, a varredura encerra sem segundos e sem registro", ...)
it("trava de turno de 60 s: o segundo pedido recebe busy; o mesmo client_turn_id depois de terminado devolve o resultado guardado", ...)
  // begin(T1) ok; begin(T2) busy; end(T1, {intent:'message'}); begin(T1) → repeat com o resultado; begin(T2) ok;
  // end(T2, null) → begin(T2) ok de novo; turn_until vencido → ok
it("conversa encerrada, de outro aluno ou só leitura não abre", ...)
it("métricas aceitam os tempos de cada etapa", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorNexusChamada.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração.
- [ ] **Step 4: Run** o arquivo e `src/__tests__/tutorVoiceMode.test.ts src/__tests__/tutorGeminiVoice.test.ts src/__tests__/termoAceiteTutor.test.ts src/__tests__/tutor.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: chamada tts com trava de turno, sem gastar o tempo da voz ao vivo".

### Tarefa 5: Motor — Durona firme e aliviada, Direto comemora, prompt sem colchetes

**Files:**
- Modify: `server/tutor/emotion.ts`, `server/tutor/engine.ts`, `server/tutor/realtime.ts` (a chamada de `stateLayer` em `startVoice` passa o palavrão da sessão), `server/tutor/prompts.ts`, `supabase/migrations/20261003005600_tutor_nexus_conversa.sql` (acrescentar no fim o texto da Durona)
- Create: `src/__tests__/tutorNexusMotor.test.ts`
- Modify (**mudam de propósito**, §16): `src/__tests__/tutor.test.ts` — `expect(moods[0]).toBe("neutral")` → `"firm"`; no bloco "motor de personalidade humana": 1º erro da Durona `5 + 11` → `25`; `d.trail.map(band)` → `[1, 2, 3]`; "pesos extras" e "variação humana" da Durona medidos no **2º** erro (prefixo `wrong()`; valores 19, 10, `> base + 25`, diferença 15–16 continuam); `prompt_version: "2.6.1"` → `"2.7.0"`. `src/__tests__/tutorVoiceMode.test.ts` — a inércia ("acerto depois de erros não vira festa") passa a esperar `relieved` (evento e humor) e frustração ≤ 40.

**Interfaces:**
- Produces:
  - `Mood` += `"firm" | "relieved"`. `PersonaEngine` += `first_error_band?: [number, number]` e `relief?: "relieved" | "celebrate"`. `PERSONA_ENGINE.durona` += `first_error_band: [25, 40], relief: "relieved"`; `PERSONA_ENGINE.direto` += `relief: "celebrate"` (`DURONA_LEVELS` não mexem nesses campos).
  - `step`: no erro com `first_error_band` e `consecutiveErrors === 1`: sem ruído e frustração presa na faixa; humor `firm`. No acerto com `relief` e `prev.consecutiveErrors >= 1`: evento `relieved` ou `celebrate` (no lugar de `recovering`), frustração `min(…, 40)`; humor `relieved` (Durona) ou `impressed`/`pleased` pela regra de `moodOf` com piso `pleased` (Direto). `frustrationDelta` continua o que subiu pelos fatos. Sem `relief`, como hoje.
  - `languageIntensity`: `relieved` conta como 3. `MOOD_PT`: `firm: "firme"`, `relieved: "aliviado"`. `avatarOf`: `firm` → animação e rosto `skeptical`, `voiceStyle "firm"`; `relieved` → animação `happy`, rosto `smile`, `voiceStyle "warm"`.
  - `stateLayer(personaId: string, s: TutorState, engine: PersonaEngine, profanity: "off" | "mild" | "moderate" = "moderate"): string`. Textos dos eventos (exatos): `relieved` + moderado: `acertou logo depois de errar: mostre alívio agora, com um palavrão sobre a situação, nunca contra o aluno (ex.: "Ufa, porra, até que enfim!")`; `relieved` abaixo: `acertou logo depois de errar: mostre alívio agora, com palavras leves, sem palavrão (ex.: "Ufa, até que enfim!")`; `celebrate` + moderado: `acertou logo depois de errar: comemore com um palavrão sobre a situação, nunca contra o aluno (ex.: "Isso, porra. Essa era difícil.")`; `celebrate` abaixo: `acertou logo depois de errar: comemore com palavras leves, sem palavrão (ex.: "Isso! Essa era difícil.")`. Com esses eventos e moderado, o "nunca obrigatório" da linha de intensidade vira "obrigatório só no alívio ou na comemoração pedidos acima". `ESCALATION.durona` ganha a linha `Acertou logo depois de errar: alívio de verdade, com um palavrão sobre a situação ("Ufa, porra, até que enfim!"); acerto sem erro antes: reconhece do seu jeito ("Tá. Essa foi bonita, vai.").`; `ESCALATION.direto` ganha `Comemoração (acerto difícil, sequência de acertos ou acerto depois de errar): palavrão de alegria sobre a situação ("Isso, porra. Essa era difícil.").`
  - `engine.ts`: `meta.personality` ganha `enthusiasm: before.enthusiasm`; `TurnResult.message.voice_avatar = avatarOf(ctx.personality.id, before)` (o estado com que o texto foi escrito; `message.avatar` continua como hoje); `TutorAction.chargeText?: boolean` — `const charged = action.chargeText ?? !voiceTurn` substitui `!voiceTurn` na conferência de `can_text`, na reserva de interação e no `feature: "tutor_voice_backend"` (só quando `voiceTurn && !charged`).
  - `prompts.ts`: em "COMO VOCÊ FALA" de `BASE_TUTOR_PROMPT`, a linha exata `- Nunca escreva marcações entre colchetes nem indicações de som ou de tom (risada, suspiro, grito): a atuação da voz é decidida pelo sistema.`; `TUTOR_VERSION = "2.7.0"` com a nota `2.7.0: Nexus por voz: Durona firme no 1º erro e aliviada no acerto depois de errar; Direto comemora com palavrão; sem marcações entre colchetes.`
  - Migração 5600 (fim): `update public.tutor_personalities set style_notes = replace(style_notes, 'Quando o aluno melhora, reconhece do seu jeito, meio a contragosto ("Tá. Essa foi bonita, vai.").', 'Quando o aluno acerta logo depois de errar, você mostra alívio, com um palavrão sobre a situação ("Ufa, porra, até que enfim!"); num acerto sem erro antes, reconhece do seu jeito, meio a contragosto ("Tá. Essa foi bonita, vai.").') where id = 'durona';`

- [ ] **Step 1: Write the failing tests**
```ts
it("Durona: 1º erro firme entre 0,25 e 0,40, sem sorteio (rand 0 e 0,999 dão o mesmo), nos três níveis", ...)
it("Durona: 2º erro seguido no mesmo ponto (repetido) impaciente (41–60) e 3º irritada ou mais (≥ 61), com DETERMINISTIC_TUTOR", ...)
  // nível forte: 25 → 51 → 77; sem_filtro: 25 → 54 → 84 (os números de 2º e 3º erro são os de hoje; ajustáveis na audição)
it("Durona: acerto logo depois de 1 erro vira alívio (≤ 40), mesmo vindo de irritação alta; sem 'recovering'; acerto sem erro antes como hoje", ...)
it("Direto: solto desde a 1ª fala (intensidade 2); acerto depois de erro comemora com palavrão dentro do teto", ...)
  // evento 'celebrate', humor 'pleased', profanityForIntensity(li) 'moderate'; stateLayer(..., 'moderate') contém "Isso, porra. Essa era difícil."
it("teto abaixo de moderado: Durona aliviada e Direto comemorando pedem palavras leves", ...)  // stateLayer(..., 'mild') contém "sem palavrão" e não "porra"
it("Tranquilo nunca xinga: intensidade ≤ 1; acerto depois de 2 erros continua 'recovering'", ...)
it("conferência: palavrão de alívio sobre a situação passa; ofensa ao aluno é barrada mesmo no alívio", ...)
  // languageViolations("Ufa, porra, até que enfim!", "moderate") → []; com ", seu burro" → personal_attack; com "mild" → profanity
it("prompt proíbe marcações entre colchetes e não traz nenhuma", ...)
  // composeSystem({ mode: 'livre', browserVoice: true, persona: 'x' }) contém "Nunca escreva marcações entre colchetes"; não casa /\[(angry|laughs|sighs|frustrated|encouraging|risos)\]/i
it("meta.personality guarda humor, frustração e entusiasmo com que a resposta foi escrita; voice_avatar usa esse estado", ...)
it("turno com chargeText gasta 1 interação mesmo com voiceCallId; a delegação do GPT-Live continua sem gastar", ...)
it("texto do jeito da Durona no banco pede alívio no acerto depois de erro", ...)  // contém "Ufa, porra, até que enfim!" e não "Quando o aluno melhora"
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorNexusMotor.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e `src/__tests__/tutor.test.ts src/__tests__/tutorVoiceMode.test.ts src/__tests__/tutorV2.test.ts src/__tests__/tutorGeminiVoice.test.ts src/__tests__/tutorNexusBanco.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: Durona firme no primeiro erro e aliviada no acerto, Direto comemora com palavrao, prompt sem colchetes".

### Tarefa 6: Speech Director e vozes oficiais: humores novos, cenários por voz e versão da voz

**Files:**
- Modify: `server/tutor/speechDirector.ts`, `server/tutor/elevenlabsTts.ts`, `server/tutor/officialVoices.ts`, `src/shared/tutor/officialVoices.ts`, `server/tutor/speech.ts`, `server/tutor/engine.ts` (`TutorDeps.elevenEnv`), `server/tutor/voicePreview.ts` (só `new OfficialElevenLabsSpeech(env, fetchImpl)`, sem o terceiro argumento; o resto muda na Tarefa 8)
- Delete: `server/tutor/elevenlabsApprovals.ts`
- Modify (**mudam de propósito**, §16): `src/__tests__/tutorOfficialVoices.test.ts` (aprovação no código, "as três vozes", `releaseReady`/`allApproved`, estabilidade); `src/__tests__/tutor.test.ts` (saem os testes de `resolveSpeechProvider`, `OpenAISpeech`, `GeminiSpeech` e `ElevenLabsSpeech` — o bloco que começa em `expect(resolveSpeechProvider({}).status)` até o fim do teste de `new ElevenLabsSpeech(`: `TUTOR_VOICE_PROVIDER` deixa de decidir a voz)

**Interfaces:**
- Produces:
  - `speechDirector.ts`: `export const SPEECH_PROFILES` (o `PROFILE` de hoje + `firm: { stability: 0.6, style: 0.24, speed: 0.02 }` e `relieved: { stability: 0.62, style: 0.3, speed: -0.04 }`); `export const TAG_RULES = { minIntensity: 0.4, durona: { angry: "[angry]", irritated: "[frustrated]", impatient: "[frustrated]" }, tranquilo: { irritated: "[sighs]", impatient: "[sighs]", disappointed: "[sighs]" }, good: { pleased: "[encouraging]", encouraged: "[encouraging]", impressed: "[encouraging]" } } as const`; `export const SPEED_RANGE = [0.85, 1.12] as const`. `speechDirectionFromState` e `elevenLabsVoiceSettings` com as mesmas regras (os humores novos usam a frustração como intensidade). Nenhuma marcação nova (alívio sem marcação confirmada: vem do ritmo e do estilo).
  - `elevenlabsTts.ts`: `officialSpeechDirection(id, direction, model)` usa `TAG_RULES` e `SPEED_RANGE` (mesmo resultado de hoje para os humores antigos); `class OfficialElevenLabsSpeech { constructor(env = process.env, fetchImpl = fetch); synthesize(text, voice) }` — exige só `row.ready` (sai o `preview`, sai `releaseReady`, sai o preço por minuto); `export function elevenSynth(deps: Pick<TutorDeps, "speech" | "elevenEnv" | "fetch">): SpeechProvider | null` = `deps.speech` quando definido (testes; `null` = desligada), senão `new OfficialElevenLabsSpeech(deps.elevenEnv ?? process.env, deps.fetch ?? fetch)`.
  - `server/tutor/officialVoices.ts`: `export interface Approval { fingerprint: string; approved_at: string; sample_path: string | null }`; `export interface ReadinessRow { id: OfficialVoice; label: string; configured: boolean; unique: boolean; ready: boolean; approved: boolean; fingerprint: string; pending: string | null }`; `fingerprintParts(id, env)` = `{ id, voiceId, model, format, profile: OFFICIAL_VOICES[id], scenarios: scenariosFor(id).map((k) => [k, VOICE_SCENARIOS[k]]), direction: { profiles: SPEECH_PROFILES, tags: TAG_RULES, speed: SPEED_RANGE } }`; `fingerprintOf(parts): string` (sha256 hex do JSON); `voiceFingerprint(id, env) = fingerprintOf(fingerprintParts(id, env))`; `elevenLabsReadiness(env, approvals: Partial<Record<OfficialVoice, Approval>> = {}) → { model, keyConfigured, pending, rows: ReadinessRow[] }` (`approved` = mesma versão). Saem `VOICES`, `VOICE_DIRECTION_REVISION`, `allApproved`, `releaseReady`. (`elevenLabsSelected` fica até a Tarefa 7.)
  - `src/shared/tutor/officialVoices.ts`: `VOICE_SCENARIOS` ganha `only?: OfficialVoice` e três cenários: `firme: { label: "1º erro firme", emotion: "firm", intensity: 0.3, only: "durona", text: "Sério isso? Você tinha o diagnóstico na mão e jogou fora na conduta." }`, `alivio: { label: "Alívio com palavrão", emotion: "relieved", intensity: 0.35, only: "durona", text: "Ufa, porra, até que enfim! Dessa vez você usou a informação do enunciado para sustentar a resposta." }`, `comemoracao: { label: "Comemoração com palavrão", emotion: "impressed", intensity: 0.7, only: "direto", text: "Isso, porra. Essa era difícil. Boa. Agora sim." }` (frases do §4 e dos exemplos já no banco); `export function scenariosFor(id: OfficialVoice): VoiceScenario[]` (os cinco de hoje na ordem de hoje e depois os dela).
  - `speech.ts`: `speechProviderFor(deps)` → `{ provider: elevenSynth(deps), status }` (sem `deps.speech`, o status sai de `elevenLabsReadiness(deps.elevenEnv ?? process.env)`: `ready = !pending && rows.some((r) => r.ready)`, `provider "elevenlabs"`). Saem `resolveSpeechProvider`, `OpenAISpeech`, `GeminiSpeech`, `ElevenLabsSpeech`, `DEFAULT_MODEL`, `DEFAULT_PRICE`. `TutorDeps.elevenEnv?: NodeJS.ProcessEnv` (testes).

- [ ] **Step 1: Write the failing tests** (em `tutorOfficialVoices.test.ts`)
```ts
it("cenários por voz: os cinco de hoje para as três; 'firme' e 'alivio' só da Durona; 'comemoracao' só do Direto", ...)
  // scenariosFor('durona') = ['apresentacao','erro','repeticao','acerto','pronuncia','firme','alivio']; tranquilo = 5; direto = 5 + 'comemoracao'
it("a versão da voz junta voz, modelo, formato, cenários dela e a direção do Speech Director; mudar qualquer um muda a versão", ...)
  // parts.direction toEqual { profiles: SPEECH_PROFILES, tags: TAG_RULES, speed: SPEED_RANGE }; cópia com profiles.firm.style alterado → fingerprintOf diferente
it("cada voz vale sozinha: aprovada a Durona, Tranquilo e Direto seguem sem aprovação; aprovação de outra versão não vale; não há 'releaseReady'", ...)
it("firme e alívio: no v3 a estabilidade fica 0,5 e o alívio muda estilo e ritmo; no multilingual_v2 também a estabilidade; nenhuma marcação", ...)
  // relieved 0.35 v3 → stability 0.5, style > neutro, speed < base; v2 → stability 0.56; firm 0.3 → tag ''
it("o transporte só exige a voz configurada: quem decide aprovação é o servidor", ...)
it("TUTOR_VOICE_PROVIDER não decide mais: sem deps.speech o servidor usa a voz oficial", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorOfficialVoices.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e `src/__tests__/tutor.test.ts src/__tests__/tutorVoiceLanguage.test.ts src/__tests__/termoAceiteTutor.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: Speech Director com firme e alivio, cenarios por voz e versao da voz com a direcao".

### Tarefa 7: `/speech` pelo direito do Tutor, limites por plano e aprovação por voz

**Files:**
- Create: `server/tutor/nexus.ts`
- Modify: `server/tutor/speech.ts` (`tutorSpeech`), `server/tutor/router.ts` (`/status` sem `tts_only`; `/voice/start` sem o 409), `server/tutor/officialVoices.ts` (sai `elevenLabsSelected`), `.env.example` (saem `TUTOR_VOICE_PROVIDER`, `TUTOR_VOICE_MODEL`, `TUTOR_VOICE_DAILY_CHARS`, `TUTOR_VOICE_PRICE_PER_MIN` e o bloco de comentário da "voz natural antiga")
- Create: `src/__tests__/tutorNexusFala.test.ts` (dev DB + `createTutorRouter`; `deps.elevenEnv` com chave falsa de 32+ caracteres, `TUTOR_VOICE_ALLOW_EXTERNAL: "1"` e três `voice_id` válidos; `deps.fetch` falso que guarda o corpo e responde `audio/mpeg`)
- Modify (**mudam de propósito**, §16): `src/__tests__/tutor.test.ts` (`/status` sem `tts_only`, `:957`; sai `TUTOR_VOICE_DAILY_CHARS`, `:1071-1072`; a voz do teste usa `deps.elevenEnv`, aprovação gravada e `tts_team_only = false`), `src/__tests__/tutorOfficialVoices.test.ts` (sai `tts_only`/409; "o estado do banco chega à voz" passa a ser o da mensagem), `src/__tests__/termoAceiteTutor.test.ts` ("depois do aceite": `deps.elevenEnv`, aprovações gravadas e `tts_team_only = false`; o "aceite antes do plano" continua passando com `TRIAL_OVER`)

**Interfaces:**
- Consumes: `ch_worker_tutor_speech` com `quota`/`direction`, `ch_worker_tutor_tts_reserve`/`settle` (Tarefa 3); `elevenLabsReadiness`, `elevenSynth`, `speechDirectionFromState` (Tarefa 6); `TRIAL_OVER`, `consentError` (engine).
- Produces (`nexus.ts`):
  - `export type ElevenBlock = "voice_off" | "not_configured" | "not_approved" | "team_only" | "student_limit" | "account_day" | "account_month"`
  - `export interface TtsQuota` = o JSON de `tutor_tts_quota` (Tarefa 3), com `approvals: Partial<Record<OfficialVoice, Approval>>`.
  - `export function elevenAccessOf(i: { quota: TtsQuota; row: ReadinessRow | null; need?: number }): { ok: boolean; reason: ElevenBlock | null }` — nesta ordem: `voice_off` (`!voice_enabled`), `not_configured` (`!row?.ready`), `not_approved` (versão aprovada ≠ `row.fingerprint` e não é equipe), `team_only` (não é equipe e `team_only`), `student_limit` (`remaining_today < need`), `account_day`, `account_month`; `need` padrão 1.
  - `export const VOICE_BLOCK_ERROR: Record<ElevenBlock, { status: number; code: string; message: string }>` — `voice_off` → 503 `voice_disabled` "A voz do Tutor está desligada."; `not_configured`/`not_approved`/`team_only` → 409 `voice_unavailable` "A voz do professor não está disponível agora."; `student_limit` → 429 `voice_student_limit` "Você usou sua voz de hoje"; `account_day` → 429 `voice_account_day` "A voz da plataforma acabou por hoje"; `account_month` → 429 `voice_account_month` "A voz da plataforma acabou neste mês".
  - `export const minutesOf = (chars: number) => Math.floor(Math.max(0, chars) / CHARS_PER_MINUTE)`.
- Produces (`speech.ts`): `export function speechCut(text: string, max = 450): string` — até `max`, corta no último `". "`, `"? "`, `"! "` ou `"… "` que esteja depois da metade (pontuação incluída); sem isso, no último espaço antes de `max`. `tutorSpeech`, nesta ordem: aceite → não achou (404) → Tutor/voz desligados (503 "A voz do Tutor está desligada.") → `quota.mode === "blocked"` (403 `TRIAL_OVER`) → texto (`message`: `speechCut(speechInput(src.text))`; `phrase`: `phraseText`; `question`: `speechInput`) → `elevenAccessOf({ quota, row, need: text.length })` → cache (acerto não reserva nem cobra) → reserva (motivos com `VOICE_BLOCK_ERROR`; `disabled` 503, `trial_expired` 403 `TRIAL_OVER`) → `synthesize` com `{ ...src.voice, personality, direction }` (`message`: `speechDirectionFromState(src.direction)`; frases e questão: neutro intensidade 0) → falhou: estorno e 502 `{ error: "A voz natural falhou agora.", code: "voice_failed" }` → gasto com `estimated_cost_usd = text.length / 1000 * settings.tts_price_per_1k_chars_usd`. Sai `DAILY_CHARS` e toda mensagem que promete "a voz do aparelho". Erros com `code` saem pelo `failTutor` de `router.ts`.

- [ ] **Step 1: Write the failing tests**
```ts
it("aluno do teste grátis ouve a voz aprovada até o limite do dia; depois 429 'Você usou sua voz de hoje' (voice_student_limit)", ...)
it("a voz do professor funciona com o tempo da voz ao vivo esgotado (dia e teste inteiro)", ...)
it("limite por plano: pago usa tts_paid_daily_chars; equipe conta como pago", ...)
it("tetos da conta: 'A voz da plataforma acabou por hoje' e 'A voz da plataforma acabou neste mês'", ...)
it("sem aprovação o aluno recebe 409 voice_unavailable e nada é gerado; a equipe ouve a voz não aprovada; 'só equipe' barra aluno mesmo com voz aprovada", ...)
it("aprovação revogada ou versão mudada: a próxima fala recusa na hora", ...)  // Review Focus 5: ch_worker_tutor_voice_revoke e depois troca do voice_id em elevenEnv
it("estorno quando a voz não sai: fornecedor fora do ar devolve os caracteres e responde 502 voice_failed", ...)
it("a voz usa o estado com que a fala foi escrita (meta.personality), não o humor atual da conversa; frase fixa sai neutra", ...)
it("corte da fala: até ~450 caracteres num fim de frase; sem fim de frase, no último espaço; a mensagem gravada continua inteira", ...)
it("colchetes do texto viram parênteses; a marcação só vem do Speech Director", ...)
it("ouvir de novo sai do cache, sem gerar nem cobrar", ...)
it("teste terminado: 403 com a mensagem do teste antes de qualquer voz; mensagens sem nome de fornecedor", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorNexusFala.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e `src/__tests__/tutor.test.ts src/__tests__/tutorOfficialVoices.test.ts src/__tests__/termoAceiteTutor.test.ts src/__tests__/tutorVoiceMode.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: voz do professor pelo direito do Tutor, limites por plano, tetos da conta e aprovacao por voz".

### Tarefa 8: Aprovação no servidor e amostra do "Ouvir"

**Files:**
- Modify: `server/tutor/voicePreview.ts` (refeito sobre o `TutorDeps`), `server/tutor/router.ts` (`GET /voice/sample/:personality`), `server/tutor/engine.ts` (`TutorDeps.storage?: Storage`), `server.ts` (`tutorDeps` ganha `storage: tutorVoiceSamplesStorage(hub.deps.db.mode)`; `app.use("/api/tutor/voices", createVoicePreviewRouter(tutorDeps))`), `.env.example` (`TUTOR_VOICE_APPROVERS=""` com o comentário "e-mails que podem aprovar e revogar as vozes do Nexus, separados por vírgula")
- Delete: `nexus-lab.html`, `src/nexus-lab/main.jsx`, `src/nexus-lab/nexus-lab.css`, `vite.nexus.config.ts` (o laboratório encaminha a conversa para a produção e só tem a chave pública: não registra audição nem aprova)
- Create: `src/__tests__/tutorVozesAprovacao.test.ts` (os dois roteadores num Express; `deps.storage = localStorageDir(<tmp>)`); Modify `src/__tests__/tutorOfficialVoices.test.ts` (a parte do painel de audição passa para o roteador novo)

**Interfaces:**
- Consumes: `ch_worker_tutor_voice_listened/approve/revoke/panel` (Tarefa 2), `ch_worker_tutor_ledger` com `tutor_tts_audicao` (Tarefa 3), `elevenLabsReadiness`, `scenariosFor`, `elevenSynth` (Tarefa 6).
- Produces:
  - `createVoicePreviewRouter(deps: TutorDeps | null, env: NodeJS.ProcessEnv = process.env)`; login por `deps.db.authenticate`; administrador por `deps.db.asUser(user, "app_admin_tutor_config")` (como hoje); `export function voiceApprovers(env): string[]` (vírgulas, sem espaços, minúsculas); `export const SAMPLE_BUCKET = "tutor-voice-samples"`; `export const samplePath = (voice: OfficialVoice, fingerprint: string) => \`${voice}/${fingerprint}.mp3\``; `export function tutorVoiceSamplesStorage(mode: ContentDb["mode"]): Storage` (como `lessonsStorage`, `server/lessons/router.ts:50-52`; local em `.data/tutor-voice-samples`).
  - `GET /` → `VoicePanel = { model, keyConfigured, pending, approver: boolean, rows: (ReadinessRow & { approved_at: string | null; scenarios: { id: VoiceScenario; label: string; heard: boolean }[]; can_approve: boolean })[] }` (`heard` = audição desta versão nas últimas 24 h; `can_approve` = `approver && ready && todos ouvidos && !approved`).
  - `POST /preview { personality, scenario }` — só essas duas chaves; cenário fora de `scenariosFor(voz)`: 400 "Voz ou cenário de teste inválido."; grava a audição (também no acerto do cache); gerou: linha `tutor_tts_audicao` (`characters`, `estimated_cost_usd` pelo preço do painel). Mantém o limite de 12 por minuto e o cache de 20 áudios de hoje.
  - `POST /approve { personality }` e `POST /revoke { personality }` — fora de `TUTOR_VOICE_APPROVERS`: 403 "Só quem está na lista de aprovação pode aprovar ou revogar."; o navegador nunca manda a versão; aprovar grava a "Apresentação" (do cache ou gerada de novo, como audição) em `samplePath(voz, versão)` e chama `ch_worker_tutor_voice_approve(p_user, voz, versão, scenariosFor(voz), caminho)`; recusa do banco sai 409 com a mensagem dele. Devolvem `VoicePanel`.
  - Aluno: `GET /api/tutor/voice/sample/:personality` — aceite pendente: 403 `tutor_consent`; voz aprovada na versão atual e com amostra: 200 `audio/mpeg` (`Cache-Control: private, max-age=3600`), sem gerar nada; senão 404 "Amostra indisponível.".

- [ ] **Step 1: Write the failing tests**
```ts
it("aprovar só depois de o servidor registrar todos os cenários daquela versão nas últimas 24 h; o navegador não manda a versão", ...)
it("só quem está em TUTOR_VOICE_APPROVERS aprova ou revoga; outro administrador ouve mas não aprova; aluno nem ouve", ...)
it("cada voz vale sozinha e na hora; revogar uma não mexe nas outras", ...)
it("a aprovação cai sozinha quando a versão muda (outro voice_id, modelo, formato ou cenário)", ...)
it("ao aprovar, a Apresentação vai para tutor-voice-samples/<voz>/<versão>.mp3 e é ela que toca no Ouvir do aluno, sem gerar voz", ...)
it("audições entram como tutor_tts_audicao e não contam no limite de quem ouviu nem nos tetos", ...)
it("o painel não escolhe a voz: só personalidade e cenário; nenhuma chave nas respostas", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorVozesAprovacao.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e `src/__tests__/tutorOfficialVoices.test.ts src/__tests__/tutorNexusFala.test.ts src/__tests__/vercelBuild.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: aprovacao das vozes pelo painel com a lista do servidor e amostra guardada para o Ouvir".

### Tarefa 9: Transcrição — `POST /api/tutor/voice/transcribe`

**Files:**
- Create: `server/tutor/stt.ts`
- Modify: `server/tutor/router.ts`, `server/tutor/engine.ts` (`TutorDeps.stt?: SttConfig`), `.env.example` (`TUTOR_STT_ALLOW_EXTERNAL=""` e `TUTOR_STT_MODEL=""`, com o comentário "transcrição da fala do aluno na Nexus; usa OPENAI_API_KEY; o áudio não é guardado")
- Create: `src/__tests__/tutorNexusTranscricao.test.ts`

**Interfaces:**
- Consumes: `voiceCall` (realtime.ts), `ch_worker_tutor_context` (aceite), `tutorSettings` (pronúncias e preço), `ch_worker_tutor_ledger`.
- Produces:
  - `export interface SttConfig { ready: boolean; model: string; key: string | null; pending: string | null }`; `export function sttConfig(env = process.env): SttConfig` — pronta só com `TUTOR_STT_ALLOW_EXTERNAL === "1"` e `realKey(env.OPENAI_API_KEY)`; `model = (env.TUTOR_STT_MODEL ?? "").trim() || STT_DEFAULT_MODEL`.
  - `export const STT_DEFAULT_MODEL = "gpt-4o-mini-transcribe"` — **conferir no dia** na documentação oficial da OpenAI o modelo de transcrição em português e o preço por minuto; se mudou, ajustar e citar a fonte no comentário (o preço vai no painel, `stt_price_per_min_usd`).
  - `export function sttPrompt(terms: string[]): string` = `"Conversa de estudo de medicina para o Revalida, em português do Brasil. Comandos: alternativa A, alternativa B, alternativa C, alternativa D, confirmo, cancela, dica, próxima."` + (`terms.length ? \` Termos: ${terms.slice(0, 40).join(", ")}.\` : ""`), com os termos das pronúncias do painel.
  - `export const MAX_AUDIO_BYTES = 4 * 1024 * 1024; export const MAX_AUDIO_SECONDS = 45; export const STT_FAILED = "Não entendi, pode repetir ou digitar?"`
  - `export async function transcribe(deps: TutorDeps, userId: string, voiceCallId: string, audio: Buffer, mime: string, seconds: number): Promise<{ text: string }>` — POST multipart para `https://api.openai.com/v1/audio/transcriptions` (`file`, `model`, `language: "pt"`, `prompt`); grava `tutor_stt` (`duration_seconds = Math.ceil(seconds)`, `estimated_cost_usd = seconds / 60 * stt_price_per_min_usd`, `meta { voice_call }`); falha: `TutorError(STT_FAILED, 502)` com `code: "stt_failed"`, sem registro. Nunca loga corpo, áudio ou texto.
  - Rota: `router.post("/voice/transcribe", express.raw({ type: "audio/*", limit: MAX_AUDIO_BYTES }), …)` com cabeçalhos `X-Voice-Call-Id` e `X-Audio-Seconds`; ordem: chamada `tts` ativa do aluno (senão 409 "A conversa por voz foi encerrada.") → aceite (403 `tutor_consent`) → `(deps.stt ?? sttConfig()).ready` (senão 503 "A transcrição não está ligada no servidor.") → segundos de 0 a 45 e corpo não vazio (senão 413 "Áudio acima de 45 segundos ou de 4 MB.") → `{ text }`. Um tratador de erro do roteador transforma o `entity.too.large` do `express.raw` no mesmo 413 em JSON.

- [ ] **Step 1: Write the failing tests**
```ts
it("transcreve em português com a dica de comandos e os termos do painel; devolve só o texto", ...)  // FormData: model, language 'pt', prompt com 'confirmo' e 'INEP'
it("aceita o áudio do iPhone (audio/mp4) e do Chrome (audio/webm;codecs=opus)", ...)  // Review Focus 1
it("o áudio não fica: nenhuma tabela, registro ou log guarda o áudio", ...)  // marcador nos bytes; procura em tutor_messages, ai_usage_ledger.meta e nas chamadas de deps.log
it("registra tutor_stt em segundos com o preço do painel", ...)
it("recusa sem o aceite (403 tutor_consent), sem conversa de voz aberta (409), acima de 45 s ou de 4 MB (413) e com a trava desligada (503)", ...)
it("falha na transcrição: 502 'Não entendi, pode repetir ou digitar?' (stt_failed), sem registro; nada nomeia fornecedor", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorNexusTranscricao.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e `src/__tests__/tutorVoiceMode.test.ts src/__tests__/termoAceiteTutor.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: transcricao da fala do aluno no servidor, sem guardar o audio".

### Tarefa 10: `/nexus`, `/voice/open` e `/voice/say` (os jeitos e o turno)

**Files:**
- Modify: `server/tutor/nexus.ts`, `server/tutor/delegate.ts`, `server/tutor/router.ts`, `server/tutor/realtime.ts` (exportar `reasonError`)
- Create: `src/__tests__/tutorNexusVoz.test.ts`

**Interfaces:**
- Consumes: `ch_worker_tutor_tts_quota`, `ch_worker_tutor_tts_open`, `ch_worker_tutor_tts_turn_begin/end` (Tarefas 3–4); `elevenAccessOf`, `minutesOf` (Tarefa 7); `sttConfig` (Tarefa 9); `voiceReady` (realtime.ts); `tutorTurn` com `chargeText` e `voice_avatar` (Tarefa 5); `voiceIntent`, `ch_worker_tutor_answer_as`, `ch_worker_tutor_next_as`.
- Produces (`nexus.ts`):
  - `export type Jeito = "eleven" | "reserva" | "escrito"`
  - `export interface NexusStatus { voice_enabled: boolean; stt: boolean; reserve: boolean; reserve_minutes: number; minutes_today: number; professors: { id: string; eleven: boolean; sample: boolean; reason: ElevenBlock | null }[] }` — `minutes_today = minutesOf(min(remaining_today, account_day_left, account_month_left))`; `reserve = voiceReady(deps).ready && reserve_can && reserve_remaining_s >= 15`; `reserve_minutes = Math.floor(reserve_remaining_s / 60)`; `sample = eleven && aprovada && sample_path != null`. `export async function nexusStatus(deps, userId): Promise<NexusStatus>`.
  - `export interface NexusOpen { jeito: Jeito; voice_call_id: string | null; mic: boolean; reason: ElevenBlock | null; minutes_today: number; reserve_minutes: number }`; `export async function openNexus(deps, userId, sessionId, force: boolean): Promise<NexusOpen>` — aceite (403) → só leitura (409 `PROFESSOR_CHANGED`) → voz desligada no painel: `escrito`, sem chamada, `mic: false` → `elevenAccessOf` ok: `ch_worker_tutor_tts_open(…, p_spoken: true)` e `eleven` (se a abertura voltar com `student_limit`/`account_day`/`account_month`, segue para o próximo passo) → reserva disponível: `reserva`, sem chamada → senão `ch_worker_tutor_tts_open(…, p_spoken: false)` e `escrito`. `mic = voice_enabled && (jeito === "reserva" || (deps.stt ?? sttConfig()).ready)`. Outras recusas da abertura pelo `reasonError` (busy: 409 com `code: "busy"`).
- Produces (`delegate.ts`):
  - `export type Letter = "A" | "B" | "C" | "D"`; `export type TtsIntent = VoiceIntent | { kind: "mark"; option: Letter } | { kind: "unmark" }`; `export function ttsIntent(text: string, questionState: string, marked: Letter | null): TtsIntent` — questão aberta: a letra de `voiceIntent` vira `mark`; `/\b(confirmo|confirma|confirmar|pode confirmar)\b/` com letra marcada vira `answer` com a marcada (sem marcada: `message`); `/\b(cancela|cancelar|desmarca|desmarcar)\b/` vira `unmark`; dica, resolução e próxima como `voiceIntent`; o resto `message`.
  - `export interface SayInput { clientTurnId: string; text?: string | null; command?: "answer" | "hint" | "reveal" | "next" | null; option?: Letter | null; marked?: Letter | null; interrupted?: string | null }`
  - `export interface SayResult { intent: "message" | "answer" | "hint" | "reveal" | "next" | "mark" | "unmark"; message: { id: number; content: string; voice_avatar: TurnResult["message"]["avatar"] } | null; phrase: { phrase: "marked" | "unmarked"; letter: Letter | null; text: string } | null; marked: Letter | null; tone: string | null; gate: "explain" | null; question_state: string | null; used_today: number | null; daily_limit: number | null; repeated?: true }`
  - `export async function sayVoice(deps, userId, voiceCallId, input: SayInput): Promise<SayResult>` — é o modo `tts` da delegação do §16 (mesmas regras sem IA de `delegateVoice`; função própria porque a resposta tem outro formato): chamada `tts` ativa (senão 409) → trava (`busy`: `TutorError("Espere a resposta anterior antes de mandar outra.", 429)` com `code: "turn_busy"`; `repeat`: o resultado guardado com `repeated: true`, sem novo turno) → intenção (`command` manda; `command "answer"` usa `option`) → `mark`/`unmark` só devolvem a frase (`phraseText`) e a marca, sem gravar resposta → `answer`: `ch_worker_tutor_answer_as` e turno `react` → `hint`/`reveal`: turno → `next`: `ch_worker_tutor_next_as`, sem mensagem (a tela relê a conversa e fala a abertura) → `message`: turno `message` com `interrupted`. Todo turno do motor: `tutorTurn(…, { …, voice: true, voiceCallId, chargeText: true })`. Erro do motor (502 ou inesperado): `TutorError("O professor não conseguiu responder, tente de novo", 502)`. Sempre grava o fim da trava (resultado ou nulo).
  - Rotas: `GET /nexus`; `POST /voice/open { session_id, force? }`; `POST /voice/say { voice_call_id, client_turn_id, text?, command?, option?, marked?, interrupted? }` (`client_turn_id` `^[A-Za-z0-9_-]{8,64}$`, senão 400 "Turno inválido."); as três recusam sem o aceite com 403 `tutor_consent`.

- [ ] **Step 1: Write the failing tests**
```ts
it("voz aprovada e com limite: 'eleven' com chamada tts; equipe com voz não aprovada também; aluno sem aprovação vai para a reserva", ...)
it("'só equipe', limite do aluno ou teto da conta: reserva enquanto houver tempo ao vivo; sem as duas vozes: 'escrito' com chamada e microfone", ...)
it("'Conversa por voz' desligada: 'escrito' sem chamada e sem microfone; trava da transcrição desligada: microfone só na reserva", ...)
it("/nexus: por professor, se a voz do professor vale e se há amostra; minutos = caracteres restantes ÷ 900", ...)
it("segunda aba: abrir de novo responde 409 busy; com force assume", ...)  // Review Focus 3
it("letra falada ou tocada só marca ('Marquei a B…') sem gravar resposta; 'cancela' desmarca", ...)
it("'confirmo' com a B marcada responde antes do texto: o banco corrige e a Durona já sai firme no erro", ...)
it("Responder pelo toque faz o mesmo que 'confirmo'", ...)
it("cada resposta do motor gasta 1 interação (falada ou digitada); sem interações, o aviso do chat (429)", ...)
it("motor falhou: 'O professor não conseguiu responder, tente de novo', sem gastar interação", ...)
it("um turno por vez: o segundo recebe 429 turn_busy; o mesmo client_turn_id repetido não responde nem cobra duas vezes", ...)  // Review Focus 2
it("dica, resolução e próxima pelo comando; a próxima não lê o enunciado", ...)
it("as três rotas recusam sem o aceite (403 tutor_consent) e conversa só leitura (409); nenhuma chave nas respostas", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorNexusVoz.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e `src/__tests__/tutorVoiceMode.test.ts src/__tests__/termoAceiteTutor.test.ts src/__tests__/tutorNexusFala.test.ts src/__tests__/tutorNexusTranscricao.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: jeitos da conversa, abertura e turno pelo motor com letra que so marca e confirmo que responde".

### Tarefa 11: Painéis — "Vozes do Nexus" e limites do Tutor

**Files:**
- Modify: `src/novo/app/admin/OfficialVoicesPanel.jsx`, `src/novo/app/admin/officialVoices.css`, `src/novo/app/admin/AdminPanels.jsx` (`AdminTutor`)
- Modify: `src/__tests__/tutorOfficialVoicesPanel.test.tsx` (refeito); `src/__tests__/tutorVoiceModeScreen.test.tsx` (o teste "Painel de administração da voz" passa a esperar também as chaves novas no envio)

**Interfaces:**
- Consumes: `VoicePanel`, `/preview`, `/approve`, `/revoke` (Tarefa 8); colunas do painel (Tarefa 2).
- Produces:
  - Painel "Vozes do Nexus": título "Vozes do Nexus"; uma linha por voz com o estado ("Aprovada", "Aguardando audição e aprovação", "Voice ID pendente"), um botão por cenário dela (marcado quando `heard`), "Aprovar esta voz" (só ativo com `can_approve`) e "Revogar" (quando aprovada e `approver`); a esfera e o player de hoje; os textos de hoje sobre "as três vozes" saem.
  - `AdminTutor`: `Switch` "Voz do professor só para a equipe" (`tts_team_only`, descrição "Ligado: só administrador e editor ouvem a voz do professor; alunos seguem na voz reserva."); `TextField`s "Voz do professor por dia — teste grátis (caracteres)", "Voz do professor por dia — plano pago (caracteres)", "Teto da plataforma por dia (caracteres)", "Teto da plataforma por mês (caracteres)" (dica "900 caracteres = 1 minuto de fala."), "Preço da voz do professor (US$ por mil caracteres)", "Preço da transcrição (US$ por minuto)"; com um dos preços em 0, `Banner` de aviso "Preço não preenchido: o custo da voz do professor e da transcrição fica zerado no registro de consumo."; a descrição de "Conversa por voz" vira "Desligada: só o Chat, por escrito (sem as vozes e sem o microfone)."

- [ ] **Step 1: Write the failing tests**
```tsx
it("lista as três vozes com os cenários de cada uma; tocar um cenário manda só personalidade e cenário", ...)
it("'Aprovar esta voz' só ativo com todos os cenários ouvidos nesta versão e para quem aprova; depois aparece 'Revogar'", ...)
it("revogar uma voz muda só aquela linha", ...)
it("painel do Tutor: só equipe, limites em caracteres e preços salvos com motivo; preço zerado mostra o aviso", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tutorOfficialVoicesPanel.test.tsx src/__tests__/tutorVoiceModeScreen.test.tsx --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** os mesmos e `src/__tests__/adminAbasVisiveis.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: painel Vozes do Nexus com aprovar e revogar por voz e limites e precos no painel do Tutor".

### Tarefa 12: Nexus — entrada, começar, encerrar, histórico e a reserva

**Files:**
- Create: `src/novo/app/tutor/nexus/NexusScreen.jsx`, `src/novo/app/tutor/nexus/NexusLobby.jsx`, `src/novo/app/tutor/nexus/TutorGate.jsx`, `src/novo/app/tutor/nexus/nexus.css`
- Modify: `src/novo/app/tutor/api.js` (`nexusApi`), `src/novo/app/tutor/voice/StaziaVoiceMode.jsx` (props novas), `src/novo/app/App.jsx` (`route === "tutor"` → `<NexusScreen go={go} />`)
- Create: `src/__tests__/nexusEntrada.test.tsx` (mocks de `tutorVoiceModeScreen.test.tsx:10-121`)

**Interfaces:**
- Consumes: `app_tutor_status`, `app_tutor_sessions`, `app_tutor_session`, `app_tutor_close`, `app_tutor_start` com `p_personality` (Tarefa 2); `/nexus`, `/voice/open` (Tarefa 10); `/voice/sample` (Tarefa 8); `useRealtimeVoice`, `unlockAudio`, `TutorConsentCard`.
- Produces:
  - `api.js`: `export const nexusApi = { status(backend), open(backend, sessionId, force = false), say(backend, body), transcribe(backend, voiceCallId, blob, seconds), sample(backend, personalityId) }` — erros com `status`, `code` e `entitlement`, como `voicePost` (`api.js:49-63`); `transcribe` manda o `Blob` cru com `Content-Type: blob.type`, `X-Voice-Call-Id` e `X-Audio-Seconds`; `sample` devolve `Blob`.
  - `TutorGate({ go, children: (status, refresh) => ReactNode })` — mesmas telas de hoje para carregando, desligado, aceite (cartão do §34) e plano (`TutorScreen.jsx:86-107`).
  - `NexusLobby({ status, nexus, request = null, busy, onStart(personalityId, mode), onHistory(), onListen(personalityId) })` — três cartões (emoji, nome, `tagline`, "Ouvir" só com `professors[i].sample`); o último escolhido marcado (`status.preferences`); modos nesta ordem: Perguntar ao Tutor (marcado), Questões, Meus erros, Me teste (rótulos de `labels.js`); linha de voz: `eleven` → `Voz hoje: ${minutes_today} min`; senão `reserve` → `Voz reserva hoje: ${reserve_minutes} min`; senão "Professor por escrito hoje"; botão `Começar com ${nome}`; "Histórico"; `TutorQuota` compacto (de `TutorScreen.jsx` até a Tarefa 15); o aviso da Política sempre visível. Com `request`, os modos somem e aparece o rótulo do modo travado (Tarefa 14).
  - `NexusScreen({ go, overlay = false, request = null, onClose })` — fases `lobby | conversation | summary | history | readonly`. No toque do "Começar" (antes de qualquer `await`): `unlockAudio()` e `navigator.mediaDevices.getUserMedia({ audio: true })` (se a voz estiver ligada); depois `app_tutor_start` (`p_mode`; "Me teste" com `{ type: "weak_points" }`, "Perguntar ao Tutor" com `{ type: "free" }`; `p_personality`) e `nexusApi.open`; o botão fica desabilitado até terminar; o microfone pedido fica guardado para a conversa (`micStream`, usado na Tarefa 13). `busy` (409) mostra a mensagem do servidor com "Assumir aqui" (`open(…, true)`). `reserva`: o microfone pedido é solto e `useRealtimeVoice({ backend, sessionId, live, hint })` começa. Conversa: `StaziaVoiceMode` com `persona` (selo que não é botão), `jeitoLabel` (`{ eleven: "Voz do professor", reserva: "Voz reserva", escrito: "Por escrito" }`) e `onClose` = Encerrar (`app_tutor_close` sempre, encerra a voz, resumo de `app_tutor_session().summary`); resumo com "Conversar de novo" (conversa **nova**, mesmo professor e modo) e "Trocar de professor" (volta aos cartões). Histórico: lista de `app_tutor_sessions`; encerrada → só leitura com o resumo e "Conversar de novo"; `read_only` → só leitura com "Este professor mudou. Comece uma conversa nova." e sem "Conversar de novo"; aberta → `nexusApi.open` e conversa.
  - `StaziaVoiceMode` ganha `jeitoLabel`, `card` (nó abaixo da esfera) e `onTextFallback` opcional (o botão "Continuar por texto" só aparece com ele).

- [ ] **Step 1: Write the failing tests**
```tsx
it("/tutor abre a Nexus: Tranquilo, Durona e Direto com a frase curta; o último escolhido marcado; nada começa sem o toque", ...)
it("'Perguntar ao Tutor' já marcado; o botão diz 'Começar com a Durona' e muda com a escolha", ...)
it("'Ouvir' só com amostra aprovada; toca a amostra guardada (nenhum /speech)", ...)
it("linha de voz: 'Voz hoje: 5 min', 'Voz reserva hoje: 10 min' ou 'Professor por escrito hoje'; aviso da Política sempre visível", ...)
it("Começar: som liberado e microfone pedido no mesmo toque; conversa com p_personality e jeito aberto; toque duplo cria uma só", ...)  // Review Focus 2
it("outra aba com voz aberta: a mensagem e 'Assumir aqui' (force)", ...)  // Review Focus 3
it("reserva: a voz ao vivo como hoje, com o selo do professor (não é botão) e 'Voz reserva'", ...)
it("Encerrar fecha a conversa e mostra o resumo; 'Conversar de novo' cria outra com o mesmo professor; 'Trocar de professor' volta aos cartões", ...)
it("Histórico: encerrada só leitura com resumo; aberta continua; Acolhedor antigo e perfil desligado com 'Este professor mudou. Comece uma conversa nova.'", ...)
it("aceite pendente mostra o cartão do §34 antes de tudo; Tutor desligado e plano como hoje; nenhum nome de fornecedor na tela", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/nexusEntrada.test.tsx --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e `src/__tests__/tutorVoiceModeScreen.test.tsx src/__tests__/tutorGeminiVoiceScreen.test.tsx src/__tests__/equipeAcessoTelas.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: tela unica com escolha do professor, comecar, encerrar, historico e voz reserva".

### Tarefa 13: Nexus — falar e ouvir pela voz do professor (e por escrito)

**Files:**
- Create: `src/novo/app/tutor/voice/audioPlayer.js`, `src/novo/app/tutor/nexus/recorder.js`, `src/novo/app/tutor/nexus/useNexusVoice.js`, `src/novo/app/tutor/nexus/QuestionCard.jsx` (o `QuestionCard` de `TutorScreen.jsx:805-865`, compacto)
- Modify: `src/novo/app/tutor/voice/geminiLive.js` (usa `AudioPlayer`), `src/novo/app/tutor/voice/StaziaVoiceMode.jsx` ("Falar", "Enviar", "Toque para falar"; aviso do microfone sem fechar a conversa), `src/novo/app/tutor/nexus/NexusScreen.jsx`
- Create: `src/__tests__/nexusGravacao.test.ts`, `src/__tests__/nexusConversa.test.tsx`

**Interfaces:**
- Consumes: `nexusApi` e fases (Tarefa 12); `SayResult` (Tarefa 10); `/speech` e os códigos `voice_*` (Tarefa 7); `/voice/transcribe` (Tarefa 9); `voiceApi.renew/end/metrics`; `rmsLevel` de `useAudioLevel.js`.
- Produces:
  - `audioPlayer.js`: `export class AudioPlayer { constructor(ctx, volume = 1, onIdle = null); get stream(); get playing(); play(b64, rate = 24000); playEncoded(arrayBuffer): Promise<boolean>; stop(); setVolume(v); close() }` (o `Player` de `geminiLive.js:88-150`; `playEncoded` decodifica com `decodeAudioData`, toca por `Gain` e pelo `MediaStreamDestination` que a esfera mede, e resolve `true` no fim ou `false` no `stop()`); `export function base64ToFloat32(b64)`.
  - `recorder.js`: `export const MAX_RECORD_MS = 45_000, SILENCE_MS = 1_500, MAX_AUDIO_BYTES = 4 * 1024 * 1024, SPEECH_LEVEL = 0.15, SILENCE_LEVEL = 0.08` (os dois níveis são iniciais, na escala de `rmsLevel`); `export function pickMime(isTypeSupported): string` (`"audio/webm;codecs=opus"`, senão `"audio/mp4"`, senão `""`); `export function tapToTalkDevice(nav = navigator): boolean` (iPhone, iPad ou iPod no `userAgent`, ou `platform === "MacIntel" && maxTouchPoints > 1`); `export function startRecording({ stream, auto, level, MediaRecorderImpl = globalThis.MediaRecorder, onDone }): { stop(): void, cancel(): void }` — `auto` para sozinho depois de `SILENCE_MS` abaixo de `SILENCE_LEVEL`, só depois de passar de `SPEECH_LEVEL`; sempre para em `MAX_RECORD_MS`; `onDone({ blob, mime, seconds })`, ou `null` quando só houve silêncio, quando foi cancelada ou acima de `MAX_AUDIO_BYTES`.
  - `useNexusVoice({ backend, session, jeito, voiceCallId, micStream, onSession, onMessage, onFallback })` → objeto no formato do `rt` de `useRealtimeVoice.js:959-964` (`state`, `error`, `captions`, `streams`, `muted`, `provider: "tts"`, `start`, `stop`, `interrupt`, `sendText`, `toggleMute`, `setVolume`, `active`) mais `mark(letter)`, `answer(letter)`, `command("hint" | "reveal" | "next")`, `marked`, `avatar`, `tapToTalk`, `talk()`, `send()`, `micError`. Regras: cada envio leva um `client_turn_id` novo (`crypto.randomUUID`); falha de rede ou `turn_busy` repete o **mesmo** id a cada 2 s por até 30 s. Resposta: legenda (`message.content` ou `phrase.text`) e emoção (`voice_avatar`) **antes** de pedir o som; `jeito === "eleven"` pede `/speech` (`kind: "message"`, ou `phrase` para marcar/desmarcar) e toca com `AudioPlayer`; códigos `voice_student_limit`, `voice_account_day`, `voice_account_month`, `voice_unavailable`, `voice_failed` → `onFallback(code, mensagem)` com a legenda mantida. `intent "next"` ou mudança de `question_state` → `onSession()` (relê a conversa) e fala a abertura nova. Microfone fechado enquanto o professor fala; depois volta a ouvir sozinho (computador e Android) ou mostra "Toque para falar" (iPhone e iPad). "Interromper" para o som na hora e manda o trecho (até 300 caracteres) como `interrupted` no próximo turno. Transcrição vazia ou `stt_failed` → `error` "Não entendi, pode repetir ou digitar?" e o Chat abre. Renova a chamada a cada 60 s; mede `stt_ms_avg`, `engine_ms_avg`, `tts_ms_avg` e `play_start_ms_avg` e manda no `voiceApi.end`. O enunciado nunca vai para `/speech`.
  - `NexusScreen`: chama os dois hooks sempre e usa `rt = jeito === "reserva" ? live : tts`; `onFallback` troca para `reserva` (o servidor encerra a `tts`) e mostra a mensagem do código; nos modos Questões e Meus erros, `card` = `QuestionCard` (alternativas para tocar = `mark`, "Responder" = `answer`, "Pedir ajuda", "Ver resolução", "Próxima"); na reserva, os mesmos botões gravam pelo banco (`app_tutor_answer`, `app_tutor_next_question`) e mandam à voz ao vivo, por `rt.sendText`, as frases que o chat de hoje já usa: `Marquei a ${letra}.`, `Me dá uma ajuda aqui.`, `Me mostra a resolução.`, `Vamos para a próxima.`.

- [ ] **Step 1: Write the failing tests**
```ts
// nexusGravacao.test.ts
it("escolhe webm/opus no Chrome e mp4 no Safari", ...)
it("iPhone e iPad (também o iPad que se apresenta como Mac) gravam por toque; computador e Android, sozinhos", ...)  // Review Focus 1
it("para sozinho depois de 1,5 s de silêncio, só depois de ouvir fala; para em 45 s", ...)
it("só silêncio, cancelada ou acima de 4 MB não é enviada", ...)
it("AudioPlayer toca o mp3 pelo caminho que a esfera mede e para na hora", ...)
```
```tsx
// nexusConversa.test.tsx
it("voz do professor: a fala vai à transcrição e ao motor; legenda e emoção antes do som; depois volta a ouvir sozinho", ...)
it("iPhone/iPad: 'Falar' e 'Enviar'; depois do professor, 'Toque para falar'", ...)
it("Interromper para o som na hora e manda o trecho como interrupted", ...)
it("questão: tocar a B só marca e o professor diz 'Marquei a B…'; Responder responde; o enunciado não vai para /speech", ...)
it("rede caiu no meio do turno: reenvia o mesmo client_turn_id e mostra uma resposta só", ...)  // Review Focus 2
it("por escrito: sem /speech; o Chat manda ao motor", ...)
it("microfone negado: o aviso de hoje e a conversa segue pelo Chat, com resposta em voz", ...)
it("limite do dia ou aprovação revogada no meio: passa para a reserva com a mensagem certa e a legenda fica", ...)  // Review Focus 5
it("transcrição falhou: 'Não entendi, pode repetir ou digitar?' e o Chat abre; motor falhou: 'O professor não conseguiu responder, tente de novo'", ...)
it("os tempos de cada etapa vão nas métricas ao encerrar", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/nexusGravacao.test.ts src/__tests__/nexusConversa.test.tsx --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** os mesmos e `src/__tests__/nexusEntrada.test.tsx src/__tests__/tutorGeminiVoiceScreen.test.tsx src/__tests__/tutorVoiceModeScreen.test.tsx src/__tests__/tutorRealtimePlayback.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: conversa pela voz do professor com gravacao, legenda antes do som, interromper e cartao da questao".

### Tarefa 14: Nexus por cima das outras telas e o relatório em `/analise`

**Files:**
- Modify: `src/novo/app/tutor/TutorDrawer.jsx` (`TutorDockProvider` mostra `<NexusScreen overlay request={request} onClose=… />`; sai o componente da gaveta e a criação automática da conversa; `TutorButton` e `useTutorDock` continuam), `src/novo/app/tutor/nexus/NexusScreen.jsx`, `src/novo/app/tutor/nexus/nexus.css`, `src/novo/app/App.jsx` (`route === "analise"` → `<ReportScreen go={go} />`)
- Create: `src/novo/app/tutor/ReportScreen.jsx` (o `Report` de `TutorScreen.jsx:867-962`, dentro de `TutorGate`)
- Create: `src/__tests__/nexusOutrasTelas.test.tsx`

**Interfaces:**
- Consumes: `NexusScreen` e `NexusLobby` com `request` (Tarefas 12–13).
- Produces: com `overlay`, a Nexus cobre a tela (camada fixa sobre o fundo escuro, botão "Fechar") sem desmontar a tela de baixo; a entrada mostra só os cartões e o rótulo do modo travado (`modeLabel(request.mode)` + `request.context?.label ?? request.topic`); "Começar" usa `request.mode`, `request.topic`, `request.questionId`, `request.context` e o professor escolhido; nenhuma conversa antes do "Começar". Pedidos de hoje: Correção/Caderno de erros → `livre` com a questão; Flashcards → `livre` com o tema; Temas → `perguntas` no tema; Desempenho → `perguntas` com `weak_points`. `ReportScreen({ go })` = relatório de hoje com o mesmo portão do Tutor.

- [ ] **Step 1: Write the failing tests**
```tsx
it("Correção abre a Nexus por cima com 'Perguntar ao Tutor' sobre a questão; só se escolhe o professor; nenhuma conversa antes do Começar", ...)
it("Temas → Me teste no tema; Desempenho → pontos fracos; Flashcards → Perguntar sobre o tema (modo travado)", ...)
it("a tela de baixo continua montada (o cronômetro do treino segue) e fechar volta para ela", ...)
it("/analise mostra o relatório, com o cartão do aceite e os avisos de hoje", ...)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/nexusOutrasTelas.test.tsx --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o arquivo e `src/__tests__/nexusEntrada.test.tsx src/__tests__/nexusConversa.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: abre por cima das outras telas com o modo travado e o relatorio vai para Analise".

### Tarefa 15: Limpeza — saem a tela antiga, a voz do aparelho e o seletor de voz

**Files:**
- Delete: `src/novo/app/tutor/TutorScreen.jsx` (antes, `TutorQuota` vai para `src/novo/app/tutor/TutorQuota.jsx`), `src/novo/app/tutor/useVoice.js`, `src/novo/app/tutor/voiceCommands.js`, `src/__tests__/tutorScreen.test.tsx`, `src/__tests__/tutorVoiceCommands.test.ts`
- Modify: `src/novo/app/tutor/voice/StaziaVoiceMode.jsx` (sai `onTextFallback` e "Continuar por texto"), `src/novo/app/tutor/voice/geminiLive.js` (erro "Este navegador não toca áudio para a voz do Gemini." → "Este navegador não toca o áudio da voz."), `src/__tests__/equipeAcessoTelas.test.tsx` (import de `TutorQuota`)
- Modify (**testes das telas antigas, §16**): `src/__tests__/tutorVoiceModeScreen.test.tsx`, `src/__tests__/tutorRealtime.test.tsx`, `src/__tests__/tutorGeminiVoiceScreen.test.tsx`, `src/__tests__/tutorRealtimePlayback.test.tsx`, `src/__tests__/tutorAceite.test.tsx` — o ajudante que abria a voz pela `TutorScreen` passa a abrir pela `NexusScreen` com `/api/tutor/voice/open` → `{ jeito: "reserva" }`; a gaveta vira a Nexus por cima; "Continuar por texto" e "Conversar por voz" saem; os comportamentos que continuam (GPT-Live/Realtime/Gemini como reserva, reconexão, Esc e foco, legenda e volume guardados, microfone negado, aceite) ficam
- Modify: `docs/architecture/STAZIA_TUTOR.md`, `docs/architecture/STAZIA_TUTOR_V2.md`, `docs/architecture/STAZIA_VOICE_MODE.md`, `docs/architecture/NEXUS_ELEVENLABS_TTS.md` (três professores, Tranquilo no lugar do Acolhedor, aprovação no painel, jeitos, limites e variáveis desta etapa)
- Create: `src/__tests__/nexusTextos.test.ts`

**Interfaces:**
- Produces: `TutorQuota` em `src/novo/app/tutor/TutorQuota.jsx` (mesma assinatura). Nada no Tutor do aluno usa `speechSynthesis`.

- [ ] **Step 1: Write the failing tests** (`nexusTextos.test.ts`, lendo os arquivos de `src/novo/app/tutor/**`)
```ts
it("a voz do aparelho nunca é usada no Tutor", ...)  // nenhum arquivo contém "speechSynthesis" nem "voz do aparelho"
it("nenhum texto do aluno nomeia fornecedor", ...)  // nenhuma string entre aspas/crases com /OpenAI|Google|Gemini|ElevenLabs/ (comentários e URLs fora)
```
- [ ] **Step 2: Run** `npx vitest run src/__tests__/nexusTextos.test.ts --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a limpeza e a reescrita dos testes.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/nexusTextos.test.ts src/__tests__/tutorVoiceModeScreen.test.tsx src/__tests__/tutorRealtime.test.tsx src/__tests__/tutorGeminiVoiceScreen.test.tsx src/__tests__/tutorRealtimePlayback.test.tsx src/__tests__/tutorAceite.test.tsx src/__tests__/equipeAcessoTelas.test.tsx src/__tests__/nexusEntrada.test.tsx src/__tests__/nexusConversa.test.tsx src/__tests__/nexusOutrasTelas.test.tsx --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Tutor Nexus: sai a tela antiga do Tutor, a voz do aparelho e o seletor de voz; testes das telas reescritos".

### Tarefa 16: Conferência final e material de publicação

**Files:**
- Create (fora do repositório, em `~/Downloads`): `tutor_nexus_supabase.sql` com `begin;`, as migrações `20261003005500` a `20261003005800`, os quatro `insert into supabase_migrations.schema_migrations (version, name) … on conflict (version) do nothing;` e `commit;` (mesmo formato do arquivo do Termo)

- [ ] **Step 1:** suíte completa `npx vitest run --maxWorkers=1`; tudo verde (o `questionKnowledge` de "reaplicar a carga" pode estourar o tempo sob carga e passa sozinho).
- [ ] **Step 2:** `npm run build:vercel` sem erro.
- [ ] **Step 3:** conferência no navegador com servidor temporário isolado (porta própria, banco novo, sem `.env`), no computador (1440 px), no celular (390 px) e com o `userAgent` de iPhone: entrada com os três cartões e os modos; "Começar" na reserva; conversa com selo, Chat, Microfone, Encerrar; resumo; histórico; Nexus por cima da Correção; painel "Vozes do Nexus"; nenhuma rolagem horizontal; nenhum nome de fornecedor na tela do aluno.
- [ ] **Step 4:** gerar o SQL do dono e conferir que o corpo é igual às quatro migrações.
- [ ] **Step 5:** publicar só com ordem do dono (§13): SQL no Supabase (inclui o depósito `tutor-voice-samples`) → na Vercel `TUTOR_STT_ALLOW_EXTERNAL=1` e `TUTOR_VOICE_APPROVERS` (e-mail do dono) → envio da main (só este ramo; o Cloud Run não muda) → conferência no ar com a equipe ("só equipe" ligado), medindo os tempos no iPhone e no Android → audição e aprovação das três vozes → preços preenchidos e tetos conferidos → plano da ElevenLabs maior → alunos (desligar "só equipe").
