# Treinamento em Dupla (2ª Fase) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dois alunos se encontram pelo match, definem os papéis, conversam por chamada externa e fazem uma estação publicada do
Banco de estações com cronômetro do servidor, impressos liberados e PEP no estilo INEP; o avaliador confere e libera a nota e os
dois invertem os papéis — sem IA e sem dado inventado.

**Architecture:** Cinco migrações (6500 dados/RLS/acesso, 6600 leituras das telas, 6700 match, 6800 sala, 6900 resultado). O
aluno não grava em tabela nenhuma: toda escrita e toda leitura sensível passam por funções `app_dupla_*` (SECURITY DEFINER) que
conferem login, acesso (`dupla_allowed`) e papel; o conteúdo da estação só sai separado por papel. No app novo, tokens e
componentes entram no DS (`src/novo/ds`) e as telas em `src/novo/app/dupla/`, nas rotas `/novo/estacoes`, `/novo/dupla`,
`/novo/dupla/perfil` e `/novo/dupla/sala/:roomId`. O tempo real só avisa (Supabase: `postgres_changes` e Presença nos canais
privados `room:{id}` e `dupla:online`); sem ele (banco local) as telas consultam as mesmas funções de tempos em tempos. Uma rota
Express assina o link da imagem do impresso.

**Tech Stack:** Postgres/Supabase (PGlite nos testes e no banco local), Supabase Realtime (canais privados, políticas em
`realtime.messages`), Express + TypeScript, React 19 + DS `src/novo/ds`, Vitest + Testing Library (jsdom e node), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-treino-dupla-design.md` (manda em tudo). Requisitos do pacote:
`/Volumes/Samsung/STAZIAMED REVALIDA/handoff-treino-dupla/PROMPT_IA.md`. Levantamento com arquivo:linha:
`.superpowers/sdd/treino-dupla/levantamento.md`. Neste plano, **pacote** = `/Volumes/Samsung/STAZIAMED REVALIDA/handoff-treino-dupla`
e **protótipo** = `pacote/ui_kits/treino-dupla` (referências `Match.jsx:144` são desse diretório).

## Global Constraints
- **Sem IA:** nenhuma chamada a modelo; nada de nota ou feedback gerados; o módulo não importa `server/ai/*` nem o maestro.
- **Nada inventado:** nenhuma pessoa, número, média ou estação fictícia na tela; o que não existe fica "—", vazio ou com
  `TODO(dono): …`. Nunca entram `data.js`, `match-rules.js:8-16,57`, `App.jsx:41-42`, `SEED` de `Stations.jsx:5` nem "14 feitas ·
  PEP 7,8". As 10 estações do INEP 2020 do pacote só como dado de teste (`teste-inep2020-eNN`), nos testes e no banco local.
- **Pacote só como referência:** ler `.jsx`, `.css`, `.d.ts` e `.prompt.md` para copiar textos e medidas; nunca executar nada de lá
  (`node`, `import`, `vm`, abrir o `index.html`) nem copiar arquivos dele para o projeto.
- **Textos:** pt-BR exatamente como no protótipo (cada tarefa cita arquivo:linha); textos novos só os da §11 da spec e os de
  "Textos novos para aprovar". Números por uma função só, `formatDecimal(value, digits = 2)` de `src/novo/ds/format.js`
  ("7,25 / 10,00").
- **Visual:** fontes e cores do app (`--font-sans` Plus Jakarta Sans, `--font-mono` JetBrains Mono, `src/novo/ds/tokens/*`), modo
  noite `[data-theme="dark"]` que já existe e é salvo no perfil. Do pacote só as cores novas, com nomes novos, em
  `src/novo/ds/tokens/dupla.css`: `--area-{clinica,cirurgia,go,pediatria,preventiva}-{soft,ink}` (a base é a do app),
  `--role-candidate|actor` (+`-soft`/`-ink`), `--score-full|partial|none|pending`, `--inep-blue-{900,700,500,300,200,100,50}`,
  `--pep-sheet`, `--pep-sheet-text`. Nenhum token existente é redefinido; nenhuma cor hexadecimal em componente ou tela (só em
  `dupla.css`). Ícones só pelo `<Icon name>` do DS (Lucide estático); nada de `lucide-react`.
- **Acesso (§9):** `app_settings.treino_dupla = {"aberto": false, "planos": ["pro", "elite"]}`. Equipe (admin/editor) sempre entra;
  aluno só com a chave ligada e um plano marcado ativo (`pro`/`elite` com `active|past_due`; `trial` só `trialing` com
  `trial_ends_at > now()`). Regra única no banco, `dupla_allowed(uuid)`, usada por toda função `app_dupla_*`, pela Presença e pela
  rota dos impressos. Chave desligada = "2ª Fase · Em breve" como hoje. A tela nunca decide plano: lê `app_dupla_access()`.
- **Clique numa estação (dono, 09/10):** o Banco de estações abre o Praticar com a estação escolhida (`/novo/dupla?estacao=<id>`)
  e, deu match, a sala abre nela (Tarefas 7, 8, 11 e 13). Estações só do Banco que já existe (`checklist_stations` +
  `checklist_station_contents`, migração `…0400`), ampliado; nenhuma tabela paralela de estações.
- **RLS (PROMPT_IA.md):** RLS ligada em toda tabela e o aluno não grava direto em nenhuma; roteiro do ator, itens/pontos/critérios
  do PEP e impressos não liberados só para o avaliador da rodada; o candidato recebe só cenário, tarefas, duração e impressos
  liberados, sem a linha "Liberação: …"; marcações (`checklist_room_marks`) visíveis ao candidato só depois que a avaliação da
  rodada existe; perfil de estudo de outra pessoa só pelos campos do cartão e só com `radar_visible` (instituição só com
  `show_school`, estações e média só com `show_stats`); e-mail e telefone nunca.
- **Cronômetro:** sempre de `ends_at`/`paused_left_ms` gravados pelo servidor e corrigidos pela diferença de relógio medida com
  `server_now`; nunca contador local.
- **Tempo real só avisa:** o estado vem sempre das funções. Sem os métodos de assinatura (banco local) as telas consultam: sala
  2 s (vazio se o `rev` não mudou), estado completo da sala e sinal do parceiro 10 s, convites 5 s, baralho 20 s. No Supabase, além
  do Realtime, consulta de segurança a cada 30 s e ao voltar a aba ou a rede. Os canais usam o cliente que o app já cria
  (`createClient(url, anonKey)` em `src/novo/data/supabaseBackend.ts`, supabase-js 2.117.2), com um método opcional por canal no
  `Backend`, como o `subscribeStats`: `subscribeInvites` (canal `dupla:online`: Presença + convites) e `subscribeRoom` (canal
  `room:{id}`: Presença + mudanças da sala). O `joinPresence` da spec §6 é o `track()`/`untrack()` do canal devolvido: o
  realtime-js 2.117 devolve o mesmo canal para o mesmo tópico e só aceita `.on(...)` antes do `subscribe()`, então dois métodos no
  mesmo tópico quebrariam. Antes do `subscribe()`, `await client.realtime.setAuth()` sem argumento (usa o token da sessão).
- **Banco:** migrações `supabase/migrations/20261003006500_treino_dupla_dados.sql`, `…6600_treino_dupla_telas.sql`,
  `…6700_treino_dupla_match.sql`, `…6800_treino_dupla_sala.sql`, `…6900_treino_dupla_resultado.sql`, só na faixa 6500–6900 (5900,
  6000, 6100, 6200, 6300, 6400, 7000, 7100 e 7200+ são de outros ramos). Funções
  `security definer set search_path = ''` com mensagens em português terminando em ponto (para `messageOf`); `app_dupla_*` com
  `revoke execute … from public, anon`; apoios `dupla_*` com `revoke … from public, anon, authenticated`, menos
  `dupla_me_allowed()` e `dupla_room_member(text)` (usadas pelas políticas do Realtime). Função que grava, inclusive leitura que
  chama `dupla_sweep` (`app_dupla_room`, `app_dupla_deck`), fica `volatile` (o padrão), nunca `stable`. Migração commitada não
  muda depois (o banco local recria se mudar); correção vai na migração da etapa seguinte.
- **Funções e checagens compartilhadas:** ao refazer uma delas, partir da definição MAIS NOVA no `supabase/migrations` do main
  atualizado (`grep -n` antes de escrever). Hoje: `app_export_my_data` ← `…5300_termo_aceite.sql:318-357`; chaves de `app_settings` ←
  `app_settings_key_check` (checagem sem nome de `…1300_admin.sql:57`, `key in ('trial_days', 'announcement')`), refeita com a
  união de todas as chaves que existirem + `treino_dupla`. `ch_jobs_step_check` não é tocada (nenhuma tarefa precisa); se um dia
  for, escrever a união: lista da 5100 + `station_pages`, `station_segment`, `station_draft` + `question_generate`,
  `question_check`, `question_source` + `source_search`.
- **Fuso:** "hoje", mês e edições no fuso `America/Sao_Paulo`.
- **Testes, sempre pela fila da máquina** (regra de 09/10: no máximo 3 vitest/tsc/build juntos neste Mac; vale no lugar do
  `--maxWorkers=3` da spec §4). Nos comandos deste plano, **`FILA`** = `bash "/Volumes/Samsung/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/vaga-de-teste.sh"`,
  escrito por extenso (variável de shell não passa de um comando para outro). Por tarefa:
  `FILA npx vitest run <arquivos> --pool=threads --maxWorkers=1`. No fim de cada etapa, suíte completa
  `FILA npx vitest run --pool=threads --maxWorkers=1 --reporter=json --outputFile=<scratchpad>/vitest-etapa-N.json` e conferir que
  o número de arquivos no relatório é igual ao de `src/__tests__/**/*.test.{ts,tsx}`; os 6 testes do clone JCodesMore falham sem o
  disco PortableSSD (não é regressão). Depois, só se `pgrep -fl vitest` vier vazio (outros agentes testam ao mesmo tempo), apagar
  só as pastas de 21 caracteres do `$TMPDIR` que têm apenas `client/` e `ssr/`.
- **Typecheck:** `npm run lint` (= `tsc --noEmit`) acusa ~2.300 erros antigos fora do módulo e é pesado: rodar só no fim de cada
  etapa, pela fila, como `FILA npx tsc --noEmit 2>&1 | grep -E "^(src/novo|server/dupla|server/devDb|src/__tests__/(dupla|helpers/dupla|supabaseSchema|segundaFase))"`
  — Expected: nenhuma linha. Build também pela fila: `FILA npm run build:vercel`.
- **Commits:** mensagem em português sem acento; `git add <caminhos explícitos>`; `git commit -m "<mensagem>" -m "Co-Authored-By:
  Claude Opus 5.5 <noreply@anthropic.com>"`; nunca `git push`; nunca abrir `.env*`.
- **Servidor local seguro** (todo "como testar" e o ponta a ponta): o `.env` desta máquina tem as chaves do Supabase de PRODUÇÃO
  e `npm run dev` puro liga o app nelas. Na raiz do worktree, com as variáveis por extenso (nunca agrupadas numa variável só no
  zsh): `PORT=3000 NODE_ENV=development CONTENT_HUB_WORKER=0 VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_DB_URL= npx tsx server.ts`.
  Só usar depois de ver no log `[central] banco: desenvolvimento` e `[dev-db] Banco de desenvolvimento pronto`; sem isso, encerrar
  na hora. No banco local novo, a tela de entrada cria a conta master (equipe). Encerrar pelo PID
  (`lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill`) e conferir que nada segura a porta 24678.
- **Etapas:** cada etapa termina em **PARE: confirmação do dono**; nada da etapa seguinte começa antes. Publicar (SQL no Supabase,
  GitHub/Vercel) só com ordem do dono, etapa por etapa (§13).
- **Paralelismo:** tarefas marcadas "Paralela com" mexem em arquivos diferentes e podem rodar ao mesmo tempo (cada uma faz `git
  add` só dos próprios arquivos); "Depois de" espera as citadas.

## Review Focus
1. **Marcação no PEP e "Finalizar" logo em seguida** (menos de 300 ms, ou o celular troca de aba para a chamada) → a nota leva a
   última marcação: as marcações pendentes são enviadas antes de `finish`/`finalize` e ao esconder a página. Teste na Tarefa 17.
2. **Baralho atualizado (a cada 20 s) enquanto a pessoa lê ou arrasta** → o cartão de cima continua o mesmo (ninguém escolhe a
   pessoa errada); novos entram no fim. Teste na Tarefa 13.
3. **Quem fechou a aba no meio de uma sala e volta ao Praticar** → vê "Sala aberta com {nome}" com "Abrir sala agora" e "Sair da
   sala", e não um baralho em que nenhuma escolha dá match (e cada escolha ainda o esconde por 7 dias). Testes nas Tarefas 11 e 13.
4. **Parceiro some** (avaliador fecha o app na conferência; ninguém chega na conexão) → "Reconectando…" depois de 30 s e "Sair da
   sala" sempre à mão; ninguém fica preso em "Aguardando avaliação" ou "Sincronizando". Testes nas Tarefas 16 e 17.
5. **Avaliador recarrega a página na conferência** (ou o celular descarta a aba ao abrir o Meet) → feedback digitado e anotações
   continuam; somem só depois de finalizar. Teste na Tarefa 17.

## Decisões do plano onde a spec não fixou (o dono pode mudar)
- **Leituras da sala na 6600:** `app_dupla_room`, `app_dupla_marks` e `app_dupla_result` entram com as telas (etapa 3), para a
  sala de teste mostrar todas as fases; `app_dupla_room_content` e o acesso vão na 6500 (os testes da etapa 2 precisam);
  `app_dupla_leave` vai na 6700 ("Continuar buscando" da etapa 4 fecha a sala).
- **Sala ganha `finished_at`** (tempo usado sem pausas, congelado em "Finalizar estação"); quem encerrou vem de `updated_by`, que já
  existe.
- **Fechamento preguiçoso:** convite vencido (60 s) e 15 min sem sinal dos dois fecham a sala na próxima chamada de qualquer função
  do módulo (`dupla_sweep`), sem tarefa agendada.
