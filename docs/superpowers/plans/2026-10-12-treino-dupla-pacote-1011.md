# Treinamento em Dupla — pacote de design de 11/10 (plano de ajuste e das tarefas 14 a 20 revisadas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajustar o que as Etapas 1 a 4 já entregaram ao pacote novo (tema reservado ao avaliador, relato do caso visível desde o
início, "Impresso 1" na tela, sala do avaliador, rodapé, menu recolhido, sem link de chamada) e **seguir a partir da Etapa 5 já
com o pacote novo**; depois, só com as decisões do dono, o chat entre os dois do match, o convite direto e a cota por pacote.

**Architecture:** Mesma do plano de 09/10 (funções `app_dupla_*` SECURITY DEFINER; tempo real só avisa; telas em
`src/novo/app/dupla/`). Mudam a **numeração das migrações** (faixa **9900 a 9959**, ver abaixo), a **fase `setup`** (só
prontidão; a sala do avaliador abre antes do início e o candidato espera) e o **conteúdo por papel** (candidato sem o tema, com
os impressos iniciais). Nada de IA neste módulo; o "sozinho" é do adendo do outro agente.

**Tech Stack:** o do plano de 09/10 (Postgres/Supabase com PGlite nos testes, Express, React 19 + DS `src/novo/ds`, Vitest +
Testing Library, Playwright).

**Spec:** `docs/superpowers/specs/2026-10-12-treino-dupla-pacote-1011.md` (este plano executa o que ela decide) e, para o resto,
`docs/superpowers/specs/2026-10-09-treino-dupla-design.md`. **Plano base:** `docs/superpowers/plans/2026-10-09-treino-dupla.md`
(as Tarefas 1 a 13 estão feitas; as 14 a 20 são **substituídas** por este documento).
**Pacote novo (só leitura, nunca executar nem copiar):** `/Users/joaopaulomendes/Documents/StaziaMed-Previas/treino-dupla-2026-10-11`
(`ATUALIZACOES_2026-10-11.md`, `LEIA_PRIMEIRO_IA_OPERACIONALIZACAO.md`, `ui_kits/treino-dupla/*.jsx`, `MATCH-CHAT-REGRAS.md`,
PNGs de referência). **Não abrir nem varrer** `PROVAS_HABILIDADES_CLINICAS_INEP_2020_A_2025/` (PDFs; a pasta é lenta e não é
necessária para construir). Neste plano, **protótipo novo** = `pacote/ui_kits/treino-dupla` (referências `Room.jsx:258` são desse
diretório) e **protótipo antigo** = a pasta de 08/10 em `~/Downloads/templates/handoff-treino-dupla`.

## Global Constraints
Valem **todas** as "Global Constraints" do plano de 09/10 (sem IA na dupla, nada inventado, só pacote como referência, textos
pt-BR, tokens e componentes do app, acesso por plano e RLS, cronômetro do servidor, tempo real só avisa, funções
`security definer set search_path = ''`, fuso de Brasília, fila de testes `FILA`, servidor local seguro, commits só com
`git add` explícito e **nunca `git push`**, nunca abrir `.env*`), **exceto** o que este bloco muda:
- **Pacote:** a referência passa a ser a pasta nova acima. Os testes que leem `stations-inep2020.js` o fazem **como texto** e só
  `if (fs.existsSync(...))` (o pacote só existe na máquina do dono). Nenhuma imagem, PDF ou arquivo do pacote entra no
  repositório; imagens de estação vêm da Montagem (`station_assets`), com `TODO(dono)` enquanto não houver.
- **Migrações: faixa 9900 a 9959.** Antes de escrever qualquer uma, conferir o número livre em **todos** os worktrees:
  `for d in .claude/worktrees/*/ .; do ls "$d"supabase/migrations 2>/dev/null; done | awk -F_ '{print substr($1,9)}' | sort -u | tail -8`
  (em 2026-10-12 o maior de outros ramos é `9820`; as do Treino são 9750, 9760 e 9770). **Reservadas:** `9900` pacote
  (Etapa P), `9910` sala, `9920` resultado, `9930` chat, `9940` convite direto, `9950` cota. As antigas "6800" e "6900" do plano
  de 09/10 **deixam de existir**: viram 9910 e 9920. **Migração commitada não muda**; correção vai na seguinte.
- **Funções refeitas:** partir da definição **mais nova** no `supabase/migrations` do main atualizado **e** nas migrações do
  Treino (`grep -n "create or replace function public.<nome>"` em `*9750*`, `*9760*`, `*9770*`, depois nas novas). Hoje: `dupla_room_state`
  ← 9760; `app_dupla_room_content` ← 9750; `app_dupla_swipe`, `app_dupla_answer_invite` ← 9770; `app_dupla_save_profile` ← 9760;
  `app_export_my_data` ← a mais nova (a do plano de 09/10 aponta `…5300_termo_aceite.sql:318-357`, conferir se a 9750 já a
  refez); chaves de `app_settings` ← a **união** de todas as que existirem + `treino_dupla` (+ `treino_dupla_chat` na 9930).
- **Tema reservado:** o servidor **nunca** devolve ao candidato, em nenhuma fase até `result`, o nome da estação, o `topic`, o
  `taxonomy_path`, o `summary`, o nome de arquivo ou o caminho de imagem (`station_assets.storage_path`) em nenhuma resposta
  (estado, conteúdo, marcações, caminho do impresso). Teste por **texto bruto da resposta** (`JSON.stringify`), não só por chave.
- **Impresso:** o número que a pessoa vê é `display_number`; `source_number` (o da prova) só o avaliador vê. Padrão sem os
  campos novos: `source = display =` posição. O que está em `initially_visible` **nunca** entra em `released_pressings` e não
  tem botão Liberar/Ocultar.
- **Sem link de chamada** na tela (decisão D3(a) da spec). A coluna `call_link` e a limpeza ao fechar a sala ficam.
- **Cota, compra, convite direto e chat** só entram nas etapas C, V e Q, e só depois das decisões marcadas. **Compra real
  não faz parte deste plano.** Nenhum preço, limite ou quantidade escrito no código: tudo vem de `app_settings` e começa
  **desligado/vazio**.
- **Fila de testes:** **`FILA`** = `bash "/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/vaga-de-teste.sh"`, escrito por extenso em cada comando (o projeto agora está no volume StaziaMed; o script antigo do Samsung é o mesmo). No máximo 3 vitest/tsc/build juntos.
- **Commits:** `git commit -m "<mensagem em português sem acento>" -m "Co-Authored-By: <modelo que executar> <noreply@anthropic.com>"`.
  O autor do commit é o de `git config user.name` do worktree (`araujomendes89-collab`); não mudar.

## Review Focus (novos; os 5 do plano de 09/10 continuam)
6. **O candidato nunca recebe o tema** (nome, tópico, resumo, caminho de imagem), em nenhuma resposta e em nenhuma tela,
   inclusive recarregando no meio e na troca de papéis da rodada 2. Teste na Tarefa P6 e de novo na 20.
7. **Relato do caso (impresso inicial)** aparece desde o início, continua aparecendo depois de recarregar e **não** aparece como
   "Aguardando liberação" nem na contagem "x/y". Testes P2, P4b e 17b.
8. **Candidato espera e entra sozinho** quando a fase vira `running`, mesmo se estava com a aba escondida ou reconectando.
   Teste 16 e 20.
9. **Mesma pessoa em duas abas** (avaliador abriu a sala do avaliador em uma e a preparação em outra): nada duplica início nem
   troca papéis. Teste 17a.
10. **Chat:** terceiro não lê nem escreve (pela API e direto no banco); mensagem bloqueada não é gravada; termos clínicos não
    são bloqueados por trecho de palavra. Testes C1.
11. **Último crédito sob concorrência** (duas abas, dois aparelhos): nunca saldo negativo; reabrir o mesmo par não debita.
    Testes Q1.

## Decisões já adotadas neste plano (o dono pode mudar; ver spec §7)
- **D3(a):** sem link da chamada; **D4:** candidato só vê "Estação N · Área" na sala, e só o avaliador escolhe/troca a estação,
  depois dos papéis; **D8:** candidato não finaliza (só "Sair da sala"); **D9:** "Materiais" só com "Resumo sobre o tema" quando
  a estação tem `summary`; **D10:** "Sinalizar problema" continua escondido.
- Liberar impresso e marcar PEP só com a estação **em andamento**; antes do início os botões ficam desligados com dica.
- A sala do avaliador "aberta" antes do início é **estado local** (`sessionStorage`), sem coluna nova: o servidor segue em `setup`.
- Sem o aviso "Tempo esgotado. Estação encerrada." (spec de 09/10, mantido); sem os blocos "TutorIA" e "Liberar" do PEP.
- Rolagem independente das duas colunas do avaliador **com a barra nativa do navegador** (estilizada por CSS); a barra
  customizada do pacote (`ActorScrollFrame`, 65 linhas de ponteiro) **não é portada**.
- Menu recolhido na sala com a largura real do menu do app (`Shell.jsx`, 76 px recolhido), não os 104 px do pacote.

