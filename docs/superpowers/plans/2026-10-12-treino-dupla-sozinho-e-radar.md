# Treinamento em Dupla — Plano do adendo: treinar sozinho e radar

> **Para quem for construir:** usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`, tarefa por
> tarefa. Os passos usam caixas `- [ ]`. **Nada deste plano foi construído.** Ele só pode começar com a ordem do dono, depois de ele
> responder as decisões D1 a D13 da §11 da spec.

**Spec:** `docs/superpowers/specs/2026-10-12-treino-dupla-sozinho-e-radar.md` (manda neste assunto). Spec e plano base:
`docs/superpowers/specs/2026-10-09-treino-dupla-design.md` e `docs/superpowers/plans/2026-10-09-treino-dupla.md`. Registro e regras:
`.superpowers/sdd/2026-10-09-treino-dupla/` (`rulings.md`, `constraints.md`, relatórios das tarefas).

**Objetivo:** no Praticar, depois de escolher a estação, o aluno decide entre **treinar sozinho** (cronômetro, narração por tarefa,
avaliação por IA conferida por outra empresa ou autoavaliação), **ver quem está online** (radar, convite direto de 60 s) e o
**baralho** que já existe. O treino sozinho conta no histórico e na nota do aluno, marcado "Sozinho", fora de ranking e fora do
"Uso do mês" da dupla.

**Arquitetura em uma frase:** tudo reaproveita o que existe — `checklist_stations`/`checklist_station_contents` (estação e PEP),
`checklist_study_sessions` (histórico), `checklist_rooms` e `study_invites` (convite direto), canal `dupla:online` (Presença e
convites), `StationPicker`, `PepTable`, `ResultPhase`, `InviteWatcher`, a rota assinada do impresso, a Central de IAs (maestro,
registro de chamadas, preços), `ai_usage_ledger` (cota) e o aceite do Termo. Novos: **uma tabela de treinos** (`study_solo_runs`),
**uma de bloqueios** (`study_blocks`), colunas, funções `app_solo_*`, `app_dupla_radar`, `app_dupla_invite`, e uma função da Central.

## Regras que valem aqui (além das Global Constraints do plano de 09/10, que seguem valendo inteiras)
- **Fila de testes, servidor local seguro, commits e "nunca `git push`":** como no plano de 09/10 (`FILA` = `bash "/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/vaga-de-teste.sh"`, por extenso em cada comando; `--pool=threads --maxWorkers=1`). Mensagens de commit em português **sem acento**, `git add <caminhos explícitos>`, com a linha de coautoria da sessão.
- **Migrações:** só **9900, 9901, 9910, 9920 e 9930** (conferidas livres em 12/10; maior em uso: 9820; 9780 e 9790 são das tarefas 14 e 18). Antes de escrever cada uma, `git for-each-ref refs/heads` + `grep` em todos os ramos e nas pastas de `.claude/worktrees/*/supabase/migrations`; se o `origin/main` tiver andado, fazer merge primeiro. Cada migração pode ser colada duas vezes sem estragar. Função refeita **parte da definição mais nova**, citando arquivo e linha no cabeçalho. Funções `security definer set search_path = ''`, mensagens em português terminando em ponto; `app_*` com `revoke execute … from public, anon`; apoios `dupla_*`/`solo_*` e `ch_worker_solo_*` com `revoke … from public, anon, authenticated` (as `ch_worker_*` só para o serviço). Função que grava fica `volatile`.
- **Sem IA no treino em dupla** continua valendo. **IA só no sozinho**, só pelo servidor, só via Central, desligada por padrão.
- **Nada inventado:** pessoa, número, nota ou estação fictícia nunca aparecem. O que o dono não preencheu (planos do sozinho, planos e limites da IA, texto do aceite) fica **fechado/bloqueado**, não ganha valor meu. Estações de teste (`teste-inep2020-eNN`) só nos testes e no banco local.
- **Aluno não grava direto em tabela nenhuma;** `study_solo_runs` e `study_blocks` com RLS ligada **e sem política** (só funções).
- **O PEP não vai ao navegador antes da entrega.** O material completo da avaliação só passa por funções `ch_worker_solo_*`.
- **Regra da IA do dono (09/10):** barreiras (login, acesso, plano, aceite, função pronta, cota) **antes de qualquer gasto**; teste de aluno barrado da Central e do painel; nenhuma resposta ao aluno carrega nome de modelo, empresa, prompt ou custo.
- **Textos:** os da §3, §4 e §5 da spec e os de "Textos novos para aprovar" abaixo; vírgula decimal e `formatDecimal` (`src/novo/ds/format.js`). Cores/ícones/componentes só os do app (`src/novo/ds`); nenhuma cor hexadecimal em tela. Pacote de design **só lido**.
- **Fuso:** dia e mês em `America/Sao_Paulo`.
- **Cada etapa termina em PARE: confirmação do dono.** Publicar (SQL no Supabase, GitHub/Vercel, Cloud Run) só com ordem do dono.

## Pré-voo (antes da primeira tarefa; sem código)
- [ ] **Decisões do dono** D1–D13 respondidas (spec §11). Sem D5/D6/D13 respondidos, a Etapa 6B não começa (a 6A e a 6C podem).
- [ ] **Base:** `git -C <worktree> log` confere HEAD; merge do `origin/main` se mudou; rodar os testes da Etapa 4 (`duplaMatchBanco`, `duplaMatchTela`, `duplaTempoReal`) pela fila.
- [ ] **Tarefas 14 a 18 do plano de 09/10 feitas** (a 6A e a 6B dependem delas; a 6C depende só das tarefas 11 a 16). Se alguma ainda não foi construída, aplicar o **Ajuste** abaixo nela em vez de refazer depois.
- [ ] **Migrações livres:** conferir 9900, 9901, 9910, 9920, 9930 (comandos acima).
- [ ] **Leva 3:** o ramo `leva3` tem 9730–9732 (`elite_beneficios` traz `station_feedback_allowed()`). Ver se já está no main. Se **não**, a 6B usa só `ia.planos`; se **sim** e o dono disse sim em D5, usa a chave Elite.
- [ ] **Chaves das IAs na Vercel** (só conferir nomes, **nunca abrir `.env*`**): quais empresas têm chave no site (Anthropic, Vertex/Gemini, OpenAI). Sem duas empresas, a função da Central fica "não pronta" e a 6B termina só com a autoavaliação.
- [ ] **Preço e tetos:** manter como decidido em 11/10 (desligados). Apenas registrar no relatório da 6B: "avaliação do sozinho entra na lista a religar antes dos alunos".

### Ajuste nas Tarefas 14 e 18 do plano de 09/10 (se ainda não construídas)
- **T14:** criar dentro da migração dela a função `dupla_score_marks(p_station_id text, p_answers jsonb) returns jsonb` (`{ score, max_score, correctness, answers }`; soma dos pontos do nível marcado dos itens **atuais**, pendente 0, `max_score` = Σ `correct`, `correctness = round(score/max*100, 1)`) e fazer `app_dupla_finalize` chamá-la. Em `server/dupla/router.ts`, a assinatura do link do impresso sai numa função `duplaPrintLink(deps, token, path)` que a rota da sala e a do sozinho usam.
- **T18:** `app_admin_dupla_usage` já nasce contando só `mode = 'dupla'` (a coluna chega na 9900; até lá todas as linhas valem dupla).
- Se as tarefas **já** foram construídas sem isso, a tarefa **S1** extrai as peças (refator sem mudar comportamento; os testes antigos continuam passando).

## Textos novos para aprovar (além dos da spec de 09/10)
- Praticar: "Como você quer treinar a Estação {n} · {nome}?"; cartões **"Treinar sozinho"** ("Escreva como conduziria o atendimento e receba a correção."), **"Ver quem está online"** ("Chame um colega que esteja livre agora."), **"Procurar dupla"** ("Deslize os cartões e combine com um colega."); "Escolher estação"; faixa "Você tem um treino sozinho em andamento" com "Continuar" e "Descartar".
- Janela do sozinho: "Treino sozinho", "Você vai ler o enunciado e escrever, em cada tarefa, como conduziria o atendimento.", "Cronômetro de {n} min. Depois você escolhe como corrigir.", "Começar".
- Estação: "Escreva aqui como você faria e o que diria ao paciente.", "Entregar", "Descartar este treino?", "Tempo esgotado" (já existe), "Impresso aberto" / "Pedir impresso".
- Correção: "Como você quer corrigir?", "Avaliar com IA", "Eu mesmo avalio com o PEP", motivos curtos de IA indisponível ("Disponível em outro plano.", "Você usou as avaliações de hoje.", "Você usou as avaliações do mês.", "Aceite o aviso para usar a IA.", "A avaliação por IA está indisponível agora."), "Avaliando…", "Tentar de novo", "Corrigir eu mesmo".
- Resultado: "Resultado do treino sozinho", selos "Sozinho", "IA", "Autoavaliação"; "Avaliação feita por inteligência artificial. Ela pode errar. A nota vale só contra o PEP desta estação."; por item "Trecho seu", "Por quê", "Não citado no seu texto", "A IA não achou um trecho seu que provasse este item", "As duas IAs divergiram", "Sem avaliação"; "Avisar a equipe que a avaliação errou", "Treinar de novo".
- Aceite (X1): **texto a ser escrito pelo dono** (proposta de base: "A avaliação usa inteligência artificial e pode errar. Ela compara o seu texto com o PEP da estação e não substitui um avaliador.") e o botão "Aceito".
- Radar: "Quem está online", abas "Online" e "Ator/avaliador", "Ninguém online agora", "Livre", "Em sala", "Treinando sozinho", "Convidar", "Não recebe convites", "Convite enviado a {nome}", "Aparecer no radar" (já existe), "Permitir convites diretos" ("Colegas podem chamar você para uma estação").
- Convite recebido: "{nome} convidou você para treinar", "Estação {n} · {nome}", "Aceitar", "Agora não", "Bloquear {nome}"; sala fechada: "Treinar sozinho esta estação".
- Erros do servidor (novos): "Sem acesso ao treino sozinho.", "Você já tem um treino sozinho em andamento.", "Escreva algo antes de pedir a avaliação.", "Avaliação por IA indisponível.", "Você já usou as avaliações por IA de hoje.", "Você já usou as avaliações por IA deste mês.", "Aceite o aviso para usar a avaliação por IA.", "Você já tem um convite aguardando resposta.", "Muitos convites seguidos. Tente de novo em {n} min.", "Você convidou {nome} há pouco. Tente de novo em {n} min.", "{nome} não pode receber convites agora.", "Colega bloqueado.".
- Painel: "Treino sozinho", "Abrir treino sozinho", "Avaliação por IA no treino sozinho", "Limite por aluno por dia", "Limite por aluno por mês", "Convites diretos: limites" e "Avaliação do treino sozinho" (nome da função na Central).

## Arquivos
| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261003009900_treino_dupla_sozinho.sql` | dados e acesso do sozinho; projeções compartilhadas; leituras ampliadas; chave do painel |
| `supabase/migrations/20261003009901_treino_dupla_sozinho_funcoes.sql` | funções `app_solo_*` e `app_dupla_my_attempts` |
| `supabase/migrations/20261003009910_treino_dupla_sozinho_ia.sql` | função da Central, cota, aceite, funções de serviço |
| `supabase/migrations/20261003009920_treino_dupla_radar.sql` | radar, convite direto, bloqueios, limites |
| `supabase/migrations/20261003009930_treino_dupla_uso_do_mes.sql` | "Uso do mês" ampliado |
| `server/dupla/{router,solo,soloEval}.ts` | rota do impresso do sozinho; avaliação por IA (material, prompt, validação, mescla) |
| `server/ai/{config,maestro}.ts` | chave `treino_avaliacao`, origem `treino`, chamada típica |
| `src/novo/app/dupla/{ModeChoice,RadarScreen,SoloScreen,soloApi,useSolo,radarApi}.jsx/js` e `solo/*` | telas e ganchos novos |
| `src/novo/app/dupla/{PracticeScreen,DuplaGate,MatchModal,StudyProfileScreen,StationsScreen}.jsx`, `room/{ResultPhase,ClosedPhase}.jsx` | alterados (reaproveitados) |
| `src/novo/app/{App,session}.jsx`, `admin/{AdminDupla,AdminAI}.jsx`, `account/AccountScreen.jsx` | rotas, acesso por modo, painel, Central |
| `src/__tests__/duplaSozinho*.test.ts(x)`, `duplaRadar*.test.ts(x)`, `duplaAvaliacaoIA.test.ts` | testes |

## Ordem
| Etapa | Tarefas | Depende de |
|---|---|---|
| **6A** Sozinho sem IA | S0, S1, S2, S3, S4, S5, S6, S7, S8, S8b, S9 | Etapa 6 do plano de 09/10 |
| **6B** Avaliação por IA | A1, A2, A3, A4, A5, A6 | 6A, decisões D2–D6 e D13 |
| **6C** Radar e convite direto | R1, R2, R3, R4, R5, R6 | tarefas 11 a 16 (pode vir antes da 6A se o dono quiser) |
| **7** (estendida) | T19 e T20 do plano de 09/10 + itens Z1 e Z2 | 6A, 6B, 6C |

Dentro de cada etapa: S1→S2→(S3 ‖ S4 ‖ S8 ‖ S8b)→S5→S6→S7→S9; A1→(A2 ‖ A3)→A4→A5→A6; R1→(R2 ‖ R3)→R4→R5→R6. "‖" = podem andar juntas
(arquivos diferentes; cada uma faz `git add` só dos seus).

---

# Etapa 6A — Treino sozinho, sem IA

### Tarefa S0: Prévia clicável para o dono aprovar o desenho novo
**Files:** nenhum no repositório. Arquivo temporário no scratchpad; publicado como Artifact **privado** (padrão do Tutor Nexus).
- [ ] **Step 1:** carregar o design system do app (`src/novo/ds`, tokens, fontes Plus Jakarta Sans/JetBrains Mono) e montar uma página clicável com **P1** (Como você quer treinar, três cartões, estados bloqueado/aberto), **S2** (estação em andamento: cronômetro, enunciado, caixa por tarefa, impressos, Entregar), **S6** (resultado com "Trecho seu" e "Por quê", selos, aviso da IA, divergência) e **P2** (radar: lista, vazio, ocupado, Convidar, convite enviado). Dados **claramente de exemplo** ("Colega A"), marcados "Prévia — dados de exemplo", sem nome de pessoa real.
- [ ] **Step 2:** publicar privado, entregar o link ao dono e **esperar o "gostei"** ou os ajustes. As telas S1, S3, S4 e X1 seguem o mesmo estilo e o dono as vê no "como testar".
- [ ] **Step 3:** registrar os ajustes pedidos em `.superpowers/sdd/2026-10-12-treino-dupla-sozinho-e-radar/rulings.md`. Commit "Treino em dupla: ajustes do dono na previa do sozinho e do radar". *(Sem aprovação da prévia, as tarefas S5, S6 e R3 não começam.)*

### Tarefa S1: Migração 9900 — dados, acesso e peças compartilhadas do sozinho
**Files:** Create `supabase/migrations/20261003009900_treino_dupla_sozinho.sql`, `src/__tests__/duplaSozinhoDados.test.ts`. Modify `src/__tests__/helpers/duplaDb.ts` (apoios `soloRun(db, uid, stationId, phase)` e `openSolo`), `src/__tests__/supabaseSchema.test.ts` (regressão), `supabase/README.md`.

**Interfaces — Produces (todas SQL):**
- Tabela `study_solo_runs(id uuid pk, user_id → auth.users on delete cascade, station_id → checklist_stations, station_version text, phase text check in ('running','submitted','evaluating','self_grading','done','abandoned'), how text check in ('ia','self') null, duration_ms int 60000–3600000, started_at, ends_at, submitted_at, answers jsonb default '[]', pressings_opened jsonb default '[]', marks jsonb default '{}', source text check in ('ia','autoavaliacao') null, ia jsonb null, reservation bigint null, session_id text null → checklist_study_sessions on delete set null, created_at, updated_at)`; **índice único parcial** (`user_id`) onde `phase in ('running','submitted','evaluating','self_grading')` (um treino aberto por aluno); RLS ligada **sem política**.
- `checklist_study_sessions` ganha `mode text not null default 'dupla' check in ('dupla','sozinho')`, `source text not null default 'avaliador' check in ('avaliador','ia','autoavaliacao')`, `solo_run_id uuid null`; índice `(doctor_id, mode, finished_at desc)`.
- `study_profiles.status` aceita `'sozinho'` (checagem refeita com a união: `livre`, `em_estacao`, `fora`, `sozinho`).
- `app_settings.treino_dupla`: mesma chave, valor ganha `sozinho` e `convites` (§6 da spec); leitura tolera chaves ausentes (= fechado/padrões).
- `solo_allowed(p_user uuid) returns boolean` (interna): `user_has_full_access(p_user)` **ou** (`treino_dupla.sozinho.aberto = true` e o plano do aluno em `sozinho.planos`, com a mesma regra de validade de `dupla_allowed`: teste só `trialing` no prazo; pro/elite com `subscription_is_paid`). `solo_assert_access() returns uuid` (porteiro: "Entre na sua conta." / "Sem acesso ao treino sozinho.").
- `app_dupla_access()` **refeita** (parte de …`9750`:102-114): ganha `sozinho: { aberto, permitido }`.
- `app_admin_save_dupla(p_config jsonb) returns jsonb` **no lugar** da de dois argumentos (parte de …`9760`:471-489; a antiga é apagada com `drop function`): valida e grava `aberto`, `planos`, `sozinho.{aberto,planos}`, `convites.{pendentes,por_hora,por_dia,espera_min}` (inteiros ≥ 1, máximos sensatos de validação, ex.: por_dia ≤ 200), **preserva** o bloco `sozinho.ia` (a 9910 cuida dele); só administrador; `admin_log('dupla.save', …)`.
- **Peças compartilhadas (refator sem mudar comportamento):** `dupla_station_candidate_view(p_station_id text, p_released text[]) returns jsonb` (a projeção do candidato hoje dentro de `app_dupla_room_content`, …`9750`:348-422, **sem** a linha "Liberação: …"); `app_dupla_room_content` **refeita** para chamá-la; `dupla_result_items(p_station_id text, p_answers jsonb) returns jsonb` (a lista de itens com pontos hoje dentro de `app_dupla_result`, …`9760`:207-262); `app_dupla_result` **refeita** para chamá-la; `dupla_score_marks` (se a T14 não criou, ver Ajuste) e `app_dupla_finalize` refeita para chamá-la.
- **Leituras ampliadas (parte de …`9760`):** `app_dupla_stations` — `my_last_pct` passa a vir da **última tentativa de qualquer modo** e ganha `my_last_mode`; `average_pct`/`evaluations` só `mode = 'dupla'`. `app_dupla_profile.stats` (cartão público) só `mode = 'dupla'`. `app_dupla_result` — "Última vez" (`previous_pct`) compara só com o **mesmo modo**. `app_export_my_data` (parte de …`9750`:468-517) inclui `solo_runs`.
- `app_dupla_heartbeat` **refeita** (parte de …`9770`): aceita a situação `'sozinho'` (só com treino aberto do aluno; senão `livre`).
- `dupla_sweep` **refeita** (parte de …`9760`): treino em `running` mais de 2 h depois de `ends_at`, ou `evaluating` há mais de 3 min sem terminar, é destravado (`abandoned` / volta a `submitted` devolvendo a reserva — a parte da reserva só age quando existir a 9910).

- [ ] **Step 1: Write the failing tests** (`duplaSozinhoDados`, PGlite com as migrações reais)
```ts
it("treino_dupla guarda sozinho e convites sem perder aberto e planos", …)
it("solo_allowed: equipe sempre; chave fechada bloqueia; plano marcado e válido libera; teste vencido e plano vencido não", …)
it("app_dupla_access mostra sozinho.permitido sem mexer nos campos antigos", …)
it("app_admin_save_dupla(jsonb): só administrador; valida números; preserva sozinho.ia; registra dupla.save", …)
it("um treino aberto por aluno (índice parcial); outro só depois de concluir ou descartar", …)
it("study_solo_runs: aluno não lê nem grava direto (RLS sem política)", …)
it("dupla_station_candidate_view: igual ao que o candidato recebia antes (sem 'Liberação', sem roteiro, sem PEP)", …) // compara com app_dupla_room_content
it("dupla_result_items e dupla_score_marks: mesma nota e mesmos itens que antes (casos de duplaResultadoBanco/duplaSalaBanco)", …)
it("app_dupla_stations: média geral e evaluations só dupla; my_last_pct de qualquer modo, com my_last_mode", …)
it("app_dupla_profile.stats e app_dupla_result.previous_pct ignoram o outro modo", …)
it("heartbeat 'sozinho' só com treino aberto; fora disso vira 'livre'", …)
it("exportar meus dados inclui os treinos; excluir a conta apaga-os", …)
it("colar a migração duas vezes dá o mesmo banco", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSozinhoDados.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração (cabeçalho em português: o que faz, funções refeitas e a base de cada uma com arquivo e linha, como desfazer).
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSozinhoDados.test.ts src/__tests__/duplaTelasBanco.test.ts src/__tests__/duplaMigracaoDados.test.ts src/__tests__/duplaMatchBanco.test.ts src/__tests__/duplaSalaBanco.test.ts src/__tests__/duplaResultadoBanco.test.ts src/__tests__/supabaseSchema.test.ts src/__tests__/supabaseAdminApi.test.ts --pool=threads --maxWorkers=1` — Expected: PASS (os testes antigos não mudam de resultado).
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9900 com dados, acesso e pecas compartilhadas do treino sozinho".

### Tarefa S2: Migração 9901 — funções do treino sozinho
**Depois de:** S1.
**Files:** Create `supabase/migrations/20261003009901_treino_dupla_sozinho_funcoes.sql`, `src/__tests__/duplaSozinhoFuncoes.test.ts`.

**Interfaces — Produces** (todas `app_solo_*` com `solo_assert_access()`, `volatile`, mensagens em português):
- `app_solo_start(p_station_id text) → { run_id }`: estação aprovada (ou equipe); `is_pro_only` exige `tutor_is_pro`; um treino aberto por aluno (`'Você já tem um treino sozinho em andamento.'`); `ends_at = now() + duration_ms` (duração da estação); grava `station_version` do conteúdo; marca o sinal `sozinho`.
- `app_solo_current() → null | { run_id, phase, station: { id, name, number }, ends_at, server_now }`.
- `app_solo_state(p_run_id) → SoloState`: `{ id, phase, station: { id, name, area, area_code, number, duration_ms, doctor_scene, doctor_tasks, version }, started_at, ends_at, server_now, answers, pressings: [{ id, index, name, opened, content?, has_image }], source, how, ia: { state, message }, result_ready }`. **Só a projeção do candidato**; `doctor_scene`/`doctor_tasks`/`pressings` só em `running` e `submitted`. Nunca `actor_script`, `checklist_items`, pontos.
- `app_solo_save_answers(p_run_id, p_answers jsonb) → { ok, saved_at }`: só `running`; cada resposta `{ task: 1..30, text ≤ 4000 }`, total ≤ 20000 (`'Texto longo demais.'`).
- `app_solo_open_pressing(p_run_id, p_pressing_id) → { id, name, content, has_image }`: registra `{ id, at_ms }` (tempo desde o início, no servidor) uma vez só; só `running`/`submitted`; impresso da estação (`'Impresso não encontrado.'`).
- `app_solo_print_path(p_run_id, p_pressing_id) → text|null`: só impresso já aberto; mesma busca de `station_assets` de `app_dupla_print_path` (T14).
- `app_solo_submit(p_run_id, p_answers jsonb, p_how text) → { phase }`: grava as respostas finais; `p_how = 'self'` → `self_grading`; `p_how = 'ia'` → `submitted` com `how = 'ia'` (a IA é chamada pela rota da 6B; aqui, sem a 9910, responde `'Avaliação por IA indisponível.'`); marca `submitted_at`; sinal volta a `livre`.
- `app_solo_pep(p_run_id) → { items, marks }`: **só** `self_grading` e `done`; itens com pontos e critérios (mesma forma do `checklist_items` do avaliador da sala) e marcações do aluno.
- `app_solo_mark(p_run_id, p_item_id text, p_grade text, p_subitems text[] default '{}') → { ok: true }`: só `self_grading`; item e nível existentes (`'Item do checklist não encontrado.'`, `'Nível inválido para este item.'`); `null` = pendente.
- `app_solo_finish_self(p_run_id) → { session_id }`: calcula com `dupla_score_marks`; grava a sessão (`mode 'sozinho'`, `source 'autoavaliacao'`, `room_id` = id do treino, `round 1`, `doctor_id` = aluno, `actor_id` nulo, `used_ms`, `station_version`, `pressings_released` = ids abertos, feedback vazio); `phase = 'done'`; idempotente (clique duplo não cria duas).
- `app_solo_result(p_run_id) → ResultData` (a forma de `app_dupla_result`, usando `dupla_result_items`) mais `{ mode: 'sozinho', source, ia }` (o `ia` vem da 9910); só o dono do treino e só em `done`.
- `app_solo_discard(p_run_id) → { ok }`: `abandoned`, sinal volta a `livre`; não apaga o que já virou sessão.
- `app_dupla_my_attempts(p_station_id text default null, p_limit integer default 20) → { attempts: [{ id, station: { id, name, number }, finished_at, pct, score, max_score, mode, source }] }` (só do aluno, mais novas primeiro, máx. 100).

- [ ] **Step 1: Write the failing tests** (`duplaSozinhoFuncoes`)
```ts
it("começar: estação aprovada, Pro-only exige plano pago, um treino aberto por aluno, ends_at do servidor", …)
it("estado: candidato nunca recebe roteiro do ator, itens do PEP nem pontos (checa o JSON cru)", …)
it("estado não mostra enunciado nem impressos depois da entrega", …)
it("salvar respostas: só running, limites, recarregar devolve o mesmo texto", …)
it("abrir impresso registra uma vez só com o tempo do servidor; impresso inexistente recusa", …)
it("caminho da imagem: só impresso aberto; sem imagem devolve null", …)
it("entregar para autoavaliação libera o PEP só depois; antes disso app_solo_pep recusa", …)
it("marcar: item e nível válidos, pendente limpa, só em self_grading", …)
it("finalizar: nota igual à da sala para as mesmas marcações; sessão com mode sozinho e source autoavaliacao; clique duplo não duplica", …)
it("resultado: só o dono e só depois de done; 'Última vez' só do mesmo modo", …)
it("descartar e abandono (sweep) liberam o aluno para outro treino", …)
it("minhas tentativas: só as do aluno, com modo e fonte, filtro por estação", …)
it("outro aluno não lê nem mexe no treino (todas as funções recusam)", …)
it("uma tentativa sozinha não entra na média geral, no cartão público nem em 'matches hoje'", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSozinhoFuncoes.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSozinhoFuncoes.test.ts src/__tests__/duplaSozinhoDados.test.ts src/__tests__/duplaSalaBanco.test.ts --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9901 com as funcoes do treino sozinho".

### Tarefa S3: Rota do impresso do treino sozinho
**Depois de:** S2. **Paralela com:** S4.
**Files:** Modify `server/dupla/router.ts`. Create `src/__tests__/duplaSozinhoImpressoRota.test.ts`.
**Interfaces:** `GET /api/dupla/solo/:runId/prints/:pressingId/link` → `{ url }` (assinado 600 s; dev `{ url: null }`) e `GET …/file` (dev; `Cache-Control: private, no-store`): mesmo código de `duplaPrintLink` da sala, chamando `app_solo_print_path`. Sem login 401 "Entre na sua conta."; ids fora do padrão 400 "Impresso inválido."; sem imagem 404 "Impresso sem imagem."; recusa do banco 403 com a mensagem.
- [ ] **Step 1: tests** — `it("sem token 401; ids inválidos 400; sem imagem 404; recusa do banco 403; com imagem, link de 600 s")`, `it("impresso ainda fechado não gera link")`, `it("desenvolvimento: link nulo e arquivo sem cache")`, `it("a rota da sala continua igual")`.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSozinhoImpressoRota.test.ts src/__tests__/duplaImpressoRota.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: rota do impresso do treino sozinho".

### Tarefa S4: Acesso por modo, rotas e a escolha "Como você quer treinar?"
**Depois de:** S2. **Paralela com:** S3.
**Files:** Create `src/novo/app/dupla/ModeChoice.jsx`, `src/__tests__/duplaEscolhaDoModo.test.tsx`. Modify `src/novo/app/session.jsx` (`dupla` ganha `sozinho`), `src/novo/app/dupla/DuplaGate.jsx`, `src/novo/app/dupla/PracticeScreen.jsx`, `src/novo/app/App.jsx` (rota `dupla-sozinho` = `/dupla/sozinho/:runId`, `TITLES`, `CONNECTED`, `PHASE2_ROUTES`, `NO_DOCK`), `src/__tests__/duplaRotas.test.tsx`, `src/__tests__/duplaPraticarTela.test.tsx`, `src/__tests__/segundaFaseEmBreve.test.tsx` (mocks).

**Interfaces:**
- `useSession().dupla` = `{ aberto, permitido, planos, equipe, sozinho: { aberto, permitido, ia?: { disponivel, motivo } } } | null`.
- `duplaAllowed(boot, dupla)` continua para a **sala, o perfil e o baralho**; novo `soloAllowed(boot, dupla)`. A rota `dupla` (Praticar) abre se **qualquer um** dos dois vale; senão `LockedFeature`.
- `ModeChoice({ go, station, access, hasProfile, onPickStation }) → JSX`: três cartões (A/B/C) com bloqueio individual (cartão trancado mostra "Ver planos"); sem perfil, B e C levam a "Meu perfil de estudo"; A chama a janela S1 (S5).
- `PracticeScreen`: lê `?estacao=` e `?modo=online|baralho`. **Sem estação:** como hoje + botão "Escolher estação" (`StationPicker`). **Com estação e sem `modo`:** `ModeChoice`. `app_dupla_profile` só é chamada para B e C (quem só tem o sozinho **não** a chama: ela recusaria com 'Sem acesso ao Treinamento em Dupla.'). Faixa "Você tem um treino sozinho em andamento" quando `app_solo_current()` devolve algo (Continuar → `go("dupla-sozinho", { runId })`; Descartar → confirma → `app_solo_discard`).
- [ ] **Step 1: Write the failing tests**
```ts
it("com estação: três cartões; sem estação: baralho de hoje e botão Escolher estação", …)
it("cada cartão respeita o acesso: só sozinho, só dupla, os dois, nenhum (LockedFeature)", …)
it("só com o sozinho a tela não chama app_dupla_profile nem app_dupla_deck", …)
it("sem perfil de estudo: Treinar sozinho funciona; B e C pedem o perfil", …)
it("faixa de treino em andamento: Continuar e Descartar com confirmação", …)
it("clique numa estação do Banco abre o Praticar com os três caminhos (go('dupla', { estacao }))", …)
it("rota dupla-sozinho sem Dock; aluno barrado vê o convite do plano", …)
it("nada do que ficou fora: sem Busca automática, Convite rápido, Salas abertas, WhatsApp", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaEscolhaDoModo.test.tsx src/__tests__/duplaRotas.test.tsx src/__tests__/duplaPraticarTela.test.tsx src/__tests__/segundaFaseEmBreve.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** os mesmos — Expected: PASS (os de baralho de `duplaMatchTela.test.tsx` também: `FILA npx vitest run src/__tests__/duplaMatchTela.test.tsx …`).
- [ ] **Step 5: Commit** "Treino em dupla: escolha do modo no Praticar e acesso por modo".

### Tarefa S5: Treino sozinho — janela, estação em andamento e entrega
**Depois de:** S0 (prévia aprovada), S3 e S4.
**Files:** Create `src/novo/app/dupla/solo/{SoloScreen,SoloIntro,SoloRun,SoloSubmit}.jsx`, `src/novo/app/dupla/{soloApi.js,useSolo.js}`, `src/__tests__/duplaSozinhoTela.test.tsx`. Modify `src/novo/app/dupla/room/RunningPhase.jsx` (extrai o cabeçalho com cronômetro em componente exportado `StationHeader`, sem mudar o visual), `src/novo/app/dupla/live.js` (`useHeartbeat` aceita `"sozinho"`).
**Interfaces:**
- `useSolo(runId) → { run: SoloState|null, error, loading, remainingMs, offsetMs, actions }` com `actions = { saveAnswers(answers), openPressing(id), printUrl(id), submit(how), discard(), reload() }`. Cronômetro com `remainingMs(room, now, offsetMs)` e `measureOffset` da T15 (`clock.js`); texto salvo a cada 800 ms sem digitar (e antes de entregar e em `pagehide`).
- `SoloIntro({ station, onStart, onClose })` (janela S1), `SoloRun` (S2: `StationHeader` + `Scene` + `splitTasks` de `content.js` + `Textarea` por tarefa; sem tarefas reconhecidas, uma caixa só; impressos com `PrintItem`/`PressingImage`; barra de baixo "Entregar" e "Sair"), `SoloSubmit` (S3: janela "Como você quer corrigir?", IA desligada com o motivo até a 6B).
- Apito (`playWhistle`) ao chegar a 00:00, uma vez por treino; `useHeartbeat("sozinho")` durante o treino.
- [ ] **Step 1: Write the failing tests**
```ts
it("janela: duração da estação e Começar cria o treino e abre a tela", …)
it("estação: enunciado, tarefas com uma caixa cada, impressos fechados até abrir; cronômetro do servidor ('09:59')", …)
it("o texto é salvo sozinho e volta igual depois de recarregar", …)
it("abrir impresso mostra o conteúdo e registra; imagem pela rota assinada; Esc fecha", …)
it("00:00: selo 'Tempo esgotado', apito uma vez, e ainda dá para entregar", …)
it("entregar: pergunta Como você quer corrigir?; escolher 'Eu mesmo avalio' vai à autoavaliação", …)
it("sair com confirmação descarta; recarregar volta à mesma fase", …)
it("a resposta de rede da tela nunca traz roteiro do ator nem itens do PEP antes da entrega", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSozinhoTela.test.tsx src/__tests__/duplaSalaEstacao.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: treino sozinho com cronometro, tarefas e entrega".

### Tarefa S6: Autoavaliação e resultado do treino sozinho
**Depois de:** S5.
**Files:** Create `src/novo/app/dupla/solo/{SoloSelfGrade,SoloResult}.jsx`, `src/__tests__/duplaSozinhoResultado.test.tsx`. Modify `src/novo/app/dupla/room/ResultPhase.jsx` (aceita a variante `mode="sozinho"` e uma lista `evidence` por item; sem mudar o resultado da dupla), `src/novo/app/dupla/soloApi.js`.
**Interfaces:** `SoloSelfGrade` usa `PepTable` com `onMark` (300 ms por item, `flushMarks` antes de "Finalizar autoavaliação", filtro Todos/Pendentes, aviso de pendentes com a contagem, confirmação) → `app_solo_finish_self`. `SoloResult` usa `ResultPhase` com: título "Resultado do treino sozinho", selos (Sozinho + IA/Autoavaliação), avaliador = "Você" (autoavaliação) ou "Inteligência artificial" (sem nome de modelo), **sem** "Solicitar revisão da nota" e **sem** "Inverter papéis"; botões "Treinar de novo" (→ `app_solo_start` na mesma estação) e "Voltar ao Praticar". Linha do item aceita `evidence` (`{ quote, reason, label: 'divergiram'|'sem trecho'|'nao citado' }`) — usada na 6B.
- [ ] **Step 1: Write the failing tests**
```ts
it("autoavaliação: PEP só aparece depois da entrega; marcar grava em 300 ms; pendentes avisam; finalizar mostra a nota do servidor", …)
it("resultado: '3,75', '/ 10,00', '38%', legenda, tabela com abas Todos e Com perda de pontos, selos Sozinho e Autoavaliação", …)
it("sem Solicitar revisão, sem Inverter papéis, sem 'Escrito por'", …)
it("Treinar de novo começa outro treino na mesma estação; Voltar ao Praticar", …)
it("resultado da dupla continua igual (ResultPhase sem a variante)", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSozinhoResultado.test.tsx src/__tests__/duplaResultadoTela.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** os mesmos — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: autoavaliacao e resultado do treino sozinho".

### Tarefa S7: Histórico — selo, "Sua última nota" e tentativas
**Depois de:** S6.
**Files:** Modify `src/novo/app/dupla/StationsScreen.jsx`, `src/novo/ds/components/osce/StationCard.jsx` (+ `.d.ts`; prop opcional `lastMode`), `src/__tests__/duplaEstacoesTela.test.tsx`. Create `src/novo/app/dupla/AttemptsDialog.jsx`, `src/__tests__/duplaTentativas.test.tsx` (**só se o dono disse sim em D12**).
**Interfaces:** o cartão mostra o selo **"Sozinho"** ao lado de "Sua última nota" quando `my_last_mode === 'sozinho'` (o texto "Média geral" não muda e segue só da dupla). `AttemptsDialog({ stationId })` lê `app_dupla_my_attempts` e lista data, nota ("7,25 / 10,00"), selo (Dupla, Sozinho · IA, Sozinho · Autoavaliação).
- [ ] **Step 1: tests** — `it("selo Sozinho quando a última foi sozinha, nada quando foi dupla")`, `it("Média geral não muda com treinos sozinhos")`, `it("lista de tentativas com os três selos e vazia sem inventar")`.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaEstacoesTela.test.tsx src/__tests__/duplaTentativas.test.tsx src/__tests__/duplaComponentesEstacaoA.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL. **Step 3:** implementar. **Step 4:** rodar — PASS.
- [ ] **Step 5: Commit** "Treino em dupla: selo Sozinho e tentativas no Banco de estacoes".

### Tarefa S8: Painel — bloco "Treino sozinho"
**Depois de:** S2. **Paralela com:** S5 a S7.
**Files:** Modify `src/novo/app/admin/AdminDupla.jsx`, `src/__tests__/duplaResultadoTela.test.tsx` (painel), `src/__tests__/segundaFaseEmBreve.test.tsx` (mock do painel, se preciso). Create `src/__tests__/duplaPainelSozinho.test.tsx`.
**Interfaces:** o cartão "Treinamento em Dupla" ganha o bloco **Treino sozinho** (Switch "Abrir treino sozinho", marcação Teste grátis / Pro / Elite) e o bloco **Convites diretos: limites** (4 campos numéricos com os pontos de partida da §4.4 da spec escritos como **dica**, não como valor salvo), tudo por `app_admin_save_dupla({ p_config })`. (O bloco da IA vem na A5.)
- [ ] **Step 1: tests** — `it("salvar manda p_config completo e mostra 'Configurações salvas.'")`, `it("sozinho começa fechado e sem planos")`, `it("campo de limite inválido mostra o erro e não salva")`, `it("aluno nunca vê este cartão")`.
- [ ] **Step 2–4:** rodar (FAIL), implementar, rodar (PASS) com `FILA npx vitest run src/__tests__/duplaPainelSozinho.test.tsx src/__tests__/adminAbasVisiveis.test.tsx --pool=threads --maxWorkers=1`.
- [ ] **Step 5: Commit** "Treino em dupla: painel do treino sozinho e limites de convite".

### Tarefa S8b: Migração 9930 — "Uso do mês" com o sozinho à parte
**Depois de:** S2 e da Tarefa 18 do plano de 09/10 (migração 9790). **Paralela com:** S5 a S8.
**Files:** Create `supabase/migrations/20261003009930_treino_dupla_uso_do_mes.sql`, `src/__tests__/duplaUsoDoMes.test.ts`. Modify `src/novo/app/admin/AdminDupla.jsx` (mais linhas no "Uso do mês"), `src/__tests__/duplaResultadoTela.test.tsx` (painel).
**Interfaces:** `app_admin_dupla_usage(p_month text default null)` **refeita** (parte de …`9790`): os números atuais (`salas`, `rodadas_avaliadas`, `alunos`, `impressos_por_rodada`) passam a contar **só `mode = 'dupla'`**; ganha `sozinho: { treinos, ia, autoavaliacao, alunos, gasto_ia_usd }` (mês de Brasília; `gasto_ia_usd` = soma dos registros da função `treino_avaliacao` quando a 9910 existir, senão `null`). A tela mostra os quatro números da dupla como hoje e, **embaixo e separados**, "Treinos sozinhos", "Avaliações por IA", "Autoavaliações" e "Gasto com IA do treino" ("—" sem dado).
- [ ] **Step 1: Write the failing tests**
```ts
it("treinos sozinhos não entram em salas, rodadas avaliadas, alunos nem impressos por rodada", …)
it("o sozinho aparece à parte: treinos, IA, autoavaliação, alunos e gasto", …)
it("mês de Brasília e só administrador", …)
it("painel: quatro números da dupla intactos e as linhas do sozinho separadas, '—' sem dado", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaUsoDoMes.test.ts src/__tests__/duplaResultadoBanco.test.ts src/__tests__/duplaResultadoTela.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL. **Step 3:** implementar. **Step 4:** rodar — PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9930 com o uso do mes do treino sozinho a parte".

### Tarefa S9: Fim da Etapa 6A
- [ ] Typecheck filtrado (`FILA npx tsc --noEmit 2>&1 | grep -E "^(src/novo|server/dupla|server/devDb|src/__tests__/(dupla|helpers/dupla|supabaseSchema|segundaFase))"` — Expected: nenhuma linha) e suíte completa pela fila (relatório JSON; número de arquivos = número de `src/__tests__/**/*.test.{ts,tsx}`; os 6 do clone JCodesMore falham sem o disco — não é regressão). `FILA npm run build:vercel` sem erro.
- [ ] Relatório ao dono: arquivos, migrações 9900, 9901 e 9930; **como testar** (servidor local seguro; conta da equipe; `POST /api/dev-db/dupla/preparar`; abrir o sozinho em `treino_dupla.sozinho`; fazer um treino de ponta a ponta com autoavaliação; recarregar no meio; abrir impresso; conferir "Sua última nota" com o selo, "Média geral" intacta e o "Uso do mês" sem o sozinho); textos novos da etapa; pendências.

**PARE: confirmação do dono.** Confirma o fluxo "Como você quer treinar?", o treino sozinho com autoavaliação, o selo e os textos.

---

# Etapa 6B — Avaliação por IA

### Tarefa A1: Migração 9910 — função da Central, cota, aceite e funções de serviço
**Files:** Create `supabase/migrations/20261003009910_treino_dupla_sozinho_ia.sql`, `src/__tests__/duplaSozinhoIABanco.test.ts`. Modify `src/__tests__/helpers/duplaDb.ts`, `supabase/README.md`.

**Interfaces — Produces:**
- **Central:** `ai_functions.key` aceita `'treino_avaliacao'` (checagem refeita com a união: as 7 de …`9610`:61 + a nova); origem `treino` na checagem de origens do registro de chamadas (conferir o nome da checagem em …`5200`/`9610`/`9520`); `ch_worker_*` de leitura da configuração já listam as chaves (conferir e ampliar).
- **Livro de uso:** `ai_usage_ledger.feature` aceita `'solo_eval'` (união com a lista mais nova — ver …`5700`/`3500`); reserva +1 / devolução −1 com `meta.releases`, como `ch_worker_tutor_text_reserve/release`.
- **Aceite:** `legal_versions.document` e `legal_acceptances.document` aceitam `'treino_ia'` (versão `'1.0'`) e a origem `'treino'` (união com …`5300`:30-45,156 e …`5400`); `solo_ia_consent(p_user uuid) returns boolean`. **Texto do aceite = o que o dono aprovar (X1);** sem a linha de versão ativa o aceite não vale e a IA fica indisponível.
- `solo_ia_allowed(p_user uuid) returns jsonb` → `{ disponivel boolean, motivo text|null }`: equipe passa (ainda precisa aceite? **não**: equipe testa sem aceite, marcado no registro); aluno: chave `sozinho.ia.aberto` **e** plano em `sozinho.ia.planos` **ou** (se D5 = sim e a 9731 existir) `station_feedback_allowed()`; aceite vigente; função `treino_avaliacao` pronta (consulta `ai_functions`); cota do dia/mês (`limite_dia`/`limite_mes` nulos = bloqueado, `'Avaliação por IA indisponível.'`). Motivos devolvidos são os textos curtos da lista de textos novos.
- `app_dupla_access()` **refeita** (parte da versão da 9900): `sozinho.ia = { disponivel, motivo }`.
- `app_solo_accept_ia() returns jsonb` (grava o aceite pelo mesmo caminho de `accept_terms`, origem `treino`).
- **Funções de serviço** (só `service_role`): `ch_worker_solo_prepare(p_user uuid, p_run uuid) → { ok, reason?, reservation?, material? }` (trava por aluno `pg_advisory_xact_lock('solo:'||user)`, confere tudo de `solo_ia_allowed`, treino em `submitted` com `how = 'ia'`, texto não vazio — `'Escreva algo antes de pedir a avaliação.'` —, reserva a cota e vira `evaluating`; `material` = `{ station: { id, name, area, version }, scene, tasks, items: [{ id, order, content, grades, criteria, subitems, tip }], answers, pressings_opened, used_ms }`); `ch_worker_solo_save_eval(p_user, p_run, p_eval jsonb) → { session_id }` (valida a forma, **calcula a nota com `dupla_score_marks`**, grava a sessão `mode 'sozinho'`/`source 'ia'` e o `ia` do treino sem o material do PEP: `{ items: [{ id, grade, final_grade, quote, reason, label }], pos_items, neg_items, note, members: [{ company, role }], diverged: n, cost_usd }`; `done`); `ch_worker_solo_fail(p_user, p_run, p_reservation, p_message) → void` (devolve a cota, volta a `submitted` com a mensagem); `ch_worker_solo_ledger(p_user, p_run, p_entry jsonb)` (registro de gasto por membro, `feature 'solo_eval'`, sem texto do aluno).
- `app_solo_state`/`app_solo_result` **refeitas** para devolver `ia` (estado e mensagem; no resultado, os itens com trecho e razão, **sem** empresa nem modelo).
- `app_admin_save_dupla(p_config jsonb)` **refeita** (parte da 9900): grava também `sozinho.ia` (`aberto`, `planos`, `limite_dia`, `limite_mes` — inteiros ≥ 1 ou nulos).

- [ ] **Step 1: Write the failing tests**
```ts
it("função treino_avaliacao entra na Central desligada (sem linha) e a checagem de chaves aceita as 8", …)
it("solo_ia_allowed: chave fechada, plano fora, sem aceite, sem limite preenchido, função não pronta — cada motivo certo e nenhum gasta cota", …)
it("com a 9731: station_feedback_allowed() libera Elite quando D5 = sim; sem a 9731 a regra própria vale", …)
it("reserva atômica: dois pedidos juntos no último da cota — um passa, o outro recusa; falha devolve a cota", …)
it("limite do dia e do mês no fuso de São Paulo", …)
it("ch_worker_solo_prepare: só treino do próprio aluno em submitted/how ia; texto vazio recusa; material tem os itens do PEP", …)
it("ch_worker_solo_save_eval: nota calculada no banco; item desconhecido ignorado; nível inexistente vira pendente; clique duplo não duplica a sessão", …)
it("navegador (authenticated) não executa nenhuma ch_worker_solo_*", …)
it("aceite treino_ia: grava, vale só a versão vigente, equipe passa sem aceite", …)
it("o resultado entregue ao aluno não traz modelo, empresa, prompt nem custo", …)
it("colar duas vezes dá o mesmo banco", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSozinhoIABanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSozinhoIABanco.test.ts src/__tests__/duplaSozinhoFuncoes.test.ts src/__tests__/duplaSozinhoDados.test.ts src/__tests__/termoAceite*.test.ts src/__tests__/aiCentral*.test.ts --pool=threads --maxWorkers=1` (usar os nomes reais dos arquivos de teste do aceite e da Central: `ls src/__tests__ | grep -i "aceite\|central"`) — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9910 com a funcao da Central, cota e aceite da avaliacao por IA".

### Tarefa A2: Função "Avaliação do treino sozinho" na Central de IAs (código)
**Depois de:** A1. **Paralela com:** A3.
**Files:** Modify `server/ai/config.ts` (`AiFunctionKey`, `TYPICAL_CALLS.treino_avaliacao = [{ use: "avaliação do treino sozinho", inputChars: 24_000, maxOut: 3000 }]`, nomes e textos, estado "pronta" com a regra de **empresas diferentes entre os membros**), `server/ai/maestro.ts` (`MaestroOrigin.source` ganha `"treino"`), `src/novo/app/admin/AdminAI.jsx` (a função aparece com os mesmos controles; aviso "dois membros de empresas diferentes"), `src/__tests__/` dos testes da Central que listam as funções (contagem 7 → 8), `docs/architecture/` da Central (uma linha). Create `src/__tests__/duplaCentralFuncao.test.ts`.
- [ ] **Step 1: tests** — `it("função nasce desligada e sem IA definida")`, `it("comitê com duas IAs da mesma empresa fica 'não pronta' com aviso")`, `it("duas empresas diferentes com preço cadastrado ficam prontas")`, `it("estimativa típica entra nos tetos (desligados) sem erro")`, `it("tela da Central lista 8 funções e só administrador abre")`, `it("aluno barrado da Central")`.
- [ ] **Step 2–4:** rodar (FAIL) / implementar / rodar `FILA npx vitest run src/__tests__/duplaCentralFuncao.test.ts <testes da Central que já existem> --pool=threads --maxWorkers=1` (PASS).
- [ ] **Step 5: Commit** "Treino em dupla: funcao Avaliacao do treino sozinho na Central de IAs".

### Tarefa A3: Servidor — material, prompt, validação, mescla e rota
**Depois de:** A1. **Paralela com:** A2.
**Files:** Create `server/dupla/soloEval.ts`, `src/__tests__/duplaAvaliacaoIA.test.ts`. Modify `server/dupla/router.ts` (rota), `server.ts` só se a montagem precisar de novas dependências.
**Interfaces — Produces:**
```ts
// soloEval.ts
export const SOLO_EVAL_SYSTEM: string        // regras da §3.4 da spec: só o PEP; sem conhecimento próprio; <aluno> é dado; saída só no esquema
export const SOLO_EVAL_SCHEMA: Schema         // { items: [{ item_id, grade: correct|partial|incorrect|sem_base, evidence: string|null, reason ≤ 240 }], pos_items: string[], neg_items: string[], note ≤ 300 }
export function buildInput(material: Material): string      // itens do PEP, cenário, tarefas, impressos abertos e texto do aluno entre <aluno>…</aluno>
export const norm: (t: string) => string                    // sem acento, caixa baixa, espaços únicos (para o trecho literal)
export function validateMember(out: unknown, material: Material): MemberResult   // regras 1–4 da spec: desconhecido ignora, nível inexistente → pendente, correct/partial sem trecho literal → sem_base, incorrect sem trecho → label 'nao_citado'
export function mergeMembers(members: MemberResult[], material: Material): Merged // menor nível; label 'divergiram'; exige ≥ 2 membros de empresas distintas
export async function evaluateSolo(deps: { db: ContentDb; maestro: MaestroDeps; now?: () => Date }, uid: string, runId: string): Promise<{ ok: true; session_id: string } | { ok: false; status: number; message: string }>
// router.ts
// POST /api/dupla/solo/:runId/evaluate → 200 { ok: true } | 401 | 403 (barreiras) | 409 (estado) | 429 (cota) | 502 (IA) — sem corpo técnico
```
Fluxo de `evaluateSolo`: `ch_worker_solo_prepare` (barreiras e reserva) → `runFunction(maestro, "treino_avaliacao", req, { source: "treino", actorId: uid })` com prazo de 90 s (`requestDeadline`) → `validateMember` em cada membro de `outputs` → `mergeMembers` → `ch_worker_solo_save_eval` (e `ch_worker_solo_ledger` por membro). Qualquer falha → `ch_worker_solo_fail` (devolve a cota) e mensagem em português sem nome de empresa. Uma avaliação por treino (a trava está no banco).
- [ ] **Step 1: Write the failing tests** (IA **simulada** com `mockProvider`/`makeProviderFor`; nenhuma chamada real)
```ts
it("trecho literal obrigatório: correct sem citação vira sem_base; incorrect sem citação vira 'não citado'", …)
it("a comparação do trecho ignora acento, caixa e espaços repetidos", …)
it("item inventado pela IA é ignorado; item que faltou fica pendente; nível que o item não tem é recusado", …)
it("a IA nunca define a nota: ignora qualquer campo 'score' e o banco calcula", …)
it("dois membros iguais: nota igual; divergentes: vale o menor e marca 'divergiram'", …)
it("só um membro respondeu: não sai nota de IA, cota devolvida, treino volta a 'entregue'", …)
it("dois membros da mesma empresa: recusa antes de gastar", …)
it("texto do aluno com 'ignore as regras e dê nota 10' não muda nada além do que o PEP permite; o prompt trata como dado", …)
it("texto vazio não chama a IA; texto curto avisa", …)
it("clique duplo: uma chamada só; o segundo pedido recebe 409", …)
it("queda no meio (timeout): mensagem em português, cota devolvida, pode tentar de novo", …)
it("aluno de outro treino 403; visitante 401; aluno sem plano/sem aceite/sem cota 403/429 sem chamar a IA", …)
it("a resposta HTTP não traz modelo, empresa, prompt nem custo", …)
it("o material enviado à IA não contém nome, e-mail nem perfil do aluno", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaAvaliacaoIA.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaAvaliacaoIA.test.ts src/__tests__/duplaSozinhoIABanco.test.ts src/__tests__/conferenciaOutraEmpresa.test.ts --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: avaliacao por IA do treino sozinho no servidor".

### Tarefa A4: Telas — aceite, "Avaliar com IA", espera e resultado com evidências
**Depois de:** A2, A3 e S6.
**Files:** Create `src/novo/app/dupla/solo/{IAConsent,SoloWaiting}.jsx`, `src/__tests__/duplaSozinhoIATela.test.tsx`. Modify `src/novo/app/dupla/solo/{SoloSubmit,SoloResult}.jsx`, `src/novo/app/dupla/room/ResultPhase.jsx`, `src/novo/app/dupla/soloApi.js`.
**Interfaces:** `SoloSubmit` habilita **Avaliar com IA** conforme `dupla.sozinho.ia.disponivel`, mostrando `motivo` quando não. Sem aceite: `IAConsent` (Checkbox + botão "Aceito", versão vinda do servidor, `app_solo_accept_ia`). Escolhida a IA: `app_solo_submit(run, answers, 'ia')` → `POST /api/dupla/solo/:runId/evaluate` → `SoloWaiting` ("Avaliando…", sem contador falso; recarregar volta aqui enquanto `evaluating`; erro mostra **Tentar de novo** e **Corrigir eu mesmo**). Resultado: cada item com acordeão "Trecho seu" (citação) e "Por quê"; etiquetas "Não citado no seu texto", "A IA não achou um trecho seu que provasse este item", "As duas IAs divergiram", "Sem avaliação"; aviso fixo da IA; "Avisar a equipe que a avaliação errou" → insere em `checklist_station_reports` (`station_id`, mensagem com o id do treino e do item, até 2000).
- [ ] **Step 1: Write the failing tests**
```ts
it("IA indisponível: botão desligado com o motivo; autoavaliação sempre disponível", …)
it("sem aceite: aparece o aviso; com aceite a avaliação segue", …)
it("avaliando: recarregar volta à espera; erro oferece Tentar de novo e Corrigir eu mesmo", …)
it("resultado: trecho e razão por item, etiquetas, aviso fixo e selo IA", …)
it("o que chega ao navegador não traz modelo, empresa, prompt nem custo", …)
it("Avisar a equipe grava o relato com o item e o treino", …)
it("aluno nunca vê palavras como 'comitê', 'Central', nome de modelo ou de empresa", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSozinhoIATela.test.tsx src/__tests__/duplaSozinhoResultado.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL. **Step 3:** implementar. **Step 4:** rodar — PASS.
- [ ] **Step 5: Commit** "Treino em dupla: telas da avaliacao por IA do treino sozinho".

### Tarefa A5: Painel — bloco "Avaliação por IA" e uso
**Depois de:** A1. **Paralela com:** A4.
**Files:** Modify `src/novo/app/admin/AdminDupla.jsx`. Create `src/__tests__/duplaPainelIA.test.tsx`.
**Interfaces:** bloco **Avaliação por IA no treino sozinho**: Switch, planos, "Limite por aluno por dia" e "por mês" (vazio = bloqueada, com a frase "Sem limite preenchido, a avaliação por IA fica bloqueada."), estado da função ("pronta" / "não pronta: {motivo}", lido da Central) com atalho "Abrir Central de IAs"; se a 9731 existir, linha informativa "Ligada ao benefício Elite…" conforme D5.
- [ ] **Step 1: tests** — `it("salvar manda sozinho.ia e preserva o resto")`, `it("limite vazio mostra a frase de bloqueio")`, `it("função não pronta aparece com o motivo")`, `it("aluno e editor barrados do bloco")`.
- [ ] **Step 2–4:** rodar (FAIL), implementar, rodar `FILA npx vitest run src/__tests__/duplaPainelIA.test.tsx src/__tests__/duplaPainelSozinho.test.tsx --pool=threads --maxWorkers=1` (PASS).
- [ ] **Step 5: Commit** "Treino em dupla: painel da avaliacao por IA do treino sozinho".

### Tarefa A6: Conferência à mão com IA de verdade e fim da Etapa 6B
**Depois de:** A4 e A5.
- [ ] Servidor local seguro (Global Constraints do plano de 09/10). Com a conta da equipe e **duas empresas de verdade na Central** (recomendação da §3.5 da spec, **só se o dono mandar ligar**), avaliar **3 estações de teste** (`teste-inep2020-eNN`), cada uma com um texto bom, um fraco e um com tentativa de enganar a IA. Anotar tokens de entrada/saída e custo reais por treino; **atualizar a tabela da §3.6 da spec** e propor limites com os números medidos (o dono decide).
- [ ] Conferir como **aluno de teste**: nada de modelo/empresa/custo na tela; Central e bloco do painel barrados; sem aceite, sem plano e sem limite → só autoavaliação.
- [ ] Typecheck filtrado, suíte completa e build (como na S9). Relatório ao dono: arquivos, migração 9910, resultado da conferência à mão, custo medido, **lembrete único: religar tetos e cadastrar preços antes dos alunos**, pendências (texto do aceite e Política).

**PARE: confirmação do dono.** Confirma a avaliação por IA (texto, trecho e razão, divergência), o aceite, os limites e o custo.

---

# Etapa 6C — Radar e convite direto

### Tarefa R1: Migração 9920 — radar, convite direto, bloqueios e limites
**Files:** Create `supabase/migrations/20261003009920_treino_dupla_radar.sql`, `src/__tests__/duplaRadarBanco.test.ts`. Modify `src/__tests__/helpers/duplaDb.ts`, `supabase/README.md`.
**Interfaces — Produces:**
- `study_profiles.allow_direct_invites boolean not null default true`; `app_dupla_profile`/`app_dupla_save_profile` **refeitas** (parte de …`9760`) para ler e gravar o campo (e `app_dupla_profile` devolve `blocked: [{ user_id, public_name }]`).
- `study_blocks(user_id → auth.users on delete cascade, blocked_id → auth.users on delete cascade, created_at, pk (user_id, blocked_id))`, RLS ligada sem política; `app_dupla_block(p_user uuid)` e `app_dupla_unblock(p_user uuid)` (`'Colega não encontrado.'`).
- `study_invites.kind text not null default 'match' check in ('match','direto')`; índice `(from_user, created_at desc)`.
- **Quem se enxerga:** helper interno `dupla_blocked(a uuid, b uuid) returns boolean` (nos dois sentidos).
- `app_dupla_radar(p_station_id text default null) → { people: [{ user_id, public_name, school, city, exam, areas, role_pref, pace, days, shifts, stats, compat, reasons, state: 'livre'|'em_sala'|'sozinho', can_invite, why_not }], online int, server_now }`: `dupla_assert_access`; exige **perfil e radar ligado** de quem chama (senão `'Ligue "Aparecer no radar" para ver quem está online.'` / `'Crie seu perfil de estudo antes de procurar uma dupla.'`); lista quem tem acesso, radar ligado, sinal < 2 min e situação ≠ `fora`, sem bloqueio; mesmo cartão público do baralho (instituição só com `show_school`; estatística só com `show_stats`; **nunca** e-mail/telefone); `compat` e `reasons` por `dupla_compat`; `can_invite` falso com `why_not` ('Não recebe convites.', 'Em sala.', 'Treinando sozinho.'); ordem: livres, depois compat, depois sinal; máximo 50.
- `app_dupla_invite(p_to uuid, p_station_id text) → { room_id, partner: { user_id, public_name } }`: trava o par (`pg_advisory_xact_lock('dupla-par:…')`); `dupla_sweep()`; confere: eu e ele com perfil, acesso, radar, `allow_direct_invites`, online e livre, sem sala aberta, sem bloqueio, estação aprovada (e, se `is_pro_only`, os dois `tutor_is_pro`: `'Estação exclusiva dos planos Pro e Elite.'`), **limites** (lê `treino_dupla.convites`, padrões 1/5/20/30 min: `'Você já tem um convite aguardando resposta.'`, `'Muitos convites seguidos. Tente de novo em {n} min.'`, `'Você convidou {nome} há pouco. Tente de novo em {n} min.'`); cria **sala** (`roles`, rodada 1, `match_id` nulo, estação e `duration_ms`, papéis por `dupla_assign`) + `study_invites (kind 'direto', 60 s)`; atualiza meu sinal. **Não** cria `study_matches`.
- **Refeitas (parte de …`9770`):** `app_dupla_invites` (cada convite ganha `kind` e `station: { id, name, number, area_code, duration_ms }`), `app_dupla_deck` e `app_dupla_swipe` (tiram bloqueados e quem está `sozinho`; o swipe não forma match com quem está `sozinho`), `app_dupla_answer_invite` (recusar convite `direto` fecha a sala como hoje; **aceitar** idem).
- [ ] **Step 1: Write the failing tests** (perfis do `duplaMatchBanco`: Ana, Bruno, Carla, Diego, Eva…)
```ts
it("radar: só quem liga o radar vê a lista; quem está fora, sem acesso, bloqueado ou com radar desligado não aparece", …)
it("cartão público: instituição só com show_school, estatística só com show_stats, nunca e-mail/telefone", …)
it("estado: livre convida; em sala e treinando sozinho aparecem sem botão; allow_direct_invites desligado aparece sem botão", …)
it("ordem: livres primeiro, depois compat; máximo 50", …)
it("convidar: cria sala em 'roles' com a estação, sem study_matches, convite 'direto' de 60 s, papéis sugeridos", …)
it("convidar recusa: ele ocupado, bloqueado, sem convites, sem acesso, estação Pro sem plano, eu em sala", …)
it("limites: 1 pendente; 5 por hora; 20 por dia; 30 min depois de recusa/vencimento — cada mensagem com o tempo certo", …)
it("dois convites juntos para a mesma pessoa: um passa (trava do par)", …)
it("aceitar leva os dois à mesma sala; recusar e vencer fecham 'convite_recusado'/'convite_expirado'", …)
it("convites trazem kind e estação; o de match continua igual", …)
it("bloquear/desbloquear: nos dois sentidos, some do baralho e do radar, não convida; lista no perfil", …)
it("baralho e match ignoram quem está 'sozinho'", …)
it("colar duas vezes dá o mesmo banco", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaRadarBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaRadarBanco.test.ts src/__tests__/duplaMatchBanco.test.ts src/__tests__/duplaTelasBanco.test.ts src/__tests__/duplaSozinhoDados.test.ts --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9920 com radar, convite direto, bloqueios e limites".

### Tarefa R2: Ganchos do radar e janela do convite direto
**Depois de:** R1. **Paralela com:** R3.
**Files:** Create `src/novo/app/dupla/radarApi.js`, `src/__tests__/duplaRadarTempoReal.test.tsx`. Modify `src/novo/app/dupla/live.js` (`useRadar`), `src/novo/app/dupla/MatchModal.jsx` (`InviteWatcher` entende `kind`), `src/__tests__/duplaMatchTela.test.tsx`.
**Interfaces:** `useRadar({ stationId, onlineIds, live }) → { people, online, loading, error, refresh() }`: consulta `app_dupla_radar` na entrada, a cada 20 s (local) / 30 s (ao vivo), ao voltar a aba/rede e quando `onlineIds` muda (agrupado, no máximo 1 consulta a cada 5 s); erro mantém a lista anterior; resposta atrasada nunca vence a mais nova. `InviteWatcher`: convite `kind: 'direto'` abre a janela **"{nome} convidou você para treinar"** (estação, **Aceitar**, **Agora não**, **Bloquear {nome}**); `kind: 'match'` segue igual ("Deu match!").
- [ ] **Step 1: tests** — `it("consulta na entrada, no relógio, ao voltar a aba e quando a Presença muda (agrupado)")`, `it("erro mantém a lista; resposta atrasada não vence")`, `it("convite direto abre a janela certa, sem fanfarra de match; Aceitar abre a sala; Agora não responde false; Bloquear bloqueia e responde false")`, `it("convite de match continua igual")`.
- [ ] **Step 2–4:** rodar (FAIL), implementar, rodar `FILA npx vitest run src/__tests__/duplaRadarTempoReal.test.tsx src/__tests__/duplaMatchTela.test.tsx src/__tests__/duplaTempoReal.test.tsx --pool=threads --maxWorkers=1` (PASS).
- [ ] **Step 5: Commit** "Treino em dupla: ganchos do radar e janela do convite direto".

### Tarefa R3: Tela do radar
**Depois de:** R1 e S0 (prévia aprovada). **Paralela com:** R2.
**Files:** Create `src/novo/app/dupla/RadarScreen.jsx`, `src/__tests__/duplaRadarTela.test.tsx`. Modify `src/novo/app/dupla/PracticeScreen.jsx` (`?modo=online`), `src/novo/app/dupla/ModeChoice.jsx`.
**Interfaces:** `RadarScreen({ go, station, profile })`: cabeçalho "Quem está online" com a estação escolhida (e "Trocar estação"), `RadarPulse` (visual do pacote, `Match.jsx:7`), a chave **Aparecer no radar** (`radar_visible`, grava pelo perfil), abas **Online** / **Ator/avaliador**, busca, "N colegas online", linhas com avatar de iniciais, nome, instituição (se pública), papel, ritmo, estado (verde/âmbar), compat e **Convidar** (→ `app_dupla_invite` → `go("dupla-sala", { sala })`). Radar desligado: aviso "Ligue "Aparecer no radar" para ver quem está online." com o botão. Vazio: "Ninguém online agora" + botões **Treinar sozinho** e **Procurar dupla**. Erros do servidor viram aviso (`messageOf`). Mesmos `useHeartbeat("livre")` e `useDuplaChannel` do baralho. **Sem** "Busca automática de duplas", "Salas abertas" e WhatsApp.
- [ ] **Step 1: Write the failing tests**
```ts
it("lista com nome, compat e estado; Convidar cria a sala e leva a ela", …)
it("ocupados e 'Não recebe convites' sem botão", …)
it("radar desligado: aviso e botão; vazio: texto honesto e atalhos", …)
it("abas Online e Ator/avaliador filtram; busca acha por nome e instituição", …)
it("erro de limite mostra a mensagem do servidor e nada quebra", …)
it("nenhuma pessoa de exemplo aparece fora dos dados do servidor", …)
it("sem Busca automática, Salas abertas, Convite rápido e WhatsApp", …)
```
- [ ] **Step 2–4:** `FILA npx vitest run src/__tests__/duplaRadarTela.test.tsx src/__tests__/duplaPraticarTela.test.tsx src/__tests__/duplaEscolhaDoModo.test.tsx --pool=threads --maxWorkers=1` (FAIL → implementar → PASS).
- [ ] **Step 5: Commit** "Treino em dupla: tela do radar com convite direto".

### Tarefa R4: Perfil — convites diretos e pessoas bloqueadas
**Depois de:** R1.
**Files:** Modify `src/novo/app/dupla/StudyProfileScreen.jsx`, `src/novo/app/dupla/profile.js`, `src/__tests__/duplaPerfilTela.test.tsx`.
**Interfaces:** na seção de privacidade, junto de "Aparecer no radar", entra o Switch **"Permitir convites diretos"**; abaixo, a lista **"Pessoas bloqueadas"** (nome público + "Desbloquear"), vazia = "Ninguém bloqueado." A prévia do cartão não muda.
- [ ] **Step 1: tests** — `it("convites diretos salva junto do perfil; desligado aparece como 'Não recebe convites' para os outros")`, `it("lista de bloqueados e Desbloquear")`, `it("o perfil antigo sem o campo abre com convites ligados")`.
- [ ] **Step 2–4:** `FILA npx vitest run src/__tests__/duplaPerfilTela.test.tsx --pool=threads --maxWorkers=1` (FAIL → implementar → PASS).
- [ ] **Step 5: Commit** "Treino em dupla: convites diretos e bloqueios no perfil de estudo".

### Tarefa R5: Sala fechada oferece o treino sozinho
**Depois de:** R3 e S6.
**Files:** Modify `src/novo/app/dupla/room/ClosedPhase.jsx`, `src/__tests__/duplaSalaFases.test.tsx`.
**Interfaces:** nos motivos `convite_recusado` e `convite_expirado`, abaixo de "{nome} não entrou na sala.", o botão secundário **"Treinar sozinho esta estação"** → `go("dupla", { estacao })` (a estação da sala; sem estação, não aparece). Os outros motivos não mudam.
- [ ] **Step 1: tests** — `it("recusado e vencido oferecem treinar sozinho com a estação da sala")`, `it("saiu e sem_sinal não oferecem")`.
- [ ] **Step 2–4:** `FILA npx vitest run src/__tests__/duplaSalaFases.test.tsx --pool=threads --maxWorkers=1` (FAIL → implementar → PASS).
- [ ] **Step 5: Commit** "Treino em dupla: sala fechada oferece o treino sozinho".

### Tarefa R6: Fim da Etapa 6C
- [ ] Typecheck filtrado, suíte completa e build (como na S9).
- [ ] Relatório ao dono: arquivos, migração 9920; **como testar** (servidor local seguro; duas contas, uma em janela anônima; perfis; radar nas duas; Convidar; aceitar → mesma sala; Agora não → "{nome} não entrou na sala." com "Treinar sozinho esta estação"; bloquear e conferir que some; estourar o limite; desligar "Permitir convites diretos"); textos novos; pendência: **Realtime do Supabase conferido à mão em dois aparelhos depois de publicar** (mesmo aviso da Etapa 4).

**PARE: confirmação do dono.** Confirma o radar, o convite direto, os limites e os bloqueios.

---

# Etapa 7 — extensões ao plano de 09/10

### Z1: Tarefa 19 (celular e acessibilidade) passa a cobrir as telas novas
- [ ] Incluir em `src/__tests__/duplaAcessibilidade.test.tsx` e em `dupla.css`: `ModeChoice` (cartões como botões com nome acessível e foco visível), `SoloRun` (até 900 px: caixas de texto na largura da tela, barra de baixo fixa, janelas como painel de baixo), `SoloSelfGrade` (mesma tabela do PEP), `RadarScreen` (lista navegável por teclado, `Convidar` com `aria-label` "Convidar {nome}"), janela do convite direto (Esc = Agora não, foco na janela). Anúncios: "Faltam 2 minutos.", "Faltam 30 segundos.", "Tempo esgotado." também no sozinho (uma vez cada por treino) e "Avaliação pronta." quando a IA termina. `prefers-reduced-motion` desliga o `RadarPulse`.

### Z2: Tarefa 20 (ponta a ponta, documentação, SQL) passa a cobrir tudo isto
- [ ] `scripts/e2e/dupla.mjs` ganha dois cenários no banco local: (1) **um contexto**: treino sozinho com **autoavaliação** (e, se houver IA simulada no servidor de desenvolvimento, com IA) até o resultado, recarregando no meio; conferir que as respostas de `/api/dev-db/rpc` antes da entrega **não trazem** `actor_script` nem `checklist_items`; (2) **dois contextos**: radar → Convidar → aceitar → sala → fim; e Agora não → "Treinar sozinho esta estação".
- [ ] `docs/architecture/TREINO_EM_DUPLA.md` ganha: os três caminhos do Praticar, o treino sozinho (tabela, funções, regras da IA, custo medido), o radar (privacidade, limites), planos/acesso, o que fica fora do ranking e do "Uso do mês", e a lista "religar antes dos alunos" (tetos e preço).
- [ ] O arquivo de SQL para o dono passa a se chamar `~/Downloads/StaziaMed-Treino-em-Dupla-SQL-9750-a-9930.sql` (as migrações 9750, 9760, 9770, as das tarefas 14 e 18 e 9900, 9901, 9910, 9920, 9930, em ordem, cada uma com "-- Etapa N — <arquivo>"); `grep -c "^-- Etapa"` = o número de arquivos.

**PARE: confirmação do dono.** O módulo com os três caminhos está pronto para publicar (§13 da spec de 09/10: SQL da etapa → código → conferência com a conta da equipe; chave do sozinho e da IA começam **fechadas**).