- **Dois "Estudar junto" no mesmo instante:** a escolha trava o par (`pg_advisory_xact_lock`) e forma um match só.
- **Sala aberta esconde o baralho** do Praticar e mostra "Sala aberta com {nome}" (Review Focus 3).
- **Baralho mesclado:** a atualização não reordena os cartões já mostrados; novos entram no fim.
- **Rascunhos no aparelho do avaliador:** anotações e feedback por sala e rodada, apagados ao finalizar.
- **Folha do PEP clara nos dois temas** (`--pep-sheet` #FFFFFF, `--pep-sheet-text` #111111, como no protótipo), com as fontes do
  app (o protótipo usava Arial); o resto da sala segue o tema.
- **"Parcial" marcado com texto `--navy-950`** (branco sobre #D08C1A dá 2,8:1); texto sobre a cor base da área usa
  `--surface-card` (branco de dia, escuro à noite).
- **Componentes do app no lugar dos do pacote:** Button `soft`→`secondary`, `block`→`fullWidth`; IconButton `outline`→`secondary`;
  `TextField` no lugar de `Input`; Card sem `title` (cabeçalho montado na tela); Badge ganha os tons `candidate` e `actor`.
- **Números:** duas casas para nota e pontos ("PEP 7,80"); "Sua última nota" e % sem casa; "Média geral" com uma.
- **Ordem da prova:** edição mais recente primeiro, regular antes da reaplicação, depois o número; estações sem edição no fim, por
  nome.
- **Disponibilidade** no cartão e na prévia pela regra do cartão (`match-rules.js:48`: 5 dias ou mais = "Seg a Dom"), "Sem turno"
  sem turnos; dias, turnos e áreas gravados na ordem da semana/lista.
- **Prova do perfil:** três próximas edições (até junho começa no /1 do ano; depois, no /2); valor inicial = edição-alvo da Conta
  quando está entre elas, senão a primeira.
- **Sinal:** Praticar e Perfil (`livre`), Sala (`em_estacao`); a cada 45 s, ou 10 s na sala sem tempo real; "online" = sinal há
  menos de 2 min; parceiro presente na sala = Presença, ou sinal há menos de 30 s. Quem está no Perfil conta como online, então o
  Perfil também recebe o convite e mostra o "Deu match!" (Tarefa 13).
- **Sem o aviso "Tempo esgotado. Estação encerrada."** do protótipo (a estação segue até o avaliador finalizar): ficam o selo
  "Tempo esgotado" e o apito. Sai também "Voltar ao checklist" da conferência (a sala não volta à estação; edita-se na própria
  conferência).
- **Revisão da nota** só enquanto a sala está no resultado daquela rodada (antes de inverter os papéis).
- **Painel:** chave e planos já na etapa 3 (`app_admin_save_dupla`); "Uso do mês" na etapa 6.
- **Teste local:** rotas só do servidor de desenvolvimento (`/api/dev-db/dupla/preparar` e `/api/dev-db/dupla/sala-teste`) e
  `npm run dupla:sala-teste`; elas abrem a chave e dão Pro às contas de teste do banco local.
- **Dados de teste:** o conversor lê `stations-inep2020.js` como texto (AST do TypeScript), sem executar; seções, numeração e
  páginas do PEP do pacote não entram (o formato publicado não tem). `pressing_assets` aceito pela chave `<codigo>-p<ordem>` ou
  `p<ordem>` até a Montagem confirmar.
- **Aluno com a 2ª fase aberta:** o início da 2ª fase é o Banco de estações; Início, Teoria, Meus PEPs, Paciente simulado e
  Desempenho aparecem no menu com "Em breve" e sem clique; atalhos e menu do celular só com Estações e Praticar.

## Textos novos para aprovar (além dos da §11 da spec)
- Etapa 3: "Revalida {edição} (reaplicação) · INEP"; botão "Remover estação escolhida"; "Ninguém online quer o papel complementar
  ao seu. Tente "Qualquer papel"." (sai a menção à busca automática, escondida).
- Etapa 4: "Sala aberta com {nome}"; "Crie seu perfil de estudo antes de procurar uma dupla.".
- Etapa 5: diálogos "Sair da sala?" / "Encerrar treino?" com "O treino termina para os dois."; "Treino encerrado." (15 min sem
  sinal); mensagens do servidor citadas nas Tarefas 14 e 16 (ex.: "Link da chamada inválido.", "Os dois precisam estar prontos.",
  "Estação exclusiva dos planos Pro e Elite.").
- Etapa 6: campo "Motivo" do pedido de revisão.
- Etapa 7 (só leitor de tela): "Faltam 2 minutos.", "Faltam 30 segundos.", "Tempo esgotado.", "Impresso {n} liberado: {nome}.".

## Custos (spec §10, mantida sem mudança)
Sem IA (R$ 0) e chamada de vídeo externa (R$ 0). O resto cabe no Supabase Pro e no Vercel Pro que o app já paga; só custa a mais
quando a conta inteira (Arena, aulas, podcasts e este módulo) passa das cotas do mês:

| Item | Cota do mês | Acima da cota |
|---|---|---|
| Mensagens do Realtime | 5 milhões | US$ 2,50 por milhão (pacotes de 1 milhão) |
| Conexões simultâneas do Realtime | 500 | US$ 10 por 1.000 |
| Tráfego de saída do Supabase | 250 GB | US$ 0,09 por GB |
| Vercel (só a rota da imagem do impresso) | — | US$ 0,60 por milhão de chamadas; CPU US$ 0,128/h; memória US$ 0,0106 por GB-h |
| Gravações no banco | sem cobrança por unidade | máquina maior se o banco ficar ocupado no pico (preço no painel) |

Por sessão (2 alunos, 2 rodadas, ~45 min): ~380 mensagens com 30 alunos no Praticar no pico, ~1.740 com 200; ~9,3 MB de tráfego;
16 links de impresso. Mensagens/mês ≈ sessões × (132 + 8 × (1 + N)); tráfego/mês ≈ sessões × (impressos × 2 × rodadas × tamanho +
1,3 MB). Acima das cotas: ≈ R$ 0,01 a R$ 0,03 por sessão e ≈ R$ 0,04 a R$ 0,12 por aluno ativo por mês (US$ 1 = R$ 5,50). Exemplo
da spec: 1.000 alunos ativos (4.000 sessões) cabem nas cotas no cenário base; no alto, 7,0 milhões de mensagens = 2 pacotes ≈
R$ 27,50/mês. O "Uso do mês" (Tarefa 18) traz os números reais para refazer a conta; a Tarefa 20 leva este quadro para o mapa.

## Arquivos
| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261003006{5,6,7,8,9}00_treino_dupla_*.sql` | dados/RLS/acesso; leituras das telas; match; sala; resultado |
| `src/novo/ds/tokens/dupla.css`, `src/novo/ds/{format,areas}.js` | cores novas; formato de número e de tempo; áreas |
| `src/novo/ds/components/{feedback,osce}/*`, `surfaces/Accordion.*`, `forms/Textarea.*`, `core/Badge.*` | componentes |
| `src/novo/app/dupla/*` | telas, rótulos, cartão, perfil, conteúdo, relógio, tempo real, sons, vitrine |
| `src/novo/app/dupla/room/*` | sala (todas as fases) |
| `src/novo/app/{App,Shell,session}.jsx`, `admin/{common,AdminScreen,AdminDupla}.jsx`, `account/AccountScreen.jsx`, `novo.html` | rotas, acesso, painel, tema |
| `src/novo/data/{backend,supabaseBackend}.ts` | canais do Realtime |
| `server/dupla/{router,testStations}.ts`, `server/dupla/data/teste-inep2020.json`, `server.ts`, `server/devDb/{router,devDatabase}.ts` | imagem do impresso; dados de teste; rotas de teste local |
| `scripts/dupla/{converter-inep2020,sala-teste}.ts`, `scripts/e2e/dupla.mjs`, `scripts/supabase/seed-builder.ts` | ferramentas e trava da carga |
| `src/__tests__/dupla*.test.ts(x)`, `src/__tests__/helpers/duplaDb.ts`, `docs/architecture/TREINO_EM_DUPLA.md` | testes e mapa |

## Paralelismo
| Etapa | Juntas | Depois |
|---|---|---|
| 1 | Tarefas 1 e 2 | Tarefa 3 |
| 2 | Tarefas 4 e 5 | — |
| 3 | Tarefas 6, 7, 8 e 9 | Tarefa 10 |
| 4 | Tarefas 11 e 12 | Tarefa 13 |
| 5 | Tarefas 14 e 15 | Tarefa 16, depois 17 |
| 6 | Tarefa 18 | — |
| 7 | Tarefa 19 | Tarefa 20 |

---

## Etapa 1 — Cores, componentes e modo dia/noite

### Tarefa 1: Tokens novos, tema antes da primeira pintura, formato e rótulos
**Paralela com:** Tarefa 2.

**Files:**
- Create: `src/novo/ds/tokens/dupla.css`, `src/novo/ds/format.js`, `src/novo/ds/areas.js`, `src/novo/app/dupla/labels.js`
- Modify: `src/novo/ds/styles.css` (importar `./tokens/dupla.css` logo depois de `semantic.css`), `src/novo/ds/components/core/Badge.jsx` e `Badge.d.ts` (tons `candidate`, `actor`), `novo.html` (script no `<head>`), `src/novo/app/App.jsx:102-104` (o efeito do tema também grava `localStorage["smn-theme"]`, em try/catch)
- Test: `src/__tests__/duplaFundacao.test.ts` (`// @vitest-environment node`)

**Interfaces:**
- Produces:
  - `dupla.css`, valores por extenso (pacote `tokens/colors.css:18-32,53`):
    - dia `--area-clinica-soft:#E5ECFF; --area-clinica-ink:#1D3FA6; --area-cirurgia-soft:#FFEAD8; --area-cirurgia-ink:#9A4100; --area-go-soft:#FDE2EC; --area-go-ink:#99194A; --area-pediatria-soft:#DAF5E5; --area-pediatria-ink:#0B6B34; --area-preventiva-soft:#EEE6FF; --area-preventiva-ink:#5A2CC0`; noite, na mesma ordem: `#16223F/#A3BBFF, #36220F/#FFB57D, #371424/#FFA0C2, #112D1D/#86E3AB, #241A42/#C7AFFF`.
    - `--role-candidate:#2E68A6; --role-candidate-soft:#EEF4FA; --role-candidate-ink:#24558A; --role-actor:#9A5631; --role-actor-soft:#F9F1EB; --role-actor-ink:#7E4524`; noite `-soft/-ink`: `#122136/#8EB8E8`, `#2A1F18/#E6B08C`.
    - iguais nos dois temas: `--score-full:#2C7F49; --score-partial:#D08C1A; --score-none:#BD4332; --score-pending:#BCC5C4`; `--inep-blue-900:#1F3864; -700:#2F5496; -500:#4472C4; -300:#8EAADB; -200:#B4C7E7; -100:#D9E2F3; -50:#EEF3FA`; `--pep-sheet:#FFFFFF; --pep-sheet-text:#111111`.
  - `format.js`: `formatDecimal(value: number, digits = 2): string` (`Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })`); `formatDuration(ms: number): string` ("7 min 32 s"; "10 min" com 0 s; "45 s" abaixo de 1 min).
  - `areas.js`: `AREAS: Array<{ code: "CM"|"CR"|"GO"|"PED"|"MFC"; label: string; card: string; chip: string; token: "clinica"|"cirurgia"|"go"|"pediatria"|"preventiva" }>` — `label` = área do banco ("Clínica Médica", "Cirurgia Geral", "Ginecologia e Obstetrícia", "Pediatria", "Medicina de Família e Comunidade"), `card` = `StationCard.jsx:3` ("…", "Cirurgia", …, "Medicina de Família"), `chip` = `Profile.jsx:13` ("Clínica Médica", "Cirurgia", "GO", "Pediatria", "MFC"); `areaByCode(code)`, `areaByLabel(label)`, `areaVars(code): { base, soft, ink }` (ex.: `"var(--area-preventiva-soft)"`).
  - `labels.js` (reexporta `areas.js`): `ROLE_PREF_LABEL = { med: "Médico(a)", ator: "Ator / avaliador", any: "Qualquer papel" }`, `ROLE_PREF_SHORT = { med: "quer ser médico(a)", ator: "quer ser ator/avaliador", any: "topa qualquer papel" }`, `ROOM_ROLE_LABEL = { candidate: "Candidato", evaluator: "Ator/Avaliador" }`, `PACE_LABEL = { livre: "Treino livre", cronometrado: "Cronometrado", simulacao: "Simulação de prova" }`, `DAYS = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"]`, `SHIFTS = ["Manhã","Tarde","Noite"]`, `sourceLabel({ edition, reapplication, institution }): string | null`.
  - Badge `tone="candidate"` = `--role-candidate-soft`/`--role-candidate-ink`; `tone="actor"` = `--role-actor-soft`/`--role-actor-ink`.
  - `novo.html`: `<script>try{var t=localStorage.getItem("smn-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}</script>` antes de qualquer outro script.

- [ ] **Step 1: Write the failing tests**
```ts
it("dupla.css traz os valores do pacote por extenso, no dia e na noite, e não redefine token do app", …)
  // :root e [data-theme="dark"] com todos os valores acima; nenhum nome definido em tokens/{colors,semantic}.css reaparece; sem --blue-600
it("contraste AA (≥ 4,5) do texto novo nos dois temas", …)
  // -ink sobre -soft (5 áreas e 2 papéis, dia e noite); --inep-blue-700 e -500 sobre --pep-sheet;
  // #FFFFFF sobre --score-full, --score-none e --inep-blue-700; #08122B (--navy-950) sobre --score-partial
it("novo.html aplica o tema guardado antes do script do app", …) // o <script> com "smn-theme" vem antes de /src/novo/main.jsx
it("formatDecimal e formatDuration", …) // 7.25→"7,25"; 10→"10,00"; (61.4,1)→"61,4"; (72,0)→"72"; 452000→"7 min 32 s"; 600000→"10 min"; 45000→"45 s"
it("áreas, rótulos e origem", …)
  // areaByLabel("Cirurgia Geral") → { code:"CR", card:"Cirurgia", chip:"Cirurgia", token:"cirurgia" }; areaVars("MFC").soft === "var(--area-preventiva-soft)"
  // sourceLabel({edition:"2020",reapplication:false,institution:"INEP"}) === "Revalida 2020 · INEP"; {edition:"2022/1",reapplication:true,…} === "Revalida 2022/1 (reaplicação) · INEP"; institution null → null
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaFundacao.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL (arquivos não existem).
- [ ] **Step 3: Implement** os arquivos acima (contraste WCAG calculado no próprio teste).
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaFundacao.test.ts src/__tests__/segundaFaseEmBreve.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: tokens novos, tema antes da primeira pintura, formato de numero e rotulos".

### Tarefa 2: Componentes base — Dialog, Toast, Accordion, Textarea
**Paralela com:** Tarefa 1.

**Files:**
- Create: `src/novo/ds/components/feedback/{Dialog,Toast}.jsx` e `.d.ts`, `src/novo/ds/components/surfaces/Accordion.jsx` e `.d.ts`, `src/novo/ds/components/forms/Textarea.jsx` e `.d.ts`
- Modify: `src/novo/ds/index.js` (exporta `Dialog`, `Toast`, `useToast`, `Accordion`, `Textarea`), `src/novo/ds/components/components.css` (classes `sm-dialog*`, `sm-toast*`, `sm-acc*`, `sm-textarea*`, portadas de `.sz-dialog`, `.sz-toast`, `.sz-acc`, `.sz-textarea` do pacote `tokens/components.css` com tokens do app)
- Test: `src/__tests__/duplaComponentesBase.test.tsx`

**Interfaces:**
- Produces (props; comportamento do pacote `components/feedback/*.jsx`, `layout/Accordion.jsx`, `forms/Textarea.jsx`):
```ts
Dialog(p: { open?: boolean; title?: string; description?: string; children?: ReactNode; actions?: ReactNode; onClose?: () => void }): JSX.Element | null
// portal em document.body; caixa role="dialog" aria-modal="true" aria-labelledby; foco no 1º focável ao abrir; Tab preso dentro;
// Esc e clique no fundo chamam onClose; foco volta a quem abriu; @media (max-width:900px): painel de baixo (align-items:flex-end, raio só em cima, 12 px)
Toast(p: { tone?: "info"|"success"|"warning"|"danger"; title: string; message?: string; onClose?: () => void }): JSX.Element // role="status"; ícones de Toast.jsx:3
useToast(): [node: ReactNode, show: (title: string, tone?: "info"|"success"|"warning"|"danger") => void] // um por vez, some em 2600 ms (App.jsx:56); direita 24 px, 96 px do rodapé; ≤ 900 px: 12 px dos lados, 84 px do rodapé
Accordion(p: { title: ReactNode; icon?: string; meta?: ReactNode; open?: boolean; defaultOpen?: boolean; onToggle?: (open: boolean) => void; children?: ReactNode }): JSX.Element // <button aria-expanded aria-controls>
Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string; showCount?: boolean }): JSX.Element // "{n}/{maxLength}" em mono com showCount
```

- [ ] **Step 1: Write the failing tests**
```ts
it("Dialog: foco entra, Tab não sai, Esc e fundo chamam onClose e o foco volta ao botão que abriu", …)
it("Dialog no celular: regra de painel de baixo em components.css", …) // CSS lido do arquivo contém @media (max-width:900px) com .sm-dialog-overlay e flex-end
it("useToast: aviso role=status que some em 2600 ms", …) // vi.useFakeTimers
it("Accordion alterna aria-expanded e mostra o corpo", …)
it("Textarea mostra 12/160 e respeita maxLength", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaComponentesBase.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** os quatro componentes no padrão do DS (JSX + `.d.ts`, classes `sm-*`).
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaComponentesBase.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: dialogo, aviso, acordeao e caixa de texto no design system".

### Tarefa 3: Componentes da estação e vitrine
**Depois de:** Tarefas 1 e 2.

**Files:**
- Create: `src/novo/ds/components/osce/{Timer,PrintItem,PrintImage,StatTile,StationCard,MatchCard,PepTable}.jsx` (+ `.d.ts` cada), `osce/index.js`, `osce/osce.css`, `src/novo/app/dupla/Vitrine.jsx`
- Modify: `src/novo/ds/index.js` (`export * from "./components/osce/index.js";`), `src/novo/ds/styles.css` (importar `./components/osce/osce.css` depois de `components.css`), `src/novo/app/App.jsx` (rota só de desenvolvimento)
- Test: `src/__tests__/duplaComponentesEstacao.test.tsx`

**Interfaces:**
- Consumes: tokens, `formatDecimal`, `areaVars` (Tarefa 1); `Dialog` (Tarefa 2).
- Produces (visual do pacote `components/osce/*` e `Room.jsx`, com tokens do app):
```ts
Timer(p: { seconds: number; state?: "idle"|"running"|"paused"|"expired"; warnAt?: number /*120*/; dangerAt?: number /*30*/; size?: number /*26*/ }) // "mm:ss" para baixo; role="timer" aria-live="off"; data-tone warn ≤ 120 s, danger ≤ 30 s
PrintItem(p: { index: number; title: string; released?: boolean; canRelease?: boolean; onToggleRelease?: () => void; children?: ReactNode }) // "Impresso {index} · {title}"; "Liberar"/"Ocultar"; "Ver conteúdo" com aria-expanded
PrintImage(p: { src: string; alt: string }) // botão aria-label "Ampliar impresso" com "Ampliar"; tela cheia role="dialog" aria-modal; "Fechar"; Esc fecha; foco volta (Room.jsx:51-65)
StatTile(p: { label: string; value: ReactNode; hint?: string; icon?: string })
StationCard(p: { areaCode: "CM"|"CR"|"GO"|"PED"|"MFC"; number?: number|null; title: string; tags?: string[]; source?: string|null; myScorePct?: number|null; averagePct?: number|null; onClick?: () => void })
  // StationCard.jsx sem dificuldade; "Sua última nota" = formatDecimal(v,0)+"%" ou "—"; "Média geral" = formatDecimal(v,1)+"%" ou "—"; barra da última nota; check title "Já realizada"; número com texto var(--surface-card)