## Textos novos para aprovar (além dos da spec de 09/10 e do plano de 09/10)
- Etapa P: "Estação {N}" (rótulo do candidato no lugar do nome); "Aguardando {nome} escolher a estação."; "Só o avaliador escolhe a
  estação."; "Definam os papéis antes de escolher a estação."; "Impresso {display} · no documento oficial: Impresso {source}";
  "Disponível depois de iniciar a estação."; "Este impresso já está visível desde o início.".
- Etapa 7 (leitor de tela): "A estação começou.".
- Etapa C: os textos do pacote (spec §3.1) e as mensagens do servidor "Faça um match antes de iniciar a conversa." e
  "Você enviou várias mensagens seguidas. Aguarde alguns segundos para continuar." (ambas **do pacote**).
- Etapa Q: "Sua cota de matches acabou" e "Você pode adquirir mais matches para encontrar novos parceiros. Suas conversas continuam
  disponíveis." (do pacote); **novo:** "Os pacotes ainda não estão à venda." (tela informativa, sem botão de pagar).

## Arquivos
| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261003009900_treino_dupla_pacote.sql`, `…009910_treino_dupla_sala.sql`, `…009920_treino_dupla_resultado.sql`, `…009930_treino_dupla_chat.sql`, `…009940_treino_dupla_convite_direto.sql`, `…009950_treino_dupla_cota.sql` | pacote (conteúdo por papel); sala; resultado; chat; convite direto; cota |
| `src/shared/checklistBank/{types,catalog}.ts` | `Pressing` com `source_number`, `display_number`, `initially_visible` (opcionais) |
| `scripts/dupla/converter-inep2020.ts`, `server/dupla/data/teste-inep2020.json`, `server/dupla/testStations.ts` | dados de teste ao formato novo |
| `src/novo/ds/components/osce/{PrintItem,PrintImage,ScrollPane}.*`, `osce.css`, `index.js` | zoom, ocultar imagem, "Impresso n", rolagem própria |
| `src/novo/app/dupla/room/*` | sala (CandidateSheet.jsx e EvaluatorFooter.jsx novos) |
| `src/novo/app/{Shell,App}.jsx` | menu recolhido na sala |
| `src/novo/app/dupla/{chat/*,MatchModal,PracticeScreen}.jsx`, `src/novo/data/{backend,supabaseBackend,devServerBackend,localBackend}.ts` | chat, convite, aviso de cota |
| `server/dupla/router.ts`, `server.ts` | rota da imagem (Tarefa 14) |
| `src/__tests__/dupla*.test.ts(x)`, `src/__tests__/helpers/duplaDb.ts`, `scripts/e2e/dupla.mjs`, `docs/architecture/TREINO_EM_DUPLA.md` | testes e mapa |

## Paralelismo
| Etapa | Juntas | Depois |
|---|---|---|
| P | P1 e P3 | P2 (depois de P1), P4a e P4b (depois de P2 e P3), P5 (livre), P6 (depois de todas) |
| 5 | 14 e 15 | 16, depois 17a, depois 17b e 17c juntas |
| 6 | — | 18 |
| 7 | — | 19, depois 20 |
| C | C1 | C2, depois C3 |
| V | V1 | V2 (junto com o adendo do radar) |
| Q | Q1 | Q2, depois Q3 |

---

## Etapa P — Ajustes do pacote no que já existe (antes da Etapa 5)
**Pré-requisito:** nenhum (D4 já adotada). Esta etapa **não** mexe em cota, chat nem convite.

### Tarefa P1: Formato do impresso, dados de teste e leitura do pacote novo
**Paralela com:** Tarefa P3.

**Files:**
- Modify: `src/shared/checklistBank/types.ts`, `src/shared/checklistBank/catalog.ts`, `scripts/dupla/converter-inep2020.ts`, `server/dupla/data/teste-inep2020.json` (regerado pelo script), `src/novo/app/dupla/content.js`, `src/__tests__/duplaEstacoesTeste.test.ts`, `src/__tests__/checklistBankCore.test.ts`, `src/__tests__/duplaConteudo.test.ts`

**Interfaces:**
- `Pressing` ganha, todos opcionais: `source_number?: number | null`, `display_number?: number | null`, `initially_visible?: boolean`. `normalizeStation` **mantém** os três (hoje descarta o que não conhece); sem eles: `source = display =` posição, `initially_visible = false`. `validateStation` recusa `display_number` repetido, número menor que 1 ou não inteiro, e mais de um impresso inicial com a mesma posição.
- Converter: `prints[i].displayIndex` → `display_number`; posição → `source_number`; `candidateImage` e `img` **ignorados** (`TODO(dono): imagem da folha e dos impressos vêm da Montagem; nenhuma imagem do pacote é copiada`); o impresso da posição 1 de uma estação que tem `candidateImage` → `initially_visible: true` (regra explícita **gravada no dado**, não por regex em tempo de execução); a constante `ACTOR_SCRIPT_1` e a atribuição `s.actor = …` viram `actor_script` com linhas `RÓTULO: texto`. `KNOWN_STATION_KEYS` e a lista de propriedades de impresso passam a aceitar os novos nomes e **continuam recusando o resto**.
- `splitActorScript` (`content.js`) passa a aceitar também rótulo **em caixa alta** (`^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 /,()’'-]{6,}:`) além dos rótulos da Montagem, sem perder texto; sem rótulo no começo da linha, continua anexando à anterior.
- O teste lê o pacote novo (`PACOTE_NOVO = "…/treino-dupla-2026-10-11/ui_kits/treino-dupla/stations-inep2020.js"`) como texto; se não existir, pula.

- [ ] **Step 1: Write the failing tests**
```ts
// checklistBankCore
it("impresso com source_number, display_number e initially_visible passa pelo normalizeStation sem perder nenhum", …)
it("impresso sem os campos novos: posição vira origem e tela, e não é inicial", …)
it("validateStation recusa display_number repetido ou inválido", …)
// duplaEstacoesTeste (formato novo)
it("E1: relato é impresso inicial (display 1, source 1) e o esfregaço é display 1 / source 2", …) // vê o pacote: displayIndex 1 no esfregaço
it("E1: actor_script traz os 10 blocos do roteiro e as outras 9 seguem vazias", …)
it("o pacote novo é aceito pelo conversor e o antigo também; propriedade desconhecida segue recusada", …)
it("nenhuma imagem do pacote é copiada: image_url continua nulo", …)
// duplaConteudo
it("rótulos em caixa alta do roteiro da E1 separam em 10 pares e a soma do texto confere com o original", …)
it("linha sem rótulo continua anexada ao bloco anterior", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/checklistBankCore.test.ts src/__tests__/duplaEstacoesTeste.test.ts src/__tests__/duplaConteudo.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** os tipos, o conversor e o separador; regerar `teste-inep2020.json` com o script (`npx tsx scripts/dupla/converter-inep2020.ts`, só leitura do pacote) e conferir `git diff --stat` (só a E1 muda).
- [ ] **Step 4: Run** os mesmos testes + `duplaTelasBanco.test.ts duplaSalaTesteLocal.test.ts` — Expected: PASS. Em seguida, **comparar os 26 PDFs com a fonte da Montagem sem abri-los** (só tamanho e `shasum`): `ls -l` e `shasum -a 256` dos arquivos de `…/PROVAS_HABILIDADES_CLINICAS_INEP_2020_A_2025/*/*.pdf` contra `/Volumes/Samsung/STAZIAMED REVALIDA/Estacoes StaziaMed Oficiais/fontes_oficiais/INEP_Revalida_Habilidades_Clinicas/` (nomes e tamanhos primeiro; só calcular `shasum` dos que tiverem o mesmo nome e tamanho; **não usar** `diff -r` nem ler o conteúdo). Anotar o resultado no relatório da Etapa P.
- [ ] **Step 5: Commit** "Treino em dupla: impresso com numero de origem e de tela, impresso inicial e roteiro da estacao 1 nos dados de teste".

### Tarefa P2: Migração 9900 — conteúdo por papel e estado da sala sem o tema para o candidato
**Depois de:** Tarefa P1.

**Files:**
- Create: `supabase/migrations/20261003009900_treino_dupla_pacote.sql`, `src/__tests__/duplaPacoteBanco.test.ts`
- Modify: `src/__tests__/helpers/duplaDb.ts` (lista de migrações até a 9900), `src/__tests__/duplaMigracaoDados.test.ts` (linhas 101, 122 e 138: o Treino agora refaz duas funções **dele**, nenhuma de produção), `src/__tests__/duplaTelasBanco.test.ts` (linha 177: o estado do candidato não traz `station.name`)

**Interfaces** (cabeçalho em português como as outras migrações; "pode ser colada duas vezes"; COMO DESFAZER):
- `dupla_room_state(p_room, p_uid)` refeita: `station` traz `name` **só** se `p_uid = evaluator_id` ou a fase é `result`; para o candidato (e para qualquer um, enquanto não houver avaliador, ou seja, fase `roles` sem papéis) traz `label` = `'Estação ' || number` (ou `'Estação'` sem número) e **não** traz `name`. Continuam: `id`, `area`, `area_code`, `number`, `edition`, `reapplication`, `institution`, `duration_ms`, `is_pro_only`.
- `app_dupla_room_content(p_room_id)` refeita: candidato recebe `station` **sem `name`** (com `label`), `doctor_scene`, `doctor_tasks`, `duration_ms`, `candidate_sheet: { has_image }` (`has_image` = `content.pressing_assets` tem a chave `candidate_sheet`; `TODO(dono)`: chave com a Montagem) e `pressings` = os `initially_visible` **mais** os liberados, cada um `{ id, display_number, name, content (sem a linha "Liberação: …"), has_image, initially_visible }` (**sem** `source_number`); `pressing_count` = só os **liberáveis** (não iniciais). Avaliador recebe tudo, com `source_number` e `initially_visible`. Fases `roles`, `closed`, sem papel: como hoje (só identificação), sem nome para quem não é avaliador.
- Nada de `summary`, `topic` nem `taxonomy_path` na resposta do candidato.

- [ ] **Step 1: Write the failing tests**
```ts
// duplaPacoteBanco (PGlite com as migrações reais, helpers/duplaDb)
it("candidato: texto bruto de app_dupla_room e app_dupla_room_content, em todas as fases até review, não contém o nome, o topic nem o summary da estação", …)
it("candidato no resultado recebe o nome; avaliador o recebe desde que os papéis estão definidos", …)
it("fase roles sem papéis: ninguém recebe o nome, só 'Estação N'", …)
it("impresso inicial: o candidato recebe sem liberação, fora de pressing_count e fora de released_pressings", …)
it("display_number e source_number: candidato só vê display; avaliador vê os dois", …)
it("estação sem os campos novos: posição como display e source, nenhum impresso inicial", …)
it("candidate_sheet.has_image reflete a chave; sem a chave é falso", …)
it("colar a 9900 duas vezes dá o mesmo banco; permissões iguais às das outras app_dupla_*", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaPacoteBanco.test.ts src/__tests__/duplaMigracaoDados.test.ts src/__tests__/duplaTelasBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração e atualizar os testes antigos citados.
- [ ] **Step 4: Run** os mesmos + `src/__tests__/supabaseSchema.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9900, candidato sem o tema da estacao e com os impressos iniciais".

### Tarefa P3: Componentes — "Impresso n", zoom, ocultar imagem e rolagem própria
**Paralela com:** Tarefa P1.

**Files:**
- Modify: `src/novo/ds/components/osce/{PrintItem,PrintImage}.jsx` (+ `.d.ts`), `src/novo/ds/components/osce/osce.css`, `src/novo/ds/components/osce/index.js`, `src/__tests__/duplaComponentesEstacaoA.test.tsx`
- Create: `src/novo/ds/components/osce/ScrollPane.jsx`, `ScrollPane.d.ts`

**Interfaces:**
- `PrintItem` aceita `index` (número exibido) e, só para o avaliador, `sourceNumber`; quando `sourceNumber` existe e é diferente de `index`, escreve `Impresso {index} · {título}` e, em linha pequena, "no documento oficial: Impresso {sourceNumber}". Rótulo trancado: "Impresso {index} · Aguardando liberação".
- `PrintImage` aceita `canHide?: boolean`; ampliada (tela cheia) ganha **−** e **+** (aria-label "Diminuir imagem" / "Ampliar imagem"), valor em % (de 60% a 200%, passo 20%, largura-base 900 px, **como no pacote** `Room.jsx:65-72`; zera ao abrir), Esc e Fechar como hoje. Com `canHide`, botões "Ocultar imagem do impresso" / "Mostrar imagem do impresso" (estado só da tela; não muda a autorização).
- `ScrollPane({ children, className, label })`: contêiner com `min-height: 0`, `overflow-y: auto`, `overscroll-behavior: contain`, `tabIndex={0}` e `role="region"` com `aria-label={label}`, para a rolagem de cada coluna do avaliador.

- [ ] **Step 1: Write the failing tests**
```ts
it("PrintItem mostra 'Impresso 1 · Esfregaço' e, com sourceNumber 2, 'no documento oficial: Impresso 2'; sem sourceNumber igual não escreve a linha", …)
it("PrintImage ampliada: − e + andam de 60% a 200% de 20 em 20, desligam nos limites e voltam a 100% ao reabrir", …)
it("canHide oculta e mostra a imagem sem fechar o impresso", …)
it("ScrollPane tem região com nome, foco por teclado e overflow próprio", …)
it("osce.css sem cor hexadecimal nem rgba(); ScrollPane com .d.ts e exportado", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaComponentesEstacaoA.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaComponentesEstacao --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: impresso com numero de origem, zoom e ocultar imagem, e painel de rolagem propria".

### Tarefa P4a: Papéis, conexão e preparação conforme o pacote (sem tema, sem link)
**Depois de:** Tarefas P2 e P3.

**Files:**
- Modify: `src/novo/app/dupla/room/{SetupPhase,ConnectingPhase,RolesPhase,StationPicker,parts}.jsx`, `src/novo/app/dupla/room/useRoom.js`, `src/__tests__/duplaSalaFases.test.tsx`

**Interfaces:**
- `parts.jsx`: `stationTitle(station)` devolve `station.name` só se existir (avaliador/resultado); senão `station.label`. Nenhuma tela usa `station.name` direto.
- `SetupPhase`: **sai** o cartão do link e **sai** a "Leitura prévia do avaliador"; ficam o cabeçalho "Sala com {nome}" com a frase "Confirmem a prontidão para iniciar a estação." (`Setup.jsx:30` do protótipo novo), a faixa de papéis, o cartão "1. Prontidão" e a faixa final: avaliador com os dois prontos: "Prontidão confirmada. Entre na sala do avaliador para controlar o cronômetro." + botão **"Abrir sala do avaliador"** (liga o estado local `evaluatorInRoom` em `sessionStorage` `smn-dupla-sala-avaliador:<sala>:<rodada>`; a tela da Tarefa 17a o usa); candidato: "Dupla conectada. Aguardando {nome} (avaliador) iniciar a estação…" e o selo "Só o avaliador inicia". O cartão do cronômetro **sai** da preparação (vai ao rodapé na 17a).
- `ConnectingPhase`: etapa "Carregando a estação" mostra `stationTitle` (sem nome para o candidato).
- `RolesPhase`/`StationPicker`: o botão **"Escolher estação"/"Trocar estação"** só aparece para o avaliador definido; sem avaliador definido: "Definam os papéis antes de escolher a estação."; candidato: "Aguardando {nome} escolher a estação." quando ainda não há estação, e "Estação {N} · {área}" quando há. O seletor lista com nome (só o avaliador o vê).

- [ ] **Step 1: Write the failing tests** (reescrevem `duplaSalaFases.test.tsx` linhas 138, 173, 195, 211 e 260)
```ts
it("papéis: candidato vê 'Estação N · Área' sem o nome; só o avaliador vê Escolher/Trocar estação", …)
it("papéis: sem avaliador definido, 'Definam os papéis antes de escolher a estação.' e nenhum nome", …)
it("conexão: a 1ª etapa não escreve o nome da estação para o candidato", …)
it("preparação: só 'Prontidão'; sem campo de link, sem 'Abrir chamada', sem leitura prévia", …)
it("preparação: avaliador com os dois prontos vê 'Abrir sala do avaliador'; candidato vê 'Só o avaliador inicia'", …)
it("abrir a sala do avaliador guarda o estado por sala e rodada e sobrevive a recarregar", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSalaFases.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** o mesmo — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: papeis, conexao e preparacao sem o tema e sem o link da chamada".

### Tarefa P4b: Sala em andamento conforme o pacote (folha do candidato, 2 colunas, cabeçalho)
**Depois de:** Tarefas P2, P3 e P4a.

**Files:**
- Create: `src/novo/app/dupla/room/CandidateSheet.jsx`
- Modify: `src/novo/app/dupla/room/{RunningPhase,parts}.jsx`, `src/novo/app/dupla/content.js`, `src/__tests__/duplaSalaFases.test.tsx` (linhas 267 e 312)

**Interfaces:**
- `CandidateSheet({ station, content })`: **folha do candidato** = cenário + "Nos {n} minutos de duração, execute:" + tarefas + os impressos iniciais (relato) como texto; com `candidate_sheet.has_image`, a imagem ampliável (pela rota da Tarefa 14, `printUrl(…, "candidate_sheet")`); sem imagem, o texto completo é a folha (fallback pedido pela LEIA §4). Nunca escreve o nome da estação.
- Cabeçalho: avaliador mostra o nome; candidato mostra **"Estação em andamento"** e "{área} · {origem}". Selo "Aguardando início" enquanto a fase é `setup` (sala do avaliador aberta) — o cabeçalho é o mesmo componente nas duas situações. Candidato: botão **"Ocultar"/"Mostrar cronômetro"** (aria-label "Esconder cronômetro"/"Mostrar cronômetro"; a dica "Esconder apenas nesta tela. O tempo continua contando."), guardado em `sessionStorage` `smn-dupla-cron-oculto`; o avaliador **não** tem cronômetro no cabeçalho (vai ao rodapé na 17a). Candidato **sem** ±1 min e sem minimizar.
- Avaliador: grade de 2 colunas (≥ 1100 px) cada uma em `ScrollPane` (altura = viewport menos cabeçalho e rodapé); abaixo de 1100 px empilha (como `index.html` do pacote). Coluna esquerda: acordeões **"Cenário e tarefas"**, **"Orientações do Ator/Atriz"** (texto do pacote novo; hoje "Roteiro do ator"), **"Impressos"** (só os **liberáveis**, `x/y`), **"Anotações"** (rascunho só no aparelho), **"Materiais"** (só "Resumo sobre o tema" quando `summary` existe; senão o acordeão nem aparece) e **"Feedback"** (a mensagem "Registre observações sobre a atuação e revise o feedback após a finalização da estação."). Coluna direita: `PepTable` (soma e cabeçalho fixo já existem). **Sem** "TutorIA", sem "Liberar" do PEP, sem "Abrir chamada externa".
- Candidato: coluna da folha + cartão "Impressos" (só os liberáveis; liberado abre/fecha com "Abrir/Fechar"; ainda não liberado "Impresso {n} · Aguardando liberação"; `canHide` na imagem).
- Avaliador vê "Impresso {display} · no documento oficial: Impresso {source}" quando diferem.

- [ ] **Step 1: Write the failing tests**
```ts
it("candidato: cabeçalho 'Estação em andamento', folha com cenário, tarefas e relato inicial, e nenhum texto do nome da estação em toda a tela", …)
it("candidato: relato inicial visível sem liberação e fora da lista 'Impressos' e da contagem", …)
it("candidato: impresso liberado abre e fecha; não liberado mostra 'Impresso 1 · Aguardando liberação' (número da tela, não o da prova)", …)
it("candidato: esconder e mostrar o cronômetro não muda a contagem e vale só para a aba (sessionStorage)", …)
it("avaliador: nome da estação no cabeçalho; 2 colunas com região de rolagem cada; sem TutorIA, sem Liberar do PEP, sem chamada externa", …)
it("avaliador: 'Impresso 1 · … no documento oficial: Impresso 2' e relato fora da lista de liberação", …)
it("avaliador: Materiais só aparece com summary; sem summary o acordeão não existe", …)
it("sem a folha em imagem, o texto completo é a folha", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSalaFases.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSalaFases.test.tsx src/__tests__/duplaComponentesEstacao --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: sala em andamento com folha do candidato, duas colunas e cabecalho do pacote".

### Tarefa P5: Menu recolhido na sala
**Paralela com:** qualquer tarefa da Etapa P.

**Files:**
- Modify: `src/novo/app/Shell.jsx`, `src/novo/app/App.jsx` (só se preciso), `src/__tests__/duplaRotas.test.tsx`

**Interfaces:** ao entrar em `dupla-sala` o menu lateral (`Rail`) abre **recolhido** (76 px) e o botão de recolher/expandir do app continua funcionando; ao sair da sala volta à preferência anterior da pessoa. Sem coluna nova nem perfil novo (estado em memória). A sala continua sem cabeçalho (`bare`) e sem barra de atalhos.

- [ ] **Step 1: Write the failing tests**
```ts
it("na sala o menu abre recolhido; o botão expande; ao sair volta como estava", …)
it("fora da sala a preferência de menu não muda", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaRotas.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** o mesmo — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: menu recolhido na sala".

### Tarefa P6: Conferência da Etapa P — vazamento do tema, trava do "Estudar junto" e relatório
**Depois de:** todas as tarefas da Etapa P.

**Files:**
- Create: `src/__tests__/duplaTemaReservado.test.tsx`
- Modify: `src/__tests__/duplaMatchTela.test.tsx` (um teste novo da trava), `docs/architecture/TREINO_EM_DUPLA.md` (se já existir; senão só o relatório)

- [ ] **Step 1: Write the failing tests**
```ts
// duplaTemaReservado (banco local PGlite + telas)
it("candidato em cada fase (roles, connecting, setup, running, review): nenhuma resposta e nenhum texto de tela contém o nome, o topic ou o summary da estação", …)
it("depois de inverter (rodada 2) quem agora é candidato também não recebe o nome da nova estação", …)
it("no resultado o candidato recebe o nome", …)
// duplaMatchTela
it("Estudar junto repetido no mesmo cartão (clique duplo, tecla repetida) escolhe uma pessoa só", …) // R15 do pacote
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaTemaReservado.test.tsx src/__tests__/duplaMatchTela.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL (pelo menos o do vazamento, se algo escapou).
- [ ] **Step 3: Implement** só o que faltar (corrigir o vazamento achado, nada mais).
- [ ] **Step 4: Run** a suíte completa da Etapa e o typecheck filtrado, como nas Global Constraints do plano de 09/10 (`vitest-etapa-P.json` com a conferência de arquivos; `FILA npx tsc --noEmit | grep -E "^(src/novo|server/dupla|server/devDb|scripts/dupla|src/shared/checklistBank|src/__tests__/(dupla|helpers/dupla|supabaseSchema|checklistBank))"` — Expected: nenhuma linha).
- [ ] **Step 5: Commit** "Treino em dupla: teste do tema reservado e da trava do Estudar junto".

#### Fim da Etapa P
- [ ] Relatório ao dono: arquivos e migração **9900**; como testar (servidor local seguro; `npm run dupla:sala-teste -- --fase running` nos dois papéis; conferir lado a lado com `candidato-ocultar-cronometro.png` e `rodape-estacao-atualizado.png` do pacote **sem copiá-los**: candidato sem o nome, relato visível, "Impresso 1 · Aguardando liberação", avaliador com 2 colunas e rolagem própria); resultado da comparação dos 26 PDFs (P1); `TODO(dono)`: chave `candidate_sheet` e os 3 campos do impresso com a Montagem.

**PARE: confirmação do dono.** O dono confirma a sala como no pacote novo (e responde D2, D4 e D8 se ainda não respondeu).

---

## Etapa 5 — Sala em tempo real (revisada)

### Tarefa 14: Migração 9910 — ações da sala, cronômetro, marcações, finalização e rota da imagem do impresso
**Paralela com:** Tarefa 15. **Depois de:** Etapa P.

**Files:** os da Tarefa 14 do plano de 09/10, com `supabase/migrations/20261003009910_treino_dupla_sala.sql` no lugar da `…006800…`
(e `src/__tests__/duplaSalaBanco.test.ts`, `src/__tests__/duplaImpressoRota.test.ts`, `server/dupla/router.ts`, `server.ts`, `helpers/duplaDb.ts`).

**Interfaces:** **todas as funções e a rota da Tarefa 14 antiga, iguais**, com estas mudanças:
- **Sai `app_dupla_set_link`** (e a regex do link). A coluna `call_link` fica; `app_dupla_leave` e o fechamento já a limpam. *(Passo opcional, só se o dono responder D3(b): a função volta como estava no plano de 09/10.)*
- `app_dupla_set_station(p_room_id, p_station_id)`: só em `roles`, **só o avaliador da sala** (`'Só o avaliador escolhe a estação.'`) e só com papéis definidos (`'Definam os papéis antes de escolher a estação.'`); o resto igual (aprovada, Pro-only só com os dois Pro, `duration_ms`, zera confirmações).
- `app_dupla_release(p_room_id, p_pressing_id, p_released)`: só impresso **liberável**; impresso `initially_visible` → `'Este impresso já está visível desde o início.'`; só em `running`.
- `app_dupla_start`: igual, **sem** exigência de link; "Os dois precisam estar prontos."
- `app_dupla_finalize`: `pressings_released` = só os liberados pelo avaliador (os iniciais não contam como "liberados").
- `app_dupla_print_path(p_room_id, p_pressing_id)`: aceita também o id especial `candidate_sheet` (caminho de `pressing_assets.candidate_sheet`, `null` se não houver); candidato: só em `running` e só para impresso inicial ou liberado, e para a folha; avaliador: `setup|running|review`. A resposta e a rota **nunca** devolvem ao candidato nada além do caminho assinado (nome de arquivo sem o tema: o caminho vem de `station_assets`, não do nome da estação). Rota: o regex do id continua `^[A-Za-z0-9_-]{1,80}$`.

- [ ] **Step 1: Write the failing tests** (os da Tarefa 14 antiga, ajustados, mais os novos)
```ts
it("papéis, estação, conexão, prontidão, cronômetro, pausa, ±1 min, marcações, finalizar (3,75 de 10; 37,5%) e finalizar duas vezes", …) // como no plano de 09/10
it("estação: só o avaliador escolhe, só depois dos papéis; o candidato recebe 'Só o avaliador escolhe a estação.'", …)
it("não existe app_dupla_set_link", …)
it("liberar: impresso inicial recusa com a mensagem; liberável só em running; o candidato passa a receber só o liberado", …)
it("caminho da imagem: folha do candidato e impresso inicial só em running para o candidato; avaliador vê em setup, running e review; sem station_assets → null", …)
it("nenhuma resposta ao candidato contém o nome da estação ou o caminho com o nome", …) // Review Focus 6
it("quem não é membro ou está sem acesso não age", …)
// duplaImpressoRota (como no plano de 09/10): sem token 401; ids inválidos 400; sem imagem 404; recusa do banco 403; link assinado de 600 s; desenvolvimento: link nulo e /file sem cache
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSalaBanco.test.ts src/__tests__/duplaImpressoRota.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração, a rota e a montagem em `server.ts` (logo depois de `/api/lessons`).
- [ ] **Step 4: Run** os dois + `duplaMatchBanco.test.ts duplaPacoteBanco.test.ts lessonsRoutes.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9910 com acoes da sala e rota da imagem do impresso".

### Tarefa 15: Estado da sala ao vivo e relógio do servidor
**Paralela com:** Tarefa 14.
**Sem mudança** em relação à Tarefa 15 do plano de 09/10 (`clock.js`, `useRoomState`, `subscribeRoom`, testes `duplaRelogio` e
`duplaSalaAoVivo`). Executar como está e usar o mesmo commit: "Treino em dupla: estado da sala ao vivo e relogio do servidor".

### Tarefa 16: Sala ao vivo (1) — papéis, conexão e preparação (sem link; sala do avaliador)
**Depois de:** Tarefas 14 e 15.

**Files:**
- Modify: `src/novo/app/dupla/room/{useRoom.js,RoomScreen.jsx,RolesPhase.jsx,ConnectingPhase.jsx,SetupPhase.jsx,ClosedPhase.jsx,StationPicker.jsx}`
- Create: `src/__tests__/duplaSalaPreparo.test.tsx`

**Interfaces:**
- `useRoom` usa `useRoomState`; `actions` implementadas: `chooseRole`, `drawRoles`, `setStation` (só avaliador), `confirmRoles`, `connected`, `setReady`, `setDuration`, `leave` — cada uma troca o estado pelo devolvido e mostra `messageOf(err)` no aviso. **Não há** `setLink`.
- Comportamento: `RoomScreen` com `useHeartbeat("em_estacao", roomId, live ? 45000 : 10000)` e `installAudioWake()`; papéis, "Sortear", Escolher/Trocar estação (só avaliador) e "Confirmar papéis e conectar"; conexão com as 5 etapas por eventos reais (estação no estado; acesso por `useSession().dupla?.permitido` ou equipe; conteúdo do meu papel recebido; `channelReady`; `partnerPresent`) e `connected()` uma vez só; preparação: só prontidão ("Estou pronto para iniciar" / "Cancelar") e a faixa final (Tarefa P4a); "Abrir sala do avaliador" liga o estado local; **o candidato permanece na preparação e passa sozinho à sala quando `room.phase` vira `running`**, mesmo se a aba estava escondida (ao voltar, já está em `running` com o tempo certo); "Sair da sala" com `Dialog` "Sair da sala?"/"Encerrar treino?", "O treino termina para os dois.", "Voltar" e o botão → `leave` e `go("dupla")`.
- **Passo opcional (só com D3(b)):** campo de link, copiar e "Abrir chamada" como no plano de 09/10; não fazer sem a resposta.

- [ ] **Step 1: Write the failing tests**
```ts
it("papéis: escolher, sortear, trocar estação (só o avaliador) e confirmar chamam as funções; 'Aguardando Bruno Lima confirmar os papéis'", …)
it("conexão: etapas andam com os eventos, connected é chamado uma vez e aparece 'Sala pronta' com 100%", …)
it("conexão sem o parceiro: Sair da sala com confirmação", …) // Review Focus 4
it("preparação: só prontidão; sem link e sem leitura prévia; dois prontos liberam 'Abrir sala do avaliador' só para o avaliador", …)
it("candidato espera e entra sozinho quando a fase vira running (inclusive aba escondida e reconexão)", …) // Review Focus 8
it("sair: confirmação e volta ao Praticar; o parceiro vê 'Treino encerrado por Ana Souza.'", …)
it("sinal na sala a cada 10 s no banco local e 45 s com tempo real", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSalaPreparo.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** as ações e as três fases.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSalaPreparo.test.tsx src/__tests__/duplaSalaFases.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: sala ao vivo nos papeis, conexao e preparacao (sem link, com sala do avaliador)".

### Tarefa 17a: Sala do avaliador — rodapé, cronômetro, apito e início
**Depois de:** Tarefa 16.

**Files:**
- Create: `src/novo/app/dupla/room/EvaluatorFooter.jsx`, `src/__tests__/duplaSalaRodape.test.tsx`
- Modify: `src/novo/app/dupla/room/{useRoom.js,RoomScreen.jsx,RunningPhase.jsx,SetupPhase.jsx}`

**Interfaces:**
- Consumes: Tarefas 14, 15 e 16; `remainingMs`, `formatClock`, `useRoomState`; `playWhistle` (Tarefa 13).
- Produces: `actions` `start`, `pause`, `resume`, `adjust`, `finish`. `EvaluatorFooter({ room, remainingMs, actions, started })`: barra **fixa embaixo**, alinhada à direita do menu recolhido (largura vinda do `Shell`, não 104 px fixos), com "Cronômetro" + o tempo (`mm:ss`, de `remainingMs`; antes do início, a duração escolhida) + botão com seta que abre **"Ajustar tempo"** (como `Room.jsx:205-250`): antes de iniciar **−/+ 30 s** (mínimo 60 s, máximo a duração oficial) e "Desafio de tempo" (Oficial, −1 min, −2 min, −3 min) → `setDuration`; depois de iniciar **−/+ 1 min** (nunca abaixo de 30 s) → `adjust`, com os avisos "Tempo reduzido em 1 minuto"/"1 minuto adicionado". O painel fecha com Esc, clique fora e o botão Fechar, e **devolve o foco**. Antes do início: botão **"Iniciar estação"** (desligado se os dois não estão prontos) → `start`. Depois: "Pausar/Retomar" e **"Finalizar estação"** → `finish`; ícones com `aria-label` "Sair da sala" (com o `Dialog` da 16). **Sem** "Sinalizar problema" (D10).
- Cabeçalho: selo "Aguardando início" / "Em andamento" / "Pausada" / "Tempo esgotado" (verde/âmbar/vermelho como o selo de hoje). O cronômetro do **candidato** só aparece depois do início (P4b) e vem do mesmo `remainingMs`.
- Apito: `playWhistle()` ao ver a fase passar a `running` e uma vez por rodada ao chegar a 0 (volta a armar se o restante passar de 0 de novo; recarregar no meio não apita) — como a Tarefa 17 antiga.
- Liberar impresso e marcar PEP antes de iniciar: botões **desligados** com a dica "Disponível depois de iniciar a estação." (decisão do plano).

- [ ] **Step 1: Write the failing tests**
```ts
it("antes de iniciar: 'Aguardando início', duração escolhida, −/+ 30 s com mínimo 1 min e máximo oficial, Desafio de tempo e Iniciar desligado sem os dois prontos", …)
it("Iniciar chama start uma vez; depois: cronômetro do servidor '09:59', Pausar congela, Retomar volta, selos", …)
it("−/+ 1 min só no painel Ajustar tempo, com os avisos e piso de 30 s; escondido em 00:00", …)
it("o painel fecha com Esc, clique fora e Fechar, e devolve o foco ao botão", …)
it("liberar e marcar antes do início: desligados com a dica", …)
it("apito ao começar e uma vez no 00:00; recarregar no meio não apita de novo", …)
it("avaliador em duas abas: o início de uma aparece na outra e nada se duplica", …) // Review Focus 9
it("o rodapé respeita a largura do menu recolhido e não cobre o PEP (altura da coluna desconta o rodapé)", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSalaRodape.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSalaRodape.test.tsx src/__tests__/duplaSalaPreparo.test.tsx src/__tests__/duplaSalaFases.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: sala do avaliador com rodape, cronometro, ajuste de tempo e apito".

### Tarefa 17b: Impressos, folha do candidato e PEP ao vivo
**Depois de:** Tarefa 17a.

**Files:**
- Create: `src/novo/app/dupla/printsApi.js`, `src/__tests__/duplaSalaEstacao.test.tsx`
- Modify: `src/novo/app/dupla/room/{useRoom.js,RunningPhase.jsx,CandidateSheet.jsx}`

**Interfaces:**
- `export async function printUrl(backend, roomId: string, pressingId: string): Promise<string|null>` (link assinado; no local, `/file` com o token, como `src/novo/app/study/lessonsApi.js:54-60`); `pressingId` aceita `"candidate_sheet"`.
- `actions` `release`, `mark`, `flushMarks`, `printUrl`. `mark` agrupa 300 ms por item; `flushMarks()` envia na hora antes de `finish`/`finalize`, em `pagehide` e com a aba escondida.
- Comportamento: avaliador libera/oculta (`release`) só os **liberáveis**; o candidato relê o conteúdo quando `released_pressings` muda; o relato inicial e a folha em imagem usam `printUrl`; imagem com `PrintImage` (`canHide` para o candidato); `PepTable` com `onMark` e subitens; anotações em `localStorage` `smn-dupla-notas:<sala>:<rodada>`.

- [ ] **Step 1: Write the failing tests**
```ts
it("impressos: liberar chama a função; o candidato vê só o liberado e abre, fecha, amplia (−/+) e oculta a imagem; Esc fecha", …)
it("relato inicial aparece sem liberar, continua depois de recarregar e nunca entra em x/y", …) // Review Focus 7
it("folha do candidato em imagem usa a rota; sem imagem usa o texto completo", …)
it("PEP: a marcação vai 300 ms depois do último toque, uma vez por item", …)
it("marcação pendente é enviada antes de Finalizar estação e de Finalizar e liberar resultado", …) // Review Focus 1
it("nenhuma resposta recebida pelo candidato traz actor_script, checklist_items, source_number ou o nome da estação", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSalaEstacao.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSalaEstacao.test.tsx src/__tests__/duplaSalaRodape.test.tsx src/__tests__/duplaSalaFases.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: impressos, folha do candidato e PEP ao vivo".

### Tarefa 17c: Conferência, finalização e queda
**Depois de:** Tarefa 17b.

**Files:**
- Modify: `src/novo/app/dupla/room/{useRoom.js,RoomScreen.jsx,ReviewPhase.jsx}`; Create: `src/__tests__/duplaSalaConferencia.test.tsx`

**Interfaces:** `actions` `finalize`; comportamento igual ao da Tarefa 17 antiga para conferência (botões da lista → `mark`, filtro Todos/Pendentes, feedback com rascunho em `localStorage` `smn-dupla-feedback:<sala>:<rodada>` apagado depois de finalizar, `Dialog` "Finalizar avaliação?" com a contagem de pendentes → `finalize`) e queda (parceiro ausente por mais de 30 s → "Reconectando…" até voltar, sem reiniciar nada); candidato em `review`: "Aguardando avaliação" e "Sair da sala" (**sem** "Finalizar estação", D8).

- [ ] **Step 1: Write the failing tests**
```ts
it("conferência: filtro Pendentes, aviso de pendentes, confirmação com a contagem e finalize com o feedback", …)
it("feedback e anotações sobrevivem ao recarregar e somem depois de finalizar", …) // Review Focus 5
it("avaliador some: 'Reconectando…' depois de 30 s e o candidato pode sair", …) // Review Focus 4
it("candidato em review: 'Aguardando avaliação', Sair da sala e nenhum botão de finalizar", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaSalaConferencia.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `FILA npx vitest run src/__tests__/duplaSalaConferencia.test.tsx src/__tests__/duplaSalaEstacao.test.tsx src/__tests__/duplaSalaRodape.test.tsx src/__tests__/duplaSalaPreparo.test.tsx src/__tests__/duplaSalaFases.test.tsx --pool=threads --maxWorkers=1` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: conferencia, finalizacao e queda na sala ao vivo".

#### Fim da Etapa 5
- [ ] Typecheck filtrado e suíte completa (como nas Global Constraints do plano de 09/10; incluir `scripts/dupla` e `src/shared/checklistBank` no filtro) — Expected: nenhuma linha; todos passam.
- [ ] Relatório ao dono: arquivos e migração **9910**; como testar: servidor local seguro e duas janelas (`npm run dupla:sala-teste -- --fase roles`) fazendo uma rodada inteira (papéis → só o avaliador escolhe a estação → prontidão → **"Abrir sala do avaliador"** → ajustar tempo → "Iniciar estação" → o candidato entra sozinho → esconder o cronômetro do candidato → liberar o esfregaço → marcar PEP → "Finalizar estação" → conferência → resultado); recarregar no meio; fechar uma janela por 40 s; somar à mão o PEP; repetir no celular; `TODO(dono)`: chave de `pressing_assets`/`candidate_sheet` com a Montagem.

**PARE: confirmação do dono.** O dono confirma a rodada completa nos dois papéis, também no celular.

---

## Etapa 6 — Resultado, histórico e notas

### Tarefa 18: Migração 9920 e Resultado — revisão da nota, inverter papéis, encerrar e uso do mês
**Files:** os da Tarefa 18 do plano de 09/10, com `supabase/migrations/20261003009920_treino_dupla_resultado.sql` no lugar da `…006900…`.
**Interfaces:** **iguais** às da Tarefa 18 antiga (`app_dupla_request_review`, `app_dupla_redo_review`, `app_dupla_swap`, `app_admin_dupla_usage`, `actions.requestReview/redoReview/swap`, tela de resultado, "Uso do mês"), com estes ajustes:
- `app_dupla_swap`: a estação **não** troca sozinha; na rodada seguinte o **novo avaliador** pode "Trocar estação" (regra da Tarefa 14); os impressos liberados e a folha zeram; `initially_visible` segue sempre visível.
- O resultado mostra o **nome da estação ao candidato** (o tema deixa de ser reservado quando a rodada chega a `result`).
- "Impressos por rodada" do painel conta só os **liberáveis** liberados (`pressings_released`).
- Testes: os da Tarefa 18 antiga + "o candidato só recebe o nome da estação no resultado" e "depois de inverter, o novo candidato volta a não receber o nome da estação da rodada 2" (Review Focus 6).
- Commit: "Treino em dupla: migracao 9920, resultado, revisao da nota, inverter papeis e uso do mes".

#### Fim da Etapa 6
- [ ] Typecheck filtrado e suíte completa — Expected: nenhuma linha; todos passam.
- [ ] Relatório ao dono: arquivos e migração 9920; como testar: duas rodadas com inversão; pedir e fazer a revisão; conferir "Sua última nota" no cartão da estação e "Uso do mês" em Administração › Configurações.

**PARE: confirmação do dono.** O dono confirma números e textos do resultado.

---

## Etapa 7 — Celular, acessibilidade e testes

### Tarefa 19: Celular e acessibilidade (com os pontos de quebra do pacote)
**Files:** os da Tarefa 19 antiga (`src/novo/app/dupla/dupla.css`, `announce.js`, `duplaAcessibilidade.test.tsx`, `osce.css`, `MatchCard.jsx` e telas).
**Interfaces e comportamento:** os da Tarefa 19 antiga, **mais** o que o pacote novo fixou em `index.html`:
- até **1100 px**: a sala do avaliador empilha as colunas (largura máxima 860 px), a altura das colunas deixa de ser fixa e a rolagem do PEP passa a `max-height: calc(100vh - 300px)`;
- até **900 px**: o rodapé do avaliador ocupa a largura toda (sem o recuo do menu) e as margens são de 16 px;
- até **480 px**: o rodapé quebra em duas linhas (ações à direita, ícones de sinalizar/sair à esquerda; sem os rótulos "Cronômetro" e do modo) e os botões ghost da barra só com ícone (com `aria-label`);
- toda coluna rolável é região com nome e alcançável por teclado (`ScrollPane`); o painel "Ajustar tempo" cabe na tela (`max-height: calc(100dvh - 112px)`);
- anúncios (leitor de tela), uma vez cada por rodada: "Faltam 2 minutos.", "Faltam 30 segundos.", "Tempo esgotado.", "Impresso {n} liberado: {nome}." (candidato, com o `display_number`) e **"A estação começou."** (candidato, ao entrar em `running`).
- Testes e comandos: os da Tarefa 19 antiga, mais "painel Ajustar tempo cabe em 480 px", "colunas empilham em 1100 px", "'A estação começou.' anunciado uma vez".
- Commit: "Treino em dupla: celular e acessibilidade (sala do avaliador e do candidato)".

### Tarefa 20: Ponta a ponta, documentação e conferência final do módulo de dupla
**Depois de:** Tarefa 19.

**Files:** `scripts/e2e/dupla.mjs`, `docs/architecture/TREINO_EM_DUPLA.md`; fora do repositório: `~/Downloads/StaziaMed-Treino-em-Dupla-SQL-9750-a-9920.sql`.

**Interfaces:** como na Tarefa 20 antiga, com estes passos **no lugar** dos do link: perfis → "Estudar junto" cruzado → "Deu match!" → os dois na sala → papéis → **o avaliador escolhe a estação** → confirmar → conexão → prontidão dos dois → **"Abrir sala do avaliador"** → ajustar para −1 min → "Iniciar estação" → **o candidato entra sozinho** e vê o relato sem liberar e "Impresso 1 · Aguardando liberação" → cronômetros iguais (±1 s) → o candidato esconde o cronômetro → o avaliador libera o esfregaço e o candidato vê → o avaliador marca 3 itens e "Finalizar estação" → candidato em "Aguardando avaliação" → feedback e "Finalizar e liberar resultado" → "x,xx / 10,00" e o **nome** da estação aparece só agora → "Treinar novamente — Inverter papéis" → rodada 2 com recarga no meio → "Encerrar treino" → o parceiro vê "Treino encerrado por …". O script guarda as respostas de `/api/dev-db/rpc` do contexto do candidato e **falha** se alguma anterior ao resultado trouxer `actor_script`, `checklist_items`, `source_number`, o texto de impresso não liberado **ou o nome/tópico/resumo da estação**.
- SQL para o dono: juntar **seis** migrações na ordem **9750, 9760, 9770, 9900, 9910, 9920**, cada uma precedida de `-- Etapa N — <arquivo>`; `grep -c "^-- Etapa" <arquivo>` = 6. Cuidado: se o dono já tiver colado 9750 a 9770 (confirmar com ele), mandar só as novas; **não** colar duas vezes sem conferir (as migrações são idempotentes, mas conferir o painel antes). Depois de colar, **sondar de fora** se entrou inteiro (regra `conferir-sql-colado`).
- Doc `docs/architecture/TREINO_EM_DUPLA.md`: visão, rotas, tabelas e quem vê o quê (incluindo "o candidato não recebe o tema"), funções por migração, tempo real, acesso por plano, custos (o quadro do plano de 09/10 continua valendo: **sem IA**), como testar, publicação por etapa, pendências (`TODO(dono)`: `pressing_assets`/`candidate_sheet`, D2, D3, D5, D9, D10).
- Commit: "Treino em dupla: ponta a ponta, documentacao e conferencia final do modulo de dupla".

#### Fim da Etapa 7
- [ ] Relatório ao dono: arquivos, resultado do ponta a ponta, caminho do SQL em Downloads, como testar no celular real (iOS e Android) e com leitor de tela, passos da publicação (§13 da spec de 09/10) e pendências.

**PARE: confirmação do dono.** O dono confirma o **módulo de dupla** pronto para publicar. As etapas C, V e Q abaixo **não** fazem parte dessa publicação.

---

## Etapa C — Chat entre os dois do match (ENTRA JÁ, depois da Etapa 7)
**Pré-requisito:** Etapa 7 confirmada. **Decisão D6 só trava a moderação de pessoa (C4), não o chat.**

### Tarefa C1: Migração 9930 — conversas, mensagens, filtro e limites no servidor
**Files:**
- Create: `supabase/migrations/20261003009930_treino_dupla_chat.sql`, `src/__tests__/duplaChatBanco.test.ts`
- Modify: `src/__tests__/helpers/duplaDb.ts`, `src/__tests__/duplaMigracaoDados.test.ts` (a exportação de dados ganha a chave do chat)

**Interfaces:**
- Tabela `study_messages` (`id uuid pk`, `match_id uuid not null references study_matches on delete cascade`, `sender_id uuid references auth.users on delete set null`, `body text not null check (char_length(btrim(body)) between 1 and 600)`, `created_at timestamptz not null default now()`; índice `(match_id, created_at)`); **RLS ligada**, leitura só para `user_a` e `user_b` do match, **nenhuma gravação direta**; entra na publicação do Realtime. A conversa **é** o `study_matches` (um par = uma conversa); não há tabela de conversa nova.
- `app_dupla_chats() returns jsonb` → conversas do par com `{ match_id, partner: { user_id, public_name }, last: { body, created_at, mine } , room_id }`; `app_dupla_chat_messages(p_match_id uuid, p_since timestamptz default null)`; `app_dupla_chat_send(p_match_id uuid, p_text text)` → mensagem gravada. Todas: `dupla_assert_access`, membro (`'Faça um match antes de iniciar a conversa.'` quando o par não tem match), `revoke … from public, anon`.
- `dupla_chat_check(p_text text) returns text` (motivo ou `null`): vazio → "Escreva uma mensagem para combinar o treino."; mais de 600 → "Use até 600 caracteres por mensagem."; palavra bloqueada (normaliza acento, caixa e troca `0 1 3 4 5 7 @ $` por letras; tolera pontuação entre as letras; plural com `s`) → "Essa mensagem contém uma palavra não permitida. Reformule com respeito e mantenha o foco no treino."; link, e-mail, telefone (10 ou mais dígitos) → "Combine o treino por aqui, sem links ou contatos externos."; divulgação → "Este chat é exclusivo para estudo. Não envie divulgação ou convites fora desse objetivo." (**textos e regras do pacote**, `study-social.js:25-40`). Limite de frequência por conversa e pessoa: padrão **5 mensagens em 30 s** → "Você enviou várias mensagens seguidas. Aguarde alguns segundos para continuar.". Lista de palavras e limites em `app_settings` chave `treino_dupla_chat` (`{"palavras":[…9 do pacote…],"max":600,"rajada":5,"janela_s":30}`), editável só por administrador; **a checagem de chaves de `app_settings` é refeita com a união de todas as que existirem + `treino_dupla` + `treino_dupla_chat`**. Mensagem bloqueada **não é gravada**.
- Conta excluída: `sender_id` vira nulo e a tela escreve "Conta excluída"; `app_export_my_data` inclui as **minhas** mensagens; excluir a conta não apaga as do parceiro.
- Enviar mensagem e reabrir a conversa **não** consomem match nem cota (regra firme do pacote).

- [ ] **Step 1: Write the failing tests** (reescrevem em SQL os 14 testes do pacote, `study-social.test.cjs`, que valem para o chat)
```ts
it("só os dois do match leem e escrevem; terceiro, equipe de fora, revisor e visitante não, pela função e direto na tabela", …) // Review Focus 10
it("sem match não há conversa: 'Faça um match antes de iniciar a conversa.'", …)
it("filtro: acentos, caixa, pontuação no meio e troca por números são pegos; termos clínicos e horários não são bloqueados por trecho de palavra", …)
it("bloqueia link, e-mail, telefone, divulgação, vazio e acima de 600", …)
it("mensagem bloqueada não é gravada; 6ª mensagem em 30 s é recusada", …)
it("lista e limites vêm de app_settings; só administrador edita; a união das chaves vale", …)
it("exportação de dados traz as minhas mensagens; excluir a conta deixa as do parceiro como 'Conta excluída'", …)
it("colar duas vezes dá o mesmo banco", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaChatBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement** a migração.
- [ ] **Step 4: Run** o mesmo + `duplaMigracaoDados.test.ts supabaseSchema.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9930 com chat entre os dois do match, filtro e limites no servidor".

### Tarefa C2: Tela do chat, botão "Enviar mensagem" no "Deu match!" e lista de conversas
**Depois de:** Tarefa C1.

**Files:**
- Create: `src/novo/app/dupla/chat/{ChatDialog,ChatList}.jsx`, `src/novo/app/dupla/chat/useChat.js`, `src/__tests__/duplaChatTela.test.tsx`
- Modify: `src/novo/app/dupla/{MatchModal,PracticeScreen}.jsx`, `src/novo/data/{backend,supabaseBackend,devServerBackend,localBackend}.ts`, `src/__tests__/duplaMatchTela.test.tsx` (linha 485 deixa de exigir a ausência de "Enviar mensagem")

**Interfaces:** `Backend` ganha `chats()`, `chatMessages(matchId, since?)`, `chatSend(matchId, text)` e o método opcional `subscribeChat(matchId, userId, h)` (canal privado `chat:{matchId}`, `postgres_changes` INSERT em `study_messages` com `match_id=eq.{id}`, política em `realtime.messages` só para os dois; sem ele, consulta a cada 5 s). `ChatDialog` usa o `Dialog` do DS com os textos do pacote (spec §3.1): cabeçalho "CHAT DE ESTUDO" + nome, botão **"Abrir sala"** (vai à sala do match sem consumir cota), faixa "Um espaço para treinar juntos. Sem ofensas, divulgação ou contatos externos.", estado vazio, campo "Mensagem para {nome}" com contador x/600, envio desligado quando vazio; motivo do bloqueio mostrado ao lado do campo; texto sempre como texto. `MatchModal` volta a ter **"Enviar mensagem"** (abaixo de "Abrir sala agora", acima de "Continuar buscando"; **sem** "Agendar sessão"). Botão **"Conversas"** no cabeçalho do Praticar abre `ChatList` ("Conversas de estudo"; vazio: "Suas conversas aparecem aqui depois do match. Use o chat para combinar estações, horários e papéis.").

- [ ] **Step 1: Write the failing tests**
```ts
it("Deu match!: 'Enviar mensagem' abre a conversa daquele par; 'Continuar buscando' e 'Abrir sala agora' seguem como antes; sem 'Agendar sessão'", …)
it("enviar: grava, mostra, e a mensagem bloqueada mostra o motivo do servidor e não aparece na lista", …)
it("contador 0/600, envio desligado vazio e texto com < > & aparece como texto", …)
it("lista de conversas e 'Abrir sala' sem consumir match", …)
it("banco local consulta a cada 5 s; com tempo real usa o canal chat:{id} e fecha ao sair", …)
```
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaChatTela.test.tsx src/__tests__/duplaMatchTela.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** os mesmos + `duplaPraticarTela.test.tsx duplaTempoReal.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: chat entre os dois do match na tela do Praticar".

### Tarefa C3: Conferência da Etapa C
**Depois de:** Tarefa C2.
- [ ] Suíte completa e typecheck filtrado (incluir `src/novo/app/dupla/chat`) — Expected: nenhuma linha; todos passam.
- [ ] Teste ponta a ponta no `scripts/e2e/dupla.mjs`: A manda mensagem, B recebe; mensagem bloqueada não chega; terceiro não lê.
- [ ] Relatório ao dono: arquivos e migração **9930**; como testar com duas janelas; **pendências**: D6 (denúncia, bloqueio, guarda das mensagens, leitura pela equipe, parágrafo da Política de Privacidade). **A moderação de pessoa (C4: `study_blocks` e `study_reports` com fila na Administração) só começa depois da resposta ao D6.**

**PARE: confirmação do dono.**

---

## Etapa V — Convite direto e convite rápido (SÓ DEPOIS DE D11 e junto com o adendo do radar)
**Pré-requisito:** D11 respondida; combinar com o adendo `2026-10-12-treino-dupla-sozinho-e-radar.md` (lista de quem está online) para **não construir duas vezes**.

### Tarefa V1: Migração 9940 — `app_dupla_invite` e o campo "permitir convites diretos"
**Files:** Create `supabase/migrations/20261003009940_treino_dupla_convite_direto.sql`, `src/__tests__/duplaConviteDiretoBanco.test.ts`; Modify `src/__tests__/helpers/duplaDb.ts`.
**Interfaces:** `study_profiles.allow_direct_invites boolean not null default true` (nome e padrão a confirmar em D11); `app_dupla_save_profile` e `app_dupla_profile` refeitas (base: 9760) com o campo; `app_dupla_invite(p_to uuid, p_station_id text default null) returns jsonb`: trava o par (`pg_advisory_xact_lock`), `dupla_sweep`, exige: eu e a pessoa com acesso, ela **online** (sinal < 2 min, não "fora"), `radar_visible` e `allow_direct_invites`, **nenhum dos dois em sala aberta**, sem convite pendente entre os dois; cria `study_matches` + `checklist_rooms` (fase `roles`, rodada 1, estação opcional como na `app_dupla_swipe`) + `study_invites` (60 s); a pessoa responde por `app_dupla_answer_invite` (aceita → sala; recusa/vence → fecha). Reaproveita 100% do convite da Etapa 4; **não** conta como "Estudar junto" cruzado. Gancho da cota (Etapa Q): `perform public.dupla_quota_charge(…)` só quando existir.
- [ ] **Step 1: Write the failing tests** — `it("convida quem está online, visível e aceita convites; recusa quem está invisível, offline, em sala, sem acesso ou consigo mesmo")`, `it("convite pendente duplicado é recusado")`, `it("aceitar abre a sala; recusar e vencer fecham")`, `it("pular não consome e convite recusado não cria match")`, `it("colar duas vezes dá o mesmo banco")`.
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaConviteDiretoBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL.
- [ ] **Step 3: Implement**. **Step 4: Run** o mesmo + `duplaMatchBanco.test.ts duplaTelasBanco.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** "Treino em dupla: migracao 9940 com convite direto".

### Tarefa V2: "Convidar" e "Convite rápido" na tela
**Depois de:** Tarefa V1 e do adendo do radar.
**Files:** Modify `src/novo/app/dupla/PracticeScreen.jsx` (e a lista de quem está online que o adendo criar), `src/novo/data/*Backend.ts`, `src/novo/app/dupla/StudyProfileScreen.jsx` (interruptor "Permitir convites diretos"), `src/__tests__/duplaMatchTela.test.tsx`, `duplaPerfilTela.test.tsx`.
**Comportamento:** "Convidar" (na lista de online) e o botão **"Convite rápido"** (entre "Pular" e "Estudar junto"; envia o convite direto à pessoa do cartão de cima, sem arrastar) chamam `app_dupla_invite`; o convidado vê o mesmo "Deu match!" por convite (Etapa 4). Botões desligados enquanto há convite em andamento (trava do pacote, `Match.jsx:131-160`).
- [ ] **Step 1: Write the failing tests**, **Step 2: Run** `FILA npx vitest run src/__tests__/duplaMatchTela.test.tsx src/__tests__/duplaPerfilTela.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL; **Step 3: Implement**; **Step 4: Run** os mesmos — Expected: PASS; **Step 5: Commit** "Treino em dupla: convidar e convite rapido na tela".
**PARE: confirmação do dono.**

---

## Etapa Q — Cota de matches por pacote (SÓ DEPOIS DE D7; ligada por chave, desligada por padrão)

> **Nota de 2026-10-12 (noite): esta Etapa Q está SUBSTITUÍDA** pelo livro de créditos único da frente "Stazia Match" (`docs/superpowers/specs/2026-10-12-stazia-match-engenharia.md` e `docs/superpowers/plans/2026-10-12-stazia-match-engenharia.md`, Etapas M1 a M4, migrações 9960 em diante). A migração `9950` e a tabela `study_quota_ledger` **não serão usadas**. O dono decidiu (D7) que o match é cobrado do **crédito diário de cada um dos dois**; resta decidir **quando** (no aceite ou no início confirmado). Não construir a Etapa Q como está escrita abaixo.
**Pré-requisito:** D7 respondida (pacote = plano atual ou produto novo; quanto por dia; quem é debitado e quando; devolução; validade dos extras). **Nenhum valor é escrito no código.**

### Tarefa Q1: Migração 9950 — livro de movimentos, checagem e débito no servidor
**Files:** Create `supabase/migrations/20261003009950_treino_dupla_cota.sql`, `src/__tests__/duplaCotaBanco.test.ts`; Modify `src/__tests__/helpers/duplaDb.ts`, `src/__tests__/duplaMigracaoDados.test.ts`.
**Interfaces:**
- `app_settings.treino_dupla.cota = { "ativa": false, "pacotes": {} }` — **desligada e vazia** (módulo funciona como hoje); a checagem de chaves não muda (a chave `treino_dupla` já existe; só o valor ganha um campo).
- Tabela `study_quota_ledger` (`id`, `user_id`, `day date` (Brasília), `kind` (`pacote | extra | devolucao`), `match_id`, `amount`, `created_at`; único por `(user_id, match_id, kind)` para a **idempotência**); RLS: a pessoa lê os **seus** movimentos; nenhuma gravação direta.
- `dupla_quota_state(uid) returns jsonb` → `{ ativa, limite_diario, usados_hoje, extras, disponivel }`; `dupla_quota_charge(uid, match_id)` (primeiro a cota diária do pacote, depois os extras; trava por pessoa; nunca saldo negativo; **se o par já tem match, não debita**) chamada por `app_dupla_swipe` (na formação do match), `app_dupla_answer_invite` (se o dono escolher "debitar no aceite") e `app_dupla_invite` — **o ponto exato vem do D7**; `app_dupla_quota() returns jsonb` para a tela. `app_dupla_swipe` refeita (base 9770) para checar a cota **antes** do "Estudar junto" e devolver o código `quota` → "Sua cota de matches acabou". Cota desligada: nada muda.
- [ ] **Step 1: Write the failing tests** (reescrevem os testes do pacote que valem: limite vem do pacote, **sem franquia gratuita global**; limite exato; **último crédito sob concorrência** em duas conexões não deixa saldo negativo (Review Focus 11); virada do dia em Brasília sem apagar conversa nem extras; extras só depois da cota do pacote; reabrir o mesmo par não debita; pular não debita; devolução quando a sala fecha sem ninguém entrar, **se** D7 mandar; cota desligada = comportamento de hoje; só administrador liga)
- [ ] **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCotaBanco.test.ts --pool=threads --maxWorkers=1` — Expected: FAIL. **Step 3: Implement. Step 4: Run** o mesmo + `duplaMatchBanco.test.ts duplaConviteDiretoBanco.test.ts duplaMigracaoDados.test.ts` — Expected: PASS. **Step 5: Commit** "Treino em dupla: migracao 9950 com cota de matches por pacote, desligada por padrao".

### Tarefa Q2: Aviso "Sua cota de matches acabou" e tela informativa (sem compra)
**Depois de:** Tarefa Q1.
**Files:** Create `src/novo/app/dupla/QuotaNotice.jsx`, `src/__tests__/duplaCotaTela.test.tsx`; Modify `src/novo/app/dupla/PracticeScreen.jsx`, `src/novo/data/*Backend.ts`.
**Comportamento:** com a cota **ligada**, o cabeçalho mostra o que sobra hoje (rótulo "Cota diária disponível", números do servidor); ao tentar um novo match sem cota (ou `quota` devolvido pelo servidor): `Dialog` **"Sua cota de matches acabou"** com "Você pode adquirir mais matches para encontrar novos parceiros. Suas conversas continuam disponíveis." e a tela **informativa** "Os pacotes ainda não estão à venda." (**sem botão de pagar**, sem `simulatePurchase`, sem preço). Conversas e salas existentes seguem abertas. Com a cota desligada, nada aparece.
- [ ] **Step 1: Write the failing tests** (cota desligada não mostra nada; ligada mostra o saldo do servidor; sem cota abre o diálogo; chat e "Abrir sala" funcionam sem cota; nenhum botão de compra; nenhum número escrito na tela que não venha do servidor). **Step 2: Run** `FILA npx vitest run src/__tests__/duplaCotaTela.test.tsx --pool=threads --maxWorkers=1` — Expected: FAIL. **Step 3: Implement. Step 4: Run** o mesmo + `duplaMatchTela.test.tsx` — Expected: PASS. **Step 5: Commit** "Treino em dupla: aviso de cota esgotada e tela informativa".

### Tarefa Q3: Conferência da Etapa Q
- [ ] Suíte completa e typecheck filtrado; relatório ao dono (arquivos, migração 9950, como testar com a chave ligada na Administração, valores a cadastrar: **todos do dono**); lembrar **uma vez** que preço dos modelos de IA e tetos ficam para antes de liberar aos alunos (não é desta etapa).
**PARE: confirmação do dono.**

---

## Fora deste plano (não construir)
- **Compra de pacotes** (checkout, webhook, estorno): a Stripe está parada; `simulatePurchase` do pacote nunca vai para o banco. Quando voltar, vira plano próprio com a LEIA §5 (Etapa 5) como lista de testes (pagamento pendente, falha, duplicado, estorno).
- **Praticar sozinho, avaliação por IA e radar:** adendo do outro agente (`2026-10-12-treino-dupla-sozinho-e-radar.md`, ramo `treino-dupla`); depende de D1.
- **Voz/vídeo dentro do app**, **denúncia/bloqueio** (C4, depois do D6), **registro real de "Sinalizar problema"** (D10), **flashcards por tema** (D9), **importação das 13 edições** (só pela Montagem, uma por vez).