MatchCard(p: { person: MatchPerson; onSwipe?: (dir: "right"|"left") => void; command?: { dir: 1|-1; n: number } })
  // MatchPerson = { name: string; online?: boolean; compat?: number; meta?: string; bio?: string; facts?: {icon,label,value}[]; reasons?: {icon,text,strong?,weak?}[]; tags?: string[] }
  // limiar 110 px; rotação dx/22; saída 260 ms cubic-bezier(.2,.7,.2,1) e onSwipe 240 ms depois; volta 220 ms; transform direto no DOM; touch-action: pan-y;
  // selos ESTUDAR/PULAR com opacidade |dx|/110; "Por que vocês combinam"; pílulas "online" e "{n}% compatível" (MatchCard.jsx do pacote); tags em --violet-50/--violet-600
PepTable(p: { stationNumber?: number|null; area: string; items: PepItem[]; marks: Record<string, { grade: Grade|null; subitems: string[] }>; onMark?: (itemId: string, grade: Grade|null) => void; onToggleSubitem?: (itemId: string, subitemId: string) => void; maxScore?: number /*10*/ })
  // PepItem = { id: string; number: string; text: string; section?: string; tip?: string; criteria?: {label: string; text: string}[]; subitems?: {id: string; text: string}[]; levels: { incorrect: number; partial: number|null; correct: number } }
  // Grade = "correct"|"partial"|"incorrect". Room.jsx:1-50: "ESTAÇÃO {n}" | "PADRÃO ESPERADO DE PROCEDIMENTO" | "Área: {area}"; "{nota} / {max}" e "{feitos} de {N} avaliados";
  // "ITENS DE DESEMPENHO AVALIADOS", "DESEMPENHO OBSERVADO", "Inadequado", "Parcialmente adequado", "Adequado"; célula hachurada aria-hidden sem nível parcial;
  // marcado em --inep-blue-700 com texto --pep-sheet; folha --pep-sheet/--pep-sheet-text; linha TOTAL. Cada item: role="radiogroup" aria-label="Item {number}";
  // opções role="radio" aria-checked aria-label "{nível}, {pontos} ponto(s)"; tabindex móvel, ← → entre os níveis existentes, Espaço/Enter marca, marcar de novo limpa; sem onMark = só leitura
```
  - `Vitrine.jsx`: `export function Vitrine(): JSX.Element` (título "Vitrine do Treinamento em Dupla"; amostras das cores novas ao lado das do app; todos os componentes com dados rotulados "Exemplo").
  - `App.jsx`: `const Vitrine = import.meta.env.DEV ? React.lazy(() => import("./dupla/Vitrine.jsx")) : null;` e a rota `vitrine-dupla` só quando `import.meta.env.DEV` (tudo dentro da condição, para sair do build).

- [ ] **Step 1: Write the failing tests**
```ts
it("MatchCard: arrastar 120 px para a direita chama onSwipe('right'); 100 px volta sem chamar", …) // pointerDown/Move/Up + vi.advanceTimersByTime(240)
it("MatchCard: command {dir:-1} chama onSwipe('left')", …)
it("PepTable: soma os níveis, hachura o parcial que não existe, TOTAL e '1 de 3 avaliados'", …)
  // níveis 2,5/1,25/0 · 2,5/—/0 · 5/2,5/0; marca i1 parcial → "1,25 / 10,00"
it("PepTable: radiogroup navegável por ← → e Espaço; marcar de novo limpa; sem onMark não marca", …)
it("PrintImage: Ampliar abre, Esc fecha e o foco volta; PrintItem: Liberar/Ocultar e Ver conteúdo", …)
it("Timer: 02:05 sem tom; 120 s warn; 30 s danger; 0 expirado", …)
it("StationCard: '—' sem nota, '72%' e '61,4%', sem dificuldade", …)
it("osce.css e componentes osce sem cor hexadecimal", …) // lê os arquivos: nenhum /#[0-9a-f]{3,6}\b/i
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaComponentesEstacao.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** os componentes, a vitrine e a rota de desenvolvimento.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaComponentesEstacao.test.tsx src/__tests__/segundaFaseEmBreve.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS. Run `FILA npm run build:vercel && (grep -rl "Vitrine do Treinamento em Dupla" dist server-dist || echo limpo)` — Expected: build sem erro e `limpo`.
- [ ] **Step 5: Commit** "Treino em dupla: componentes da estacao e vitrine de desenvolvimento".

#### Fim da Etapa 1
- [ ] Typecheck filtrado e suíte completa (Global Constraints) — Expected: nenhuma linha; todos passam (fora JCodesMore sem o disco).
- [ ] Relatório ao dono: arquivos; como testar: servidor local seguro (Global Constraints), entrar com a conta da equipe e abrir `http://localhost:3000/novo/vitrine-dupla`, alternando dia/noite no botão do topo; TODO: nenhum.

**PARE: confirmação do dono.** O dono confirma as cores novas ao lado das do app (dia e noite) e os componentes.

---

## Etapa 2 — Banco de dados com RLS

### Tarefa 4: Migração 6500 — dados, RLS, acesso por plano, conteúdo por papel, Realtime e conta
**Paralela com:** Tarefa 5.

**Files:**
- Create: `supabase/migrations/20261003006500_treino_dupla_dados.sql`, `src/__tests__/helpers/duplaDb.ts`, `src/__tests__/duplaRealtimePoliticas.test.ts`
- Modify: `src/__tests__/supabaseSchema.test.ts` (o teste de conteúdo de :152-165 passa a esperar `[]` para os alunos; o bloco "sala em dupla (máquina de estados no banco)" de :180-287 é trocado pelos testes desta tarefa)

**Interfaces:**
- Produces:
  - `app_settings`: `drop constraint app_settings_key_check` e recriar com a união das chaves que existirem no main na hora + `treino_dupla` (hoje `('trial_days', 'announcement', 'treino_dupla')`; ver Global Constraints); linha `treino_dupla` = `{"aberto": false, "planos": ["pro", "elite"]}` (`on conflict do nothing`).
  - `dupla_allowed(p_user uuid) returns boolean` (stable; regra das Global Constraints, equipe por `user_is_staff`); `dupla_me_allowed() returns boolean`; `dupla_assert_access() returns uuid` (sem login `'Entre na sua conta.'` 28000; sem acesso `'Sem acesso ao Treinamento em Dupla.'` 42501); `app_dupla_access() returns jsonb` = `{ aberto, permitido, planos, equipe }`.
  - `dupla_station_meta(p_id text) returns jsonb` = `{ number: int|null, edition: "2024/1"|"2020"|null, reapplication: bool }` por `^(?:teste-)?inep-?(\d{4})(?:-([12]))?(r)?-e(\d{1,2})$`; `dupla_area_code(p_area text) returns text` (CM, CR, GO, PED, MFC).
  - Tabelas (§5; RLS ligada; só política de `select`; `study_profiles.user_id`, `study_swipes.from_user`/`to_user` e `study_matches.user_a`/`user_b` → `auth.users on delete cascade`):
    - `study_profiles`: `public_name` 3–40 após `btrim`; `school`, `city`, `goal` até 80; `bio not null default ''` até 160; `exam ~ '^\d{4}/[12]$'`; `areas <@ {CM,CR,GO,PED,MFC}`; `role_pref` med|ator|any (padrão any); `pace` livre|cronometrado|simulacao (padrão cronometrado); `days <@ {Seg…Dom}`; `shifts <@ {Manhã,Tarde,Noite}`; `radar_visible`, `show_school`, `show_stats` padrão true; `status` livre|em_estacao|fora (padrão fora); `last_seen_at`; `updated_at`. Lê só a própria linha.
    - `study_swipes` (pk `(from_user, to_user)`, `direction` right|left, `station_id` → estação `on delete set null`, `from_user <> to_user`): lê só as próprias.
    - `study_matches` (`id`, `user_a`, `user_b`, `station_id`, `room_id` → sala `on delete set null`, `created_at`): os dois leem.
    - `checklist_rooms`: saem `state`, o gatilho `checklist_rooms_guard`, `guard_checklist_room()`, "salas: membro cria" e "salas: membros atualizam"; entram as colunas da §5 e `finished_at` (`phase` das 7 fases, padrão `roles`; `round ≥ 1`; `candidate_id`/`evaluator_id` → auth.users `on delete set null`; `confirmed_ids`, `connected_ids`, `ready_ids uuid[] default '{}'`; `call_link` até 500 e `~ '^https://[^\s/.]+\.[^\s]+$'`; `duration_ms` 60000–3600000; `paused_total_ms default 0`; `released_pressings text[] default '{}'`; `closed_reason` saiu|convite_recusado|convite_expirado|sem_sinal; `match_id` → study_matches `on delete set null`). Salas antigas: `phase 'closed'`, `closed_reason 'sem_sinal'`. Ficam `member_ids`, `rev`, `updated_by`, o gatilho de carimbo e "salas: membros leem".
    - `study_invites`: saem "convites: enviar" e "convites: responder ou cancelar"; ficam "convites: envolvidos leem" e o gatilho `study_invites_guard` (ele só barra `authenticated`/`anon`; as funções `security definer` rodam como dono e passam).
    - `checklist_room_marks` (pk `(room_id, round, item_id)`; `room_id` `on delete cascade`; `evaluator_id` `on delete set null`; `grade` correct|partial|incorrect|null; `subitems_checked text[] default '{}'`; `updated_at`): lê `evaluator_id = auth.uid()` ou o `doctor_id` da sessão `(room_id, round)`.
    - `checklist_study_sessions`: `actor_id`/`doctor_id` sem `not null`, FKs `checklist_study_sessions_actor_id_fkey`/`checklist_study_sessions_doctor_id_fkey` recriadas `on delete set null`; colunas novas da §5 (`round integer not null default 1`, `feedback_*` até 1000, `review_reason` até 500); `unique (room_id, round)`.
    - `checklist_station_contents`: `drop policy "estações: conteúdo (aprovada e acesso Pro quando exigido)"` e cria "estações: conteúdo só da equipe" (`is_staff()`).
  - `app_dupla_room_content(p_room_id uuid) returns jsonb` → **RoomContent**:
```
{ role: "candidate"|"evaluator"|null,
  station: { id, name, area, area_code, number, duration_ms, version: string|null,
             doctor_scene?, doctor_tasks?,   // candidato e avaliador
             actor_script? },                // só avaliador
  pressing_count: int,
  pressings: [{ id, index /*1..*/, name, content, has_image }], // candidato: só liberados, sem linhas "Liberação: …"; avaliador: todos, texto inteiro
  checklist_items?: [{ id, order, content, tip, grades: {correct, partial, incorrect}, criteria: {correct, partial?, incorrect}, subitems: [{id, text}] }] } // só avaliador
```
    `role` = papel do chamador (`candidate_id`/`evaluator_id`) nas fases connecting…result; em `roles`/`closed` ou sem papel: `role null`, só `{id, name, area, area_code, number, duration_ms}` e `pressing_count`. `has_image` = `content -> 'pressing_assets'` tem `<id>` ou `p<ordem>` (`TODO(dono)`: confirmar a chave com a Montagem). Não membro: `'Sala não encontrada.'` (42501).
  - `dupla_room_member(p_topic text) returns boolean` (`room:<uuid>` de sala do chamador, com acesso; tópico inválido → false sem erro).
  - Realtime, só se `to_regclass('realtime.messages')` existir: políticas de `select` e de `insert` (só `extension = 'presence'`) para `realtime.topic() = 'dupla:online' and dupla_me_allowed()` e para `realtime.topic() like 'room:%' and dupla_room_member(realtime.topic())`.
  - `app_export_my_data()` continua `language sql stable` (invoker, `search_path = ''`): tudo de `…5300_termo_aceite.sql:318-357` mais `study_profile`, `study_swipes`, `study_matches`, `checklist_rooms`.
  - `src/__tests__/helpers/duplaDb.ts`:
```ts
export const U: Record<"ana"|"bruno"|"carla"|"diego"|"eva"|"fabio"|"gil"|"admin", string>; // uuids fixos
export type Phase = "roles"|"connecting"|"setup"|"running"|"review"|"result"|"closed";
export interface DuplaDb { db: PGlite; rpc<T = any>(uid: string|null, fn: string, args?: Record<string, unknown>): Promise<T>; asUser(uid: string, sql: string, params?: unknown[]): Promise<any[]>; sql<T = any>(q: string, p?: unknown[]): Promise<T[]> }
export async function openDuplaDb(opts?: { realtime?: boolean }): Promise<DuplaDb>; // bootstrap, (esquema realtime falso), todas as migrações, usuários de U (admin com papel admin)
// esquema realtime falso, criado ANTES das migrações e igual ao do Supabase no que as políticas usam: realtime.messages(topic text not null,
// extension text not null, payload jsonb, event text, private boolean, inserted_at timestamptz default now()) com RLS ligada e
// select/insert para authenticated; realtime.topic() = nullif(current_setting('realtime.topic', true), ''); o teste fixa o tópico com set_config
export async function setPlan(db: PGlite, uid: string, plan: "trial"|"pro"|"elite", status: string, trialEndsAt?: string): Promise<void>;
export async function setDupla(db: PGlite, value: { aberto: boolean; planos: string[] }): Promise<void>;
export const STATION: object; // id "teste-dupla-e01", aprovada; itens i1 (2,5/1,25/0), i2 (2,5/null/0), i3 (5/2,5/0, subitens s1,s2); impressos p1 ("Hb 9,0 g/dL\n\nLiberação: …") e p2 ("Radiografia de tórax.", com pressing_assets); actor_script com "Dados pessoais:" e "Só se perguntado:"; doctor_scene em blocos; doctor_tasks "1. …\n2. …"; version "1.0"
export async function addStation(db: PGlite, station?: object, extra?: { is_pro_only?: boolean; medical_review?: string }): Promise<void>;
export async function addProfile(db: PGlite, uid: string, p?: Record<string, unknown>): Promise<void>;
export async function makeRoom(db: PGlite, o: { members: [string, string]; phase: Phase; candidate?: string; evaluator?: string; station?: string|null; round?: number; extra?: Record<string, unknown> }): Promise<string>;
```
  - Permissões conforme as Global Constraints.

- [ ] **Step 1: Write the failing tests** (em `supabaseSchema.test.ts`, bloco "Supabase — Treinamento em Dupla (dados)", que abre o próprio banco com `openDuplaDb()` no seu `beforeAll`, e em `duplaRealtimePoliticas.test.ts` com `openDuplaDb({ realtime: true })`)
```ts
it("conteúdo das estações: só a equipe lê direto; aluno, mesmo Pro, não", …) // ana [], carla (pro) [], admin 3
it("acesso: chave desligada barra o aluno, mesmo Pro; a equipe entra", …) // app_dupla_access de ana {aberto:false, permitido:false}; admin {permitido:true, equipe:true}
it("acesso: chave ligada e padrão → Pro/Elite active ou past_due entram; teste grátis, canceled e expired não", …)
it("acesso: com o teste grátis marcado, só trialing dentro do prazo", …)
it("perfil de estudo: cada um lê só o seu e ninguém grava direto", …) // update da própria linha → affectedRows 0
it("candidato não recebe roteiro, PEP nem impresso não liberado; avaliador recebe tudo", …)
  // JSON do candidato sem "actor_script", "checklist_items", "Liberação:" nem "Radiografia"; com p1 liberado: 1 impresso { index: 1, content: "Hb 9,0 g/dL" }
  // avaliador: actor_script, 2 impressos (p1 com "Liberação:"), 3 itens com grades e criteria
it("na fase roles ninguém recebe conteúdo por papel; quem não é membro recebe 'Sala não encontrada.'", …)
it("marcações: ninguém grava direto; o avaliador lê; o candidato só depois da avaliação da rodada", …)
it("sala, convites, escolhas e matches: envolvidos leem; ninguém cria nem altera direto", …)
it("excluir a conta apaga perfil, escolhas e matches e deixa a avaliação para o parceiro, sem o vínculo", …) // sessão com doctor_id null; bruno ainda lê
it("exportação traz perfil de estudo, escolhas, matches e salas, com os direitos de quem chama", …) // prosecdef false; anon → null
it("funções: app_dupla_* fechadas para visitante; dupla_* fechadas para o navegador, menos dupla_me_allowed e dupla_room_member", …)
// duplaRealtimePoliticas.test.ts
it("room:{id}: membro com acesso lê e envia presença; quem não é membro não; tópico inválido não dá erro", …)
it("dupla:online: aluno com acesso lê e envia presença; sem plano não; equipe sim", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/supabaseSchema.test.ts src/__tests__/duplaRealtimePoliticas.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração e o apoio de testes.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/supabaseSchema.test.ts src/__tests__/duplaRealtimePoliticas.test.ts src/__tests__/supabaseAccountApi.test.ts src/__tests__/termoAceiteBanco.test.ts src/__tests__/supabaseAdminApi.test.ts src/__tests__/equipeAcessoCompleto.test.ts src/__tests__/supabaseSeed.test.ts --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 6500 com dados, RLS, acesso por plano e conteudo por papel".

### Tarefa 5: Estações de teste do INEP 2020 (só testes e banco local)
**Paralela com:** Tarefa 4.

**Files:**
- Create: `scripts/dupla/converter-inep2020.ts`, `server/dupla/data/teste-inep2020.json` (gerado e commitado), `server/dupla/testStations.ts`, `src/__tests__/duplaEstacoesTeste.test.ts`
- Modify: `scripts/supabase/seed-builder.ts` (chama `assertNoTestStations` em `buildSeedRows`), `server/devDb/devDatabase.ts:39-43` (a carga local acrescenta `buildDuplaTestStatements()`)

**Interfaces:**
- Produces:
  - `npx tsx scripts/dupla/converter-inep2020.ts "<pacote>/ui_kits/treino-dupla/stations-inep2020.js" server/dupla/data/teste-inep2020.json` — lê o arquivo como texto e o percorre com `ts.createSourceFile(…, ts.ScriptKind.JS)`, avaliando só literais, as chamadas `C(...)`/`R(...)` (`stations-inep2020.js:4-8`) e constantes de texto do próprio arquivo (`origin: ORIGIN`); propriedades que o JSON não usa (`origin`, `difficulty`, `short`) podem ser puladas; qualquer outra forma → erro com a posição; ignora `PAGES`, `PEP`, `SECTIONS`, `NUMS`.
  - JSON = `Station[]` no formato publicado: id `teste-inep2020-e{NN}`; `name` e `topic` = `name`; `area` = rótulo do banco pelo `code`; `institution` "INEP"; `year` "2020"; `goal` "Revalida"; `styles` = `tags`; `taxonomy_path` [área, nome]; `medical_review` "approved"; `is_pro_only` false; `max_score` 10; `duration_ms` 600000; `actor_script` ""; `doctor_scene` = `scenario`; `doctor_tasks` = "1. …\n2. …"; `pressings[k]` = `{ id: "teste-inep2020-e{NN}-p{k}", name: title, content: body, image_url: null }`; `checklist_items[k]` = `{ id: "…-i{k}", order: k, phase: "PEP", content: title, tip: hint ?? "", grades: { correct: max, partial: part ?? null, incorrect: 0 }, criteria: das linhas de rubric (Inadequado → incorrect, Parcialmente adequado → partial, Adequado → correct; "" sem rubric), subitems: items → { id: "…-i{k}-s{j}", text }, auto_grade_rule: null }`; `summary` []; `version` "teste".
  - `testStations.ts`: `loadDuplaTestStations(): Station[]` (`loadStations` do JSON) e `buildDuplaTestStatements(): string[]` (inserts em `checklist_stations` e `checklist_station_contents` com `on conflict do update`, via `sqlLiteral`).
  - `seed-builder.ts`: `export function assertNoTestStations(ids: string[]): void` → lança `"A carga do Supabase não aceita estações de teste (teste-…)."`.

- [ ] **Step 1: Write the failing tests**
```ts
it("10 estações válidas (soma 10,00 cada) com 8/28/11/13/14/9/14/18/13/11 itens = 139", …)
it("formato publicado: ids teste-inep2020-eNN, PEP com phase 'PEP', impressos sem imagem, sem roteiro do ator, aprovadas", …)
it("a carga do Supabase recusa o prefixo teste- e a carga real não tem nenhuma", …) // assertNoTestStations(["teste-inep2020-e01"]) lança; buildSeedRows().stations sem "teste-"
it("o banco local recebe as 10 estações de teste aprovadas, com conteúdo", …) // openDevDatabaseForTests numa pasta temporária
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaEstacoesTeste.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** o conversor, rode-o uma vez e gere o JSON; depois `testStations.ts` e as duas mudanças. Se alguma estação não validar (soma ≠ 10), pare e relate: não corrigir dado.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaEstacoesTeste.test.ts src/__tests__/supabaseSeed.test.ts src/__tests__/lessonsRoutes.test.ts --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: estacoes de teste do INEP 2020 so no banco local e nos testes".

#### Fim da Etapa 2
- [ ] Typecheck filtrado e suíte completa — Expected: nenhuma linha; todos passam.
- [ ] Relatório ao dono: tabelas reaproveitadas (`checklist_stations`, `study_invites`, `subscriptions`/`plans`/`profiles` só lidos), ampliadas (`app_settings`, `checklist_station_contents`, `checklist_rooms`, `checklist_study_sessions`) e novas (`study_profiles`, `study_swipes`, `study_matches`, `checklist_room_marks`) com quem vê o quê; como testar: `FILA npx vitest run src/__tests__/supabaseSchema.test.ts src/__tests__/duplaRealtimePoliticas.test.ts src/__tests__/duplaEstacoesTeste.test.ts --pool=threads --maxWorkers=1`; SQL da etapa (só com ordem): `supabase/migrations/20261003006500_treino_dupla_dados.sql`; TODO: chave de `pressing_assets` com a Montagem.

**PARE: confirmação do dono.** O dono confirma a lista de tabelas e quem vê o quê.

---

## Etapa 3 — Rotas e telas

### Tarefa 6: Migração 6600 — leituras das telas, perfil de estudo e chave no painel
**Paralela com:** Tarefas 7, 8 e 9.

**Files:**
- Create: `supabase/migrations/20261003006600_treino_dupla_telas.sql`, `src/__tests__/duplaTelasBanco.test.ts`
- Modify: `src/__tests__/helpers/duplaDb.ts` (`addSession(db, o: { room: string; round: number; doctor: string|null; actor: string|null; station: string; correctness: number; finishedAt?: string; usedMs?: number }): Promise<string>`)

**Interfaces:**
- Consumes: Tarefa 4.
- Produces:
  - `dupla_public_name(p_user uuid) returns text` (`public_name` ou `'Conta excluída'`).
  - `dupla_sweep(p_room_id uuid default null) returns void` — fecha (`phase 'closed'`, `call_link null`, `rev + 1`): convite `pending` vencido → convite `canceled`, sala `convite_expirado`; nenhum membro com `last_seen_at > now() − 15 min` e `updated_at < now() − 15 min` → `sem_sinal`. Com `p_room_id`, só essa sala.
  - `dupla_room_state(p_room public.checklist_rooms, p_uid uuid) returns jsonb` → **RoomState**:
```
{ id, rev, phase, round, server_now,
  station: null | { id, name, area, area_code, number, edition, reapplication, institution, duration_ms, is_pro_only },
  duration_ms,
  me:      { user_id, public_name, role: "candidate"|"evaluator"|null, confirmed, connected, ready },
  partner: { user_id|null, public_name /* ou "Conta excluída" */, role, confirmed, connected, ready, seen_ms_ago: int|null },
  match_note: string|null,  // rodada 1, sala do match, fase roles, assign sugeriu: "Definido pelo match: você {ROLE_SHORT meu} e {primeiro nome} {ROLE_SHORT dele}. Vocês ainda podem trocar." (Match.jsx:208)
  invite_pending: bool,
  call_link, started_at, ends_at, paused_left_ms, paused_at, finished_at,
  released_pressings: string[],
  closed_reason, closed_by: null | { user_id, public_name, me: bool } }
```
  - `app_dupla_room(p_room_id uuid, p_since_rev integer default null) returns jsonb` — `dupla_assert_access`, `dupla_sweep(p_room_id)`, membro (senão `'Sala não encontrada.'`); `null` se `p_since_rev = rev`; senão `RoomState`.
  - `app_dupla_marks(p_room_id uuid) returns jsonb` — avaliador da rodada atual: `[{ item_id, grade, subitems }]`; outro: `'Só o avaliador vê as marcações durante a rodada.'`.
  - `app_dupla_result(p_room_id uuid, p_round integer) returns jsonb` — só com a sessão `(room, round)` e para o `doctor_id` ou `actor_id` dela (senão `'Resultado ainda não liberado.'`) → **ResultData**:
```
{ round, viewer: "candidate"|"evaluator",
  station: { id, name, area, area_code, number, edition, reapplication, institution, duration_ms },
  score, max_score, pct /* round(score/max*100) */, previous_pct: int|null /* sessão anterior do mesmo candidato na mesma estação */,
  items: [{ id, order, content, max_points, grade: "correct"|"partial"|"incorrect"|null, points }],
  evaluator: { user_id|null, public_name }, candidate: { user_id|null, public_name },
  finished_at, used_ms, feedback: { pos, neg, gen },
  review: { requested_at, reason, revised_at, score_before_review } }
```
  - `app_dupla_stations() returns jsonb` — aprovadas (equipe: todas), na ordem da prova (decisão do plano): `[{ id, name, topic, area, area_code, number, edition, reapplication, institution, styles, duration_ms, is_pro_only, criteria_count, pressing_count, my_last_pct: int|null, average_pct: number|null /* 1 casa, só com 5+ */, evaluations: int }]`.
  - `app_dupla_profile() returns jsonb` = `{ profile: StudyProfile|null, defaults: { public_name: profiles.name|null, exam: profiles.target_edition|null }, stats: { done: int, avg: number|null } }` (`StudyProfile` = colunas de `study_profiles` sem `user_id`, `status`, `last_seen_at`; `stats` = sessões como candidato, média da nota 0–10).
  - `app_dupla_save_profile(p_profile jsonb) returns jsonb` — junta com o salvo (só as chaves enviadas mudam; a primeira vez parte dos padrões), valida, ordena dias/turnos/áreas e devolve o mesmo de `app_dupla_profile()`. Mensagens: `'Informe como você quer aparecer para os colegas.'` (Profile.jsx:10), `'Bio: máximo de 160 caracteres.'`, `'Área inválida.'`, `'Papel inválido.'`, `'Ritmo inválido.'`, `'Dia inválido.'`, `'Turno inválido.'`, `'Prova inválida.'`, `'Instituição, cidade e objetivo: até 80 caracteres.'`.
  - `app_admin_save_dupla(p_aberto boolean, p_planos text[]) returns jsonb` — `assert_admin`; planos ⊆ {trial, pro, elite} (`'Planos inválidos.'`); `admin_log('dupla.save', null, …)`; devolve `{ aberto, planos }`.

- [ ] **Step 1: Write the failing tests**
```ts
it("estações: aluno vê só aprovadas, na ordem da prova, com número e edição tirados do id", …)
  // inep-2024-1-e01, inep-2024-1-e02, inep-2022-1r-e10, inep-2020-e03, autoral → number [1,2,10,3,null], edition ["2024/1","2024/1","2022/1","2020",null]
it("estações: 'Sua última nota' é a última como candidato; 'Média geral' só com 5 avaliações", …) // 60 e depois 72,5 → 73; 2 sessões → null; 60/72,5/80/90/50 → 70,5; evaluations 5
it("perfil: valores iniciais do nome e da edição-alvo; salvar valida, ordena e só muda o que veio", …) // days ["Qua","Seg"] → ["Seg","Qua"]; só role_pref mantém o resto
it("perfil: estatística própria das sessões como candidato", …)
it("sala: estado de cada membro com papéis, nomes, prontidão e faixa do match; mesmo rev → null; não membro não vê", …)
it("sala: parceiro que excluiu a conta aparece como 'Conta excluída'", …)
it("sala: convite vencido e 15 min sem sinal fecham na próxima leitura e apagam o link", …)
it("marcações: só o avaliador da rodada", …)
it("resultado: só depois da avaliação; última vez, avaliador da rodada, tempo usado e 'Conta excluída'", …)
it("chave no painel: só administrador, planos válidos, e app_dupla_access reflete", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaTelasBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaTelasBanco.test.ts src/__tests__/supabaseSchema.test.ts --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 6600 com leituras das telas e chave no painel".

### Tarefa 7: Tela Banco de estações
**Paralela com:** Tarefas 6, 8 e 9.

**Files:**
- Create: `src/novo/app/dupla/StationsScreen.jsx`, `src/__tests__/duplaEstacoesTela.test.tsx`

**Interfaces:**
- Consumes: `app_dupla_stations()` (Tarefa 6); `StationCard` (Tarefa 3); `formatDecimal`, `AREAS`, `areaByCode`, `sourceLabel` (Tarefa 1); `useLoad`, `Loading`, `LoadError` (`admin/common.jsx`).
- Produces: `export function StationsScreen({ go }: { go: (route: string, query?: Record<string, string>) => void }): JSX.Element`.

Comportamento (`Stations.jsx:28-58`): frase de apoio (:31) na primeira linha (o título fica no cabeçalho do app); 5 blocos de área (:34-40) com contagem e filtro; busca fixa ao rolar (placeholder :43) em nome, tema e `styles`; "Ordenar": "Ordem da prova" (ordem do servidor) e "A–Z"; "Visualização": Grade/Lista (:45); abas "Todas" + 5 (:47-50); agrupamento por área com Todas + Ordem da prova (:27, :55-57); vazio (:52); linha da lista (:19-25) com "Última nota" e "Média geral", sem dificuldade. Sem "Simulado de prova" e sem "Dificuldade". Clique → `go("dupla", { estacao: id })`.

- [ ] **Step 1: Write the failing tests**
```ts
it("cartões com número, 'Revalida 2020 · INEP', 'Sua última nota' e 'Média geral' (— sem dado)", …)
it("bloco de área filtra; busca acha por tema e pílula; 'Limpar filtros' volta tudo", …)
it("A–Z, Grade/Lista e agrupamento por área na ordem da prova", …)
it("clique abre o Praticar com a estação", …) // go("dupla", { estacao: "inep-2020-e01" })
it("sem Simulado de prova, sem Dificuldade e sem número inventado", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaEstacoesTela.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a tela.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaEstacoesTela.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: tela Banco de estacoes com dados reais".

### Tarefa 8: Telas Meu perfil de estudo e Praticar (sem baralho)
**Paralela com:** Tarefas 6, 7 e 9.

**Files:**
- Create: `src/novo/app/dupla/{StudyProfileScreen,PracticeScreen}.jsx`, `src/novo/app/dupla/{card,profile}.js`, `src/__tests__/duplaPerfilTela.test.tsx`, `src/__tests__/duplaPraticarTela.test.tsx`

**Interfaces:**
- Consumes: `app_dupla_profile`, `app_dupla_save_profile`, `app_dupla_stations` (Tarefa 6); `MatchCard` (Tarefa 3); `Textarea`, `useToast` (Tarefa 2); rótulos e `formatDecimal` (Tarefa 1).
- Produces:
```js
// card.js
export function availabilityLabel(shifts: string[], days: string[]): string // (turnos.join(" e ") || "Sem turno") + (dias ? " · " + (dias.length >= 5 ? `${dias[0]} a ${dias.at(-1)}` : dias.join(", ")) : "")
export function statsLabel(stats: { done: number; avg: number|null } | null): string // null → "Oculto"; done 0 → "0 feitas"; senão "{done} feitas · PEP {formatDecimal(avg)}"
export function toCard(p: PublicCard): MatchPerson // meta = [school, city, exam && "Revalida " + exam].filter(Boolean).join(" · "); facts Objetivo (goal || "—"), Disponível, Papel (ROLE_PREF_LABEL), Estações (statsLabel) com os ícones de match-rules.js:50; tags = chip das áreas
// PublicCard = { public_name, school, city, exam, bio, goal, areas, role_pref, pace, days, shifts, stats, compat?, reasons?, online? }
// profile.js
export function nextEditions(today: Date): string[] // 09/10/2026 → ["2026/2","2027/1","2027/2"]; 15/03/2027 → ["2027/1","2027/2","2028/1"] (fuso America/Sao_Paulo)
export function profileDraft(data: AppDuplaProfile, today: Date): Draft // perfil salvo; senão public_name = defaults.public_name ?? "", exam = defaults.exam se estiver em nextEditions senão a primeira, role_pref "any", pace "cronometrado", switches true, listas vazias
export function draftErrors(d: Draft): { public_name?: string } // "Informe como você quer aparecer para os colegas." com btrim < 3
export function StudyProfileScreen({ go }): JSX.Element
export function PracticeScreen({ go }): JSX.Element // a Tarefa 13 acrescenta o baralho
```

Perfil (`Profile.jsx:23-70` com componentes do app; `Switch` recebe o evento): "Voltar para Praticar" → `go("dupla")`; "Descartar"/"Salvar perfil" só com alteração e sem erro; aviso "Perfil de estudo salvo"; avatar com "A foto usa suas iniciais." (sem "Envio de foto em breve."); "Prova que vou fazer" com `nextEditions(new Date())`; Bio com contador "{n}/160"; chips de área (marcado: fundo base da área e texto `--surface-card`; desmarcado: borda e texto `-ink`); papel, ritmo, dias, turnos e privacidade (:51-61); prévia `MatchCard` com `toCard({ ...draft, school: draft.show_school ? draft.school : null, stats: draft.show_stats ? data.stats : null })` (como o servidor mostra aos outros, `Profile.jsx:18`), "Alterações não salvas", e com o radar desligado só "Com o radar desligado, ninguém vê seu cartão.".

Praticar (etapa 3): primeira linha com a frase de `Match.jsx:141` e o botão "Meu perfil de estudo" (ícone `user-pen`) → `go("dupla-perfil")`; sem perfil: `EmptyState` (ícone `users`, "Encontrar dupla", "Os seus dados vêm do perfil de estudo.", botão "Meu perfil de estudo"); com perfil: painel "Encontrar dupla" (:151-155) com o seletor "Papel desejado" que grava `app_dupla_save_profile({ p_profile: { role_pref } })`; radar desligado: `Banner` de aviso "Com o radar desligado, ninguém vê seu cartão."; faixa de `?estacao=` ("Estação {n} · {nome}" + `IconButton` "Remover estação escolhida", sem faixa se o id não existir); vazio "Nenhum colega compatível agora" (com "Qualquer papel" só o título; senão também "Ninguém online quer o papel complementar ao seu. Tente "Qualquer papel"." e "Aceitar qualquer papel"); "Como a compatibilidade é calculada" (:170-180) com "0 compatíveis". Sem contadores, radar, convites, abas Online/Atores/Salas, WhatsApp e Convite rápido.

- [ ] **Step 1: Write the failing tests**
```ts
// duplaPerfilTela
it("primeira vez: nome e prova vêm da Conta; prova só entre as três próximas edições", …)
it("nome com menos de 3 letras mostra o erro e não salva; Salvar e Descartar só com alteração", …)
it("salvar manda p_profile e mostra 'Perfil de estudo salvo'", …)
it("prévia: meta, Disponível ('Noite · Seg, Qua'), Papel e Estações ('Oculto'; '3 feitas · PEP 7,80')", …)
it("prévia sem a instituição quando 'Mostrar instituição de formação' está desligado", …) // meta sem a escola; com o switch ligado, a escola volta
it("radar desligado: aviso sem a frase de convidar colegas; sem 'Envio de foto em breve.'", …)
// duplaPraticarTela
it("sem perfil: pede para criar e leva ao perfil", …)
it("seletor de papel grava role_pref", …)
it("faixa da estação escolhida; remover tira o parâmetro", …)
it("painel da compatibilidade com Papel 40%, Áreas em comum 25%, Disponibilidade 20%, Ritmo 10%, Prova 5% e os textos de Match.jsx:173-178", …)
it("nada do que ficou fora nem contador inventado", …) // sem "colegas online", "Convite rápido", "Busca automática", "WhatsApp", "Salas abertas"
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaPerfilTela.test.tsx src/__tests__/duplaPraticarTela.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** as duas telas e os módulos.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaPerfilTela.test.tsx src/__tests__/duplaPraticarTela.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: telas Meu perfil de estudo e Praticar".

### Tarefa 9: Sala — todas as fases desenhadas a partir da fase gravada
**Paralela com:** Tarefas 6, 7 e 8.

**Files:**
- Create: `src/novo/app/dupla/room/{RoomScreen,RolesPhase,ConnectingPhase,SetupPhase,RunningPhase,ReviewPhase,ResultPhase,ClosedPhase,StationPicker}.jsx`, `src/novo/app/dupla/room/useRoom.js`, `src/novo/app/dupla/content.js`, `src/__tests__/duplaSalaFases.test.tsx`, `src/__tests__/duplaConteudo.test.ts`

**Interfaces:**
- Consumes: `RoomState`, `ResultData`, marcações e estações (Tarefa 6); `RoomContent` (Tarefa 4); componentes (Tarefas 2 e 3); rótulos, `formatDecimal`, `formatDuration` (Tarefa 1).
- Produces:
```js
// content.js
export const ACTOR_LABELS = ["Dados pessoais","Motivo da consulta","História atual","Antecedentes","Hábitos","Respostas condicionais","Dúvidas do paciente","Só se perguntado","Orientação","Impressos a liberar"];
export function splitActorScript(text: string): Array<[label: string, value: string]> // "Rótulo: valor" no começo da linha com os rótulos acima; sem rótulo → [["", texto]]; vazio → []
export function splitBlocks(text: string): string[] // parágrafos separados por linha em branco
export function splitTasks(text: string): string[] // "1. …\n2. …" sem a numeração
export function toPepItems(items: RoomContent["checklist_items"]): PepItem[] // number = String(order); criteria na ordem Inadequado, Parcialmente adequado, Adequado (só com texto); levels de grades
// room/useRoom.js
export function useRoom(roomId: string): { room: RoomState|null; content: RoomContent|null; marks: Record<string,{grade: Grade|null; subitems: string[]}>; result: ResultData|null; error: Error|null; loading: boolean; reload(): void; actions: RoomActions }
/** RoomActions — nesta tarefa todas resolvem sem fazer nada; as Tarefas 16, 17 e 18 implementam:
 *  chooseRole(role: "candidate"|"evaluator"), drawRoles(), setStation(stationId), confirmRoles(), connected(), setLink(link), setReady(ready),
 *  setDuration(ms), start(), pause(), resume(), adjust(deltaMs: 60000|-60000), release(pressingId, released), mark(itemId, grade|null, subitems),
 *  finish(), finalize({ pos, neg, gen }), leave(), requestReview(reason), redoReview(), swap(), printUrl(pressingId): Promise<string|null> */
export function RoomScreen({ roomId, go }): JSX.Element // escolhe a fase; cada fase recebe ({ room, content, marks, result, actions, go, remainingMs })
```
  Leituras: `app_dupla_room(p_room_id, null)`; `app_dupla_room_content` fora de `closed`; `app_dupla_marks` para o avaliador em running/review; `app_dupla_result(room.id, room.round)` em result; `app_dupla_stations` só no StationPicker. Sem tempo real nesta etapa: `remainingMs = ends_at − server_now` (parado).

Fases (textos do protótipo):
- **roles** (`Setup.jsx:13-27`): "Dupla com {parceiro}"; "Estação {n} · {nome}. " + "Antes de conectar, definam quem será o candidato e quem será o ator/avaliador."; faixa `match_note`; "Aguardando {nome} entrar na sala" com `invite_pending`; "Papéis desta rodada" + "Sortear"; cartões Candidato/Ator/Avaliador (marcado = `me.role`); "{parceiro} será {papel}." só com papéis; sem estação "Escolher estação", com estação "Trocar estação" (StationPicker em `Dialog`: busca e lista "Estação {n} · {nome}" por área); "Confirmar papéis e conectar"; confirmado por mim: "Aguardando {nome} confirmar os papéis".
- **connecting** (`Loading.jsx`): anel com %, 5 etapas e subtítulos, "Preparando a sala…"/"Sala pronta", "Você e {primeiro nome}", botão ghost "Sair da sala" (nesta tarefa as etapas aparecem "a fazer"; a Tarefa 16 liga os eventos).
- **setup** (`Setup.jsx:28-88`): selo "Aguardando prontidão" só enquanto os dois não estão prontos; faixa dos papéis; link (:39-48); prontidão (:49-56); cronômetro do candidato só leitura e do avaliador com ajustes (:57-70); "Leitura prévia do avaliador" só para o avaliador (`splitBlocks(doctor_scene)`, `splitTasks`, `splitActorScript` ou o texto de :76, impressos como selos); rodapé (:80-87) com "Iniciar estação" ou "Só o avaliador inicia".
- **running** (`Room.jsx:71-135`): cabeçalho (sigla da área no quadro da cor da área, nome, "{área} · {sourceLabel}", avatares, selo do papel, situação, ±1 min só do avaliador, `Timer`, minimizar/esconder guardados em `localStorage` `sz-timer-min`/`sz-timer-hidden`); avaliador: acordeões "Cenário e tarefas", "Roteiro do ator" (aberto; vazio → texto de :99), "Impressos" ("{liberados}/{total}"), "Anotações" (Textarea "Observações privadas sobre o atendimento", dica "Anotações ficam só neste aparelho.") e `PepTable` com `toPepItems`; candidato: "Enunciado", "Nos {N} minutos de duração, execute:" (N da duração oficial), tarefas "01 …", "Impressos" com "{n} liberados" e "Aguardando liberação"; barra de baixo: "Abrir chamada externa", "Pausar"/"Retomar" e "Finalizar estação" só do avaliador, "Sair da sala". Sem "PEP oficial (INEP)" e sem "Sinalizar problema".
- **review**: avaliador `Result.jsx:15-61` sem "Voltar ao checklist" ("Parcial" marcado com texto `--navy-950`); candidato: "Aguardando avaliação" e "Sair da sala".
- **result** (`Result.jsx:85-139` com `ResultData`): "Resultado da rodada {round}", nota `formatDecimal(score)` e "/ " + `formatDecimal(max_score)`, "{pct}% de aproveitamento" e a comparação de :100 com `previous_pct`, legenda Adequado/Parcial/Inadequado/Não avaliado, "Avaliador" = `evaluator.public_name`, "Data" (dia, mês por extenso, ano), "Tempo da estação" = `formatDuration(used_ms)`; abas "Todos"/"Com perda de pontos"; feedback "Escrito por {avaliador}" e "Sem comentários."; "Encerrar treino", "Treinar novamente — Inverter papéis", "Solicitar revisão da nota" (só candidato).
- **closed**: `saiu` pelo parceiro → "Treino encerrado por {nome}."; `convite_recusado`/`convite_expirado` → "{nome} não entrou na sala."; `sem_sinal` → "Treino encerrado."; botão "Voltar para Praticar" → `go("dupla")`; encerrada por mim → `go("dupla")`.

- [ ] **Step 1: Write the failing tests**
```ts
// duplaConteudo
it("roteiro separado pelos rótulos da Montagem; blocos do cenário; tarefas sem numeração; itens do PEP para a tabela", …)
// duplaSalaFases (backend.rpc simulado por função; uma montagem por fase e papel)
it("papéis: nomes, faixa do match, 'Aguardando Bruno Lima entrar na sala', Escolher e Trocar estação", …)
it("conexão: 5 etapas com 'Sincronizando com Bruno Lima' e Sair da sala", …)
it("preparação: avaliador vê a leitura prévia e Iniciar desligado; candidato vê 'Só o avaliador inicia' e não vê roteiro", …)
it("estação: avaliador com PEP e impressos; candidato sem roteiro, sem PEP e com 'Aguardando liberação'", …)
it("conferência: avaliador com nota provisória e pendentes; candidato com 'Aguardando avaliação' e Sair da sala", …)
it("resultado: '3,75', '/ 10,00', '38% de aproveitamento', '+6 p.p. vs. última tentativa (32%)', avaliador e '7 min 32 s'", …)
it("sala encerrada: os três motivos", …)
it("montar de novo em cada fase desenha a mesma fase (o estado vem só do servidor)", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSalaFases.test.tsx src/__tests__/duplaConteudo.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a sala e `content.js`.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSalaFases.test.tsx src/__tests__/duplaConteudo.test.ts --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: sala com todas as fases desenhadas a partir da fase gravada".

### Tarefa 10: Rotas, acesso por plano, atalhos, painel e sala de teste local
**Depois de:** Tarefas 6, 7, 8 e 9.

**Files:**
- Create: `src/novo/app/dupla/DuplaGate.jsx`, `src/novo/app/admin/AdminDupla.jsx`, `scripts/dupla/sala-teste.ts`, `src/__tests__/duplaRotas.test.tsx`, `src/__tests__/duplaSalaTesteLocal.test.ts`
- Modify: `src/novo/app/App.jsx`, `src/novo/app/Shell.jsx`, `src/novo/app/session.jsx`, `src/novo/app/admin/common.jsx:9`, `src/novo/app/account/AccountScreen.jsx:196,409` (as duas chamadas de `isPhase2Locked` passam `useSession().dupla`), `src/novo/app/admin/AdminScreen.jsx` (aba Configurações mostra `AdminDupla`), `server/devDb/router.ts`, `package.json` (`"dupla:sala-teste": "tsx scripts/dupla/sala-teste.ts"`), `src/__tests__/segundaFaseEmBreve.test.tsx` (mocks das telas novas no lugar de `Phase2.Stations` e `Match.Pair`); se `adminAbasVisiveis`, `aiCentralScreen` ou `telaAceite` renderizarem a aba Configurações, acrescentar `vi.mock("../novo/app/admin/AdminDupla.jsx", () => ({ AdminDupla: () => null }))`

**Interfaces:**
- Consumes: `StationsScreen` (7), `StudyProfileScreen` e `PracticeScreen` (8), `RoomScreen` (9), `app_dupla_access` (4), `app_admin_settings` (existente) e `app_admin_save_dupla` (6), estações de teste (5).
- Produces:
  - `useSession().dupla: { aberto: boolean; permitido: boolean; planos: string[]; equipe: boolean } | null` — o `load` faz `Promise.all([backend.rpc("app_bootstrap"), Promise.resolve().then(() => backend.rpc("app_dupla_access")).catch(() => null)])` (bootstrap primeiro; o `then` protege dos testes que simulam `rpc` sem resposta, como `termoSessaoAceitar.test.tsx`) e guarda `dupla ?? null`; `refresh` não muda.
  - `isPhase2Locked(role, access?) => !isStaffRole(role) && access?.aberto !== true`.
  - `Root`: `/dupla/perfil` → `<Screen view="dupla-perfil" />` e `/dupla/sala/:roomId` → `<Screen view="dupla-sala" />`, antes de `/:route?`; `Screen({ view })` usa `route = view ?? params.route ?? defaultRoute`, e `ROUTES` ganha `dupla-sala` (`dupla-perfil` entra pelo `TITLES`), senão a tela volta ao início. `go("dupla-perfil")` → `/dupla/perfil`; `go("dupla-sala", { sala })` → `/dupla/sala/<sala>`; `go("dupla", { estacao })` → `/dupla?estacao=…`.
  - `TITLES`: `estacoes: ["Banco de estações", null]`, `dupla: ["Praticar em dupla", null]`, `"dupla-perfil": ["Meu perfil de estudo", null]`; `CONNECTED` e `PHASE2_ROUTES` ganham `dupla-perfil`, `dupla-sala` (e `CONNECTED` também `estacoes`, `dupla`); a sala com `bare` e sem Dock/MobileNav (`NO_DOCK = ["dupla-sala"]` no Shell).
  - Aluno com a 2ª fase aberta: `defaultRoute` e `setPhase(2)` vão para `estacoes`; `SOON = ["home2","teoria2","peps","paciente","desempenho2","estacao"]` redireciona para `/estacoes`; `AppShell` recebe `soon: string[]` e `studentPhase2: boolean` — o Rail mostra os itens de `soon` apagados, `aria-disabled`, sem clique e com "Em breve"; Dock da 2ª fase do aluno = `[["estacoes","play","Treinar estação"],["dupla","users","Praticar"]]`, da equipe o mesmo mais `["peps","list-checks","PEPs"]` e "Paciente simulado"; MobileNav da 2ª fase do aluno = Estações e Praticar.
  - `DuplaGate({ go, children })`: equipe ou `dupla?.permitido` → `children`; senão `LockedFeature` (title "Praticar em dupla", description "Encontre um colega com os mesmos objetivos e treine as estações da 2ª fase.", plan `PLAN_LABEL` do primeiro de pro/elite marcado, cta "Ver planos", `onUpgrade={() => go("planos")}`). Envolve `estacoes`, `dupla`, `dupla-perfil` e `dupla-sala`.
  - `AdminDupla()`: cartão "Treinamento em Dupla" com Switch "Abrir para os alunos", Checkbox "Teste grátis", "Pro", "Elite" e "Salvar configurações" → `app_admin_save_dupla({ p_aberto, p_planos })` → "Configurações salvas.".
  - Rotas de desenvolvimento (só em `createDevDbRouter`): `POST /dupla/preparar` `{ emails: string[] }` → plano `pro`/`active`, aceites vigentes (mesmo SQL de `src/__tests__/helpers/aceites.ts`), WhatsApp de teste quando vazio (`+5511999990001`, `+5511999990002`, …) e chave aberta → `{ ok: true }`; `POST /dupla/sala-teste` `{ fase }` → cria se faltar `candidato@dupla.local` e `avaliador@dupla.local` (senha `dupla-local-123`, conta e perfil de estudo com os nomes "Candidato de teste" e "Avaliador de teste"; sem perfil de estudo o sinal não grava e a sala fecharia em 15 min), prepara as duas e cria a sala na `teste-inep2020-e01` já na fase pedida (papéis, confirmações, prontidão, `started_at`/`ends_at`, `finished_at`, marcações e sessão conforme a fase) → `{ room_id, url: "/novo/dupla/sala/<id>", candidato: { email, senha }, avaliador: { email, senha } }`; fase inválida → 400 "Fase inválida.".
  - `scripts/dupla/sala-teste.ts`: `--fase <fase>` (padrão roles), `--preparar <email…>`, `--porta <n>` (padrão 3000); chama as rotas e imprime o link e as contas.

- [ ] **Step 1: Write the failing tests**
```ts
// duplaRotas
it("chave desligada: aluno com '2ª Fase · Em breve' e as rotas da 2ª fase levam ao início", …)
it("chave ligada sem plano: Estações, Praticar, Perfil e Sala mostram o convite do plano; 'Ver planos' leva à Conta", …)
it("chave ligada com plano: 2ª fase começa no Banco de estações; Início, Teoria, PEPs, Paciente e Desempenho 'Em breve' no menu; /home2 vai para /estacoes", …)
it("atalhos da 2ª fase: Treinar estação → /estacoes e Praticar → /dupla; aluno sem PEPs e sem Paciente simulado; equipe com os dois", …)
it("rotas /dupla/perfil e /dupla/sala/:id; sala sem barra de atalhos e sem cabeçalho; sem 'Tela em reconstrução'", …)
it("isPhase2Locked olha a chave", …) // ("student") true; ("student", {aberto:true}) false; ("editor") false
it("sessão lê app_dupla_access depois do app_bootstrap; falha vira null", …)
it("painel: Treinamento em Dupla salva a chave e os planos", …)
// duplaSalaTesteLocal (openDevDatabaseForTests + createDevDbRouter num express na porta 0)
it("preparar: Pro ativo, aceites, WhatsApp de teste e chave aberta", …)
it("sala de teste em cada fase, com as contas devolvidas; fase inválida → 400", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaRotas.test.tsx src/__tests__/duplaSalaTesteLocal.test.ts src/__tests__/segundaFaseEmBreve.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** rotas, sessão, Shell, portão, painel, rotas de desenvolvimento e o script.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaRotas.test.tsx src/__tests__/duplaSalaTesteLocal.test.ts src/__tests__/segundaFaseEmBreve.test.tsx src/__tests__/adminAbasVisiveis.test.tsx src/__tests__/aiCentralScreen.test.tsx src/__tests__/telaAceite.test.tsx src/__tests__/termoSessaoAceitar.test.tsx src/__tests__/contaTermo.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: rotas, acesso por plano, atalhos, painel e sala de teste local".

#### Fim da Etapa 3
- [ ] Typecheck filtrado e suíte completa — Expected: nenhuma linha; todos passam.
- [ ] Relatório ao dono: arquivos e migração 6600; como testar: servidor local seguro (Global Constraints) com a conta da equipe em `/novo/estacoes` (estações de teste, filtros, busca), `/novo/dupla/perfil` (salvar e recarregar), `/novo/dupla`; `npm run dupla:sala-teste -- --fase setup` e abrir o link em duas janelas (uma anônima) com as duas contas impressas, para cada fase; os botões da sala passam a agir na Etapa 5; textos novos da etapa; TODO: nenhum novo.

**PARE: confirmação do dono.** O dono confirma as telas fiéis ao protótipo, com fontes e cores do app, nos dois temas.

---

## Etapa 4 — Regras do match no servidor

### Tarefa 11: Migração 6700 — sinal, baralho, escolha, match, convite e saída da sala
**Paralela com:** Tarefa 12.

**Files:**
- Create: `supabase/migrations/20261003006700_treino_dupla_match.sql`, `src/__tests__/duplaMatchBanco.test.ts`
- Modify: `src/__tests__/helpers/duplaDb.ts` (`seen(db, uid, agoSeconds = 0, status = "livre")`)

**Interfaces:**
- Consumes: Tarefas 4 e 6 (`dupla_assert_access`, `dupla_sweep`, `dupla_room_state`, `dupla_public_name`); `tutor_is_pro(uuid)` (existente).
- Produces:
  - `app_dupla_heartbeat(p_status text, p_room_id uuid default null) returns jsonb` → `{ server_now }`; status livre|em_estacao|fora (`'Situação inválida.'`); sem perfil de estudo não grava; `em_estacao` só com sala aberta da pessoa (senão `livre`).
  - `dupla_compat(p_me public.study_profiles, p_other public.study_profiles) returns jsonb` → `{ ok, compat, kind, reasons: [{ icon, text, strong?, weak? }] }` — porte de `match-rules.js:17-41` em `numeric` (arredonda como `Math.round`, limita 40–99); razões com os textos de :33-39, primeiro nome do outro, rótulo `chip` das áreas e `PACE_LABEL`.
  - `dupla_assign(p_me text, p_other text) returns text` → `'candidato'|'ator'|null` (match-rules.js:42-46).
  - `app_dupla_deck() returns jsonb` → `{ cards: DeckCard[], hidden_by_role: int, online: int, matches_today: int, open_room: null | { id, phase, partner_name }, server_now }`; **DeckCard** = `PublicCard` (Tarefa 8) + `user_id`, `compat`, `reasons`. Sem perfil: `'Crie seu perfil de estudo antes de procurar uma dupla.'`. Começa com `dupla_sweep()`. Fora: eu; sem perfil ou sem acesso; radar desligado; sinal há 2 min ou mais, ou `fora`; em sala aberta; escolhido por mim (qualquer lado) há menos de 7 dias; mesmo papel específico (conta em `hidden_by_role`). Ordem: compat desc, sinal mais recente. `school` só com `show_school`; `stats` só com `show_stats`. `online` = com acesso, radar e sinal há menos de 2 min (sem mim); `matches_today` desde 0 h de Brasília.
  - `app_dupla_swipe(p_to uuid, p_direction text, p_station_id text default null) returns jsonb` → `{ matched: false }` ou `{ matched: true, room_id, partner: { user_id, public_name } }`. Antes de ler: `pg_advisory_xact_lock(hashtextextended('dupla-par:' || least(eu, p_to)::text || ':' || greatest(eu, p_to)::text, 0))`. Grava/regrava a escolha e meu sinal; match só com `right`, o outro com `right` para mim há menos de 7 dias, ele com sinal há menos de 2 min e ≠ `fora`, nenhum em sala aberta e os dois com acesso. Sala: `roles`, rodada 1, `member_ids [eu, outro]`, estação = a minha, senão a da escolha dele (aprovada e, se `is_pro_only`, os dois com `tutor_is_pro`), papéis por `dupla_assign(meu, dele)` ('candidato' → eu candidato; 'ator' → eu avaliador), `duration_ms` da estação; `study_matches (user_a = outro, user_b = eu)`; `study_invites (from eu, to outro, 60 s)`. Erros: `'Escolha inválida.'`, `'Colega não encontrado.'`, `'Estação não encontrada.'`.
  - `app_dupla_invites() returns jsonb` → `{ invites: [{ id, room_id, from: { user_id, public_name }, expires_at }], server_now }` (pendentes e no prazo, para mim).
  - `app_dupla_answer_invite(p_invite_id uuid, p_accept boolean) returns jsonb` → aceitar: `accepted`, sala `rev + 1`, `{ room_id }`; recusar: `declined`, sala `closed`/`convite_recusado`, `{ room_id: null }`; vencido: fecha (`convite_expirado`) e `'Convite expirado (60 s).'`; já respondido: `'Convite já respondido.'`.
  - `app_dupla_leave(p_room_id uuid) returns jsonb` → membro; `closed`/`saiu`, `call_link null`, convite pendente `canceled`, `rev + 1`; devolve `RoomState`.

- [ ] **Step 1: Write the failing tests** (perfis: Ana any {CM,CR; Seg Ter Qua Qui; Noite; cronometrado; 2026/2}, Bruno ator {CM,PED; Seg Qua Sex; Noite; cronometrado; 2026/2}, Carla med {CM,CR; Ter Qua Qui; Noite; cronometrado; 2026/2}, Diego any {GO,PED; Seg Ter Qua Qui; Noite; cronometrado; 2026/2}, Eva med {GO; Sáb; Manhã; simulacao; 2027/1}, Fábio med igual à Ana, Gil ator {sem áreas, dias e turnos; livre; 2027/1}; todos com acesso; sinal agora em Ana, Bruno, Carla, Diego e Eva; Fábio e Gil sem sinal, só olham o próprio baralho — por isso não aparecem nos baralhos abaixo)
```ts
it("compatibilidade como em match-rules.js, vista de quem olha", …)
  // Ana: Carla 92, Bruno 78, Diego 63, Eva 41 (nessa ordem), hidden_by_role 0; Fábio: Ana 94, Bruno 84, Diego 69, hidden_by_role 2; Gil→Carla 63; Bruno→Ana 79
it("razões com os textos do protótipo", …)
  // Ana→Bruno ["Bruno quer ser ator/avaliador; você topa qualquer papel" (strong), "Clínica Médica em comum", "Noite · 2 dias em comum", "Cronometrado"]
  // Fábio→Bruno "Papéis complementares: você médico(a), Bruno ator/avaliador"; Ana→Diego "Os dois topam qualquer papel" e "Noite · 4 dias em comum"; Ana→Eva "Prova diferente (2027/1)" (weak)
it("quem fica fora do baralho e quando volta", …) // radar, sinal de 3 min, 'fora', sala aberta, sem acesso, escolhido há 6 dias (fora) e há 8 (volta)
it("cartão só com campos públicos: instituição com show_school; estatística com show_stats; nunca e-mail ou telefone", …)
it("matches hoje desde 0 h de Brasília", …)
it("Estudar junto sem reciprocidade grava e não dá match; recíproco com os dois online forma sala, match e convite", …)
it("estação da sala: a de quem completou, senão a do outro; Pro-only com alguém sem Pro fica sem estação", …)
it("papéis sugeridos por assign; os dois 'qualquer' ficam sem sugestão", …)
it("sem match: recíproco de 8 dias, outro sem sinal, outro em sala aberta", …)
it("dois 'Estudar junto' juntos dão um match e uma sala só; a função trava o par", …) // Promise.all; count(study_matches)=1; pg_proc.prosrc contém 'pg_advisory_xact_lock'
it("convite: aceitar libera a sala; recusar fecha; vencido fecha e avisa; resposta repetida recusa", …)
it("sair fecha para os dois, apaga o link e cancela o convite; até lá o baralho mostra a sala aberta", …) // open_room {id, phase:'roles', partner_name}
it("sinal grava hora e situação; situação inválida recusa", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaMatchBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaMatchBanco.test.ts src/__tests__/duplaTelasBanco.test.ts --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 6700 com sinal, baralho, escolha, match e convite".

### Tarefa 12: Tempo real do Praticar — canal dupla:online, convites e sinal
**Paralela com:** Tarefa 11.

**Files:**
- Modify: `src/novo/data/backend.ts`, `src/novo/data/supabaseBackend.ts`
- Create: `src/novo/app/dupla/live.js`, `src/__tests__/duplaTempoReal.test.tsx`

**Interfaces:**
- Consumes: nomes `app_dupla_heartbeat` e `app_dupla_invites` (Tarefa 11).
- Produces:
```ts
// backend.ts
export interface PresenceMember { user_id: string; status?: "livre" | "em_estacao" }
export type RealtimeStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";
export interface RealtimeHandle { track(payload: Record<string, unknown>): void; untrack(): void; close(): void }
// em Backend (opcional, como subscribeStats; só o supabaseBackend implementa):
readonly subscribeInvites?: (userId: string, h: { onInvite(): void; onPresence(members: PresenceMember[]): void; onStatus?(s: RealtimeStatus): void }) => RealtimeHandle;
// nome da spec §6; o joinPresence da spec = track()/untrack() deste canal (Global Constraints: um método por canal)
// supabaseBackend: client.channel("dupla:online", { config: { private: true, presence: { key: userId } } }),
//   presença "sync" → members de presenceState(); postgres_changes INSERT em study_invites com filter `to_user=eq.${userId}` → onInvite;
//   subscribe(onStatus) depois de `await client.realtime.setAuth()` (sem argumento); close → removeChannel
```
```js
// live.js
export function useHeartbeat(status: "livre"|"em_estacao", roomId?: string|null, intervalMs = 45000): void // na montagem, a cada intervalMs e ao voltar a aba; "fora" ao desmontar e em pagehide
export function useDuplaChannel({ radar }: { radar: boolean }): { onlineIds: Set<string>|null; inviteTick: number; live: boolean } // com radar: track { user_id, status: "livre" }; sem: untrack; sem subscribeInvites: { null, 0, false }
export function useInvites(inviteTick: number, live: boolean): { invites: Invite[]; serverNow: string|null; refresh(): Promise<void> } // local 5 s; ao vivo: no aviso, a cada 30 s, ao voltar a aba e a rede
```

- [ ] **Step 1: Write the failing tests**
```ts
it("subscribeInvites: canal privado dupla:online com presença por usuário e convites filtrados por to_user; close remove o canal", …) // vi.mock("@supabase/supabase-js")
it("useHeartbeat: sinal na entrada, a cada 45 s, ao voltar a aba e 'fora' ao sair", …) // vi.useFakeTimers
it("useDuplaChannel: track com radar, untrack sem radar; onlineIds sem mim", …)
it("useInvites: banco local a cada 5 s; com tempo real no aviso e a cada 30 s", …)
it("canal com erro volta à consulta periódica", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaTempoReal.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** os tipos, o método do Supabase e os hooks.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaTempoReal.test.tsx src/__tests__/playScreens.test.tsx src/__tests__/novoLocalBackend.test.ts --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: tempo real do Praticar com reserva por consulta".

### Tarefa 13: Baralho, "Deu match!" e sons
**Depois de:** Tarefas 11 e 12.

**Files:**
- Modify: `src/novo/app/dupla/PracticeScreen.jsx`, `src/novo/app/dupla/StudyProfileScreen.jsx` (sinal, Presença e convite também no Perfil)
- Create: `src/novo/app/dupla/{MatchModal.jsx,sound.js,deck.js}`, `src/__tests__/duplaMatchTela.test.tsx`, `src/__tests__/duplaSom.test.ts`

**Interfaces:**
- Consumes: Tarefa 11 (`app_dupla_deck`, `app_dupla_swipe`, `app_dupla_invites`, `app_dupla_answer_invite`, `app_dupla_leave`), Tarefa 12 (hooks), `toCard` (Tarefa 8), `MatchCard` (3), `Dialog`, `useToast` (2).
- Produces:
```js
// sound.js — mesmos números de App.jsx:1-32 e Match.jsx:30-88 do protótipo
export function installAudioWake(): void // uma vez; pointerdown/keydown/touchstart com capture e passive
export function soundOn(): boolean; export function setSoundOn(on: boolean): void // localStorage "sz-sound" ("off" desliga)
export function playWhistle(): void; export function playMatchSound(): void; export function playSkipSound(): void
// deck.js
export function mergeDeck(current: DeckCard[], incoming: DeckCard[]): DeckCard[] // mantém a ordem dos que continuam; o de cima fica até ser escolhido; quem saiu some; novos no fim
// MatchModal.jsx — Match.jsx:89-118 sem "Agendar sessão" e "Enviar mensagem"; Dialog; playMatchSound na montagem; botão "Desativar som"/"Ativar som"
export function MatchModal({ meName, partnerName, busy, onOpen, onClose }): JSX.Element
// MatchModal.jsx — convite de quem deu o primeiro "Estudar junto", o mesmo no Praticar e no Perfil
export function InviteWatcher(p: { go: (route: string, query?: Record<string, string>) => void; meName: string; inviteTick: number; live: boolean }): JSX.Element|null
// useInvites(inviteTick, live); o convite mais novo no prazo abre o MatchModal; "Abrir sala agora" → app_dupla_answer_invite(true) e go("dupla-sala", { sala }); "Continuar buscando"/Esc → (false)
```

Perfil (o Perfil conta como online, Decisões): `installAudioWake()`, `useHeartbeat("livre")`, `useDuplaChannel({ radar })` com o `radar_visible` do perfil salvo (não o do rascunho) e `<InviteWatcher meName={public_name salvo}>`; sem perfil salvo, nada disso (o sinal não grava sem perfil).

Praticar: `installAudioWake()`; `useHeartbeat("livre")`, `useDuplaChannel({ radar })`, `<InviteWatcher>`; baralho por `app_dupla_deck` (local 20 s; ao vivo 30 s e ao voltar a aba) com `mergeDeck`; cabeçalho "{n} colegas online" (Presença ou `online`) e "{n} match(es) hoje" (Match.jsx:144-145); `SwipeHint` (:21-29, "Fechar dica"); pilha (:157-164) com "Próximo: {primeiro nome}"; "Pular" (←) e "Estudar junto" (→) (:166, :168); teclas ← → fora de campo de texto e sem diálogo aberto; pular toca `playSkipSound()`; resumo "{n} compatíveis · {k} ocultos pelo papel" (:171); escolha → `app_dupla_swipe({ p_to, p_direction, p_station_id })` (erro: cartão volta e aviso com `messageOf`); quem completou → `MatchModal`: "Abrir sala agora" → `go("dupla-sala", { sala })`, "Continuar buscando"/Esc → `app_dupla_leave`; convite (quem escolheu primeiro) → `InviteWatcher`; `open_room` → `Banner` "Sala aberta com {nome}" com "Abrir sala agora" e "Sair da sala", sem baralho.

- [ ] **Step 1: Write the failing tests**
```ts
// duplaMatchTela
it("cabeçalho com colegas online e matches de hoje; pilha com 'Próximo: Bruno'", …)
it("← pula com o som de pular e → estuda; teclas ignoradas em campo de texto", …)
it("quem completa: 'Deu match!' com o texto do protótipo; Abrir sala agora vai à sala; Continuar buscando sai da sala", …)
it("quem escolheu primeiro: convite abre o modal; aceitar abre a sala; recusar responde false", …)
it("no Meu perfil de estudo: sinal 'livre' na entrada e 'fora' ao sair; o convite abre o mesmo 'Deu match!' e aceitar abre a sala", …)
it("baralho atualizado não troca o cartão de cima; novos entram no fim", …) // Review Focus 2
it("sala aberta: 'Sala aberta com Bruno Lima' sem baralho; Sair da sala volta ao baralho", …) // Review Focus 3
it("som desligado em sz-sound não toca; o botão do modal alterna", …)
it("sem Convite rápido, Agendar sessão e Enviar mensagem", …)
// duplaSom
it("playWhistle: 1.400 Hz por 2 s com vibração de 800 ms; respeita sz-sound", …) // AudioContext simulado
it("installAudioWake instala uma vez só", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaMatchTela.test.tsx src/__tests__/duplaSom.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** o baralho, o modal e os sons.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaMatchTela.test.tsx src/__tests__/duplaSom.test.ts src/__tests__/duplaPraticarTela.test.tsx src/__tests__/duplaPerfilTela.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: baralho, Deu match e sons".

#### Fim da Etapa 4
- [ ] Typecheck filtrado e suíte completa — Expected: nenhuma linha; todos passam.
- [ ] Relatório ao dono: arquivos e migração 6700; como testar: servidor local seguro (Global Constraints), criar duas contas no app, `npm run dupla:sala-teste -- --preparar <email1> <email2>`, abrir uma em janela comum e outra em janela anônima, criar os perfis, deslizar "Estudar junto" nas duas e ver "Deu match!" e as duas na mesma sala; textos novos da etapa.

**PARE: confirmação do dono.** O dono confirma quem aparece, a ordem, as razões e a porcentagem.

---

## Etapa 5 — Sala em tempo real

### Tarefa 14: Migração 6800 — ações da sala, cronômetro, marcações, finalização e rota da imagem do impresso
**Paralela com:** Tarefa 15.

**Files:**
- Create: `supabase/migrations/20261003006800_treino_dupla_sala.sql`, `server/dupla/router.ts`, `src/__tests__/duplaSalaBanco.test.ts`, `src/__tests__/duplaImpressoRota.test.ts`
- Modify: `server.ts` (montar logo depois de `/api/lessons`), `src/__tests__/helpers/duplaDb.ts` (`stationAssets(db, rows: { id: string; storage_path: string }[])`: sem a tabela no main (hoje a `station_assets` é da migração 6000 da Montagem, ainda em outro ramo), cria `public.station_assets(id uuid primary key, storage_path text not null)` de teste; com ela já no main, grava na tabela real preenchendo as colunas obrigatórias que a 6000 exigir)

**Interfaces:**
- Consumes: Tarefas 4, 6 e 11.
- Produces — todas `returns jsonb` com o `RoomState` depois de `rev + 1`; antes de agir: `dupla_assert_access`, `dupla_sweep(p_room_id)`, `select … for update` e membro (`'Sala não encontrada.'`); fase errada `'Esta ação não vale nesta fase da sala.'`; avaliador exigido `'Só o avaliador pode fazer isso.'`:
  - `app_dupla_set_roles(p_room_id uuid, p_candidate_id uuid)` — roles; qualquer membro; o outro vira avaliador; zera `confirmed_ids`.
  - `app_dupla_draw_roles(p_room_id uuid)` — roles; sorteio no servidor; zera confirmações.
  - `app_dupla_set_station(p_room_id uuid, p_station_id text)` — roles; aprovada; Pro-only só com os dois `tutor_is_pro` (`'Estação exclusiva dos planos Pro e Elite.'`); `duration_ms` da estação; zera confirmações.
  - `app_dupla_confirm_roles(p_room_id uuid)` — roles; sem estação `'Escolha a estação antes de confirmar.'`; sem papéis `'Definam os papéis antes de confirmar.'`; os dois → `connecting`.
  - `app_dupla_connected(p_room_id uuid)` — connecting; os dois → `setup`.
  - `app_dupla_set_link(p_room_id uuid, p_link text)` — fase ≠ closed; regex da 6500 e até 500, senão `'Link da chamada inválido.'`.
  - `app_dupla_ready(p_room_id uuid, p_ready boolean)` — setup.
  - `app_dupla_set_duration(p_room_id uuid, p_duration_ms integer)` — setup; avaliador; 60000 ≤ d ≤ duração da estação (`'Duração fora do permitido.'`).
  - `app_dupla_start(p_room_id uuid)` — setup; avaliador; os dois prontos (`'Os dois precisam estar prontos.'`); `running`, `started_at = now()`, `ends_at = now() + duration_ms`, pausas zeradas.
  - `app_dupla_pause(p_room_id uuid)` / `app_dupla_resume(p_room_id uuid)` — running; avaliador; pausar: `paused_left_ms = greatest(0, ends_at − now())`, `paused_at = now()`, `ends_at = null`; retomar: `ends_at = now() + paused_left_ms`, `paused_total_ms += now() − paused_at`.
  - `app_dupla_adjust(p_room_id uuid, p_delta_ms integer)` — running; avaliador; só ±60000 (`'Ajuste inválido.'`); correndo `ends_at = greatest(now() + 30 s, ends_at + delta)`; pausada `paused_left_ms = greatest(30000, paused_left_ms + delta)`.
  - `app_dupla_release(p_room_id uuid, p_pressing_id text, p_released boolean)` — running; avaliador; impresso da estação (`'Impresso não encontrado.'`).
  - `app_dupla_mark(p_room_id uuid, p_item_id text, p_grade text, p_subitems text[] default '{}')` → `{ ok: true }`, sem mexer no `rev` — running|review; avaliador; item da estação (`'Item do checklist não encontrado.'`); nível existente (`'Nível inválido para este item.'`); `null` = pendente; upsert com `evaluator_id`.
  - `app_dupla_finish(p_room_id uuid)` — running; avaliador; `review`, `finished_at = now()` (pausada: soma a pausa em curso a `paused_total_ms`).
  - `app_dupla_finalize(p_room_id uuid, p_feedback jsonb)` — review; avaliador; `pos`/`neg`/`gen` aparados, até 1000 (`'Feedback: máximo de 1000 caracteres em cada campo.'`); nota = Σ pontos do nível marcado dos itens atuais (pendente 0; marcação de item que sumiu não conta); `max_score` = Σ `correct`; `correctness = round(score/max*100, 1)`; sessão: id `gen_random_uuid()::text`, `round`, `actor_id` avaliador, `doctor_id` candidato, `started_at`, `finished_at` da sala, `pressings_released` (ids), `checklist_answers` `[{ id, grade: "Correct"|"Partial"|"Incorrect", subitems }]` dos marcados, `used_ms = finished_at − started_at − paused_total_ms`, `station_version = content ->> 'version'`, feedback. Sessão da rodada já existente: em `result` só devolve o estado (clique duplo); em `review` (revisão) atualiza nota e feedback com `score_before_review = coalesce(score_before_review, nota antiga)` e `revised_at = now()`. Vai a `result`.
  - `app_dupla_print_path(p_room_id uuid, p_pressing_id text) returns text` — candidato: liberado e fase running (`'Impresso não liberado.'`); avaliador: setup|running|review; `storage_path` de `public.station_assets` pelo id em `pressing_assets` (chave `<id>` ou `p<ordem>`), por SQL dinâmico só se `to_regclass('public.station_assets')` existir; sem imagem → `null` (`TODO(dono)`: chave com a Montagem).
  - `server/dupla/router.ts`: `export const DUPLA_PRINTS_BUCKET = "content-hub"`; `export function duplaStorage(mode: ContentDb["mode"]): Storage` (Supabase `supabaseStorage("content-hub")`, dev `localStorageDir()`); `export function createDuplaRouter(deps: { db: ContentDb; storage: Storage } | null, pending?: string | null): express.Router` com `GET /rooms/:roomId/prints/:pressingId/link` → `{ url }` (assinado 600 s; dev `{ url: null }`) e `GET /rooms/:roomId/prints/:pressingId/file` (dev; `Cache-Control: private, no-store`); sem login 401 "Entre na sua conta."; sala não uuid ou impresso fora de `^[A-Za-z0-9_-]{1,80}$` → 400 "Impresso inválido."; caminho nulo → 404 "Impresso sem imagem."; recusa do banco → 403 com a mensagem (padrão de `server/lessons/router.ts:143-175`). Em `server.ts`: `app.use("/api/dupla", createDuplaRouter(hub.deps ? { db: hub.deps.db, storage: duplaStorage(hub.deps.db.mode) } : null, hub.pending));`.

- [ ] **Step 1: Write the failing tests**
```ts
// duplaSalaBanco
it("papéis: qualquer membro escolhe ou sorteia; mudar zera confirmações; confirmar exige estação e papéis; os dois → connecting", …)
it("estação: só em roles, aprovada, Pro-only com os dois Pro; trocar zera confirmações e repõe a duração", …)
it("conexão e prontidão: os dois conectados → setup; link https validado", …)
it("cronômetro: só o avaliador; iniciar exige os dois prontos e grava ends_at = started_at + duração", …)
it("pausar, retomar e ±1 min com piso de 30 s, também pausado", …)
it("impressos: só o avaliador libera e oculta; o candidato passa a receber só o liberado", …)
it("marcações: só o avaliador, itens e níveis válidos, pendente limpa, subitens gravados, sem mudar o rev", …)
it("finalizar: nota do servidor (1,25 + 2,5 + pendente = 3,75 de 10; 37,5%), sessão completa e tempo usado sem pausas", …)
it("finalizar duas vezes não cria duas sessões", …)
it("conteúdo republicado no meio: item que sumiu não conta e o total segue a estação atual", …)
it("caminho da imagem: candidato só liberado; avaliador qualquer; sem station_assets ou sem imagem → null", …)
it("quem não é membro ou está sem acesso não age", …)
// duplaImpressoRota (ContentDb e Storage simulados, como lessonsRoutes.test.ts:31-50)
it("sem token 401; ids inválidos 400; sem imagem 404; recusa do banco 403; com imagem, link assinado de 600 s", …)
it("desenvolvimento: link nulo e arquivo pela rota /file sem cache", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSalaBanco.test.ts src/__tests__/duplaImpressoRota.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração, a rota e a montagem.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSalaBanco.test.ts src/__tests__/duplaImpressoRota.test.ts src/__tests__/duplaMatchBanco.test.ts src/__tests__/lessonsRoutes.test.ts --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 6800 com acoes da sala e rota da imagem do impresso".

### Tarefa 15: Estado da sala ao vivo e relógio do servidor
**Paralela com:** Tarefa 14.

**Files:**
- Modify: `src/novo/data/backend.ts`, `src/novo/data/supabaseBackend.ts`, `src/novo/app/dupla/live.js`
- Create: `src/novo/app/dupla/clock.js`, `src/__tests__/duplaRelogio.test.ts`, `src/__tests__/duplaSalaAoVivo.test.tsx`

**Interfaces:**
- Consumes: `app_dupla_room` (Tarefa 6); `PresenceMember`, `RealtimeHandle`, `RealtimeStatus` (Tarefa 12).
- Produces:
```ts
// Backend (opcional): canal privado `room:${roomId}`, presença com key = userId, postgres_changes UPDATE em checklist_rooms com filter `id=eq.${roomId}`
readonly subscribeRoom?: (roomId: string, userId: string, h: { onChange(): void; onPresence(members: PresenceMember[]): void; onStatus?(s: RealtimeStatus): void }) => RealtimeHandle;
```
```js
// clock.js
export function measureOffset(serverNowIso: string, sentAtMs: number, receivedAtMs: number): number // servidor − meio da ida e volta
export function remainingMs(room: { ends_at: string|null; paused_left_ms: number|null }, nowMs: number, offsetMs: number): number|null // pausado → paused_left_ms; correndo → max(0, ends_at − (now + offset)); senão null
export function formatClock(ms: number): string // "mm:ss", segundos para baixo
// live.js
export function useRoomState(roomId: string): { room: RoomState|null; error: Error|null; offsetMs: number; live: boolean; channelReady: boolean; partnerPresent: boolean|null; refresh(): Promise<void> }
// ao vivo: avisos agrupados em 300 ms → app_dupla_room(p_since_rev = rev); presença do outro membro; consulta completa a cada 30 s e ao voltar a aba/rede; canal com erro → modo local
// local: a cada 2 s com p_since_rev e completa a cada 10 s; channelReady depois da 1ª consulta; partnerPresent = partner.seen_ms_ago < 30000
```

- [ ] **Step 1: Write the failing tests**
```ts
// duplaRelogio
it("diferença de relógio no meio da ida e volta", …) // server 12:00:10.000; enviado 12:00:00.000 local; recebido +400 ms → 9800
it("restante a partir de ends_at igual (±1 s) em dois aparelhos com relógios diferentes", …)
it("pausado usa paused_left_ms; sem ends_at → null; nunca negativo; '09:59'", …)
// duplaSalaAoVivo
it("banco local: consulta de 2 s só traz mudança quando o rev muda; completa a cada 10 s", …)
it("Supabase: aviso agrupa 300 ms e busca de novo; presença do parceiro; consulta de segurança de 30 s", …)
it("canal com erro passa a consultar a cada 2 s", …)
it("subscribeRoom: canal privado room:{id}, filtro id=eq.{id}, presença por usuário; close remove", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaRelogio.test.ts src/__tests__/duplaSalaAoVivo.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** o método, o relógio e o hook.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaRelogio.test.ts src/__tests__/duplaSalaAoVivo.test.tsx src/__tests__/duplaTempoReal.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: estado da sala ao vivo e relogio do servidor".

### Tarefa 16: Sala ao vivo (1) — papéis, conexão e preparação
**Depois de:** Tarefas 14 e 15.

**Files:**
- Modify: `src/novo/app/dupla/room/{useRoom.js,RoomScreen.jsx,RolesPhase.jsx,ConnectingPhase.jsx,SetupPhase.jsx,ClosedPhase.jsx,StationPicker.jsx}`
- Create: `src/__tests__/duplaSalaPreparo.test.tsx`

**Interfaces:**
- Consumes: funções da Tarefa 14 e `app_dupla_leave` (11); `useRoomState` (15); `useHeartbeat` (12); `installAudioWake` (13); `useToast`, `Dialog` (2).
- Produces: `useRoom` passa a usar `useRoomState`; `actions` implementadas: `chooseRole` (→ `app_dupla_set_roles` com `p_candidate_id` = eu ou o parceiro), `drawRoles`, `setStation`, `confirmRoles`, `connected`, `setLink`, `setReady`, `setDuration`, `start`, `leave` — cada uma troca o estado pelo devolvido e mostra `messageOf(err)` no aviso.

Comportamento: `RoomScreen` com `useHeartbeat("em_estacao", roomId, live ? 45000 : 10000)` e `installAudioWake()`; papéis pelos cartões, "Sortear", Escolher/Trocar estação e "Confirmar papéis e conectar"; conexão com as 5 etapas por eventos reais (estação no estado; acesso por `useSession().dupla?.permitido` ou equipe; conteúdo do meu papel recebido; `channelReady`; `partnerPresent`) e `connected()` uma vez só; preparação: link conferido no aparelho com a regex do servidor e a mensagem de `Setup.jsx:7` → `setLink` e "Link compartilhado com a dupla"; copiar (`navigator.clipboard.writeText`, "Link copiado"); "Abrir chamada" com `window.open(link, "_blank", "noopener,noreferrer")`; prontidão; −/+30 s e atalhos (mínimo 60 s, máximo a duração oficial); "Iniciar estação" só com os dois prontos; "Sair da sala" e "Encerrar treino" com `Dialog` "Sair da sala?"/"Encerrar treino?", "O treino termina para os dois.", "Voltar" e o botão → `leave` e `go("dupla")`.

- [ ] **Step 1: Write the failing tests**
```ts
it("papéis: escolher, sortear, trocar estação e confirmar chamam as funções; 'Aguardando Bruno Lima confirmar os papéis'", …)
it("conexão: etapas andam com os eventos, connected é chamado uma vez e aparece 'Sala pronta' com 100%", …)
it("conexão sem o parceiro: Sair da sala com confirmação", …) // Review Focus 4
it("preparação: link inválido mostra a mensagem do protótipo e não grava; válido grava, copia e abre em nova aba", …)
it("preparação: −30 s para em 1 min, +30 s na duração oficial; Iniciar só com os dois prontos", …)
it("sair: confirmação e volta ao Praticar; o parceiro vê 'Treino encerrado por Ana Souza.'", …)
it("sinal na sala a cada 10 s no banco local e 45 s com tempo real", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSalaPreparo.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** as ações e as três fases.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSalaPreparo.test.tsx src/__tests__/duplaSalaFases.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: sala ao vivo nos papeis, conexao e preparacao".

### Tarefa 17: Sala ao vivo (2) — estação, impressos, PEP, conferência e queda
**Depois de:** Tarefa 16.

**Files:**
- Modify: `src/novo/app/dupla/room/{useRoom.js,RoomScreen.jsx,RunningPhase.jsx,ReviewPhase.jsx}`
- Create: `src/novo/app/dupla/printsApi.js`, `src/__tests__/duplaSalaEstacao.test.tsx`

**Interfaces:**
- Consumes: funções e rota da Tarefa 14; `remainingMs`, `formatClock`, `useRoomState` (15); `playWhistle` (13).
- Produces: `actions` `pause`, `resume`, `adjust`, `release`, `mark`, `finish`, `finalize`, `printUrl`; `export async function printUrl(backend, roomId: string, pressingId: string): Promise<string|null>` (link assinado; no local, `/file` com o token, como `src/novo/app/study/lessonsApi.js:54-60`); `mark` agrupa 300 ms por item e `flushMarks()` envia na hora antes de `finish`/`finalize`, em `pagehide` e com a aba escondida.

Comportamento: restante de `remainingMs(room, Date.now(), offsetMs)` a cada 250 ms; selos "Em andamento"/"Pausada"/"Tempo esgotado"; `playWhistle()` ao ver a fase passar de setup a running e uma vez por rodada ao chegar a 0 (volta a armar se o restante passar de 0 de novo; recarregar no meio não apita); ±1 min (avaliador; escondido em 0, minimizado ou oculto) com "Tempo reduzido em 1 minuto"/"1 minuto adicionado" (App.jsx:60); "Liberar"/"Ocultar" → `release`; conteúdo do candidato relido quando `released_pressings` muda; imagem com `PrintImage` quando `has_image`; `PepTable` com `onMark` e subitens; anotações em `localStorage` `smn-dupla-notas:<sala>:<rodada>`; "Finalizar estação" → `finish`; conferência: botões da lista → `mark`, filtro Todos/Pendentes, feedback com rascunho em `localStorage` `smn-dupla-feedback:<sala>:<rodada>` (apagado depois de finalizar), `Dialog` "Finalizar avaliação?" (Result.jsx:59-60) → `finalize`; queda: parceiro ausente por mais de 30 s → aviso fixo "Reconectando…" até voltar, sem reiniciar nada; candidato em review: "Aguardando avaliação" e "Sair da sala".

- [ ] **Step 1: Write the failing tests**
```ts
it("cronômetro do servidor: '09:59' a partir de ends_at e da diferença de relógio; pausado congela; selos", …)
it("apito ao começar e uma vez no 00:00; recarregar no meio não apita de novo", …)
it("±1 min só para o avaliador, com os avisos do protótipo; escondido em 00:00", …)
it("impressos: liberar chama a função; o candidato vê só o liberado e amplia a imagem; Esc fecha", …)
it("PEP: a marcação vai 300 ms depois do último toque, uma vez por item", …)
it("marcação pendente é enviada antes de Finalizar estação e de Finalizar e liberar resultado", …) // Review Focus 1
it("conferência: filtro Pendentes, aviso de pendentes, confirmação com a contagem e finalize com o feedback", …)
it("feedback e anotações sobrevivem ao recarregar e somem depois de finalizar", …) // Review Focus 5
it("avaliador some: 'Reconectando…' depois de 30 s e o candidato pode sair", …) // Review Focus 4
it("nenhuma resposta recebida pelo candidato traz actor_script ou checklist_items", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSalaEstacao.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** as ações, a estação, a conferência e a queda.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSalaEstacao.test.tsx src/__tests__/duplaSalaPreparo.test.tsx src/__tests__/duplaSalaFases.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: sala ao vivo na estacao, impressos, PEP e conferencia".

#### Fim da Etapa 5
- [ ] Typecheck filtrado e suíte completa — Expected: nenhuma linha; todos passam.
- [ ] Relatório ao dono: arquivos e migração 6800; como testar: servidor local seguro (Global Constraints) e duas janelas (`npm run dupla:sala-teste -- --fase roles`) fazendo uma rodada inteira; recarregar no meio (volta à fase, cronômetro certo); fechar uma janela por 40 s (aviso "Reconectando…"); somar à mão o PEP de uma estação de teste; repetir no celular na mesma rede; TODO: chave de `pressing_assets`.

**PARE: confirmação do dono.** O dono confirma a rodada completa nos dois papéis, também no celular.

---

## Etapa 6 — Resultado, histórico e notas

### Tarefa 18: Migração 6900 e Resultado — revisão da nota, inverter papéis, encerrar e uso do mês

**Files:**
- Create: `supabase/migrations/20261003006900_treino_dupla_resultado.sql`, `src/__tests__/duplaResultadoBanco.test.ts`, `src/__tests__/duplaResultadoTela.test.tsx`
- Modify: `src/novo/app/dupla/room/{useRoom.js,ResultPhase.jsx}`, `src/novo/app/admin/AdminDupla.jsx`

**Interfaces:**
- Consumes: Tarefas 6, 11 e 14.
- Produces:
  - `app_dupla_request_review(p_room_id uuid, p_round integer, p_reason text) returns jsonb` — candidato da sessão; sala em `result` na mesma rodada; uma vez (`'Revisão já solicitada.'`); motivo aparado 1–500 (`'Escreva o motivo (até 500 caracteres).'`); grava `review_requested_at`, `review_reason`; sala `rev + 1`; devolve `RoomState`.
  - `app_dupla_redo_review(p_room_id uuid, p_round integer) returns jsonb` — avaliador da sessão; só com pedido e sem revisão (`'A revisão só vale depois do pedido, uma vez.'`); sala → `review`.
  - `app_dupla_swap(p_room_id uuid) returns jsonb` — membro; `result` → `roles`, `round + 1`, papéis trocados, confirmações/conexões/prontidão vazias, cronômetro e impressos zerados, `duration_ms` da estação; o link fica.
  - `app_admin_dupla_usage(p_month text default null) returns jsonb` — `assert_admin`; mês `YYYY-MM` de Brasília (padrão o atual): `{ month, salas, rodadas_avaliadas, alunos, impressos_por_rodada /* 1 casa ou null */ }`.
  - `actions.requestReview(reason)`, `actions.redoReview()`, `actions.swap()`.

Tela: candidato — "Solicitar revisão da nota" → `Dialog` com o mesmo título, `Textarea` "Motivo" (até 500, contador) → `requestReview`, depois o botão fica desligado; avaliador — com pedido, `Banner` "{nome} pediu revisão da nota" com o motivo e "Rever a nota" → `redoReview`; selo "Nota revisada" com `review.revised_at`; "Treinar novamente — Inverter papéis" → `swap`; "Encerrar treino" → confirmação → `leave`. Painel: seção "Uso do mês" com `StatTile` "Salas", "Rodadas avaliadas", "Alunos que treinaram" e "Impressos por rodada" ("—" sem dado).

- [ ] **Step 1: Write the failing tests**
```ts
// duplaResultadoBanco
it("pedido de revisão: só o candidato, uma vez, com motivo, no resultado da rodada", …)
it("Rever a nota: só o avaliador, só depois do pedido, uma vez; finalizar de novo guarda a nota anterior e marca revisada", …)
it("inverter papéis: rodada 2 com papéis trocados e tudo zerado, menos o link", …)
it("duas rodadas: última vez, última nota e média da estação contam as duas", …) // app_dupla_result.previous_pct e app_dupla_stations.my_last_pct
it("uso do mês: salas, rodadas avaliadas, alunos e impressos por rodada no mês de Brasília; só administrador", …)
// duplaResultadoTela
it("candidato pede revisão com motivo e o botão desliga", …)
it("avaliador vê '{nome} pediu revisão da nota' e 'Rever a nota'; depois, 'Nota revisada'", …)
it("Inverter papéis e Encerrar treino com confirmação", …)
it("painel: Uso do mês com os quatro números e '—' sem dado", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaResultadoBanco.test.ts src/__tests__/duplaResultadoTela.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração, as ações, o resultado e o uso do mês.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaResultadoBanco.test.ts src/__tests__/duplaResultadoTela.test.tsx src/__tests__/duplaSalaBanco.test.ts src/__tests__/duplaRotas.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 6900, resultado, revisao da nota, inverter papeis e uso do mes".

#### Fim da Etapa 6
- [ ] Typecheck filtrado e suíte completa — Expected: nenhuma linha; todos passam.
- [ ] Relatório ao dono: arquivos e migração 6900; como testar: servidor local seguro (Global Constraints) e duas rodadas com inversão; pedir e fazer a revisão; conferir "Sua última nota" no cartão da estação e "Uso do mês" em Administração › Configurações.

**PARE: confirmação do dono.** O dono confirma números e textos do resultado.

---

## Etapa 7 — Celular, acessibilidade e testes

### Tarefa 19: Celular e acessibilidade

**Files:**
- Create: `src/novo/app/dupla/dupla.css` (importado pelas telas do módulo), `src/novo/app/dupla/announce.js`, `src/__tests__/duplaAcessibilidade.test.tsx`
- Modify: `src/novo/ds/components/osce/osce.css`, `src/novo/ds/components/osce/MatchCard.jsx`, `src/novo/app/dupla/{MatchModal,PracticeScreen,StationsScreen,StudyProfileScreen}.jsx`, `src/novo/app/dupla/room/{RoomScreen,ConnectingPhase,RunningPhase}.jsx`

**Interfaces:**
- Produces: `useAnnouncer(): [node: ReactNode, announce: (text: string) => void]` (região `aria-live="polite"` escondida); `prefersReducedMotion(): boolean` (`matchMedia("(prefers-reduced-motion: reduce)")`).

Comportamento (protótipo `index.html:13-38`): até 900 px — cartão na largura da tela, margens de 16 px nas telas do módulo, diálogos como painel de baixo (Tarefa 2), barra da sala fixa embaixo com `env(safe-area-inset-bottom)`, cabeçalho da sala quebrando linha; até 480 px — botões ghost da barra só com ícone (com `aria-label`). `prefers-reduced-motion`: cartão sai sem transição nem rotação (onSwipe na hora), modal do match e anel do carregamento sem animação. Foco visível (`--focus-ring`) em todo botão próprio (células do PEP, blocos de área, cartões de papel, botões do baralho). Anúncios: candidato "Impresso {n} liberado: {nome}."; cronômetro "Faltam 2 minutos.", "Faltam 30 segundos.", "Tempo esgotado." (uma vez cada por rodada).

- [ ] **Step 1: Write the failing tests**
```ts
it("até 900 px e 480 px: regras do CSS do módulo (16 px, barra fixa, cartão inteiro, diálogo embaixo, botões só com ícone)", …) // lê os CSS
it("movimento reduzido: o cartão sai sem animação e chama onSwipe na hora; modal e anel sem animação", …)
it("anúncios só nos marcos do cronômetro e no impresso liberado", …) // vi.useFakeTimers; texto da região aria-live
it("todo botão das telas do módulo tem nome acessível", …) // getAllByRole("button") com nome não vazio em cada tela
it("← → no match têm botões equivalentes; Esc fecha o impresso; células do PEP alcançáveis pelo teclado", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaAcessibilidade.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** o CSS, os anúncios e o movimento reduzido.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/dupla --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: celular e acessibilidade".

### Tarefa 20: Ponta a ponta, documentação e conferência final
**Depois de:** Tarefa 19.

**Files:**
- Create: `scripts/e2e/dupla.mjs`, `docs/architecture/TREINO_EM_DUPLA.md`
- Fora do repositório: `~/Downloads/StaziaMed-Treino-em-Dupla-SQL-6500-a-6900.sql`

**Interfaces:**
- Consumes: tudo; rotas `/api/dev-db/auth/signup` e `/api/dev-db/dupla/preparar` (Tarefa 10).
- Produces: `E2E_URL=<url> node scripts/e2e/dupla.mjs` → sai 0 com "dupla e2e: OK" ou ≠ 0 com o passo que falhou. Cria duas contas, prepara as duas, abre dois contextos do `playwright` (chromium) com `smn-dev-token` no `localStorage` (`addInitScript`) e faz: perfis (A médico, B ator) → B "Estudar junto" em A → A "Estudar junto" em B → "Deu match!" → os dois na sala → estação e papéis → confirmar → conexão → link, prontos, "Iniciar estação" → cronômetros iguais (±1 s) → B libera "Impresso 1" e A vê → B marca 3 itens e "Finalizar estação" → A em "Aguardando avaliação" → B feedback e "Finalizar e liberar resultado" → A vê "x,xx / 10,00" → "Treinar novamente — Inverter papéis" → rodada 2 com recarga de A no meio (mesma fase e restante ±1 s) até o resultado → "Encerrar treino" → B vê "Treino encerrado por …". Guarda as respostas de `/api/dev-db/rpc` do contexto de A e falha se alguma anterior ao resultado tiver `actor_script`, `checklist_items` ou o texto de impresso não liberado. Usa `domcontentloaded` + espera por elemento (nunca `networkidle`).
- Doc: visão, rotas, tabelas e quem vê o quê, funções por migração, tempo real e reserva, acesso por plano, custos (o quadro "Custos" deste plano, que resume a §10 da spec, e as fórmulas para refazer a conta com o "Uso do mês"), como testar (local e Supabase), publicação por etapa (§13), pendências (`TODO(dono)`).

- [ ] **Step 1: Write** `scripts/e2e/dupla.mjs`.
- [ ] **Step 2: Run** o servidor temporário em segundo plano, com as variáveis por extenso (nunca agrupadas numa variável só no zsh): `PORT=3197 NODE_ENV=development DEV_DB_DIR=<scratchpad>/devdb-dupla CONTENT_HUB_STORAGE_DIR=<scratchpad>/files-dupla CONTENT_HUB_WORKER=0 VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_DB_URL= npx tsx server.ts` — Expected no log: "banco: desenvolvimento" e "[dev-db] Banco de desenvolvimento pronto" (sem isso, encerrar na hora). Depois, pela fila, `FILA env E2E_URL=http://localhost:3197 node scripts/e2e/dupla.mjs` — Expected: "dupla e2e: OK". Encerrar: `lsof -tiTCP:3197 -sTCP:LISTEN | xargs kill` e `lsof -tiTCP:3197 -sTCP:LISTEN` vazio (conferir também que nada segura a porta 24678).
- [ ] **Step 3: Write** `docs/architecture/TREINO_EM_DUPLA.md`.
- [ ] **Step 4: Run** a suíte completa da Global Constraints (`FILA npx vitest run --pool=threads --maxWorkers=1 --reporter=json --outputFile=<scratchpad>/vitest-etapa-7.json`) com a conferência de arquivos — Expected: todos passam (fora JCodesMore sem o disco); typecheck filtrado pela fila — Expected: nenhuma linha; `FILA npm run build:vercel && (grep -rl "Vitrine do Treinamento em Dupla" dist server-dist || echo limpo)` — Expected: build sem erro e `limpo`.
- [ ] **Step 5: SQL para o dono:** juntar as cinco migrações, em ordem, em `~/Downloads/StaziaMed-Treino-em-Dupla-SQL-6500-a-6900.sql`, cada uma precedida de `-- Etapa N — <arquivo>`, com cabeçalho em português: rodar no SQL Editor do Supabase, uma etapa por vez e só com a ordem de publicar (§13) — Expected: `grep -c "^-- Etapa" <arquivo>` = 5.
- [ ] **Step 6: Commit** `git add scripts/e2e/dupla.mjs docs/architecture/TREINO_EM_DUPLA.md`; "Treino em dupla: ponta a ponta, documentacao e conferencia final".

#### Fim da Etapa 7
- [ ] Relatório ao dono: arquivos, resultado do ponta a ponta, caminho do SQL em Downloads, como testar no celular real (iOS e Android) e com leitor de tela no match e na sala, passos da publicação (§13: SQL da etapa → código → conferência com a conta da equipe; "Spend Cap"; escolha dos planos; ligar a chave; comparar o painel do Supabase e o "Uso do mês" com a §10 na primeira semana) e as pendências (`pressing_assets` com a Montagem; Realtime conferido à mão no Supabase em dois aparelhos depois de publicar).

**PARE: confirmação do dono.** O dono confirma o módulo pronto para publicar (§13).
