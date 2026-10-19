# Treino em Dupla — fluxo simples (ator escolhe, convida e inicia) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Nada deste plano foi construído.** Ele começa só com a ordem do dono. Tudo continua **só para a equipe**.

**Goal:** do convite aceito ao atendimento começar, um toque do ator ("Iniciar estação"): o ator escolhe a estação e convida pela lista de colegas; antes do início o candidato vê só uma porta com o número da área; o apito e a porta abrindo acontecem juntos nos dois aparelhos e, quando o apito acaba, o candidato "entra" (folha e 10 minutos); a nota tem um comentário opcional e o fim oferece "mesmo papel" ou "trocar de papel".

**Architecture:** três migrações novas sobre o ramo `fase2-etapa2` (014130 convite e lista, com o convite por link do @ desligado; 014140 sigilo antes do início, com a porta numerada; 014150 início com o apito, papéis e rodadas), cada uma partindo da definição mais nova de cada função e só reaplicando o acréscimo, com arquivo de desfazer. O servidor grava o início = toque do ator + 2 s do apito; os aparelhos calculam a entrada (porta fechada → abrindo → aberta) por uma função pura sobre o relógio do servidor (`src/novo/app/dupla/porta.js`). Nas telas (`src/novo/app/dupla`), a sala some com prontidão/conexão/confirmar no caminho novo: o ator em `setup` vai direto à "sala do avaliador" com "Iniciar estação"; o candidato vê só a porta numerada (`room/Porta.jsx`). O Praticar abre a lista de colegas (radar) e o baralho do match fica secundário; o menu continua "Praticar". Perfil, baralho, compatibilidade e `dupla_assign` não mudam.

**Tech Stack:** Postgres/Supabase (plpgsql, `security definer`, `search_path = ''`), PGlite nos testes de banco, React 18 + Vite, Vitest + Testing Library (jsdom), Node para os roteiros de ensaio.

**Spec:** `docs/superpowers/specs/2026-10-19-treino-dupla-fluxo-simples-design.md` (desenho aprovado pelo dono em 19/10, com a 2ª rodada de decisões: commit e8d458e5, seções 2b e 3). Leia o desenho inteiro antes de cada tarefa.

## Global Constraints

- **Só equipe:** a chave `treino_dupla` continua desligada (`aberto: false`); aluno (teste grátis, PRO pago, PRO vencido) e visitante são recusados em toda função nova ou refeita (`dupla_assert_access`). Nada abre a 2ª fase aos alunos.
- **Sigilo:** antes de `running` o candidato recebe SÓ o número da porta da área (`porta`: 1 Clínica Médica, 2 Cirurgia Geral, 3 Pediatria, 4 Ginecologia e Obstetrícia, 5 Medicina de Família e Comunidade/Saúde Coletiva) — nunca nome, tema, área por escrito, número da estação, origem (edição/instituição), versão do conteúdo, id, duração ou folha. Vale no convite (`app_dupla_invites`: nem a porta), no estado (`dupla_room_state`) e no conteúdo (`app_dupla_room_content`) em `roles`, `connecting` e `setup`, e em sala fechada antes de começar. Nunca há porta sem número: sem estação escolhida, o candidato vê só "O ator está escolhendo a estação".
- **Convite por link do @ sai** (botão "Copiar link de convite", rota `/convite/<@>`, pedido de 24 h): as funções do link passam a recusar ('O convite por link saiu. …'); a tabela `study_train_requests` e o @ ficam (dados antigos inofensivos, nada mais os lê).
- **Menu da 2ª fase continua "Praticar"** (não renomear). A lista de colegas abre dentro do Praticar e pelo "Em dupla" do Banco de estações.
- **Apito e porta:** `APITO_MS = 2000` (o apito de `playWhistle` em `src/novo/app/dupla/sound.js` dura 2 s); o servidor grava `started_at = toque do ator + 2 s`. Tela e som seguem o relógio do servidor (`server_now`), nunca o clique; som desligado = porta sem som no mesmo tempo; `prefers-reduced-motion` = porta troca sem animação.
- **Nenhum modelo do Vertex/Gemini** em nenhum passo, nem para revisar. Execução: um agente por tarefa e outro confere antes da próxima (superpowers:subagent-driven-development, revisores Claude).
- **Estação pendente** só entre duas pessoas da equipe: toda escolha de estação passa por `dupla_station_liberada(p_station_id, membros)`.
- **Sem link de chamada:** nenhum botão nem campo de link de chamada (WhatsApp/Meet) em nenhuma tela. A conversa é por fora.
- **Sem sortear estação.** (O sorteio de **papéis** que já existe na fase dos papéis do match fica.)
- **IA e créditos continuam desligados** (`creditos.ativa = false`; avaliação por IA do treino sozinho sem configuração). Nenhuma chamada de IA.
- **Match não muda:** perfil (`app_dupla_save_profile`), baralho (`app_dupla_deck`), escolha (`app_dupla_swipe`), compatibilidade (`dupla_compat`) e papéis por preferência (`dupla_assign`) ficam como estão. Só muda a sala depois do match (papéis definidos → `setup`; o ator escolhe a estação ali).
- **Migrações:** números **014130, 014140 e 014150** (faixa de folga 014130–014199, reservada ao ramo `fase2-etapa2` em `/Volumes/StaziaMed/.tmp-aulas/NUMEROS-MIGRACAO.md`; a 014200 é do ramo `fase2-imagens` e não toca nas funções deste plano). Nome do arquivo sempre com `treino_dupla` (o teste `fase2PublicacaoEquipe` exige). Cada migração pode ser colada duas vezes; função refeita parte da definição mais nova (arquivo e linhas citados no cabeçalho); `app_*` com `revoke execute … from public, anon`; apoios e gatilhos com `revoke … from public, anon, authenticated`. Cada migração tem `supabase/desfazer/<arquivo>.desfazer.sql`.
- **Testes:** sempre com `TMPDIR=/Volumes/StaziaMed/.tmp-aulas/tmp-correcoes`, pela fila `bash "/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/vaga-de-teste.sh"`, com `nice` e `npx vitest run <arquivos> --maxWorkers=2`. Mac de 16 GB: **uma suíte por vez**. Suíte inteira só na Tarefa 10 (`VITEST_TUDO=1`).
- **Build:** `npx vite build --outDir $TMPDIR/dist-fluxo` e apagar a pasta depois.
- **Git:** só no worktree `/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/fase2-etapa2` (ramo `fase2-etapa2`). `git add <caminhos explícitos>`. Mensagens em português **sem acento**, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Nunca `git push`, nunca Vercel, nunca gravar em produção, nunca `supabase db push`.**
- **Textos** que o dono vê: português, simples. Mensagens do banco terminam em ponto.
- **Testes antigos:** só se muda expectativa que contradiz o desenho (fase `setup` no lugar de `roles`/`connecting`, papéis fixos no convite direto, estação obrigatória, convite/estado/conteúdo sem a estação antes do início (só a porta), início 2 s depois do toque, um comentário, "mesmo/trocar", lista sem a aba Ator, radar como tela padrão do Praticar, convite por link do @ removido) ou teste que recola migração antiga (acrescentar `recolarFluxoSimples`). Cada tarefa traz a tabela das quebras já previstas; quebra fora da tabela que também for consequência direta do desenho pode ser ajustada, com uma linha no corpo do commit dizendo qual e por quê; qualquer outra falha: **pare** e investigue (é defeito, não expectativa).

## Review Focus

1. **Tela antiga aberta durante a publicação** chama `app_dupla_next_station` só com `p_room_id`, e as salas antigas ainda chamam `ready`/`confirm_roles`/`connected`: a pessoa espera que continue funcionando (nova rodada com o mesmo papel; salas antigas ainda andam) — teste na Tarefa 3 ("tela antiga, sem p_papel" e "salas antigas").
2. **O candidato aceita depois de o ator trocar a estação durante os 60 s**, ou o ator aperta "Iniciar" antes do aceite: espera-se que o candidato nunca veja a estação e que o início espere o aceite — teste na Tarefa 3 ("um toque do ator") e na Tarefa 5 ("convite ainda não aceito").
3. **Rodada nova ou match sem estação**, com o candidato recarregando a página: espera-se "O ator está escolhendo a estação", sem porta e sem nada da estação, e o início recusado até haver estação — testes na Tarefa 3 ("nova rodada") e na Tarefa 5 ("candidato sem estação escolhida").
4. **Aparelho que recebe o início atrasado** (rede lenta, aba no fundo, relógio do aparelho adiantado): espera-se que a porta abra no tempo do SERVIDOR nos dois aparelhos, que o apito não toque atrasado mais de 1 s (porta abre sem som) e que quem abre a sala depois da porta aberta caia direto na estação, sem apito — testes na Tarefa 6 (linha do tempo pura e "apito atrasado").
5. **Celular:** o rodapé da sala (Iniciar/Finalizar), a porta e a lista de estações aberta pelo radar não podem ficar escondidos pela barra de baixo nem pela área do gesto do iPhone — testes na Tarefa 5 (CSS do rodapé com `safe-area-inset-bottom`; porta com largura `min(220px, 60vw)`) e na Tarefa 9 (a escolha de estação abre como janela `Dialog`, que usa `--z-modal` 90).

---

## Mapa de arquivos

| Arquivo | O que faz | Tarefa |
|---|---|---|
| `supabase/migrations/20261003014130_treino_dupla_fluxo_convite.sql` (novo) | convite direto com papéis fixos e estação obrigatória, sala nasce em `setup`; convite sem dados da estação; radar só "online" e "perto"; convite por link do @ e pedido de 24 h recusam | 1 |
| `supabase/migrations/20261003014140_treino_dupla_fluxo_sigilo.sql` (novo) | estado e conteúdo da sala sem nada da estação para quem não é o ator antes de `running`; só a `porta` (número da área) | 2 |
| `supabase/migrations/20261003014150_treino_dupla_fluxo_sala.sql` (novo) | início por um toque do ator, gravado 2 s à frente (apito); papéis → `setup`; estação escolhida em `setup`; nova rodada "mesmo"/"trocar"; aceite do match → `setup`; quem trouxe a estação e virou candidato fica sem ela | 3 |
| `supabase/desfazer/20261003014130…014150_*.desfazer.sql` (novos) | desfazer de cada migração | 4 |
| `src/__tests__/helpers/duplaDb.ts` | `recolarFluxoSimples(db)` para os testes que recolam migrações antigas | 1 |
| `src/__tests__/duplaFluxoSimplesBanco.test.ts` (novo) | banco: convite, sigilo, início, rodadas, match, colar duas vezes, desfazer | 1–4 |
| `src/novo/app/dupla/room/RoomScreen.jsx`, `SetupPhase.jsx`, `EvaluatorFooter.jsx`, `RolesPhase.jsx`, `useRoom.js`, `sala.css`, `room/Porta.jsx` (novo) | preparação do ator com "Iniciar estação", candidato de frente para a porta numerada, papéis sem confirmar | 5 |
| `src/novo/app/dupla/porta.js` (novo), `room/Porta.jsx`, `room/RoomScreen.jsx`, `sound.js` | linha do tempo da entrada (função pura do relógio do servidor), apito e porta abrindo juntos, cronômetro a partir da porta aberta | 6 |
| `src/novo/app/dupla/room/ReviewPhase.jsx`, `ResultPhase.jsx`, `useRoom.js` | um comentário opcional e "Enviar nota"; fim com "mesmo papel", "trocar de papel" e "Sair" | 7 |
| `src/novo/app/dupla/MatchModal.jsx`, `live.js`, `radarApi.js`, `HandleField.jsx`, `RadarScreen.jsx`, `src/novo/app/App.jsx`; apagados `InviteLinkButton.jsx` e `InviteLinkScreen.jsx` | aviso do convite "te chamou para treinar como candidato", sem estação; convite por link do @ sai das telas e das rotas | 8 |
| `src/novo/app/dupla/RadarScreen.jsx`, `radarApi.js`, `PracticeScreen.jsx` | lista Online/Perto; escolher estação ao convidar; o Praticar abre a lista; match secundário; menu continua "Praticar" | 9 |
| `src/__tests__/duplaFluxoSimplesSala.test.tsx`, `duplaFluxoSimplesPorta.test.ts`, `duplaFluxoSimplesConvite.test.tsx` (novos) | telas e linha do tempo | 5–9 |
| `/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples/` (fora do repositório) | SQL de produção, conferir, ensaio com ROLLBACK, relatório | 10 |

Variáveis usadas nos comandos (copie no terminal antes de cada tarefa):

```bash
W="/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/fase2-etapa2"
FILA="/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/vaga-de-teste.sh"
export TMPDIR=/Volumes/StaziaMed/.tmp-aulas/tmp-correcoes
```

---

### Task 1: Migração 014130 — o ator convida com a estação; convite sem a estação; lista sem a aba "Ator"; convite por link sai

**Files:**
- Create: `supabase/migrations/20261003014130_treino_dupla_fluxo_convite.sql`
- Create: `src/__tests__/duplaFluxoSimplesBanco.test.ts`
- Modify: `src/__tests__/helpers/duplaDb.ts` (acrescentar `recolarFluxoSimples`)
- Modify: `src/__tests__/duplaRadarBanco.test.ts`, `src/__tests__/duplaArrobaLinkBanco.test.ts`, `src/__tests__/fase2PublicacaoEquipe.test.ts` (expectativas que o desenho muda)
- Conferir (fora do repositório): `/Volumes/StaziaMed/.tmp-aulas/NUMEROS-MIGRACAO.md`

**Interfaces:**
- Consumes: `dupla_invite_core(uuid, uuid, text, boolean, uuid)` (014000:600-737), `app_dupla_invite(uuid, text)` (014000:739-745), `app_dupla_radar(text, text)` (014000:452-571), `app_dupla_invites()` (014010:233-260), `app_dupla_link_lookup(text, text)`, `app_dupla_link_request(text, text)`, `app_dupla_requests()`, `app_dupla_answer_request(uuid, boolean)` (014080).
- Produces:
  - `dupla_invite_core(v_uid uuid, p_to uuid, p_station_id text, p_free boolean, p_chosen_by uuid default null, p_fixed boolean default false) returns jsonb` — com `p_fixed`: avaliador = quem convida, candidato = quem recebe, estação obrigatória (`'Escolha a estação antes de convidar.'`), sala nasce em `setup`. A versão de 5 argumentos deixa de existir.
  - `app_dupla_invite(p_to uuid, p_station_id text default null)` → `{ room_id, expires_at, partner }`; chama o miolo com `p_fixed = true`.
  - `app_dupla_invites()` → `{ invites: [{ id, room_id, kind, role: 'candidate'|'evaluator'|null, from, station: null, expires_at }], server_now }`.
  - Convite por link sai: `app_dupla_link_lookup`, `app_dupla_link_request` e `app_dupla_answer_request` recusam com `'O convite por link saiu. Chame o colega pela lista de quem está online.'` (depois do porteiro `dupla_assert_access`); `app_dupla_requests()` → `{ requests: [], server_now }` (os pedidos antigos ficam na tabela e não aparecem).
  - `app_dupla_radar(p_station_id text default null, p_aba text default 'online')` aceita só `'online'` e `'perto'`.
  - Teste: `recolarFluxoSimples(db: PGlite): Promise<void>` em `helpers/duplaDb.ts`.

- [ ] **Step 1: Conferir o registro dos números**

Os números já foram registrados ao escrever este plano (19/10). Confira antes de começar (ninguém pode ter usado):

```bash
grep -n "| 01413\|| 01414\|| 01415\|| 014160" /Volumes/StaziaMed/.tmp-aulas/NUMEROS-MIGRACAO.md && ls "$W/supabase/migrations" | grep -E "^2026100301(413|414|415)"
```
Esperado: as linhas de 014130, 014140, 014150 ("fluxo simples", ramo fase2-etapa2) e de 014160–014199 (folga); nenhum arquivo de migração com esses números ainda. Se outro ramo tiver tomado um deles, pare e avise o dono.

- [ ] **Step 2: Escrever o teste que falha**

Crie `src/__tests__/duplaFluxoSimplesBanco.test.ts`:

```ts
// @vitest-environment node
/**
 * Treino em Dupla · fluxo simples (desenho de 19/10: docs/superpowers/specs/2026-10-19-treino-dupla-fluxo-simples-design.md).
 * Migrações 014130 (convite e lista), 014140 (sigilo antes do início) e 014150 (início, papéis e rodadas), no PGlite com
 * TODAS as migrações em ordem. Pessoas e estações de TESTE; nenhuma IA, rede ou chave.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, addProfile, addStation, makeRoom, openDuplaDb, seen, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const ABERTO = { aberto: true, planos: ["trial", "pro", "elite"] };
// Estações de TESTE com marcas fáceis de procurar no texto bruto.
const SECRETA = { ...STATION, id: "teste-fluxo-e09", name: "ZZNOME fluxo simples", topic: "ZZTEMA fluxo", taxonomy_path: ["Clínica Médica", "ZZTAXO"] };
const OUTRA = { ...STATION, id: "teste-fluxo-e10", name: "ZZOUTRA estação de teste", topic: "ZZOUTRA tema" };
const MARCAS = [SECRETA.id, SECRETA.name, "ZZTEMA", "ZZTAXO", SECRETA.area];
const vaza = (x: unknown) => MARCAS.filter((m) => JSON.stringify(x).includes(m));
const PERFIS: Record<string, Record<string, unknown>> = {
  ana: { public_name: "Ana Souza", role_pref: "med", city: "Curitiba · PR" },
  bruno: { public_name: "Bruno Lima", role_pref: "med", city: "Curitiba · PR" },
  carla: { public_name: "Carla Dias", role_pref: "any", city: "Londrina · PR" },
};

describe("Fluxo simples do Treino em Dupla (014130–014150)", () => {
  let d: DuplaDb;

  const convidar = (de: string, para: string, estacao: string | null = SECRETA.id) =>
    d.rpc<any>(de, "app_dupla_invite", { p_to: para, p_station_id: estacao });
  const conviteDe = async (sala: string) => (await d.sql<any>(`select id from public.study_invites where room_id = $1`, [sala]))[0].id as string;
  const aceitar = async (quem: string, sala: string) => d.rpc<any>(quem, "app_dupla_answer_invite", { p_invite_id: await conviteDe(sala), p_accept: true });
  const estado = (uid: string, sala: string) => d.rpc<any>(uid, "app_dupla_room", { p_room_id: sala });
  const conteudo = (uid: string, sala: string) => d.rpc<any>(uid, "app_dupla_room_content", { p_room_id: sala });
  const act = (uid: string, fn: string, sala: string, args: Record<string, unknown> = {}) => d.rpc<any>(uid, `app_dupla_${fn}`, { p_room_id: sala, ...args });
  const linha = async (sala: string) => (await d.sql<any>(`select * from public.checklist_rooms where id = $1`, [sala]))[0];

  const montar = async () => {
    await d.sql(`delete from public.study_train_requests`);
    await d.sql(`delete from public.checklist_study_sessions`);
    await d.sql(`delete from public.checklist_rooms`); // convites caem junto
    await d.sql(`delete from public.study_matches`);
    await d.sql(`delete from public.study_swipes`);
    await d.sql(`delete from public.study_profiles`);
    for (const [nome, p] of Object.entries(PERFIS)) await addProfile(d.db, (U as any)[nome], p);
    for (const nome of Object.keys(PERFIS)) await seen(d.db, (U as any)[nome]);
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await setDupla(d.db, ABERTO);
  };

  beforeAll(async () => {
    d = await openDuplaDb();
    await addStation(d.db, SECRETA);
    await addStation(d.db, OUTRA);
  }, 240_000);
  beforeEach(async () => {
    await montar();
  }, 60_000);
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ 014130: convite e lista
  it("convite direto: quem convida é o ator e quem recebe é o candidato (ignora o papel preferido); a sala nasce na preparação com a estação", async () => {
    const r = await convidar(U.ana, U.bruno); // os dois preferem ser candidatos: não importa no convite direto
    expect(r.partner).toEqual({ user_id: U.bruno, public_name: "Bruno Lima" });
    expect(await linha(r.room_id)).toMatchObject({
      phase: "setup", round: 1, match_id: null, station_id: SECRETA.id, station_chosen_by: U.ana, evaluator_id: U.ana, candidate_id: U.bruno,
    });
    const [c] = await d.sql<any>(`select kind, status, from_user, to_user, extract(epoch from (expires_at - created_at))::int as prazo from public.study_invites where room_id = $1`, [r.room_id]);
    expect(c).toEqual({ kind: "direto", status: "pending", from_user: U.ana, to_user: U.bruno, prazo: 60 });
  });

  it("convite direto sem estação é recusado e nada é criado", async () => {
    await expect(convidar(U.ana, U.bruno, null)).rejects.toThrow("Escolha a estação antes de convidar.");
    expect(await d.sql(`select 1 from public.checklist_rooms`)).toEqual([]);
    expect(await d.sql(`select 1 from public.study_invites`)).toEqual([]);
  });

  it("o convite não leva nada da estação (nem número, área, porta ou origem); pedidos antigos de 24 h não aparecem mais", async () => {
    await convidar(U.ana, U.bruno);
    const v = await d.rpc<any>(U.bruno, "app_dupla_invites");
    expect(v.invites).toHaveLength(1);
    expect(v.invites[0]).toMatchObject({ kind: "direto", role: "candidate", station: null, from: { user_id: U.ana, public_name: "Ana Souza" } });
    expect(vaza(v)).toEqual([]);
    expect(JSON.stringify(v)).not.toContain("Estação");

    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`insert into public.study_train_requests (from_user, to_user, station_id) values ($1, $2, $3)`, [U.carla, U.bruno, SECRETA.id]);
    const p = await d.rpc<any>(U.bruno, "app_dupla_requests");
    expect(p.requests).toEqual([]); // o pedido por link saiu: o pedido antigo fica guardado e não aparece
    expect((await d.sql<any>(`select count(*)::int as n from public.study_train_requests`))[0].n).toBe(1);
    expect(v.invites[0]).not.toHaveProperty("porta");
  });

  it("aceitar: a sala continua na preparação com os papéis fixos; recusar fecha 'convite_recusado'", async () => {
    const r = await convidar(U.ana, U.bruno);
    expect(await aceitar(U.bruno, r.room_id)).toEqual({ room_id: r.room_id });
    expect(await linha(r.room_id)).toMatchObject({ phase: "setup", evaluator_id: U.ana, candidate_id: U.bruno });
    await d.sql(`delete from public.checklist_rooms`);
    const b = await convidar(U.carla, U.bruno);
    await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: await conviteDe(b.room_id), p_accept: false });
    expect(await linha(b.room_id)).toMatchObject({ phase: "closed", closed_reason: "convite_recusado" });
  });

  it("lista: só as abas 'online' e 'perto'; a aba 'atores' é recusada", async () => {
    await expect(d.rpc(U.ana, "app_dupla_radar", { p_aba: "atores" })).rejects.toThrow("Aba inválida.");
    const online = await d.rpc<any>(U.ana, "app_dupla_radar", { p_aba: "online" });
    expect(online.people.map((p: any) => p.public_name).sort()).toEqual(["Bruno Lima", "Carla Dias"]);
    const perto = await d.rpc<any>(U.ana, "app_dupla_radar", { p_aba: "perto" });
    expect(perto.people.map((p: any) => p.public_name)).toEqual(["Bruno Lima", "Carla Dias"]); // mesma cidade antes do mesmo estado
  });

  it("convite por link do @ saiu: abrir o link, pedir e responder pedido recusam e nada é criado; sem acesso, o porteiro recusa antes", async () => {
    const [{ handle }] = await d.sql<any>(`select handle from public.study_profiles where user_id = $1`, [U.bruno]);
    const chamadas: [string, Record<string, unknown>][] = [
      ["app_dupla_link_lookup", { p_handle: handle }],
      ["app_dupla_link_request", { p_handle: handle }],
      ["app_dupla_answer_request", { p_request_id: "00000000-0000-4000-8000-0000000000ff", p_accept: true }],
    ];
    for (const [fn, args] of chamadas) await expect(d.rpc(U.ana, fn, args), fn).rejects.toThrow("O convite por link saiu.");
    expect(await d.sql(`select 1 from public.checklist_rooms`)).toEqual([]);
    expect(await d.sql(`select 1 from public.study_train_requests`)).toEqual([]);
    await setDupla(d.db, { aberto: false, planos: [] });
    await expect(d.rpc(U.ana, "app_dupla_link_lookup", { p_handle: handle })).rejects.toThrow("Sem acesso ao Treinamento em Dupla.");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesBanco.test.ts --maxWorkers=2
```

Esperado: FAIL — "convite direto…" com `phase: "roles"` no lugar de `"setup"`; "sem estação" não recusa; convite com `station` preenchida e sem `role`; o pedido antigo aparece; `'atores'` aceita; o link ainda funciona.

- [ ] **Step 4: Escrever a migração (cabeçalho + funções)**

Crie o arquivo com o cabeçalho e as funções curtas, e depois acrescente as duas funções longas copiadas das bases:

```bash
cd "$W" && F=supabase/migrations/20261003014130_treino_dupla_fluxo_convite.sql && cat > "$F" <<'SQL'
-- =============================================================================
-- Treino em Dupla, FLUXO SIMPLES (desenho aprovado pelo dono em 19/10: docs/superpowers/specs/2026-10-19-treino-dupla-fluxo-simples-design.md),
-- parte 1 de 3: convite e lista. Número 014130, reservado em .tmp-aulas/NUMEROS-MIGRACAO.md (folga do ramo fase2-etapa2).
-- Depende da 014000 (radar, dupla_invite_core), 014010 (convites), 014080 (pedido de 24 h) e da 013405 (dupla_station_liberada).
-- Pode ser colada duas vezes: "drop function if exists" da assinatura antiga, "create or replace" e permissões. Não grava dado.
-- Não abre nada ao aluno (o módulo continua mandado pela chave "treino_dupla", desligada).
--
-- O QUE FAZ (decisões do dono de 19/10, perguntas 1, 2, 6 e 8)
--  1) Convite direto do radar (app_dupla_invite): QUEM CONVIDA É O ATOR/AVALIADOR e quem recebe é o CANDIDATO (ignora role_pref e
--     dupla_assign). A estação é OBRIGATÓRIA ('Escolha a estação antes de convidar.'). A sala nasce direto em "setup" (preparação),
--     sem passar por papéis e conexão; enquanto o convite espera, o ator já lê a estação e "Iniciar" fica recusado até o aceite
--     (014150).
--  2) dupla_invite_core ganha o último argumento p_fixed (padrão falso). A assinatura antiga de 5 argumentos é APAGADA (com as
--     duas, uma chamada de 4 ou 5 argumentos ficaria ambígua). p_fixed falso (papéis pelas preferências, sala em "roles") fica
--     para quem ainda chamar o miolo do jeito antigo; o link do @ deixa de chamá-lo (item 4).
--  3) app_dupla_invites: o convite NÃO leva nada da estação (station sempre nulo; antes ia "Estação N", área e duração) e ganha
--     "role" (o papel de quem recebe na sala: 'candidate' no convite direto).
--  4) CONVITE POR LINK DO @ SAI (dono, 19/10, 2ª rodada): app_dupla_link_lookup, app_dupla_link_request e
--     app_dupla_answer_request recusam ('O convite por link saiu. …', depois do porteiro de acesso); app_dupla_requests devolve
--     a lista vazia. A tabela study_train_requests e o @ ficam como estão (dados antigos inofensivos: nada mais os lê).
--  5) app_dupla_radar: só as abas 'online' e 'perto' ("Perto de você"); a aba 'atores' sai ('Aba inválida.').
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   dupla_invite_core ← 014000 (linhas 600-737) + p_fixed; app_dupla_invite ← 014000 (739-745);
--   app_dupla_radar ← 014000 (452-571) sem a aba 'atores'; app_dupla_invites ← 014010 (233-260) sem a estação;
--   app_dupla_link_lookup, app_dupla_link_request, app_dupla_requests e app_dupla_answer_request ← 014080 (recusam / lista
--   vazia). Conferido em 19/10: nenhuma migração depois delas as refaz.
--
-- COMO DESFAZER: supabase/desfazer/20261003014130_treino_dupla_fluxo_convite.desfazer.sql (volta as cinco funções da etapa 2,
--   apaga o miolo de 6 argumentos e recria o de 5). Salas e convites já criados ficam.
-- =============================================================================

drop function if exists public.dupla_invite_core(uuid, uuid, text, boolean, uuid);

-- ---------------------------------------------------------------- 3) convites que chegaram para mim (base: 014010)
-- Pendentes, no prazo (60 s) e de sala ainda aberta. Nada da estação (quem recebe pode ser o candidato); "role" é o papel de
-- quem recebe na sala ('candidate' | 'evaluator' | nulo quando o match ainda não decidiu).
-- → { invites: [{ id, room_id, kind, role, from: { user_id, public_name }, station: null, expires_at }], server_now }
create or replace function public.app_dupla_invites() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
begin
  perform public.dupla_sweep();
  return jsonb_build_object(
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'room_id', i.room_id, 'kind', i.kind,
               'role', case when r.candidate_id = v_uid then 'candidate' when r.evaluator_id = v_uid then 'evaluator' end,
               'from', jsonb_build_object('user_id', i.from_user, 'public_name', public.dupla_public_name(i.from_user)),
               'station', null,
               'expires_at', i.expires_at) order by i.created_at desc)
        from public.study_invites i
        join public.checklist_rooms r on r.id = i.room_id and r.phase <> 'closed'
       where i.to_user = v_uid and i.status = 'pending' and i.expires_at >= now()
         and not public.dupla_hides(v_uid, i.from_user)
    ), '[]'::jsonb),
    'server_now', clock_timestamp()
  );
end
$$;

-- ---------------------------------------------------------------- 4) convite por link do @ sai (base: 014080)
-- O porteiro de acesso vem primeiro (aluno e visitante continuam recebendo a mesma recusa de sempre).
create or replace function public.app_dupla_link_lookup(p_handle text, p_station_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.dupla_assert_access();
  raise exception 'O convite por link saiu. Chame o colega pela lista de quem está online.' using errcode = '42501';
end
$$;

create or replace function public.app_dupla_link_request(p_handle text, p_station_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.dupla_assert_access();
  raise exception 'O convite por link saiu. Chame o colega pela lista de quem está online.' using errcode = '42501';
end
$$;

create or replace function public.app_dupla_answer_request(p_request_id uuid, p_accept boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.dupla_assert_access();
  raise exception 'O convite por link saiu. Chame o colega pela lista de quem está online.' using errcode = '42501';
end
$$;

-- Pedidos de 24 h: a lista fica sempre vazia (os antigos ficam guardados e não aparecem). → { requests: [], server_now }
create or replace function public.app_dupla_requests() returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  perform public.dupla_assert_access();
  return jsonb_build_object('requests', '[]'::jsonb, 'server_now', clock_timestamp());
end
$$;

-- ---------------------------------------------------------------- 1) convite direto (base: 014000)
-- Quem convida é o ator e escolhe a estação (obrigatória); quem recebe é o candidato. → { room_id, partner, expires_at }
create or replace function public.app_dupla_invite(p_to uuid, p_station_id text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  return public.dupla_invite_core(public.dupla_assert_access(), p_to, p_station_id, false, null, true);
end
$$;

-- ---------------------------------------------------------------- 2) miolo do convite (base: 014000, linhas 600-737)
SQL
sed -n '600,737p' supabase/migrations/20261003014000_treino_dupla_radar.sql >> "$F"
printf '\n-- ---------------------------------------------------------------- 5) lista (base: 014000, linhas 452-571)\n' >> "$F"
sed -n '452,571p' supabase/migrations/20261003014000_treino_dupla_radar.sql >> "$F"
cat >> "$F" <<'SQL'

-- ---------------------------------------------------------------- permissões
revoke execute on function public.dupla_invite_core(uuid, uuid, text, boolean, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.app_dupla_invite(uuid, text) from public, anon;
revoke execute on function public.app_dupla_invites() from public, anon;
revoke execute on function public.app_dupla_requests() from public, anon;
revoke execute on function public.app_dupla_link_lookup(text, text) from public, anon;
revoke execute on function public.app_dupla_link_request(text, text) from public, anon;
revoke execute on function public.app_dupla_answer_request(uuid, boolean) from public, anon;
revoke execute on function public.app_dupla_radar(text, text) from public, anon;
SQL
```

- [ ] **Step 5: Aplicar as quatro trocas exatas no miolo e na lista copiados**

No arquivo `supabase/migrations/20261003014130_treino_dupla_fluxo_convite.sql`, com a ferramenta de edição:

(a) Assinatura do miolo. Troque
```sql
create or replace function public.dupla_invite_core(v_uid uuid, p_to uuid, p_station_id text, p_free boolean, p_chosen_by uuid default null) returns jsonb
```
por
```sql
create or replace function public.dupla_invite_core(v_uid uuid, p_to uuid, p_station_id text, p_free boolean, p_chosen_by uuid default null,
                                                    p_fixed boolean default false) returns jsonb
```

(b) Estação obrigatória. Troque
```sql
  if p_to is null or p_to = v_uid then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dupla-convite:' || v_uid::text, 0));
```
por
```sql
  if p_to is null or p_to = v_uid then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  -- 014130 (fluxo simples): no convite direto do radar a estação é obrigatória (quem convida é o ator e escolhe a estação).
  if p_fixed and p_station_id is null then
    raise exception 'Escolha a estação antes de convidar.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dupla-convite:' || v_uid::text, 0));
```

(c) Papéis fixos. Troque
```sql
  v_assign := public.dupla_assign(me.role_pref, other.role_pref);
  if v_assign = 'candidato' then
    v_cand := v_uid; v_eval := p_to;
  elsif v_assign = 'ator' then
    v_cand := p_to; v_eval := v_uid;
  end if;

  -- Quem trouxe a estação
```
por
```sql
  -- 014130: no convite direto do radar os papéis são fixos (quem convida é o ator/avaliador; quem recebe, o candidato).
  -- O convite por link e o pedido de 24 h (p_fixed falso) seguem as preferências (dupla_assign), como antes.
  if p_fixed then
    v_cand := p_to; v_eval := v_uid;
  else
    v_assign := public.dupla_assign(me.role_pref, other.role_pref);
    if v_assign = 'candidato' then
      v_cand := v_uid; v_eval := p_to;
    elsif v_assign = 'ator' then
      v_cand := p_to; v_eval := v_uid;
    end if;
  end if;

  -- Quem trouxe a estação
```

(d) Sala na preparação. Troque
```sql
  values (array[v_uid, p_to], 'roles', 1, null, v_station,
```
por
```sql
  values (array[v_uid, p_to], case when p_fixed then 'setup' else 'roles' end, 1, null, v_station,
```

(e) Lista sem a aba "Ator". Troque
```sql
  if p_aba is null or p_aba not in ('online', 'atores', 'perto') then
```
por
```sql
  if p_aba is null or p_aba not in ('online', 'perto') then
```
e troque
```sql
        and (p_aba = 'online'
             or (p_aba = 'atores' and p.role_pref in ('ator', 'any'))
             or (p_aba = 'perto' and n.near is not null))
```
por
```sql
        and (p_aba = 'online' or (p_aba = 'perto' and n.near is not null))
```

Confira que só essas trocas aconteceram:

```bash
cd "$W" && F=supabase/migrations/20261003014130_treino_dupla_fluxo_convite.sql && grep -c "p_fixed" "$F" && grep -c "atores" "$F"
```
Esperado: `p_fixed` em 8 linhas (cabeçalho 3, assinatura 1, (b) 1, (c) 2, (d) 1); `atores` em 1 linha (no cabeçalho); `O convite por link saiu` em 3 linhas.

- [ ] **Step 6: Apoio dos testes que recolam migrações antigas**

Em `src/__tests__/helpers/duplaDb.ts`, logo depois de `migrationFiles`, acrescente:

```ts
/**
 * Fluxo simples (014130–014150, desenho de 19/10): um teste que cola de novo uma migração ANTIGA do Treino (que refaz funções
 * que o fluxo simples também refaz) chama isto logo depois, para o banco voltar ao estado da cadeia inteira.
 */
export async function recolarFluxoSimples(db: PGlite): Promise<void> {
  for (const f of migrationFiles().filter((x) => x.includes("_treino_dupla_fluxo_"))) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
  }
}
```

- [ ] **Step 7: Rodar e ver passar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesBanco.test.ts --maxWorkers=2
```
Esperado: PASS (6 testes).

- [ ] **Step 8: Rodar os testes de banco vizinhos e ajustar só o que o desenho muda**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaRadarBanco.test.ts src/__tests__/duplaArrobaLinkBanco.test.ts src/__tests__/duplaMatchBanco.test.ts src/__tests__/duplaCreditosPreChecagem.test.ts src/__tests__/duplaCreditosSeguranca.test.ts src/__tests__/duplaUmaSala.test.ts src/__tests__/fase2PublicacaoEquipe.test.ts --maxWorkers=2
```

Quebras esperadas e a correção de cada uma (outras: siga a regra "Testes antigos" das Global Constraints):

| Arquivo · teste | Correção |
|---|---|
| `duplaRadarBanco` · helper `convidar` | troque por `const convidar = (de: string, para: string, estacao?: string \| null) => d.rpc(de, "app_dupla_invite", { p_to: para, p_station_id: estacao === undefined ? STATION.id : estacao });` (o convite direto passa a exigir a estação) |
| `duplaRadarBanco` · "aba Ator/avaliador…" | troque o corpo por `await expect(radar(U.carla, null, "atores")).rejects.toThrow(/Aba inválida\./); await expect(radar(U.carla, null, "outra")).rejects.toThrow(/Aba inválida\./);` e o título por `"aba Ator/avaliador saiu (fluxo simples, 19/10): 'atores' é recusada"` |
| `duplaRadarBanco` · "convidar: sala em 'papéis'…" | espere `{ phase: "setup", round: 1, match_id: null, station_id: STATION.id, candidate_id: U.bruno, evaluator_id: U.ana, duration_ms: 600000 }` (quem convida é o ator); troque o trecho "sem estação também vale" por `await expect(convidar(U.ana, U.bruno, null)).rejects.toThrow("Escolha a estação antes de convidar.");`; título: `"convidar: quem convida é o ator, sala na preparação com a estação, sem match, convite 'direto' de 60 s"` |
| `duplaRadarBanco` · "quem recebe vê o convite com kind e a estação SEM nome nem id" | troque `expect(v.invites[0].station).toMatchObject({…})` por `expect(v.invites[0]).toMatchObject({ station: null, role: "candidate" }); expect(cru).not.toContain("Clínica Médica");` |
| `duplaRadarBanco` · "aceitar leva os dois à mesma sala…" | `toBe("roles")` vira `toBe("setup")` |
| `duplaRadarBanco` · "colar as duas migrações de novo…" | já recola as posteriores (`x > "20261003014010"`): passa sem mudar; se falhar, acrescente `await recolarFluxoSimples(d.db);` depois do laço |
| `duplaArrobaLinkBanco` · `describe("Convite por link e pedido de treino de 24 h")`, testes das linhas 283 a 512 (link, pedido, aceitar/recusar pedido) | apague esses testes (o link saiu; a recusa está em `duplaFluxoSimplesBanco` "convite por link do @ saiu"); os do `describe("Nome de usuário com @")` ficam todos |
| `duplaArrobaLinkBanco` · "a tabela de pedidos não é lida nem escrita direto; colar de novo dá o mesmo banco" (linha 537) | troque `await pedir(U.ana, "bruno.link");` por `` await d.sql(`insert into public.study_train_requests (from_user, to_user) values ($1, $2)`, [U.ana, U.bruno]); ``; acrescente `await recolarFluxoSimples(d.db);` depois do laço de recolagem; na lista de ACL troque `"dupla_invite_core(uuid,uuid,text,boolean,uuid)"` por `"dupla_invite_core(uuid,uuid,text,boolean,uuid,boolean)"` (importe `recolarFluxoSimples` de `./helpers/duplaDb`) |
| `fase2PublicacaoEquipe` · `["app_dupla_invite", { p_to: U.admin }]` | vire `["app_dupla_invite", { p_to: U.admin, p_station_id: "inep2025-1-e07" }]` (a recusa tem de vir do acesso, não da falta de estação) |

Rode de novo o mesmo comando. Esperado: PASS.

- [ ] **Step 9: Commit**

```bash
cd "$W" && git add supabase/migrations/20261003014130_treino_dupla_fluxo_convite.sql src/__tests__/duplaFluxoSimplesBanco.test.ts src/__tests__/helpers/duplaDb.ts src/__tests__/duplaRadarBanco.test.ts src/__tests__/duplaArrobaLinkBanco.test.ts src/__tests__/fase2PublicacaoEquipe.test.ts && git commit -m "$(cat <<'EOF'
Treino em Dupla, fluxo simples (014130): o ator convida com a estacao, sala nasce na preparacao; convite sem a estacao; lista sem a aba Ator; convite por link do @ recusa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migração 014140 — antes de começar, quem não é o ator recebe só a porta numerada da área

**Files:**
- Create: `supabase/migrations/20261003014140_treino_dupla_fluxo_sigilo.sql`
- Modify: `src/__tests__/duplaFluxoSimplesBanco.test.ts` (novos testes no fim do `describe`)
- Modify: `src/__tests__/duplaCorrecoesPublicacao2Banco.test.ts`, `src/__tests__/duplaSalaTesteLocal.test.ts` e os que recolam 013406/013980 (expectativas que o desenho muda)

**Interfaces:**
- Consumes: `dupla_room_state(checklist_rooms, uuid)` (013406:199-313), `app_dupla_room_content(uuid)` (013980:25-127).
- Produces:
  - `dupla_porta(p_area text) returns integer` (apoio, só por dentro): 1 Clínica Médica, 2 Cirurgia Geral, 3 Pediatria, 4 Ginecologia e Obstetrícia, 5 Medicina de Família e Comunidade; outra área → nulo.
  - `dupla_room_state` devolve `station: null` e `duration_ms: null` para quem não é o avaliador quando a sala está em `roles`, `connecting` ou `setup`, ou fechada antes de começar (`started_at` nulo); chaves novas `station_ready: boolean` (a sala já tem estação, sem dizer qual) e `porta: integer | null` (número da área da estação da rodada; nulo sem estação), para os dois membros.
  - `app_dupla_room_content` devolve `{ role, station: null, pressing_count: 0, pressings: [], waiting: true }` nesses mesmos casos.

- [ ] **Step 1: Escrever o teste que falha**

No fim do `describe` de `src/__tests__/duplaFluxoSimplesBanco.test.ts`, acrescente:

```ts
  // ------------------------------------------------------------------ 014140: sigilo antes do início
  it("antes de 'running' o candidato não recebe nada da estação (estado, conteúdo e imagem), em nenhuma fase; o ator recebe tudo", async () => {
    for (const phase of ["roles", "connecting", "setup"] as const) {
      const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase, candidate: U.bruno, evaluator: U.ana, station: SECRETA.id });
      const e = await estado(U.bruno, sala);
      expect(e.station, phase).toBeNull();
      expect(e.duration_ms, phase).toBeNull();
      expect(e.station_ready, phase).toBe(true);
      expect(e.porta, phase).toBe(1); // SECRETA é de Clínica Médica: porta 1, e só isso
      const c = await conteudo(U.bruno, sala);
      expect(c, phase).not.toHaveProperty("porta");
      expect(c, phase).toMatchObject({ station: null, pressing_count: 0, pressings: [], waiting: true });
      expect(vaza([e, c]), phase).toEqual([]);
      await expect(d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" }), phase).rejects.toThrow("Esta ação não vale nesta fase da sala.");
      const a = await estado(U.ana, sala);
      expect(a.station, phase).toMatchObject({ id: SECRETA.id, name: SECRETA.name });
    }
  });

  it("na fase dos papéis sem papéis definidos ninguém recebe a estação escolhida no match", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", station: SECRETA.id });
    for (const uid of [U.ana, U.bruno]) {
      const e = await estado(uid, sala);
      expect(e.station, uid).toBeNull();
      expect(e.station_ready, uid).toBe(true);
      expect(vaza([e, await conteudo(uid, sala)]), uid).toEqual([]);
    }
  });

  it("porta = número da área (1 CM, 2 Cirurgia, 3 Pediatria, 4 GO, 5 MFC); sem estação, sem porta; o texto bruto não traz a área", async () => {
    const areas: [string, number][] = [["Clínica Médica", 1], ["Cirurgia Geral", 2], ["Pediatria", 3], ["Ginecologia e Obstetrícia", 4], ["Medicina de Família e Comunidade", 5]];
    for (const [area, porta] of areas) {
      const id = `teste-porta-${porta}`;
      await addStation(d.db, { ...STATION, id, name: `ZZPORTA ${porta}`, topic: `ZZPORTA tema ${porta}`, area });
      const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "setup", candidate: U.bruno, evaluator: U.ana, station: id });
      const e = await estado(U.bruno, sala);
      expect(e.porta, area).toBe(porta);
      expect(e.station, area).toBeNull();
      const cru = JSON.stringify([e, await conteudo(U.bruno, sala)]);
      for (const m of [area, "ZZPORTA", id]) expect(cru, area).not.toContain(m);
    }
    const semEstacao = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "setup", candidate: U.bruno, evaluator: U.ana, station: null });
    expect(await estado(U.bruno, semEstacao)).toMatchObject({ porta: null, station_ready: false, station: null });
    expect((await d.sql<any>(`select public.dupla_porta('Área que não existe') as n`))[0].n).toBeNull();
  });

  it("sala fechada antes de começar: o candidato segue sem a estação; em andamento ele recebe 'Estação N · área' sem o nome", async () => {
    const fechada = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "closed", candidate: U.bruno, evaluator: U.ana, station: SECRETA.id });
    expect((await estado(U.bruno, fechada)).station).toBeNull();
    const andando = await makeRoom(d.db, {
      members: [U.ana, U.bruno], phase: "running", candidate: U.bruno, evaluator: U.ana, station: SECRETA.id,
      extra: { started_at: new Date().toISOString(), ends_at: daqui(1) },
    });
    const e = await estado(U.bruno, andando);
    expect(e.station).toMatchObject({ area: SECRETA.area });
    expect(e.station).not.toHaveProperty("name");
    expect(e.station).not.toHaveProperty("id");
    const c = await conteudo(U.bruno, andando);
    expect(c.role).toBe("candidate");
    expect(c.station).toMatchObject({ doctor_scene: expect.any(String) });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesBanco.test.ts --maxWorkers=2
```
Esperado: FAIL nos quatro testes novos (`station` com `label`/`area`, `station_ready` e `porta` indefinidos, conteúdo com a folha em `connecting`/`setup`, `dupla_porta` não existe).

- [ ] **Step 3: Escrever a migração**

```bash
cd "$W" && F=supabase/migrations/20261003014140_treino_dupla_fluxo_sigilo.sql && cat > "$F" <<'SQL'
-- =============================================================================
-- Treino em Dupla, FLUXO SIMPLES (desenho de 19/10), parte 2 de 3: SIGILO ANTES DO INÍCIO. Número 014140 (folga do ramo
-- fase2-etapa2, registrado em .tmp-aulas/NUMEROS-MIGRACAO.md). Depende da 013406 (estado da sala) e da 013980 (conteúdo).
-- Pode ser colada duas vezes: só "create or replace function" e permissões. Não grava dado. Nenhuma IA.
--
-- O QUE FAZ (decisões do dono de 19/10: "o candidato só vê a estação quando o atendimento começa, como na prova"; "só o desenho
-- de uma porta com um número": a porta da área, 1 Clínica Médica, 2 Cirurgia Geral, 3 Pediatria, 4 Ginecologia e Obstetrícia,
-- 5 Medicina de Família e Comunidade / Saúde Coletiva)
--  Quem NÃO é o avaliador da rodada não recebe NADA da estação (nem nome, número, área por escrito, origem, versão, duração ou
--  id) quando a sala está em "roles", "connecting" ou "setup", ou foi fechada antes de começar (started_at nulo), A NÃO SER o
--  número da porta:
--   - dupla_porta(área) → 1..5 (apoio novo, só por dentro);
--   - dupla_room_state: station nulo, duration_ms nulo e as chaves novas "station_ready" (a sala já tem estação, sem dizer
--     qual) e "porta" (número da área da estação da rodada, para os dois membros; nulo sem estação: nunca há porta sem número);
--   - app_dupla_room_content: { role, station: null, pressing_count: 0, pressings: [], waiting: true }. Muda a decisão da 013406
--     ("o candidato recebe a folha em connecting/setup"): agora a folha aparece quando o ator inicia (pergunta 4 do dono).
--  Em "running", "review" e "result" nada muda (o candidato recebe "Estação N · área" e a folha; o nome só no resultado).
--  A imagem da folha (app_dupla_print_path) já era só em "running" para o candidato (013560): não muda.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   dupla_room_state(checklist_rooms, uuid) ← 013406 (linhas 199-313); app_dupla_room_content(uuid) ← 013980 (linhas 25-127).
--   Conferido em 19/10: nenhuma migração depois delas as refaz. Nova: dupla_porta(text).
--
-- COMO DESFAZER: supabase/desfazer/20261003014140_treino_dupla_fluxo_sigilo.desfazer.sql (volta as duas funções e apaga a nova).
-- =============================================================================

-- ---------------------------------------------------------------- 0) porta da área
-- Número da porta da área, como na prova. Só o que checklist_stations aceita (013300: dupla_area_code); outra área → nulo.
create or replace function public.dupla_porta(p_area text) returns integer
  language sql immutable security definer set search_path = ''
as $$
  select case public.dupla_area_code(p_area) when 'CM' then 1 when 'CR' then 2 when 'PED' then 3 when 'GO' then 4 when 'MFC' then 5 end
$$;

-- ---------------------------------------------------------------- 1) estado da sala (base: 013406, linhas 199-313)
SQL
sed -n '199,313p' supabase/migrations/20261003013406_treino_dupla_correcoes_publicacao_2.sql >> "$F"
printf '\n-- ---------------------------------------------------------------- 2) conteúdo por papel (base: 013980, linhas 25-127)\n' >> "$F"
sed -n '25,127p' supabase/migrations/20261003013980_treino_dupla_juncao_main.sql >> "$F"
cat >> "$F" <<'SQL'

-- ---------------------------------------------------------------- permissões
revoke execute on function public.dupla_room_state(public.checklist_rooms, uuid) from public, anon, authenticated;
revoke execute on function public.app_dupla_room_content(uuid) from public, anon;
revoke execute on function public.dupla_porta(text) from public, anon, authenticated;
SQL
```

Depois, com a ferramenta de edição no mesmo arquivo:

(a) Troque
```sql
  v_named boolean := p_room.evaluator_id is not null and p_uid = p_room.evaluator_id or p_room.phase = 'result';
```
por
```sql
  v_named boolean := p_room.evaluator_id is not null and p_uid = p_room.evaluator_id or p_room.phase = 'result';
  -- 014140: antes de começar, quem não é o avaliador não recebe nada da estação.
  v_hide boolean := p_uid is distinct from p_room.evaluator_id
                    and (p_room.phase in ('roles', 'connecting', 'setup') or (p_room.phase = 'closed' and p_room.started_at is null));
```

(b) Troque
```sql
  if p_room.station_id is not null then
    select * into st from public.checklist_stations where id = p_room.station_id;
```
por
```sql
  if p_room.station_id is not null and not v_hide then
    select * into st from public.checklist_stations where id = p_room.station_id;
```

(c) Troque
```sql
    'station', v_station,
    'duration_ms', coalesce(p_room.duration_ms, st.duration_ms),
```
por
```sql
    'station', v_station,
    'station_ready', p_room.station_id is not null,
    'porta', case when p_room.station_id is not null
                  then public.dupla_porta((select s.area from public.checklist_stations s where s.id = p_room.station_id)) end,
    'duration_ms', case when v_hide then null else coalesce(p_room.duration_ms, st.duration_ms) end,
```

(d) No conteúdo, troque
```sql
                   then jsonb_build_object('notice', 'Esta estação ficou indisponível. Escolham outra.')
                   else '{}'::jsonb end;
  end if;
```
por
```sql
                   then jsonb_build_object('notice', 'Esta estação ficou indisponível. Escolham outra.')
                   else '{}'::jsonb end;
  end if;
  -- 014140 (fluxo simples): antes de começar, quem não é o avaliador não recebe nada da estação (nem número, área, origem,
  -- versão ou a folha). A folha aparece quando o ator inicia.
  if v_uid is distinct from r.evaluator_id
     and (r.phase in ('roles', 'connecting', 'setup') or (r.phase = 'closed' and r.started_at is null)) then
    return jsonb_build_object('role', case when v_uid = r.candidate_id then 'candidate' end, 'station', null,
                              'pressing_count', 0, 'pressings', '[]'::jsonb, 'waiting', true);
  end if;
```

Confira: `grep -c "v_hide" "$F"` → 3 (declaração, (b) e (c)); `grep -c "'waiting', true" "$F"` → 1; `grep -c "dupla_porta" "$F"` → 5 (cabeçalho 2, criação 1, estado 1, permissão 1).

- [ ] **Step 4: Rodar e ver passar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesBanco.test.ts --maxWorkers=2
```
Esperado: PASS (10 testes).

- [ ] **Step 5: Rodar os vizinhos e ajustar só o que o desenho muda**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaCorrecoesPublicacao2Banco.test.ts src/__tests__/duplaSalaTesteLocal.test.ts src/__tests__/duplaPacoteBanco.test.ts src/__tests__/duplaSalaBanco.test.ts src/__tests__/duplaDecisoes2Banco.test.ts src/__tests__/duplaFolhaCandidatoBanco.test.ts src/__tests__/duplaMigracaoDados.test.ts src/__tests__/duplaCadeiaDuasVezes.test.ts src/__tests__/fase2PublicacaoEquipe.test.ts src/__tests__/duplaTarefasRelato.test.ts --maxWorkers=2
```

| Arquivo · teste | Correção |
|---|---|
| `duplaCorrecoesPublicacao2Banco` · "4: em connecting e setup o candidato recebe só a folha…" | troque o corpo do laço por `expect(c, phase).toMatchObject({ role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true }); expect(vaza(c), phase).toEqual([]); expect(vaza(await estado(U.ana, id)), phase).toEqual([]);` e o título por `"4 (refeito pelo fluxo simples, 014140): em connecting e setup o candidato não recebe nada da estação; a folha vem no início"` |
| `duplaCorrecoesPublicacao2Banco` · teste que recola a 013406 e o da linha 260-272 (junção 013980) | acrescente `await recolarFluxoSimples(d.db);` logo depois da recolagem; onde o teste confere o texto da função da 013980 (`pg_proc … app_dupla_room_content`), confira que contém `'waiting', true` e `dupla_sweep` |
| `duplaSalaTesteLocal` · linha 189-192 (fases sem `roles`/`closed`) | troque a condição `if (fase !== "roles" && fase !== "closed")` por `if (["running", "review", "result"].includes(fase))` e acrescente, para `connecting`/`setup`, `expect((await rpc(cand, "app_dupla_room_content", { p_room_id: id })).station).toBeNull();` |
| `duplaCadeiaDuasVezes` / `fase2PublicacaoEquipe` (recolam 013406/013980) | se falharem só porque a versão do fluxo simples foi sobrescrita, acrescente `await recolarFluxoSimples(d.db);` depois da recolagem |
| `duplaFolhaCandidatoBanco`, `duplaPacoteBanco`, `duplaDecisoes2Banco`, `duplaSalaBanco`, `duplaMigracaoDados`, `duplaTarefasRelato` | devem passar sem mudança (o candidato recebe ainda menos). Se `duplaMigracaoDados` "conteúdo por papel" falhar por `role` em sala `roles`/`setup`, monte a sala do teste em `running` (é o que o teste quer provar: quem tem acesso e é da sala recebe) |

Rode de novo. Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
cd "$W" && git add supabase/migrations/20261003014140_treino_dupla_fluxo_sigilo.sql src/__tests__/duplaFluxoSimplesBanco.test.ts src/__tests__/duplaCorrecoesPublicacao2Banco.test.ts src/__tests__/duplaSalaTesteLocal.test.ts src/__tests__/duplaCadeiaDuasVezes.test.ts src/__tests__/fase2PublicacaoEquipe.test.ts src/__tests__/duplaMigracaoDados.test.ts && git commit -m "$(cat <<'EOF'
Treino em Dupla, fluxo simples (014140): antes de comecar, quem nao e o ator recebe so a porta numerada da area (estado e conteudo)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
(Se algum dos arquivos listados não mudou, tire-o do `git add`.)

---

### Task 3: Migração 014150 — um toque do ator (início 2 s à frente, o apito); papéis vão à preparação; nova rodada "mesmo" ou "trocar"; estação de quem virou candidato é limpa

**Files:**
- Create: `supabase/migrations/20261003014150_treino_dupla_fluxo_sala.sql`
- Modify: `src/__tests__/duplaFluxoSimplesBanco.test.ts`
- Modify: testes de banco da sala, do resultado e dos créditos (tabela do Step 5)

**Interfaces:**
- Consumes: `app_dupla_start(uuid)` (014050:65-127), `app_dupla_next_station(uuid)` (014050:132-162), `app_dupla_swipe(uuid, text, text)` (014050:165-293), `app_dupla_set_roles(uuid, uuid)` e `app_dupla_draw_roles(uuid)` (013350:322-364), `app_dupla_set_station(uuid, text)` (013405:266-303), `dupla_room_need`, `dupla_room_for_action`, `dupla_station_liberada`, `dupla_station_done_in_room`, `credit_*`.
- Produces:
  - `app_dupla_start(p_room_id uuid)`: só o avaliador, em `setup`, com estação (`'Escolha a estação antes de iniciar.'`) e convite aceito (`'O convite ainda não foi aceito.'`); **sem** "os dois prontos". Grava `started_at = now() + 2 s` (o apito, `APITO_MS` criado na Tarefa 5) e `ends_at = started_at + duração`.
  - `app_dupla_set_roles(uuid, uuid)` / `app_dupla_draw_roles(uuid)`: em `roles`, definem os papéis e levam a sala a `setup`; se quem trouxe a estação (`station_chosen_by`) virar o candidato, a estação é limpa.
  - `app_dupla_swipe`: igual à 014050 (perfil, baralho, `dupla_assign`), mais: se quem trouxe a estação virar o candidato, a sala nasce sem estação.
  - `app_dupla_set_station(p_room_id uuid, p_station_id text)`: em `roles` (com papéis) ou `setup`, só o avaliador; a sala fica em `setup`.
  - `app_dupla_next_station(p_room_id uuid, p_papel text default 'mesmo')`: `'mesmo'` | `'trocar'`; só em `result`; rodada seguinte em `setup`, sem estação. A assinatura `(uuid)` deixa de existir (a chamada só com `p_room_id` continua valendo e quer dizer "mesmo").
  - Gatilho `study_invites_accepted_setup` (função `dupla_invite_accepted_setup()`): convite aceito numa sala em `roles` com os dois papéis definidos leva a sala a `setup` (match, chat e link).

- [ ] **Step 1: Escrever o teste que falha**

No fim do `describe` de `src/__tests__/duplaFluxoSimplesBanco.test.ts`, acrescente:

```ts
  // ------------------------------------------------------------------ 014150: início, papéis e rodadas
  const rodadaCompleta = async () => {
    const r = await convidar(U.ana, U.bruno);
    await aceitar(U.bruno, r.room_id);
    await act(U.ana, "start", r.room_id);
    await act(U.ana, "finish", r.room_id);
    await act(U.ana, "finalize", r.room_id, { p_feedback: { gen: "" } });
    return r.room_id as string;
  };

  it("um toque do ator: o início espera o aceite; depois, só o ator inicia, sem 'pronto', conexão ou confirmar", async () => {
    const r = await convidar(U.ana, U.bruno);
    await expect(act(U.ana, "start", r.room_id)).rejects.toThrow("O convite ainda não foi aceito.");
    // o ator troca a estação enquanto o convite espera: o candidato continua sem saber qual é
    await act(U.ana, "set_station", r.room_id, { p_station_id: OUTRA.id });
    await aceitar(U.bruno, r.room_id);
    expect((await estado(U.bruno, r.room_id)).station).toBeNull();
    await expect(act(U.bruno, "start", r.room_id)).rejects.toThrow("Só o avaliador pode fazer isso.");
    const s = await act(U.ana, "start", r.room_id);
    expect(s.phase).toBe("running");
    expect(await linha(r.room_id)).toMatchObject({ phase: "running", station_id: OUTRA.id, ready_ids: [], confirmed_ids: [], connected_ids: [] });
    // o início é gravado 2 s à frente (o apito); o cronômetro tem a duração inteira a partir daí
    const [t] = await d.sql<any>(
      `select round(extract(epoch from (started_at - now())) * 1000)::int as falta, round(extract(epoch from (ends_at - started_at)) * 1000)::int as dur
         from public.checklist_rooms where id = $1`, [r.room_id]);
    expect(t.falta).toBeGreaterThan(1000);
    expect(t.falta).toBeLessThanOrEqual(2000);
    expect(t.dur).toBe(600000);
    expect((await estado(U.bruno, r.room_id)).station).toMatchObject({ area: OUTRA.area });
    await expect(act(U.ana, "start", r.room_id)).rejects.toThrow("Esta ação não vale nesta fase da sala.");
  });

  it("só o ator libera, marca, encerra e envia a nota; a nota guarda o comentário em feedback_gen; o candidato pede revisão", async () => {
    const r = await convidar(U.ana, U.bruno);
    await aceitar(U.bruno, r.room_id);
    await act(U.ana, "start", r.room_id);
    await expect(act(U.bruno, "release", r.room_id, { p_pressing_id: "p1", p_released: true })).rejects.toThrow("Só o avaliador pode fazer isso.");
    await expect(d.rpc(U.bruno, "app_dupla_mark", { p_room_id: r.room_id, p_item_id: "i1", p_grade: "correct" })).rejects.toThrow("Só o avaliador pode fazer isso.");
    await expect(act(U.bruno, "finish", r.room_id)).rejects.toThrow("Só o avaliador pode fazer isso.");
    await d.rpc(U.ana, "app_dupla_mark", { p_room_id: r.room_id, p_item_id: "i1", p_grade: "correct" });
    await act(U.ana, "finish", r.room_id);
    await expect(act(U.bruno, "finalize", r.room_id, { p_feedback: { gen: "x" } })).rejects.toThrow("Só o avaliador pode fazer isso.");
    expect((await act(U.ana, "finalize", r.room_id, { p_feedback: { gen: "Boa anamnese." } })).phase).toBe("result");
    const [sess] = await d.sql<any>(`select feedback_pos, feedback_neg, feedback_gen, doctor_id, actor_id from public.checklist_study_sessions where room_id = $1`, [r.room_id]);
    expect(sess).toEqual({ feedback_pos: "", feedback_neg: "", feedback_gen: "Boa anamnese.", doctor_id: U.bruno, actor_id: U.ana });
    await act(U.bruno, "request_review", r.room_id, { p_round: 1, p_reason: "O item 2 foi feito." });
    expect((await act(U.ana, "redo_review", r.room_id, { p_round: 1 })).phase).toBe("review");
  });

  it("nova rodada 'trocar': os papéis invertem, a sala volta à preparação sem estação e só o novo ator escolhe", async () => {
    const sala = await rodadaCompleta();
    await expect(act(U.bruno, "next_station", sala, { p_papel: "outro" })).rejects.toThrow("Escolha inválida.");
    const s = await act(U.bruno, "next_station", sala, { p_papel: "trocar" });
    expect(s).toMatchObject({ phase: "setup", round: 2, station: null, station_ready: false });
    expect(await linha(sala)).toMatchObject({ evaluator_id: U.bruno, candidate_id: U.ana, station_id: null, started_at: null });
    await expect(act(U.bruno, "start", sala)).rejects.toThrow("Escolha a estação antes de iniciar.");
    await expect(act(U.ana, "set_station", sala, { p_station_id: OUTRA.id })).rejects.toThrow("Só o avaliador escolhe a estação.");
    await expect(act(U.bruno, "set_station", sala, { p_station_id: SECRETA.id })).rejects.toThrow("Vocês já treinaram esta estação nesta sala. Escolham outra.");
    await act(U.bruno, "set_station", sala, { p_station_id: OUTRA.id });
    expect(await estado(U.ana, sala)).toMatchObject({ phase: "setup", station: null, station_ready: true });
    expect((await act(U.bruno, "start", sala)).phase).toBe("running");
  });

  it("tela antiga, sem p_papel: a nova rodada mantém os papéis ('mesmo')", async () => {
    const sala = await rodadaCompleta();
    const s = await d.rpc<any>(U.bruno, "app_dupla_next_station", { p_room_id: sala });
    expect(s).toMatchObject({ phase: "setup", round: 2 });
    expect(await linha(sala)).toMatchObject({ evaluator_id: U.ana, candidate_id: U.bruno, station_id: null });
  });

  it("match: perfil, baralho e papéis pelas preferências não mudam; com os papéis decididos, aceitar leva à preparação e o ator escolhe a estação", async () => {
    await d.sql(`update public.study_profiles set role_pref = 'ator' where user_id = $1`, [U.bruno]); // Ana 'med', Bruno 'ator'
    await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right" });
    const m = await d.rpc<any>(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right" });
    expect(m.matched).toBe(true);
    expect(await linha(m.room_id)).toMatchObject({ phase: "roles", candidate_id: U.ana, evaluator_id: U.bruno, station_id: null });
    const [{ id }] = (await d.rpc<any>(U.bruno, "app_dupla_invites")).invites;
    await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true });
    expect(await linha(m.room_id)).toMatchObject({ phase: "setup", station_id: null });
    await act(U.bruno, "set_station", m.room_id, { p_station_id: SECRETA.id });
    expect((await act(U.bruno, "start", m.room_id)).phase).toBe("running");
  });

  it("match: quem trouxe a estação e virou candidato fica sem ela; quem trouxe e virou ator fica com ela", async () => {
    await d.sql(`update public.study_profiles set role_pref = 'ator' where user_id = $1`, [U.bruno]); // Ana 'med', Bruno 'ator'
    await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right" });
    const m = await d.rpc<any>(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right", p_station_id: SECRETA.id });
    expect(m.matched).toBe(true);
    expect(await linha(m.room_id)).toMatchObject({ candidate_id: U.ana, evaluator_id: U.bruno, station_id: null, station_chosen_by: null, duration_ms: null });
    await d.sql(`delete from public.checklist_rooms`);
    await d.sql(`delete from public.study_matches`);
    await d.sql(`delete from public.study_swipes`);
    await d.rpc(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right" });
    const n = await d.rpc<any>(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right", p_station_id: SECRETA.id });
    expect(await linha(n.room_id)).toMatchObject({ candidate_id: U.ana, evaluator_id: U.bruno, station_id: SECRETA.id, station_chosen_by: U.bruno });
  });

  it("papéis escolhidos na sala: se quem trouxe a estação vira candidato, a estação é limpa; se vira ator, fica", async () => {
    const a = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", station: SECRETA.id, extra: { station_chosen_by: U.ana } });
    await act(U.bruno, "set_roles", a, { p_candidate_id: U.ana });
    expect(await linha(a)).toMatchObject({ phase: "setup", candidate_id: U.ana, station_id: null, station_chosen_by: null, duration_ms: null });
    const b = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", station: SECRETA.id, extra: { station_chosen_by: U.ana } });
    await act(U.ana, "set_roles", b, { p_candidate_id: U.bruno });
    expect(await linha(b)).toMatchObject({ phase: "setup", evaluator_id: U.ana, station_id: SECRETA.id });
  });

  it("match sem papéis decididos ('qualquer papel' dos dois): a sala fica nos papéis; escolher ou sortear os papéis leva à preparação", async () => {
    await d.sql(`update public.study_profiles set role_pref = 'any' where user_id = any ($1::uuid[])`, [[U.ana, U.bruno]]);
    await d.rpc(U.bruno, "app_dupla_swipe", { p_to: U.ana, p_direction: "right" });
    const m = await d.rpc<any>(U.ana, "app_dupla_swipe", { p_to: U.bruno, p_direction: "right" });
    const [{ id }] = (await d.rpc<any>(U.bruno, "app_dupla_invites")).invites;
    await d.rpc(U.bruno, "app_dupla_answer_invite", { p_invite_id: id, p_accept: true });
    expect(await linha(m.room_id)).toMatchObject({ phase: "roles", candidate_id: null, evaluator_id: null });
    expect((await act(U.ana, "set_roles", m.room_id, { p_candidate_id: U.bruno })).phase).toBe("setup");
    expect(await linha(m.room_id)).toMatchObject({ candidate_id: U.bruno, evaluator_id: U.ana });

    const outra = await makeRoom(d.db, { members: [U.ana, U.carla], phase: "roles", station: null });
    expect((await act(U.carla, "draw_roles", outra)).phase).toBe("setup");
    const l = await linha(outra);
    expect([l.candidate_id, l.evaluator_id].sort()).toEqual([U.ana, U.carla].sort());
  });

  it("estação que caiu (sala nos papéis com os papéis definidos): o ator escolhe outra e a sala vai direto à preparação", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "roles", candidate: U.bruno, evaluator: U.ana, station: null, extra: { station_dropped_round: 1 } });
    await expect(act(U.bruno, "set_station", sala, { p_station_id: OUTRA.id })).rejects.toThrow("Só o avaliador escolhe a estação.");
    expect((await act(U.ana, "set_station", sala, { p_station_id: OUTRA.id })).phase).toBe("setup");
  });

  it("salas antigas: 'conexão' ainda leva à preparação e o início não pede mais 'pronto'", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "connecting", candidate: U.bruno, evaluator: U.ana, station: SECRETA.id });
    await act(U.ana, "connected", sala);
    expect((await act(U.bruno, "connected", sala)).phase).toBe("setup");
    expect((await act(U.ana, "start", sala)).phase).toBe("running");
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesBanco.test.ts --maxWorkers=2
```
Esperado: FAIL — "Os dois precisam estar prontos.", início sem os 2 s, `next_station` volta a `roles`, `p_papel` desconhecido, aceite do match deixa em `roles`, `set_roles` fica em `roles` e não limpa a estação, o match guarda a estação de quem virou candidato, `set_station` em `setup` recusa pela fase.

- [ ] **Step 3: Escrever a migração**

```bash
cd "$W" && F=supabase/migrations/20261003014150_treino_dupla_fluxo_sala.sql && cat > "$F" <<'SQL'
-- =============================================================================
-- Treino em Dupla, FLUXO SIMPLES (desenho de 19/10), parte 3 de 3: INÍCIO, PAPÉIS E RODADAS. Número 014150 (folga do ramo
-- fase2-etapa2, registrado em .tmp-aulas/NUMEROS-MIGRACAO.md). Depende da 013350, 013380, 013405, 013406, 014050 e da 014130.
-- Pode ser colada duas vezes: "drop function if exists" da assinatura antiga, "create or replace", "drop trigger if exists" e
-- permissões. Não grava dado. Nenhuma IA. Cota de créditos continua DESLIGADA (a pré-checagem da 014050 é mantida).
--
-- O QUE FAZ (decisões do dono de 19/10, perguntas 2b, 4 e 7)
--  1) app_dupla_start: UM TOQUE DO ATOR. Só o avaliador, em "setup", com a estação escolhida ('Escolha a estação antes de
--     iniciar.') e o convite da sala já aceito ('O convite ainda não foi aceito.', agora sempre, não só com a cota ligada). Sai a
--     exigência dos dois "prontos". O débito de crédito da 014050 continua igual (só com a cota ligada).
--     APITO E PORTA (dono, 19/10): started_at = toque do ator + 2 s (a duração do apito, APITO_MS de src/novo/app/dupla/porta.js e
--     de playWhistle) e ends_at = started_at + duração. Os dois aparelhos tocam o apito e abrem a porta pelo relógio do
--     servidor nesses 2 s; o cronômetro conta a partir da porta aberta.
--  2) app_dupla_set_roles / app_dupla_draw_roles: definidos os papéis, a sala vai DIRETO a "setup" (sem "connecting", "pronto"
--     e "confirmar"). O sorteio é de PAPÉIS (não existe sortear estação). Se quem trouxe a estação (station_chosen_by) virar o
--     candidato, a estação é limpa (dono, 19/10: ele já conhece o tema) e o ator escolhe outra.
--  2b) app_dupla_swipe (match): perfil, baralho, compatibilidade e dupla_assign iguais à 014050; a única mudança é a mesma
--     regra: se quem trouxe a estação virar o candidato, a sala nasce sem estação.
--  3) app_dupla_set_station: só o avaliador, em "roles" (com os papéis definidos: estação que caiu, 013406) ou em "setup"; a sala
--     fica em "setup". Mesmas regras de estação (dupla_station_liberada, já treinada na sala, Pro/Elite).
--  4) app_dupla_next_station(p_room_id, p_papel): 'mesmo' (padrão) ou 'trocar'. A rodada seguinte nasce em "setup", com os
--     papéis mantidos ou invertidos e SEM estação: só o ator da rodada escolhe. Mantém a pré-checagem de crédito da 014050. A
--     assinatura antiga (uuid) é apagada; a tela antiga, que chama só com p_room_id, cai no padrão 'mesmo'.
--  5) Gatilho study_invites_accepted_setup: convite ACEITO numa sala em "roles" com os dois papéis definidos (match em que as
--     preferências decidiram, "Abrir sala" do chat, convite por link) leva a sala a "setup". Sem papéis definidos, a sala fica
--     nos papéis até alguém escolher ou sortear (item 2).
--  app_dupla_ready, app_dupla_confirm_roles e app_dupla_connected continuam existindo, sem mudança, para salas antigas.
--
-- FUNÇÕES REDEFINIDAS E A BASE DE CADA UMA
--   app_dupla_start(uuid) ← 014050 (linhas 65-127); app_dupla_swipe(uuid, text, text) ← 014050 (165-293);
--   app_dupla_set_roles(uuid, uuid) e app_dupla_draw_roles(uuid) ← 013350 (322-364); app_dupla_set_station(uuid, text) ← 013405
--   (266-303). Apagada: app_dupla_next_station(uuid) (014050, 132-162);
--   nova: app_dupla_next_station(uuid, text). Novas: dupla_invite_accepted_setup() e o gatilho study_invites_accepted_setup.
--
-- COMO DESFAZER: supabase/desfazer/20261003014150_treino_dupla_fluxo_sala.desfazer.sql (apaga o gatilho e as funções novas,
--   volta as refeitas e recria app_dupla_next_station(uuid) da 014050).
-- =============================================================================

drop function if exists public.app_dupla_next_station(uuid);

-- ---------------------------------------------------------------- 2) papéis → preparação (base: 013350)
create or replace function public.app_dupla_set_roles(p_room_id uuid, p_candidate_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['roles'], false);
  if p_candidate_id is null or not (p_candidate_id = any (r.member_ids)) then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  update public.checklist_rooms
     set candidate_id = p_candidate_id,
         evaluator_id = (select x from unnest(r.member_ids) x where x <> p_candidate_id limit 1),
         -- quem trouxe a estação e virou candidato fica sem ela (já conhece o tema): o ator escolhe outra
         station_id = case when r.station_chosen_by = p_candidate_id then null else station_id end,
         duration_ms = case when r.station_chosen_by = p_candidate_id then null else duration_ms end,
         station_chosen_by = case when r.station_chosen_by = p_candidate_id then null else station_chosen_by end,
         phase = 'setup', confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}',
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

create or replace function public.app_dupla_draw_roles(p_room_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_cand uuid;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['roles'], false);
  v_cand := r.member_ids[1 + floor(random() * 2)::integer];
  update public.checklist_rooms
     set candidate_id = v_cand,
         evaluator_id = (select x from unnest(r.member_ids) x where x <> v_cand limit 1),
         station_id = case when r.station_chosen_by = v_cand then null else station_id end,
         duration_ms = case when r.station_chosen_by = v_cand then null else duration_ms end,
         station_chosen_by = case when r.station_chosen_by = v_cand then null else station_chosen_by end,
         phase = 'setup', confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}',
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 3) estação na preparação (base: 013405)
create or replace function public.app_dupla_set_station(p_room_id uuid, p_station_id text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  st public.checklist_stations;
begin
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['roles', 'setup'], false);
  if r.candidate_id is null or r.evaluator_id is null then
    raise exception 'Definam os papéis antes de escolher a estação.' using errcode = '55000';
  end if;
  if r.evaluator_id <> v_uid then
    raise exception 'Só o avaliador escolhe a estação.' using errcode = '42501';
  end if;
  if not public.dupla_station_liberada(p_station_id, r.member_ids) then
    if public.is_staff() and exists (select 1 from public.checklist_stations s where s.id = p_station_id) then
      raise exception 'Estação ainda sem aprovação médica: só dá para treinar entre a equipe.' using errcode = '42501';
    end if;
    raise exception 'Estação não encontrada.' using errcode = '22023';
  end if;
  select * into st from public.checklist_stations s where s.id = p_station_id;
  if public.dupla_station_done_in_room(r, st.id) then
    raise exception 'Vocês já treinaram esta estação nesta sala. Escolham outra.' using errcode = '22023';
  end if;
  if st.is_pro_only and not (public.tutor_is_pro(r.member_ids[1]) and public.tutor_is_pro(r.member_ids[2])) then
    raise exception 'Estação exclusiva dos planos Pro e Elite.' using errcode = '42501';
  end if;
  update public.checklist_rooms
     set station_id = st.id, station_chosen_by = v_uid,
         duration_ms = case when st.duration_ms between 60000 and 3600000 then st.duration_ms end,
         phase = 'setup', confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}',
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 4) nova rodada: mesmo papel ou trocar (base: 014050)
create or replace function public.app_dupla_next_station(p_room_id uuid, p_papel text default 'mesmo') returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := public.dupla_assert_access();
  r public.checklist_rooms;
  v_m uuid;
begin
  if p_papel is null or p_papel not in ('mesmo', 'trocar') then
    raise exception 'Escolha inválida.' using errcode = '22023';
  end if;
  select * into r from public.dupla_room_for_action(p_room_id, v_uid);
  perform public.dupla_room_need(r, v_uid, array['result'], false);
  if public.credit_ativa() and public.credit_cobra_rodada() then
    foreach v_m in array r.member_ids loop
      if not public.credit_available(v_m, 'match') then
        raise exception 'Não foi possível abrir outra estação agora. Confirmem a cota de hoje e tentem de novo.'
          using errcode = '54000', hint = 'INSUFFICIENT_CREDITS';
      end if;
    end loop;
  end if;
  update public.checklist_rooms
     set phase = 'setup', round = round + 1,
         candidate_id = case when p_papel = 'trocar' then r.evaluator_id else r.candidate_id end,
         evaluator_id = case when p_papel = 'trocar' then r.candidate_id else r.evaluator_id end,
         station_id = null, station_chosen_by = null, duration_ms = null,
         confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}',
         started_at = null, ends_at = null, paused_left_ms = null, paused_at = null, paused_total_ms = 0,
         finished_at = null, released_pressings = '{}',
         rev = rev + 1, updated_by = v_uid
   where id = r.id
  returning * into r;
  return public.dupla_room_state(r, v_uid);
end
$$;

-- ---------------------------------------------------------------- 5) convite aceito com papéis definidos → preparação
create or replace function public.dupla_invite_accepted_setup() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    update public.checklist_rooms r
       set phase = 'setup', confirmed_ids = '{}', connected_ids = '{}', ready_ids = '{}', rev = r.rev + 1
     where r.id = new.room_id and r.phase = 'roles'
       and r.candidate_id is not null and r.evaluator_id is not null;
  end if;
  return null;
end
$$;
drop trigger if exists study_invites_accepted_setup on public.study_invites;
create trigger study_invites_accepted_setup after update of status on public.study_invites
  for each row execute function public.dupla_invite_accepted_setup();

-- ---------------------------------------------------------------- 1) início por um toque do ator (base: 014050, linhas 65-127)
SQL
sed -n '65,127p' supabase/migrations/20261003014050_treino_dupla_creditos_inicio.sql >> "$F"
printf '\n-- ---------------------------------------------------------------- 2b) match: estação de quem virou candidato (base: 014050, linhas 165-293)\n' >> "$F"
sed -n '165,293p' supabase/migrations/20261003014050_treino_dupla_creditos_inicio.sql >> "$F"
cat >> "$F" <<'SQL'

-- ---------------------------------------------------------------- permissões
revoke execute on function public.app_dupla_start(uuid) from public, anon;
revoke execute on function public.app_dupla_swipe(uuid, text, text) from public, anon;
revoke execute on function public.app_dupla_set_roles(uuid, uuid) from public, anon;
revoke execute on function public.app_dupla_draw_roles(uuid) from public, anon;
revoke execute on function public.app_dupla_set_station(uuid, text) from public, anon;
revoke execute on function public.app_dupla_next_station(uuid, text) from public, anon;
revoke execute on function public.dupla_invite_accepted_setup() from public, anon, authenticated;
SQL
```

Depois, com a ferramenta de edição no mesmo arquivo, troque (dentro de `app_dupla_start`)
```sql
  perform public.dupla_room_need(r, v_uid, array['setup'], true);
  if not (r.member_ids <@ r.ready_ids) then
    raise exception 'Os dois precisam estar prontos.' using errcode = '55000';
  end if;
```
por
```sql
  perform public.dupla_room_need(r, v_uid, array['setup'], true);
  -- 014150 (fluxo simples): um toque do ator. Sem "pronto" dos dois; precisa da estação e do convite aceito (sempre).
  if r.station_id is null then
    raise exception 'Escolha a estação antes de iniciar.' using errcode = '55000';
  end if;
  if exists (select 1 from public.study_invites i where i.room_id = r.id and i.status = 'pending') then
    raise exception 'O convite ainda não foi aceito.' using errcode = '55000';
  end if;
```

Ainda em `app_dupla_start`, troque
```sql
     set phase = 'running', started_at = now(), ends_at = now() + v_dur * interval '1 millisecond',
```
por
```sql
     -- 014150: o início fica 2 s à frente (o apito; APITO_MS em src/novo/app/dupla/porta.js): a porta abre durante o apito e o
     -- cronômetro conta a partir da porta aberta, igual nos dois aparelhos (relógio do servidor).
     set phase = 'running', started_at = now() + interval '2 seconds',
         ends_at = now() + interval '2 seconds' + v_dur * interval '1 millisecond',
```

E em `app_dupla_swipe` (copiado), troque
```sql
  v_assign := public.dupla_assign(me.role_pref, other.role_pref);
  if v_assign = 'candidato' then
    v_cand := v_uid; v_eval := p_to;
  elsif v_assign = 'ator' then
    v_cand := p_to; v_eval := v_uid;
  end if;

  -- Match + sala + convite numa só unidade
```
por
```sql
  v_assign := public.dupla_assign(me.role_pref, other.role_pref);
  if v_assign = 'candidato' then
    v_cand := v_uid; v_eval := p_to;
  elsif v_assign = 'ator' then
    v_cand := p_to; v_eval := v_uid;
  end if;
  -- 014150 (dono, 19/10): quem trouxe a estação e virou candidato não fica com ela (já conhece o tema); o ator escolhe outra na
  -- sala. Papéis e o resto do match não mudam.
  if v_station is not null and v_chooser is not null and v_chooser = v_cand then
    v_station := null; v_chooser := null; v_dur := null;
  end if;

  -- Match + sala + convite numa só unidade
```

Confira: `grep -c "Os dois precisam estar prontos" "$F"` → 0; `grep -c "Escolha a estação antes de iniciar" "$F"` → 1 (na função; no cabeçalho a frase quebra a linha); `grep -c "interval '2 seconds'" "$F"` → 2; `grep -c "v_chooser = v_cand" "$F"` → 1.

- [ ] **Step 4: Rodar e ver passar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesBanco.test.ts --maxWorkers=2
```
Esperado: PASS (20 testes).

- [ ] **Step 5: Rodar os vizinhos e ajustar só o que o desenho muda**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaSalaBanco.test.ts src/__tests__/duplaResultadoBanco.test.ts src/__tests__/duplaResumoBanco.test.ts src/__tests__/duplaCreditosInicio.test.ts src/__tests__/duplaCreditosSeguranca.test.ts src/__tests__/duplaCreditosPreChecagem.test.ts src/__tests__/duplaParCanonico.test.ts src/__tests__/duplaUmaSala.test.ts src/__tests__/duplaMatchBanco.test.ts src/__tests__/duplaChatBanco.test.ts src/__tests__/duplaCorrecoesPublicacaoBanco.test.ts src/__tests__/duplaCorrecoesPublicacao2Banco.test.ts src/__tests__/duplaCadeiaDuasVezes.test.ts src/__tests__/duplaHistoricoBanco.test.ts src/__tests__/duplaSalaTesteLocal.test.ts --maxWorkers=2
```

| Arquivo · teste | Correção |
|---|---|
| `duplaSalaBanco` · "papéis: … os dois → connecting" | `set_roles`/`draw_roles` agora levam a `setup`: espere `phase: "setup"` depois do primeiro `set_roles`; troque o trecho de `confirm_roles` por uma sala montada com `makeRoom(…, "roles")` com papéis e estação (sala antiga) para provar que `confirm_roles` ainda leva a `connecting`; título: `"papéis: escolher ou sortear leva à preparação (fluxo simples); confirmar segue valendo em sala antiga"` |
| `duplaSalaBanco` · "estação: só o avaliador escolhe, só depois dos papéis…" | escolher a estação deixa a sala em `setup`; onde o teste esperava `roles` depois de `set_station`, espere `setup`; "só depois dos papéis" continua (sala `roles` sem papéis → `'Definam os papéis antes de escolher a estação.'`) |
| `duplaSalaBanco` · "cronômetro: … iniciar exige os dois prontos" | troque a expectativa `'Os dois precisam estar prontos.'` por: sala `setup` com convite pendente → `'O convite ainda não foi aceito.'`; sala `setup` sem estação → `'Escolha a estação antes de iniciar.'`; título sem "exige os dois prontos" |
| `duplaSalaBanco` · "nenhuma resposta ao candidato contém o nome…" | apague as linhas de `confirm_roles`, `connected` e `ready` (depois de `set_station` a sala já está em `setup`); o resto fica |
| `duplaSalaBanco` / `duplaResumoBanco` / `duplaCorrecoesPublicacaoBanco` / `duplaCreditosInicio` / `duplaCreditosSeguranca` / `duplaCreditosPreChecagem` / `duplaParCanonico` / `duplaUmaSala` · testes "colar … duas vezes" | acrescente `await recolarFluxoSimples(d.db);` logo depois da recolagem |
| `duplaResultadoBanco` · "Treinar outra estação…" (linhas 175-261) | `next_station` agora volta a `setup` com os papéis mantidos: espere `{ phase: "setup", round: 2, station: null, … }` e, onde o teste definia papéis de novo com `set_roles` na rodada 2, chame `set_station` direto pelo avaliador; título: `"nova rodada (fluxo simples): preparação sem estação, mesmos papéis"` |
| `duplaResultadoBanco` · linhas 312 e 336 | `"app_dupla_next_station(uuid)"` vira `"app_dupla_next_station(uuid,text)"` |
| `duplaCreditosInicio` · início "com os dois prontos" | tire os `ready` do preparo; mantenha a expectativa de débito; o caso "convite ainda não foi aceito" agora vale também com a cota desligada |
| `duplaMatchBanco` · "aceitar libera a sala" (linha 474) | o match de teste tem os papéis decididos? Se `candidate_id`/`evaluator_id` estiverem preenchidos, espere `{ phase: "setup", rev: antes.rev + 2, closed_reason: null }`; se não, mantenha `roles` e `rev + 1` |
| `duplaMatchBanco` / `duplaCorrecoesPublicacaoBanco` · match com estação escolhida no Banco por quem virou candidato | a estação agora vem nula (decisão do dono, 19/10); espere `station_id: null` e, onde o teste conferia o aviso "já viu" dessa estação, monte o caso com quem trouxe a estação como ator |
| `duplaSalaBanco` · "cronômetro: … grava ends_at = started_at + duração" | `ends_at - started_at` continua igual à duração; `started_at` fica ~2 s depois da chamada (espere `started_at > now()` logo depois do início) |
| `duplaCreditosInicio` / `duplaResultadoBanco` · tempo usado (`used_ms`) de rodada encerrada logo depois do início | o início está 2 s à frente: o tempo usado pode dar 0 (`greatest(0, …)`); onde o teste fixa `used_ms`, ajuste `started_at` direto no banco antes de encerrar |
| `duplaChatBanco` · "Abrir sala" (linha 287) | sala criada pelo chat continua em `roles` (o convite ainda espera): sem mudança |
| `duplaCorrecoesPublicacao2Banco` · linha 159 (`connecting`/`connected`) | sala antiga: continua valendo; se a expectativa de fase depois de `connected` for `setup`, sem mudança |

Rode de novo. Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
cd "$W" && git add supabase/migrations/20261003014150_treino_dupla_fluxo_sala.sql src/__tests__/duplaFluxoSimplesBanco.test.ts src/__tests__/duplaSalaBanco.test.ts src/__tests__/duplaResultadoBanco.test.ts src/__tests__/duplaResumoBanco.test.ts src/__tests__/duplaCreditosInicio.test.ts src/__tests__/duplaCreditosSeguranca.test.ts src/__tests__/duplaCreditosPreChecagem.test.ts src/__tests__/duplaParCanonico.test.ts src/__tests__/duplaUmaSala.test.ts src/__tests__/duplaMatchBanco.test.ts src/__tests__/duplaCorrecoesPublicacaoBanco.test.ts && git commit -m "$(cat <<'EOF'
Treino em Dupla, fluxo simples (014150): um toque do ator, inicio 2 s a frente (apito); papeis levam a preparacao; nova rodada mesmo papel ou trocar; aceite do match leva a preparacao; estacao de quem virou candidato e limpa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
(Tire do `git add` o que não mudou.)

---

### Task 4: Desfazer das três migrações, colar duas vezes e "só a equipe"

**Files:**
- Create: `supabase/desfazer/20261003014130_treino_dupla_fluxo_convite.desfazer.sql`, `…014140_treino_dupla_fluxo_sigilo.desfazer.sql`, `…014150_treino_dupla_fluxo_sala.desfazer.sql`
- Modify: `src/__tests__/duplaFluxoSimplesBanco.test.ts`, `src/__tests__/fase2PublicacaoEquipe.test.ts`

**Interfaces:**
- Consumes: as três migrações; o gerador `/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-etapa2/desfazer-gerador/gerar.mjs` (compara o banco antes e depois de cada migração; **não recria função apagada** — por isso o Step 3).
- Produces: os três arquivos de desfazer, colados em ordem inversa (014150 → 014130), voltam as funções da etapa 2.

- [ ] **Step 1: Escrever o teste que falha**

No topo de `src/__tests__/duplaFluxoSimplesBanco.test.ts`, depois dos imports, acrescente:

```ts
const ROOT = path.resolve(__dirname, "../..");
const NOVAS = ["20261003014130_treino_dupla_fluxo_convite.sql", "20261003014140_treino_dupla_fluxo_sigilo.sql", "20261003014150_treino_dupla_fluxo_sala.sql"];
const ler = (f: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
const desfazer = (f: string) => fs.readFileSync(path.join(ROOT, "supabase/desfazer", f.replace(/\.sql$/, ".desfazer.sql")), "utf8");
```

e no fim do `describe` (estes três ficam por último, porque mexem no banco do arquivo):

```ts
  // ------------------------------------------------------------------ colar de novo, permissões e desfazer
  const foto = () =>
    d.sql(`select p.oid::regprocedure::text as f, md5(pg_get_functiondef(p.oid)) as h, coalesce(array_to_string(p.proacl, ','), '') as acl
             from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ '^(app_)?dupla_' order by 1`);
  const assinatura = async (sig: string) => (await d.sql<any>(`select to_regprocedure($1) is not null as ok`, [sig]))[0].ok as boolean;
  const gatilho = async () => (await d.sql(`select 1 from pg_trigger where tgname = 'study_invites_accepted_setup'`)).length === 1;

  it("permissões: as app_* sem visitante; o miolo do convite e o gatilho só por dentro", async () => {
    const pode = async (papel: string, sig: string) =>
      (await d.sql<any>(`select has_function_privilege($1, $2, 'execute') as ok`, [papel, sig]))[0].ok as boolean;
    for (const sig of ["public.app_dupla_invite(uuid,text)", "public.app_dupla_next_station(uuid,text)", "public.app_dupla_start(uuid)", "public.app_dupla_set_station(uuid,text)", "public.app_dupla_radar(text,text)", "public.app_dupla_invites()", "public.app_dupla_requests()", "public.app_dupla_room_content(uuid)", "public.app_dupla_swipe(uuid,text,text)", "public.app_dupla_link_lookup(text,text)", "public.app_dupla_link_request(text,text)", "public.app_dupla_answer_request(uuid,boolean)"]) {
      expect(await pode("anon", sig), sig).toBe(false);
      expect(await pode("authenticated", sig), sig).toBe(true);
    }
    for (const sig of ["public.dupla_invite_core(uuid,uuid,text,boolean,uuid,boolean)", "public.dupla_invite_accepted_setup()", "public.dupla_room_state(public.checklist_rooms,uuid)", "public.dupla_porta(text)"]) {
      expect(await pode("anon", sig), sig).toBe(false);
      expect(await pode("authenticated", sig), sig).toBe(false);
    }
  });

  it("colar as três migrações de novo não muda nada (mesmas funções, mesmos textos, mesmas permissões)", async () => {
    const antes = await foto();
    for (const f of NOVAS) await d.db.exec(ler(f));
    expect(await foto()).toEqual(antes);
  });

  it("desfazer em ordem inversa volta as assinaturas da etapa 2; colar de novo volta o fluxo simples", async () => {
    const depois = await foto();
    for (const f of [...NOVAS].reverse()) await d.db.exec(desfazer(f));
    expect(await assinatura("public.dupla_invite_core(uuid,uuid,text,boolean,uuid)")).toBe(true);
    expect(await assinatura("public.dupla_invite_core(uuid,uuid,text,boolean,uuid,boolean)")).toBe(false);
    expect(await assinatura("public.app_dupla_next_station(uuid)")).toBe(true);
    expect(await assinatura("public.app_dupla_next_station(uuid,text)")).toBe(false);
    expect(await gatilho()).toBe(false);
    expect(await assinatura("public.dupla_porta(text)")).toBe(false);
    const [{ s }] = await d.sql<any>(`select prosrc as s from pg_proc where proname = 'app_dupla_start' and pronamespace = 'public'::regnamespace`);
    expect(s).toContain("Os dois precisam estar prontos.");
    const [{ l }] = await d.sql<any>(`select prosrc as l from pg_proc where proname = 'app_dupla_link_request' and pronamespace = 'public'::regnamespace`);
    expect(l).not.toContain("O convite por link saiu.");
    for (const f of NOVAS) await d.db.exec(ler(f));
    expect(await foto()).toEqual(depois);
    expect(await gatilho()).toBe(true);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesBanco.test.ts --maxWorkers=2
```
Esperado: FAIL em "desfazer…" (`ENOENT` dos arquivos de desfazer). "permissões" e "colar de novo" já passam.

- [ ] **Step 3: Gerar os desfazer e recriar à mão as duas funções apagadas**

```bash
cd "$W" && node /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-etapa2/desfazer-gerador/gerar.mjs "$W" 20261003014130 && ls supabase/desfazer | grep fluxo
```
Esperado: os três arquivos `…014130…`, `…014140…`, `…014150….desfazer.sql`.

O gerador não recria função que a migração apagou. Acrescente no FIM de cada um:

```bash
cd "$W" && D=supabase/desfazer && {
  printf '\n-- função apagada por ela: dupla_invite_core de 5 argumentos volta como era (014000, linhas 600-737)\n'
  sed -n '600,737p' supabase/migrations/20261003014000_treino_dupla_radar.sql
  printf 'revoke execute on function public.dupla_invite_core(uuid, uuid, text, boolean, uuid) from public, anon, authenticated;\n'
} >> "$D/20261003014130_treino_dupla_fluxo_convite.desfazer.sql" && {
  printf '\n-- função apagada por ela: app_dupla_next_station(uuid) volta como era (014050, linhas 132-162)\n'
  sed -n '132,162p' supabase/migrations/20261003014050_treino_dupla_creditos_inicio.sql
  printf 'revoke execute on function public.app_dupla_next_station(uuid) from public, anon;\n'
} >> "$D/20261003014150_treino_dupla_fluxo_sala.desfazer.sql"
```

Leia os três arquivos inteiros e confira: o de 014130 apaga `dupla_invite_core(uuid,uuid,text,boolean,uuid,boolean)` ANTES de recriar a de 5 argumentos; o de 014150 apaga o gatilho `study_invites_accepted_setup`, a função `dupla_invite_accepted_setup()` e `app_dupla_next_station(uuid,text)` antes de recriar a `(uuid)`.

- [ ] **Step 4: "Só a equipe" com as assinaturas novas**

Em `src/__tests__/fase2PublicacaoEquipe.test.ts`, no array `CHAMADAS` do `describe("etapa 2 …")`, acrescente:

```ts
    ["app_dupla_next_station", { p_room_id: QUALQUER, p_papel: "trocar" }],
    ["app_dupla_start", { p_room_id: QUALQUER }],
    ["app_dupla_set_station", { p_room_id: QUALQUER, p_station_id: "inep2025-1-e07" }],
    ["app_dupla_room_content", { p_room_id: QUALQUER }],
```

E, no mesmo `describe`, um teste novo:

```ts
  it("fluxo simples (014130–014150): as migrações estão na cadeia, depois da etapa 2, e a chave do Treino segue desligada", async () => {
    const fluxo = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.includes("_treino_dupla_fluxo_")).sort();
    expect(fluxo).toEqual(["20261003014130_treino_dupla_fluxo_convite.sql", "20261003014140_treino_dupla_fluxo_sigilo.sql", "20261003014150_treino_dupla_fluxo_sala.sql"]);
    const [{ value }] = await d.sql(`select value from public.app_settings where key = 'treino_dupla'`);
    expect(value.aberto).toBe(false);
  });
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesBanco.test.ts src/__tests__/fase2PublicacaoEquipe.test.ts src/__tests__/apoioVarredura.test.ts src/__tests__/segurancaPermissoesBanco.test.ts --maxWorkers=2
```
Esperado: PASS (o `apoioVarredura` e o `segurancaPermissoesBanco` varrem todas as funções: as novas têm de passar sem mudar esses testes; se falharem, a permissão da função nova está errada — corrija a migração, não o teste).

- [ ] **Step 6: Commit**

```bash
cd "$W" && git add supabase/desfazer/20261003014130_treino_dupla_fluxo_convite.desfazer.sql supabase/desfazer/20261003014140_treino_dupla_fluxo_sigilo.desfazer.sql supabase/desfazer/20261003014150_treino_dupla_fluxo_sala.desfazer.sql src/__tests__/duplaFluxoSimplesBanco.test.ts src/__tests__/fase2PublicacaoEquipe.test.ts && git commit -m "$(cat <<'EOF'
Treino em Dupla, fluxo simples: desfazer das tres migracoes (com as funcoes apagadas recriadas), colar duas vezes e so a equipe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Sala — preparação do ator com "Iniciar estação", candidato de frente para a porta numerada, papéis sem confirmar

**Files:**
- Modify: `src/novo/app/dupla/room/RoomScreen.jsx`, `SetupPhase.jsx` (reescrito), `EvaluatorFooter.jsx`, `RolesPhase.jsx`, `useRoom.js`, `sala.css`
- Create: `src/novo/app/dupla/porta.js` (só `APITO_MS` nesta tarefa), `src/novo/app/dupla/room/Porta.jsx`
- Create: `src/__tests__/duplaFluxoSimplesSala.test.tsx`
- Modify: `src/__tests__/duplaSalaPreparo.test.tsx`, `duplaSalaFases.test.tsx`, `duplaSalaRodape.test.tsx`

**Interfaces:**
- Consumes (do banco): estado com `station` (nulo para o candidato antes de `running`), `station_ready`, `porta` (1 a 5 ou nulo), `invite_pending`, `me.role`, `me.seen_station`; `app_dupla_start`, `app_dupla_set_station`, `app_dupla_set_roles`, `app_dupla_draw_roles`, `app_dupla_room_done_stations`, `app_dupla_stations`.
- Produces:
  - `SetupPhase({ room, actions, askLeave })` (só para o ator SEM estação e para o candidato) e `candidateWaitText(room): string` ("Aguardando {ator} iniciar a estação" com estação; "O ator está escolhendo a estação" sem).
  - `porta.js`: `APITO_MS = 2000`. `Porta.jsx`: `Porta({ numero: number, estado?: "fechada" | "abrindo" | "aberta", jaPassouMs?: number })` (SVG com `role="img"` e nome "Porta N"; só tokens) e `prefereMenosMovimento(): boolean`.
  - `RoomScreen`: em `setup`, o ator com estação vai direto a `RunningPhase` com `started = false`. Sai `evaluatorRoomKey` e o `sessionStorage` da "sala do avaliador".
  - `EvaluatorFooter`: antes de iniciar, "Trocar estação" (abre `StationPicker`) e "Iniciar estação" ligado quando `room.station && !room.invite_pending`; com o convite pendente, "Aguardando {nome} aceitar".
  - `useRoom`: chave do conteúdo com a etapa `"espera"` para quem não é o ator antes de começar.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/__tests__/duplaFluxoSimplesSala.test.tsx`:

```tsx
/**
 * Treino em Dupla · fluxo simples (desenho de 19/10) na SALA: preparação do ator com "Iniciar estação" (um toque), espera do
 * candidato sem nada da estação, papéis que vão direto à preparação, rodapé seguro no celular. Servidor simulado
 * (helpers/duplaSala). Pessoas e estação de TESTE.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CAND_STATION, NOW, advance, asCandidate, baseRoom, contentOf, serve, type Srv } from "./helpers/duplaSala";

const rpc = vi.fn();
const backend: any = { rpc };
const session: any = { backend, user: { id: "u-ana" }, dupla: { aberto: true, permitido: true, equipe: true } };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => session }));
const apito = vi.hoisted(() => ({ n: 0 }));
vi.mock("../novo/app/dupla/sound.js", () => ({ playWhistle: () => (apito.n += 1), installAudioWake: () => undefined }));

import { RoomScreen } from "../novo/app/dupla/room/RoomScreen.jsx";

const STATIONS = [{ id: "s9", name: "Outra estação", area: "Pediatria", area_code: "PED", number: 9 }];
const calls = (fn: string) => rpc.mock.calls.filter((c: any[]) => c[0] === fn);
let srv: Srv;
function ligar() {
  serve(rpc, srv);
  const base = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (fn: string, args: any = {}) => {
    if (fn === "app_dupla_stations") return STATIONS;
    if (fn === "app_dupla_room_done_stations") return [];
    return base(fn, args);
  });
}
async function mount(go = vi.fn()) {
  const view = render(<RoomScreen roomId="r1" go={go} />);
  await advance(0);
  await advance(0);
  await advance(0);
  return { ...view, go };
}
const candidatoEsperando = () => ({
  ...asCandidate(baseRoom({ phase: "setup" })), station: null, duration_ms: null, station_ready: true, porta: 1,
});
const conteudoEspera = { role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true };

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  apito.n = 0;
  srv = { room: baseRoom({ phase: "setup", station_ready: true, porta: 1 }), content: contentOf("evaluator"), marks: [], result: null, steps: {} };
  ligar();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Fluxo simples · preparação", () => {
  it("ator com a estação: entra direto na sala do avaliador; 'Iniciar estação' ligado sem prontidão; um toque inicia", async () => {
    srv.room = baseRoom({ phase: "setup", station_ready: true, me: { ...baseRoom().me, ready: false }, partner: { ...baseRoom().partner, ready: false } });
    srv.steps.app_dupla_start = () => ({ phase: "running", started_at: NOW, ends_at: "2026-10-11T15:10:00.000Z" });
    await mount();
    expect(screen.queryByRole("button", { name: "Estou pronto para iniciar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir sala do avaliador" })).toBeNull();
    expect(screen.getByText("Aguardando início")).toBeTruthy();
    const start = screen.getByRole("button", { name: "Iniciar estação" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    await advance(0);
    expect(calls("app_dupla_start")).toHaveLength(1);
    expect(screen.getByText("Em andamento")).toBeTruthy();
  });

  it("convite ainda não aceito: 'Iniciar estação' desligado e 'Aguardando Bruno aceitar'", async () => {
    srv.room = baseRoom({ phase: "setup", station_ready: true, invite_pending: true });
    await mount();
    expect((screen.getByRole("button", { name: "Iniciar estação" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Aguardando Bruno aceitar")).toBeTruthy();
  });

  it("ator troca a estação antes de iniciar pela lista do Banco de estações", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Trocar estação" }));
    await advance(0);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Outra estação/ }));
    await advance(0);
    expect(calls("app_dupla_set_station")[0][1]).toEqual({ p_room_id: "r1", p_station_id: "s9" });
    expect(document.body.textContent).not.toMatch(/Sortear estação/);
  });

  it("ator sem estação (match ou rodada nova): 'Escolher estação' abre a lista", async () => {
    srv.room = baseRoom({ phase: "setup", station: null, station_ready: false, duration_ms: null });
    srv.content = { role: null, station: null, pressing_count: 0, pressings: [] };
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Escolher estação" }));
    await advance(0);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Outra estação/ }));
    await advance(0);
    expect(calls("app_dupla_set_station")[0][1]).toEqual({ p_room_id: "r1", p_station_id: "s9" });
  });

  it("candidato de frente para a porta numerada ('Porta 1'), sem nada da estação; entra sozinho quando começa", async () => {
    srv.room = candidatoEsperando();
    srv.content = conteudoEspera;
    await mount();
    expect(screen.getByRole("img", { name: "Porta 1" })).toBeTruthy();
    // helpers/duplaSala: asCandidate troca também os nomes (eu = Bruno, candidato; parceira = Ana, atriz)
    expect(screen.getByText("Aguardando Ana iniciar a estação")).toBeTruthy();
    const texto = document.body.textContent ?? "";
    for (const proibido of ["Estação 3", "Clínica Médica", "INEP", "2020", "Escolher estação", "Iniciar estação"]) expect(texto, proibido).not.toContain(proibido);
    srv.room = { ...srv.room, rev: srv.room.rev + 1, phase: "running", station: CAND_STATION, duration_ms: 600000, started_at: NOW, ends_at: "2026-10-11T15:10:00.000Z" };
    srv.content = contentOf("candidate");
    await advance(2000);
    await advance(0);
    expect(screen.getByText("Em andamento")).toBeTruthy();
  });

  it("candidato sem estação escolhida (match ou rodada nova): só 'O ator está escolhendo a estação', sem porta", async () => {
    srv.room = { ...candidatoEsperando(), station_ready: false, porta: null };
    srv.content = conteudoEspera;
    await mount();
    expect(screen.getByText("O ator está escolhendo a estação")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Porta/ })).toBeNull();
  });

  it("nunca há porta sem número: estação escolhida sem porta mostra só o texto de espera", async () => {
    srv.room = { ...candidatoEsperando(), porta: null };
    srv.content = conteudoEspera;
    await mount();
    expect(screen.getByText("Aguardando Ana iniciar a estação")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Porta/ })).toBeNull();
  });

  it("a porta: SVG acessível 'Porta N', só com tokens do design system", () => {
    const fonte = fs.readFileSync(path.resolve(__dirname, "../novo/app/dupla/room/Porta.jsx"), "utf8");
    expect(fonte).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    expect(fonte).toContain('role="img"');
    expect(fonte).toContain("aria-label={`Porta ${numero}`}");
    expect(fonte).toContain("width:min(220px,60vw)"); // cabe no celular sem rolar para o lado
  });

  it("papéis: escolher o papel vai direto à preparação, sem 'Confirmar papéis e conectar'", async () => {
    srv.room = baseRoom({
      phase: "roles", station: null, station_ready: false,
      me: { ...baseRoom().me, role: null }, partner: { ...baseRoom().partner, role: null },
    });
    srv.content = { role: null, station: null, pressing_count: 0, pressings: [] };
    srv.steps.app_dupla_set_roles = () => ({
      phase: "setup", me: { ...srv.room.me, role: "evaluator" }, partner: { ...srv.room.partner, role: "candidate" },
    });
    await mount();
    expect(screen.queryByRole("button", { name: "Confirmar papéis e conectar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Ator\/Avaliador/ }));
    await advance(0);
    await advance(0);
    expect(calls("app_dupla_set_roles")[0][1]).toEqual({ p_room_id: "r1", p_candidate_id: "u-bruno" });
    expect(screen.getByRole("button", { name: "Escolher estação" })).toBeTruthy();
  });

  it("sem link de chamada em nenhuma tela da preparação", async () => {
    await mount();
    expect(screen.queryByLabelText(/link/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Link da reunião|Meet|WhatsApp/);
  });

  it("celular: o rodapé da sala respeita a área segura de baixo (iPhone)", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../novo/app/dupla/room/sala.css"), "utf8");
    const regras = css.match(/\.dupla-foot\{[^}]*\}/g) ?? [];
    expect(regras.length).toBeGreaterThanOrEqual(2);
    for (const r of regras) expect(r).toContain("env(safe-area-inset-bottom, 0px)");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesSala.test.tsx --maxWorkers=2
```
Esperado: FAIL — aparece "Estou pronto para iniciar"/"Abrir sala do avaliador"; não há "Trocar estação" no rodapé; a porta e os textos da espera não existem (`Porta.jsx` não existe); "Confirmar papéis e conectar" aparece; CSS sem área segura.

- [ ] **Step 3: `useRoom.js` — chave do conteúdo com a espera**

Troque a função `contentKeyOf` inteira por:

```js
/**
 * O conteúdo do meu papel muda com a rodada, a fase (papéis → espera/sala → resultado), o papel, a estação e, para o candidato,
 * os liberados. Fluxo simples (014140): quem não é o ator não recebe nada antes de começar ("espera"); ao começar, a chave muda e
 * o conteúdo é lido de novo.
 */
function contentKeyOf(room) {
  if (!room || room.phase === "closed") return null;
  const role = room.me?.role ?? "";
  const waiting = role !== "evaluator" && ["connecting", "setup"].includes(room.phase);
  const stage = room.phase === "roles" ? "roles" : room.phase === "result" ? "result" : waiting ? "espera" : "sala";
  const station = room.station ? room.station.id ?? room.station.label ?? "?" : "";
  const released = role === "candidate" ? (room.released_pressings || []).join(",") : "";
  return [room.round, stage, role, station, released].join("|");
}
```

- [ ] **Step 4a: `porta.js` e `Porta.jsx` — a porta numerada**

Crie `src/novo/app/dupla/porta.js`:

```js
// Treino em Dupla · entrada na estação (dono, 19/10): o candidato fica de frente para a porta da área e, ao iniciar, o apito e a
// porta abrindo acontecem juntos, pelo relógio do SERVIDOR. A migração 014150 grava started_at = toque do ator + 2 s.

/** Duração do apito (playWhistle, sound.js) e da porta abrindo, em ms. A 014150 usa o mesmo valor ("interval '2 seconds'"). */
export const APITO_MS = 2000;
```

Crie `src/novo/app/dupla/room/Porta.jsx`:

```jsx
// Treino em Dupla · a porta da estação (dono, 19/10): o candidato fica "de frente para a porta" com o número da ÁREA, como na
// prova (1 Clínica Médica, 2 Cirurgia Geral, 3 Pediatria, 4 Ginecologia e Obstetrícia, 5 MFC/Saúde Coletiva). O número vem do
// servidor (`room.porta`, 014140); nunca há porta sem número (quem chama não desenha a porta sem `numero`). Ao iniciar, a porta
// abre durante o apito, no tempo do servidor (porta.js). Só tokens do design system; o leitor de tela ouve "Porta N".
import React from "react";
import { APITO_MS } from "../porta.js";

const CSS = `
@keyframes dupla-porta-abre{from{transform:perspective(700px) rotateY(0deg)}to{transform:perspective(700px) rotateY(-78deg)}}
.dupla-porta{display:block;width:min(220px,60vw);height:auto;margin:0 auto}
.dupla-porta__folha{transform-origin:46px 50%;transform-box:view-box}
.dupla-porta[data-estado="abrindo"][data-animar="sim"] .dupla-porta__folha{animation:dupla-porta-abre ${APITO_MS}ms linear forwards}
.dupla-porta[data-estado="aberta"] .dupla-porta__folha{transform:perspective(700px) rotateY(-78deg)}
@media (prefers-reduced-motion:reduce){.dupla-porta__folha{animation:none!important}}
`;

/** O aparelho pede menos movimento? (Com isso a porta troca sem animação.) */
export function prefereMenosMovimento() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

/**
 * @param {{ numero: number, estado?: "fechada" | "abrindo" | "aberta", jaPassouMs?: number }} p
 *   jaPassouMs: quanto do apito já passou no relógio do servidor; a animação começa desse ponto (atraso negativo) para os dois
 *   aparelhos ficarem juntos.
 */
export function Porta({ numero, estado = "fechada", jaPassouMs = 0 }) {
  const animar = !prefereMenosMovimento();
  const atraso = Math.max(0, Math.min(APITO_MS, jaPassouMs));
  return (
    <svg className="dupla-porta" viewBox="0 0 200 300" role="img" aria-label={`Porta ${numero}`} data-estado={estado} data-animar={animar ? "sim" : "nao"}>
      <style>{CSS}</style>
      <rect x="30" y="20" width="140" height="270" rx="6" fill="var(--surface-sunken)" stroke="var(--border-strong)" strokeWidth="6" />
      <g className="dupla-porta__folha" style={estado === "abrindo" && animar ? { animationDelay: `-${atraso}ms` } : undefined}>
        <rect x="46" y="34" width="108" height="250" rx="4" fill="var(--surface-card)" stroke="var(--border-default)" strokeWidth="3" />
        <circle cx="138" cy="164" r="6" fill="var(--text-brand)" />
        <rect x="70" y="70" width="60" height="60" rx="30" fill="var(--surface-brand-soft)" />
        <text x="100" y="112" textAnchor="middle" fontSize="40" fontWeight="800" fill="var(--text-primary)" aria-hidden="true">
          {numero}
        </text>
      </g>
    </svg>
  );
}
```

- [ ] **Step 4: `SetupPhase.jsx` — reescrever**

Substitua o arquivo inteiro por:

```jsx
// Fase "setup" no fluxo simples (dono, 19/10): sem prontidão, sem conexão e sem link (a conversa é por fora). O ator com a estação
// escolhida vai direto à "sala do avaliador" (RunningPhase antes do início, decidido em RoomScreen). Aqui ficam só:
//  - o ator ainda SEM estação (sala do match ou rodada nova): escolhe pela lista do Banco de estações;
//  - o candidato, de frente para a PORTA com o número da área (dono, 19/10) e SEM mais nada da estação (nem nome, número da
//    estação, área por escrito ou origem: o servidor nem manda, 014140). Sem estação escolhida: "O ator está escolhendo a
//    estação", sem porta (nunca há porta sem número).
import React from "react";
import { Button, Card, Icon } from "../../../ds";
import { OwnQuotaLine } from "../CreditHeader.jsx";
import { PairHeader, RoleBand, firstName, pageStyle } from "./parts.jsx";
import { Porta } from "./Porta.jsx";
import { StationPicker } from "./StationPicker.jsx";

const status = { display: "flex", alignItems: "center", gap: 10, font: "600 var(--text-sm)/1.45 var(--font-sans)", color: "var(--text-primary)" };
const note = { margin: "10px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" };

/** Texto da espera do candidato: o servidor diz só se a estação já foi escolhida (`station_ready`), nunca qual é. */
export function candidateWaitText(room) {
  const ator = firstName(room.partner?.public_name) || "o ator";
  return room.station_ready ? `Aguardando ${ator} iniciar a estação` : "O ator está escolhendo a estação";
}

export function SetupPhase({ room, actions, askLeave }) {
  const [picking, setPicking] = React.useState(false);
  const isEval = room.me.role === "evaluator";
  const partner = room.partner.public_name;
  const leave = () => (askLeave ? askLeave("sair") : actions.leave());

  return (
    <main style={pageStyle}>
      <PairHeader
        room={room}
        title={`Sala com ${partner}`}
        subtitle={isEval ? "Você é o ator: escolha a estação para começar." : "A conversa é por fora (WhatsApp, Meet ou ligação)."}
      />
      <RoleBand room={room} />
      <OwnQuotaLine roomId={room.id} />
      {isEval ? (
        <Card padding={20}>
          <div style={status}>
            <Icon name="clipboard-list" size={20} style={{ color: "var(--text-brand)" }} />
            Escolha a estação na lista do Banco de estações.
          </div>
          <p style={note}>{`${firstName(partner)} só vê a estação quando você iniciar o atendimento.`}</p>
          <div style={{ marginTop: 14 }}>
            <Button size="lg" icon="clipboard-list" onClick={() => setPicking(true)}>
              Escolher estação
            </Button>
          </div>
        </Card>
      ) : (
        <Card padding={20}>
          {room.station_ready && room.porta ? <Porta numero={room.porta} /> : null}
          <div role="status" style={{ ...status, justifyContent: "center", marginTop: room.station_ready && room.porta ? 14 : 0 }}>
            <Icon name="loader" size={20} style={{ color: "var(--text-brand)" }} />
            {candidateWaitText(room)}
          </div>
          <p style={{ ...note, textAlign: "center" }}>O enunciado aparece quando a porta abrir.</p>
          {room.me.seen_station && (
            <p role="note" style={{ ...note, color: "var(--warning-text)", fontWeight: 600 }}>
              Você já viu esta estação, então já conhece o tema. Se quiserem, o ator pode trocar a estação.
            </p>
          )}
        </Card>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="ghost" icon="log-out" onClick={leave}>
          Sair da sala
        </Button>
      </div>
      {picking && isEval && (
        <StationPicker
          roomId={room.id}
          title="Escolher estação"
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            actions.setStation(id);
          }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 5: `RoomScreen.jsx` — ator com estação vai direto à sala do avaliador**

(a) No comentário do topo, troque a frase `Aqui também: sinal de presença na sala, apito (início e fim do tempo), aviso "Reconectando…", confirmação de saída e a "sala do avaliador" aberta antes do início (estado só desta aba, em sessionStorage; o servidor continua em "setup").` por `Aqui também: sinal de presença na sala, apito (início e fim do tempo), aviso "Reconectando…" e confirmação de saída. Fluxo simples (19/10): em "setup", o ator com a estação escolhida vê direto a sala do avaliador (RunningPhase antes do início) com "Iniciar estação".`

(b) Apague o bloco inteiro que vai de `/** Chave da "sala do avaliador" aberta antes do início, por sala e rodada (só nesta aba). */` até o fim de `function writeSession(key) { … }`.

(c) Apague o bloco
```js
  // Sala do avaliador aberta antes do início (só nesta aba).
  const evalKey = room ? evaluatorRoomKey(room.id, room.round) : null;
  const [evalOpen, setEvalOpen] = React.useState(false);
  React.useEffect(() => {
    setEvalOpen(evalKey ? readSession(evalKey) : false);
  }, [evalKey]);
  const openEvaluatorRoom = React.useCallback(() => {
    if (evalKey) writeSession(evalKey);
    setEvalOpen(true);
  }, [evalKey]);
```

(d) Troque
```js
  const inEvaluatorRoom = room.phase === "setup" && isEval && evalOpen;
```
por
```js
  // Fluxo simples: o ator com a estação escolhida vai direto à sala do avaliador (lê roteiro, impressos e PEP e inicia).
  const inEvaluatorRoom = room.phase === "setup" && isEval && Boolean(room.station);
```

(e) Apague a linha `        openEvaluatorRoom={openEvaluatorRoom}` das props de `<Phase … />`.

- [ ] **Step 6: `EvaluatorFooter.jsx` — "Trocar estação" e "Iniciar estação" sem prontidão**

(a) Imports: depois de `import { formatClock } from "../clock.js";` acrescente
```js
import { firstName } from "./parts.jsx";
import { StationPicker } from "./StationPicker.jsx";
```

(b) Troque
```js
  const [busy, setBusy] = React.useState(false);
```
por
```js
  const [busy, setBusy] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
```

(c) Troque
```js
  const both = room.me.ready && room.partner.ready;
```
por
```js
  // Fluxo simples (19/10): um toque do ator. Precisa só da estação e do convite aceito (o servidor confere de novo).
  const canStart = Boolean(room.station) && !room.invite_pending;
```

(d) Troque
```jsx
        <Button icon="play" disabled={!both || busy} onClick={once(() => actions.start())}>
          Iniciar estação
        </Button>
      )}
    </div>
```
por
```jsx
        <>
          {room.invite_pending && (
            <span role="status" className="dupla-time__mode" data-state="reduced">
              {`Aguardando ${firstName(room.partner.public_name)} aceitar`}
            </span>
          )}
          <Button variant="ghost" icon="clipboard-list" disabled={busy} onClick={() => setPicking(true)}>
            Trocar estação
          </Button>
          <Button icon="play" disabled={!canStart || busy} onClick={once(() => actions.start())}>
            Iniciar estação
          </Button>
        </>
      )}
      {picking && (
        <StationPicker
          roomId={room.id}
          title="Trocar estação"
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            actions.setStation(id);
          }}
        />
      )}
    </div>
```

- [ ] **Step 7: `RolesPhase.jsx` — sem confirmar**

(a) Troque o `subtitle` do `PairHeader` inteiro (as duas linhas do ternário `room.round > 1 ? … : …`) por:
```jsx
        subtitle={
          room.round > 1
            ? `Rodada ${room.round}: definam os papéis; a estação precisa ser diferente das que vocês já treinaram nesta sala.`
            : "Definam quem será o candidato e quem será o ator/avaliador. Com os papéis definidos, a sala vai direto para a preparação."
        }
```

(b) Apague o bloco
```jsx
        {room.me.confirmed ? (
          <Button size="lg" variant="secondary" icon="loader" disabled>
            Aguardando {partnerName} confirmar os papéis
          </Button>
        ) : (
          <Button size="lg" icon="plug-zap" disabled={!ready} onClick={() => actions.confirmRoles()}>
            Confirmar papéis e conectar
          </Button>
        )}
```
e a linha `  const ready = Boolean(station && room.me.role);` (deixa de ser usada).

- [ ] **Step 8: `sala.css` — área segura do rodapé**

Troque `padding:10px 28px;background:var(--surface-card);border-top` por `padding:10px 28px calc(10px + env(safe-area-inset-bottom, 0px));background:var(--surface-card);border-top` e troque `@media (max-width:900px){.dupla-foot{padding:10px 16px}}` por `@media (max-width:900px){.dupla-foot{padding:10px 16px calc(10px + env(safe-area-inset-bottom, 0px))}}`.

- [ ] **Step 9: Rodar e ver passar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesSala.test.tsx --maxWorkers=2
```
Esperado: PASS (11 testes).

- [ ] **Step 10: Ajustar os testes antigos da sala que o desenho muda**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaSalaPreparo.test.tsx src/__tests__/duplaSalaFases.test.tsx src/__tests__/duplaSalaRodape.test.tsx src/__tests__/duplaSalaAoVivo.test.tsx src/__tests__/duplaSalaEstacao.test.tsx src/__tests__/duplaSalaFechadaSozinho.test.tsx src/__tests__/duplaCreditosTela.test.tsx src/__tests__/duplaTempoReal.test.tsx --maxWorkers=2
```

| Arquivo · teste | Correção |
|---|---|
| `duplaSalaPreparo` · "papéis: escolher, sortear, trocar estação (só o avaliador) e confirmar…" | tire a parte do "Confirmar papéis e conectar"/"Aguardando Bruno Lima confirmar os papéis" (não existe mais); mantenha escolher, sortear e trocar estação |
| `duplaSalaPreparo` · "preparação: só prontidão…" e "abrir a sala do avaliador guarda o estado…" | apague os dois (cobertos por `duplaFluxoSimplesSala` "ator com a estação…") |
| `duplaSalaPreparo` · "candidato espera e entra sozinho…" | monte a sala do candidato com `station: null, station_ready: true, porta: 1` e conteúdo `{ role: "candidate", station: null, pressing_count: 0, pressings: [], waiting: true }`; troque `"Só o avaliador inicia"` por `"Aguardando Bruno iniciar a estação"` nas duas linhas (o `asCandidate` desse arquivo troca só os papéis, não os nomes: o parceiro avaliador é o Bruno Lima) |
| `duplaSalaFases` · "preparação: só a prontidão; avaliador abre a sala do avaliador…" | troque por: avaliador em `setup` com estação vê "Aguardando início" e "Iniciar estação"; candidato vê `candidateWaitText` ("Aguardando … iniciar a estação") |
| `duplaSalaFases` · "preparação (Etapa P): candidato vê só 'Estação N · Área'…" | o desenho muda: o candidato NÃO vê "Estação N · Área" antes de começar; troque a expectativa por `expect(document.body.textContent).not.toContain("Estação 3")` e pelo texto de espera; título: `"preparação (fluxo simples, 19/10): candidato não vê nada da estação antes de começar"` |
| `duplaSalaFases` · "decisões do dono (16/10): origem sempre visível…" | a parte "origem sempre visível ao candidato" vale só em `running` (monte em `running`); o aviso "Você já viu esta estação" em `setup` agora vem da `SetupPhase` ("Você já viu esta estação, então já conhece o tema.") |
| `duplaSalaRodape` · "antes de iniciar: … Iniciar desligado sem os dois prontos" | "Iniciar estação" fica LIGADO sem prontidão; desligado só com `invite_pending: true` ou sem estação; título sem "sem os dois prontos" |
| `duplaSalaPreparo`/`duplaSalaFases` que importam `evaluatorRoomKey` | apague o import e o uso (a chave não existe mais) |

Rode de novo. Esperado: PASS.

- [ ] **Step 11: Commit**

```bash
cd "$W" && git add src/novo/app/dupla/porta.js src/novo/app/dupla/room/Porta.jsx src/novo/app/dupla/room/RoomScreen.jsx src/novo/app/dupla/room/SetupPhase.jsx src/novo/app/dupla/room/EvaluatorFooter.jsx src/novo/app/dupla/room/RolesPhase.jsx src/novo/app/dupla/room/useRoom.js src/novo/app/dupla/room/sala.css src/__tests__/duplaFluxoSimplesSala.test.tsx src/__tests__/duplaSalaPreparo.test.tsx src/__tests__/duplaSalaFases.test.tsx src/__tests__/duplaSalaRodape.test.tsx && git commit -m "$(cat <<'EOF'
Treino em Dupla, fluxo simples (sala): ator vai direto a preparacao com Iniciar estacao e Trocar estacao; candidato de frente para a porta numerada da area; papeis sem confirmar; rodape com area segura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Apito e porta sincronizados — a porta abre durante o apito, pelo relógio do servidor, e o candidato entra quando ele acaba

**Files:**
- Modify: `src/novo/app/dupla/porta.js` (linha do tempo), `src/novo/app/dupla/room/Porta.jsx` (`PortaEntrada`), `src/novo/app/dupla/room/RoomScreen.jsx`, `src/novo/app/dupla/sound.js`
- Create: `src/__tests__/duplaFluxoSimplesPorta.test.ts`
- Modify: `src/__tests__/duplaFluxoSimplesSala.test.tsx`, `src/__tests__/duplaSalaRodape.test.tsx`, `src/__tests__/duplaSalaPreparo.test.tsx`

**Interfaces:**
- Consumes: estado da sala com `started_at`/`ends_at` gravados pela 014150 (`started_at` = toque do ator + 2 s) e `server_now`; `offsetMs` de `useRoom` (diferença de relógio medida por `measureOffset`); `room.porta` (014140); `Porta`, `APITO_MS` (Tarefa 5); `playWhistle` (`sound.js`).
- Produces (em `porta.js`, funções puras, sem `Date.now()`; quem chama passa a hora do servidor = `Date.now() + offsetMs`):
  - `APITO_TOLERANCIA_MS = 1000`.
  - `entrada(room, serverNowMs) → { etapa: "fechada" | "abrindo" | "aberta", apitoEm: number | null, abreEm: number | null, faltaMs: number }` — "abrindo" de `started_at − APITO_MS` até `started_at`.
  - `deveApitar(entrada, serverNowMs, jaApitou: boolean) → boolean` — só na etapa "abrindo", uma vez, com atraso de até 1 s.
  - `tempoMostrado(entrada, restanteMs: number | null, duracaoMs: number | null) → number | null` — durante a porta abrindo, a duração cheia.
  - `PortaEntrada({ room, entrada })` em `Porta.jsx`: tela dos dois aparelhos enquanto a porta abre ("A estação vai começar").

- [ ] **Step 1: Escrever o teste da linha do tempo (falha)**

Crie `src/__tests__/duplaFluxoSimplesPorta.test.ts`:

```ts
// @vitest-environment node
/**
 * Treino em Dupla · entrada na estação (dono, 19/10): linha do tempo do apito e da porta (porta.js). Funções PURAS do relógio do
 * servidor: o teste passa a hora; nada de Date.now().
 */
import { describe, expect, it } from "vitest";
import { APITO_MS, APITO_TOLERANCIA_MS, deveApitar, entrada, tempoMostrado } from "../novo/app/dupla/porta.js";

const T = Date.parse("2026-10-19T15:00:02.000Z"); // started_at: a porta termina de abrir aqui
const sala = (o: Record<string, unknown> = {}) => ({ phase: "running", started_at: new Date(T).toISOString(), ...o });

describe("porta.js · entrada na estação", () => {
  it("o apito dura 2 s e o atraso tolerado é 1 s", () => {
    expect(APITO_MS).toBe(2000);
    expect(APITO_TOLERANCIA_MS).toBe(1000);
  });

  it("antes de começar a porta está fechada; sala já em andamento sem início gravado (antiga) está aberta", () => {
    expect(entrada({ phase: "setup", started_at: null }, T).etapa).toBe("fechada");
    expect(entrada(null, T).etapa).toBe("fechada");
    expect(entrada({ phase: "running", started_at: null }, T)).toEqual({ etapa: "aberta", apitoEm: null, abreEm: null, faltaMs: 0 });
  });

  it("2 s antes do início a porta começa a abrir; no início ela está aberta", () => {
    expect(entrada(sala(), T - 2500)).toMatchObject({ etapa: "fechada", faltaMs: 2500 });
    expect(entrada(sala(), T - 2000)).toEqual({ etapa: "abrindo", apitoEm: T - 2000, abreEm: T, faltaMs: 2000 });
    expect(entrada(sala(), T - 1)).toMatchObject({ etapa: "abrindo", faltaMs: 1 });
    expect(entrada(sala(), T)).toMatchObject({ etapa: "aberta", faltaMs: 0 });
    expect(entrada(sala({ phase: "review" }), T + 60000).etapa).toBe("aberta");
  });

  it("dois aparelhos com relógios diferentes, mesma hora do servidor: mesma etapa", () => {
    const servidor = T - 1200;
    const ator = { aparelho: servidor - 30000, diferenca: 30000 };
    const candidato = { aparelho: servidor + 45000, diferenca: -45000 };
    expect(entrada(sala(), ator.aparelho + ator.diferenca)).toEqual(entrada(sala(), candidato.aparelho + candidato.diferenca));
  });

  it("apita uma vez, e só se o atraso desde o começo do apito for de até 1 s", () => {
    const cedo = T - 2000 + 300;
    expect(deveApitar(entrada(sala(), cedo), cedo, false)).toBe(true);
    expect(deveApitar(entrada(sala(), cedo), cedo, true)).toBe(false);
    const tarde = T - 2000 + 1500;
    expect(deveApitar(entrada(sala(), tarde), tarde, false)).toBe(false);
    expect(deveApitar(entrada(sala(), T + 100), T + 100, false)).toBe(false);
  });

  it("cronômetro: enquanto a porta abre mostra a duração cheia; depois, o que o servidor diz (inclusive +1 min)", () => {
    expect(tempoMostrado(entrada(sala(), T - 1000), 601000, 600000)).toBe(600000);
    expect(tempoMostrado(entrada(sala(), T + 1000), 599000, 600000)).toBe(599000);
    expect(tempoMostrado(entrada(sala(), T + 1000), 659000, 600000)).toBe(659000);
    expect(tempoMostrado(entrada({ phase: "setup" }, T), null, 600000)).toBe(600000);
  });
});
```

- [ ] **Step 2: Escrever os testes da tela (falham)**

No fim de `src/__tests__/duplaFluxoSimplesSala.test.tsx`, acrescente:

```tsx
const T0 = Date.parse(NOW);
const em = (ms: number) => new Date(T0 + ms).toISOString();
// No servidor simulado, cada estado novo chega com server_now = NOW: no relógio do servidor, "agora" é NOW quando ele chega.

describe("Fluxo simples · apito e porta", () => {
  it("candidato: a porta numerada abre durante o apito e, quando acaba, aparecem a folha e o cronômetro de 10 min", async () => {
    srv.room = candidatoEsperando();
    srv.content = conteudoEspera;
    await mount();
    srv.room = { ...srv.room, rev: srv.room.rev + 1, phase: "running", station: CAND_STATION, duration_ms: 600000, started_at: em(1700), ends_at: em(601700) };
    srv.content = contentOf("candidate");
    await advance(2000); // a consulta de 2 s traz o início: o apito começou há 300 ms (relógio do servidor)
    expect(screen.getByRole("img", { name: "Porta 1" }).getAttribute("data-estado")).toBe("abrindo");
    expect(screen.getByText("A estação vai começar")).toBeTruthy();
    expect(screen.queryByText("INSTRUÇÕES AO PARTICIPANTE")).toBeNull();
    expect(apito.n).toBe(1);
    await advance(1800);
    await advance(0);
    expect(screen.queryByRole("img", { name: "Porta 1" })).toBeNull();
    expect(screen.getByText("INSTRUÇÕES AO PARTICIPANTE")).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toMatch(/10:00|09:59/);
    expect(apito.n).toBe(1);
  });

  it("ator: o toque em 'Iniciar estação' mostra a mesma porta abrindo e o apito; depois, a estação em andamento", async () => {
    srv.steps.app_dupla_start = () => ({ phase: "running", started_at: em(2000), ends_at: em(602000) });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar estação" }));
    await advance(0);
    expect(screen.getByRole("img", { name: "Porta 1" }).getAttribute("data-estado")).toBe("abrindo");
    expect(apito.n).toBe(1);
    await advance(2100);
    expect(screen.queryByRole("img", { name: "Porta 1" })).toBeNull();
    expect(screen.getAllByText("Em andamento").length).toBeGreaterThan(0);
  });

  it("início que chega atrasado mais de 1 s: a porta abre no tempo do servidor, sem apito", async () => {
    srv.room = candidatoEsperando();
    srv.content = conteudoEspera;
    await mount();
    srv.room = { ...srv.room, rev: srv.room.rev + 1, phase: "running", station: CAND_STATION, duration_ms: 600000, started_at: em(500), ends_at: em(600500) };
    srv.content = contentOf("candidate");
    await advance(2000);
    expect(screen.getByRole("img", { name: "Porta 1" })).toBeTruthy();
    expect(apito.n).toBe(0);
    await advance(600);
    await advance(0);
    expect(screen.getByText("INSTRUÇÕES AO PARTICIPANTE")).toBeTruthy();
    expect(apito.n).toBe(0);
  });

  it("abrir a sala com a porta já aberta: direto na estação, sem porta e sem apito", async () => {
    srv.room = { ...candidatoEsperando(), phase: "running", station: CAND_STATION, duration_ms: 600000, started_at: em(-5000), ends_at: em(595000) };
    srv.content = contentOf("candidate");
    await mount();
    expect(screen.queryByRole("img", { name: /Porta/ })).toBeNull();
    expect(screen.getByText("INSTRUÇÕES AO PARTICIPANTE")).toBeTruthy();
    expect(apito.n).toBe(0);
  });

  it("movimento reduzido: a porta troca sem animação (no mesmo tempo)", async () => {
    const antes = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }) as any;
    try {
      srv.steps.app_dupla_start = () => ({ phase: "running", started_at: em(2000), ends_at: em(602000) });
      await mount();
      fireEvent.click(screen.getByRole("button", { name: "Iniciar estação" }));
      await advance(0);
      expect(screen.getByRole("img", { name: "Porta 1" }).getAttribute("data-animar")).toBe("nao");
      await advance(2100);
      expect(screen.queryByRole("img", { name: "Porta 1" })).toBeNull();
    } finally {
      window.matchMedia = antes;
    }
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesPorta.test.ts src/__tests__/duplaFluxoSimplesSala.test.tsx --maxWorkers=2
```
Esperado: FAIL — `entrada`, `deveApitar`, `tempoMostrado` e `APITO_TOLERANCIA_MS` não existem; a sala vai direto à estação sem porta; o apito toca na troca de fase.

- [ ] **Step 4: `porta.js` — a linha do tempo**

No fim de `src/novo/app/dupla/porta.js`, acrescente:

```js
/** Apito que chegaria atrasado mais que isto (rede lenta, aba no fundo, sala aberta depois) não toca: a porta abre sem som. */
export const APITO_TOLERANCIA_MS = 1000;

const ANTES_DE_COMECAR = new Set(["roles", "connecting", "setup"]);

/**
 * Etapa da entrada na estação, pela hora do SERVIDOR (função pura: quem chama passa `Date.now() + offsetMs`).
 * "fechada" antes de começar e até o apito começar (started_at − APITO_MS); "abrindo" durante o apito; "aberta" a partir de
 * started_at (ou já começada sem started_at gravado).
 * @param {{ phase?: string, started_at?: string | null } | null} room
 * @param {number} serverNowMs
 * @returns {{ etapa: "fechada" | "abrindo" | "aberta", apitoEm: number | null, abreEm: number | null, faltaMs: number }}
 */
export function entrada(room, serverNowMs) {
  const abreEm = room?.started_at ? Date.parse(room.started_at) : NaN;
  if (!room || ANTES_DE_COMECAR.has(room.phase)) return { etapa: "fechada", apitoEm: null, abreEm: null, faltaMs: 0 };
  // Já começou, mas sem início gravado (sala antiga): a porta já está aberta, sem apito.
  if (!Number.isFinite(abreEm)) return { etapa: "aberta", apitoEm: null, abreEm: null, faltaMs: 0 };
  const apitoEm = abreEm - APITO_MS;
  if (serverNowMs < apitoEm) return { etapa: "fechada", apitoEm, abreEm, faltaMs: abreEm - serverNowMs };
  if (serverNowMs < abreEm) return { etapa: "abrindo", apitoEm, abreEm, faltaMs: abreEm - serverNowMs };
  return { etapa: "aberta", apitoEm, abreEm, faltaMs: 0 };
}

/**
 * Toca o apito agora? Só na etapa "abrindo", uma vez por rodada (`jaApitou`), e só se o atraso desde o começo do apito for de
 * até APITO_TOLERANCIA_MS.
 */
export function deveApitar(e, serverNowMs, jaApitou) {
  return e.etapa === "abrindo" && !jaApitou && serverNowMs - e.apitoEm <= APITO_TOLERANCIA_MS;
}

/** Tempo do cronômetro: enquanto a porta abre, a duração cheia (os 10 minutos começam com a porta aberta). */
export function tempoMostrado(e, restanteMs, duracaoMs) {
  if (restanteMs == null) return duracaoMs ?? null;
  return e.etapa === "abrindo" && typeof duracaoMs === "number" ? Math.min(restanteMs, duracaoMs) : restanteMs;
}
```

- [ ] **Step 5: `Porta.jsx` — a tela da porta abrindo**

No fim de `src/novo/app/dupla/room/Porta.jsx`, acrescente:

```jsx
/**
 * Tela dos dois aparelhos enquanto a porta abre (apito tocando). Sem número de porta (nunca deve acontecer: o servidor manda a
 * porta de toda estação da prova), só o texto.
 * @param {{ room: { porta?: number | null }, entrada: { etapa: string, faltaMs: number } }} p
 */
export function PortaEntrada({ room, entrada }) {
  const jaPassou = APITO_MS - (entrada.faltaMs ?? APITO_MS);
  return (
    <main
      role="status"
      aria-live="polite"
      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "32px 16px", boxSizing: "border-box" }}
    >
      {room.porta ? <Porta numero={room.porta} estado={entrada.etapa === "abrindo" ? "abrindo" : "fechada"} jaPassouMs={jaPassou} /> : null}
      <p style={{ margin: 0, font: "700 var(--text-lg)/1.3 var(--font-sans)", color: "var(--text-primary)", textAlign: "center" }}>A estação vai começar</p>
    </main>
  );
}
```

- [ ] **Step 6: `RoomScreen.jsx` — porta, apito e cronômetro pelo relógio do servidor**

(a) Imports: depois de `import { remainingMs as remainingFrom } from "../clock.js";` acrescente
```js
import { deveApitar, entrada, tempoMostrado } from "../porta.js";
import { PortaEntrada } from "./Porta.jsx";
```

(b) Substitua a função `useWhistle` inteira (do comentário `/**` que começa com `* Apito: ao ver a fase passar a "running"` até o `}` que fecha a função) por:
```js
/**
 * Apito (dono, 19/10). O do início toca quando a porta começa a abrir, pelo relógio do SERVIDOR (deveApitar, porta.js): uma vez
 * por rodada e só com atraso de até 1 s (rede lenta, aba no fundo, sala aberta depois: a porta abre sem som). O do fim toca uma
 * vez por rodada ao chegar a 00:00 e volta a armar se o tempo passar de zero de novo (+1 min). Abrir já em 00:00 não apita.
 * Som desligado: playWhistle não toca (sound.js), e a porta abre no mesmo tempo.
 */
function useWhistle(room, porta, serverNowMs, remaining) {
  const inicio = React.useRef({ round: null, feito: false });
  const armed = React.useRef({ round: null, on: false });
  const phase = room?.phase ?? null;
  const round = room?.round ?? null;
  React.useEffect(() => {
    if (inicio.current.round !== round) inicio.current = { round, feito: false };
    if (deveApitar(porta, serverNowMs, inicio.current.feito)) playWhistle();
    if (porta.etapa !== "fechada") inicio.current.feito = true;
  }, [round, porta, serverNowMs]);
  React.useEffect(() => {
    if (phase !== "running" || remaining == null) return;
    if (armed.current.round !== round) armed.current = { round, on: false };
    if (remaining > 0) armed.current.on = true;
    else if (armed.current.on) {
      armed.current.on = false;
      playWhistle();
    }
  }, [phase, round, remaining]);
}
```

(c) Troque
```js
  const fromServer = remainingFrom(room, now, offsetMs);
  const remaining = fromServer ?? (typeof room?.duration_ms === "number" ? room.duration_ms : null);
  useWhistle(room, fromServer);
```
por
```js
  // Entrada na estação (dono, 19/10): apito e porta pelo relógio do SERVIDOR, iguais nos dois aparelhos (porta.js).
  const serverNow = now + (Number.isFinite(offsetMs) ? offsetMs : 0);
  const porta = entrada(room, serverNow);
  const fromServer = remainingFrom(room, now, offsetMs);
  const remaining = tempoMostrado(porta, fromServer, typeof room?.duration_ms === "number" ? room.duration_ms : null);
  useWhistle(room, porta, serverNow, fromServer);
```

(d) Logo depois de `if (!Phase) return null;` acrescente:
```js
  // Porta abrindo nos dois aparelhos (apito tocando): a estação aparece quando ela termina de abrir.
  const entrando = room.phase === "running" && porta.etapa !== "aberta";
```

(e) Troque
```jsx
      <Phase
        room={room}
```
por
```jsx
      {entrando ? (
        <PortaEntrada room={room} entrada={porta} />
      ) : (
      <Phase
        room={room}
```
e troque
```jsx
        progress={{ access, channelReady, partnerPresent: partnerPresent === true }}
      />
```
por
```jsx
        progress={{ access, channelReady, partnerPresent: partnerPresent === true }}
      />
      )}
```

- [ ] **Step 7: `sound.js` — a duração do apito vem de `APITO_MS`**

No topo de `src/novo/app/dupla/sound.js`, depois do comentário, acrescente `import { APITO_MS } from "./porta.js";`. Em `playWhistle`, troque `const DUR = 2;` por `const DUR = APITO_MS / 1000; // a porta abre no mesmo tempo (porta.js, 014150)` e, no comentário da função, troque `2 s em 1.400 Hz` por `APITO_MS (2 s) em 1.400 Hz`.

- [ ] **Step 8: Rodar e ver passar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesPorta.test.ts src/__tests__/duplaFluxoSimplesSala.test.tsx src/__tests__/duplaSom.test.ts --maxWorkers=2
```
Esperado: PASS (6 da linha do tempo; 16 da sala; `duplaSom` sem mudança).

- [ ] **Step 9: Ajustar os testes antigos do apito**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaSalaRodape.test.tsx src/__tests__/duplaSalaPreparo.test.tsx src/__tests__/duplaSalaFases.test.tsx src/__tests__/duplaSalaAoVivo.test.tsx src/__tests__/duplaTempoReal.test.tsx --maxWorkers=2
```

| Arquivo · teste | Correção |
|---|---|
| `duplaSalaRodape` · "apito ao começar e uma vez no 00:00…" | o passo do início vira `({ phase: "running", started_at: at(2000), ends_at: at(5000) })` (o início fica 2 s à frente); depois do clique, `whistle.n` = 1; troque `advance(3500)` por `advance(5500)` antes de "Tempo esgotado" e `whistle.n` = 2. As partes "recarregar no meio" e "abrir já no 00:00" ficam (porta já aberta: sem apito de início) |
| `duplaSalaPreparo` · "candidato espera e entra sozinho…" | o estado em andamento usa `started_at` 1,5 s depois de `NOW` (`new Date(Date.parse(NOW) + 1500).toISOString()`) e `ends_at` 10 min depois disso; depois do `visibilitychange`, `await advance(1600)` antes de esperar "Em andamento"; `whistle.n` = 1 continua |
| testes que montam a sala em `running` com `started_at` no futuro em relação a `NOW` sem querer | ponha `started_at: NOW` (porta já aberta) |

Rode de novo. Esperado: PASS.

- [ ] **Step 10: Commit**

```bash
cd "$W" && git add src/novo/app/dupla/porta.js src/novo/app/dupla/room/Porta.jsx src/novo/app/dupla/room/RoomScreen.jsx src/novo/app/dupla/sound.js src/__tests__/duplaFluxoSimplesPorta.test.ts src/__tests__/duplaFluxoSimplesSala.test.tsx src/__tests__/duplaSalaRodape.test.tsx src/__tests__/duplaSalaPreparo.test.tsx && git commit -m "$(cat <<'EOF'
Treino em Dupla, fluxo simples (apito e porta): a porta abre durante o apito pelo relogio do servidor nos dois aparelhos; o candidato entra quando o apito acaba; sem som ou com movimento reduzido a porta abre no mesmo tempo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Sala — nota com um comentário ("Enviar nota") e fim com "mesmo papel", "trocar de papel" e "Sair"

**Files:**
- Modify: `src/novo/app/dupla/room/ReviewPhase.jsx`, `ResultPhase.jsx`, `useRoom.js`
- Modify: `src/__tests__/duplaFluxoSimplesSala.test.tsx`
- Modify: `src/__tests__/duplaSalaConferencia.test.tsx`, `duplaSalaFases.test.tsx`, `duplaResultadoTela.test.tsx`, `duplaSalaEstacao.test.tsx`, `duplaHistoricoTela.test.tsx`

**Interfaces:**
- Consumes: `app_dupla_finalize(p_room_id, p_feedback jsonb)` (grava `gen`; `pos`/`neg` vazios), `app_dupla_next_station(p_room_id, p_papel)` (Task 3), `app_dupla_request_review`, `app_dupla_redo_review`.
- Produces: `actions.nextStation(papel: "mesmo" | "trocar" = "mesmo")`; `actions.finalize({ gen })` manda `{ pos: "", neg: "", gen }`.

- [ ] **Step 1: Escrever o teste que falha**

No fim de `src/__tests__/duplaFluxoSimplesSala.test.tsx`, acrescente:

```tsx
const resultado = (viewer: "candidate" | "evaluator", feedback: Record<string, string>) => ({
  round: 1, viewer, station: { ...CAND_STATION, id: "teste-dupla-e01", name: "Estação de teste" }, score: 7.5, max_score: 10, pct: 75, previous_pct: null,
  items: [{ id: "i1", order: 1, content: "Item um", max_points: 2.5, grade: "correct", points: 2.5 }],
  evaluator: { user_id: "u-ana", public_name: "Ana Souza" }, candidate: { user_id: "u-bruno", public_name: "Bruno Lima" },
  finished_at: NOW, used_ms: 452000, feedback: { pos: "", neg: "", gen: "", ...feedback },
  review: { requested_at: null, reason: null, revised_at: null, score_before_review: null },
});

describe("Fluxo simples · nota e fim", () => {
  it("conferência: um comentário opcional e 'Enviar nota'; vai só no 'gen'", async () => {
    srv.room = baseRoom({ phase: "review", finished_at: NOW });
    await mount();
    expect(screen.queryByLabelText("Pontos positivos")).toBeNull();
    expect(screen.queryByLabelText("Pontos para melhorar")).toBeNull();
    fireEvent.change(screen.getByLabelText("Comentário (opcional)"), { target: { value: "Boa anamnese." } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar nota" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar nota" }));
    await advance(0);
    await advance(0);
    expect(calls("app_dupla_finalize")[0][1]).toEqual({ p_room_id: "r1", p_feedback: { pos: "", neg: "", gen: "Boa anamnese." } });
  });

  it("enviar sem comentário também vale", async () => {
    srv.room = baseRoom({ phase: "review", finished_at: NOW });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Enviar nota" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Enviar nota" }));
    await advance(0);
    await advance(0);
    expect(calls("app_dupla_finalize")[0][1]).toEqual({ p_room_id: "r1", p_feedback: { pos: "", neg: "", gen: "" } });
  });

  it("resultado: o comentário aparece como 'Comentário do ator'; avaliação antiga mostra os campos antigos preenchidos", async () => {
    srv.room = baseRoom({ phase: "result", finished_at: NOW });
    srv.result = resultado("evaluator", { gen: "Boa anamnese." });
    await mount();
    expect(screen.getByRole("heading", { name: "Comentário do ator" })).toBeTruthy();
    expect(screen.getByText("Boa anamnese.")).toBeTruthy();
    expect(screen.queryByText("Pontos positivos")).toBeNull();
    cleanup();
    srv.result = resultado("evaluator", { pos: "Boa escuta." });
    await mount();
    expect(screen.getByText("Pontos positivos")).toBeTruthy();
    expect(screen.getByText("Boa escuta.")).toBeTruthy();
    expect(screen.getByText("Sem comentário.")).toBeTruthy();
  });

  it("fim: 'Nova estação · mesmo papel', 'Nova estação · trocar de papel' e 'Sair'", async () => {
    srv.room = baseRoom({ phase: "result", finished_at: NOW });
    srv.result = resultado("evaluator", {});
    srv.steps.app_dupla_next_station = () => ({ phase: "setup", round: 2, station: null, station_ready: false, finished_at: null });
    srv.content = () => ({ role: null, station: null, pressing_count: 0, pressings: [] });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Nova estação · trocar de papel" }));
    await advance(0);
    expect(calls("app_dupla_next_station")[0][1]).toEqual({ p_room_id: "r1", p_papel: "trocar" });
    cleanup();
    rpc.mockClear();
    srv.room = baseRoom({ phase: "result", finished_at: NOW });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Nova estação · mesmo papel" }));
    await advance(0);
    expect(calls("app_dupla_next_station")[0][1]).toEqual({ p_room_id: "r1", p_papel: "mesmo" });
    cleanup();
    srv.room = baseRoom({ phase: "result", finished_at: NOW });
    srv.steps.app_dupla_leave = () => ({ phase: "closed", closed_reason: "saiu", closed_by: { user_id: "u-ana", public_name: "Ana Souza", me: true } });
    const { go } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Encerrar treino" }));
    await advance(0);
    expect(go).toHaveBeenCalledWith("dupla");
  });

  it("candidato no resultado pode pedir revisão da nota", async () => {
    srv.room = asCandidate(baseRoom({ phase: "result", finished_at: NOW }));
    srv.result = resultado("candidate", { gen: "Boa anamnese." });
    srv.content = contentOf("candidate");
    await mount();
    expect(screen.getByRole("button", { name: "Solicitar revisão da nota" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesSala.test.tsx --maxWorkers=2
```
Esperado: FAIL — três campos de feedback, botão "Finalizar e liberar resultado", "Feedback do avaliador", "Treinar outra estação"/"Encerrar treino".

- [ ] **Step 3: `useRoom.js`**

Troque
```js
        const res = await call("app_dupla_finalize", { p_feedback: { pos: feedback?.pos ?? "", neg: feedback?.neg ?? "", gen: feedback?.gen ?? "" } });
```
por
```js
        // Fluxo simples (19/10): um comentário só, em "gen"; "pos" e "neg" vão vazios (colunas mantidas).
        const res = await call("app_dupla_finalize", { p_feedback: { pos: "", neg: "", gen: feedback?.gen ?? "" } });
```
e troque
```js
      // "Treinar outra estação": rodada seguinte com o mesmo par, sem papéis e sem estação (decisão do dono de 16/10: sem
      // inverter papéis na mesma estação, porque o novo candidato já viu o tema como avaliador).
      nextStation: () => call("app_dupla_next_station"),
```
por
```js
      // "Nova estação · mesmo papel" | "Nova estação · trocar de papel" (dono, 19/10): rodada seguinte com o mesmo par, na
      // preparação e sem estação; o ator da rodada escolhe uma estação diferente das já treinadas na sala.
      nextStation: (papel = "mesmo") => call("app_dupla_next_station", { p_papel: papel === "trocar" ? "trocar" : "mesmo" }),
```

- [ ] **Step 4: `ReviewPhase.jsx`**

(a) Troque a constante `FEEDBACK` inteira por:
```js
// Fluxo simples (dono, 19/10): um comentário opcional só (vai em "gen"; "pos" e "neg" ficam vazios).
const FEEDBACK = [["gen", "Comentário (opcional)", "Para o candidato: o que foi bem e o que melhorar.", "message-square", "var(--info-solid)"]];
```

(b) Troque
```js
  const [fb, setFbState] = React.useState(() => ({ pos: "", neg: "", gen: "", ...readDraft(draftKey, {}) }));
```
por
```js
  const [fb, setFbState] = React.useState(() => ({ gen: String(readDraft(draftKey, {})?.gen ?? "") }));
```

(c) Troque `Revise as notas e escreva o feedback antes de liberar o resultado para {firstName(partner)}.` por `Confira o PEP, escreva um comentário se quiser e envie a nota para {firstName(partner)}.`

(d) Troque `<h2 style={sectionTitle}>Feedback ao candidato</h2>` por `<h2 style={sectionTitle}>Comentário ao candidato</h2>`.

(e) Troque
```jsx
            <Button size="lg" fullWidth icon="send" onClick={() => setConfirm(true)}>
              Finalizar e liberar resultado
            </Button>
```
por
```jsx
            <Button size="lg" fullWidth icon="send" onClick={() => setConfirm(true)}>
              Enviar nota
            </Button>
```

(f) No `Dialog` de confirmação, troque `title="Finalizar avaliação?"` por `title="Enviar nota?"`, troque `actions.finalize({ pos: fb.pos, neg: fb.neg, gen: fb.gen });` por `actions.finalize({ gen: fb.gen });` e troque o texto do botão `Finalizar e liberar` por `Enviar nota`.

- [ ] **Step 5: `ResultPhase.jsx`**

(a) No comentário do topo, troque `"Treinar outra estação" abre a rodada seguinte com o mesmo par, de volta à` … `"Encerrar treino" pede` `confirmação.` (as três linhas) por: `Fim (dono, 19/10): "Nova estação · mesmo papel", "Nova estação · trocar de papel" (rodada seguinte com o mesmo par, na preparação, estação DIFERENTE das já treinadas; o banco recusa repetida) e "Sair" (pede confirmação).`

(b) Troque o bloco dos botões do cabeçalho (do `<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>` que contém "Encerrar treino" até o `</div>` antes de `)}`) por:
```jsx
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" icon="log-out" onClick={() => (askLeave ? askLeave("encerrar") : actions.leave())}>
              Sair
            </Button>
            <Button variant="secondary" icon="shuffle" disabled={nexting} onClick={() => next("trocar")}>
              Nova estação · trocar de papel
            </Button>
            <Button icon="clipboard-list" disabled={nexting} onClick={() => next("mesmo")}>
              Nova estação · mesmo papel
            </Button>
          </div>
```
e, logo depois de `const [nexting, setNexting] = React.useState(false);`, acrescente:
```js
  const next = async (papel) => {
    if (nexting) return;
    setNexting(true);
    await actions.nextStation(papel);
    setNexting(false);
  };
```

(c) Troque
```js
                writeDraft(feedbackKey(room.id, room.round), { pos: result.feedback?.pos ?? "", neg: result.feedback?.neg ?? "", gen: result.feedback?.gen ?? "" });
```
por
```js
                writeDraft(feedbackKey(room.id, room.round), { gen: result.feedback?.gen ?? "" });
```

(d) Troque o título `Feedback do avaliador` por `Comentário do ator` e troque a lista
```jsx
          {[
            ["Pontos positivos", feedback.pos],
            ["Pontos para melhorar", feedback.neg],
            ["Orientações gerais", feedback.gen],
          ].map(([title, value]) => (
```
por
```jsx
          {[
            ["Comentário", feedback.gen],
            // avaliações de antes de 19/10 tinham três campos: os antigos aparecem só se foram preenchidos
            ...[["Pontos positivos", feedback.pos], ["Pontos para melhorar", feedback.neg]].filter(([, value]) => value),
          ].map(([title, value]) => (
```
e, dentro do `.map`, troque `{value || "Sem comentários."}` por `{value || "Sem comentário."}`.

- [ ] **Step 6: Rodar e ver passar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesSala.test.tsx --maxWorkers=2
```
Esperado: PASS (21 testes).

- [ ] **Step 7: Ajustar os testes antigos que o desenho muda**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaSalaConferencia.test.tsx src/__tests__/duplaSalaFases.test.tsx src/__tests__/duplaResultadoTela.test.tsx src/__tests__/duplaSalaEstacao.test.tsx src/__tests__/duplaHistoricoTela.test.tsx src/__tests__/duplaSozinhoIATela.test.tsx src/__tests__/duplaSozinhoResultado.test.tsx --maxWorkers=2
```

| Arquivo · teste | Correção |
|---|---|
| `duplaSalaConferencia`, `duplaSalaFases` (linhas 534-550), `duplaSalaEstacao` (203-217) | `"Pontos positivos"` → `"Comentário (opcional)"`; `"Finalizar e liberar resultado"` → `"Enviar nota"`; botão do diálogo `"Finalizar e liberar"` → `"Enviar nota"`; `p_feedback` esperado `{ pos: "", neg: "", gen: <texto> }` |
| `duplaSalaFases` (586-587) | `"Encerrar treino"` → `"Sair"`; `"Treinar outra estação"` → `"Nova estação · mesmo papel"` (e confira também `"Nova estação · trocar de papel"`) |
| `duplaResultadoTela` · "avaliador vê … 'Rever a nota'" | depois de rever, o rascunho tem só `gen`: troque `getByLabelText("Pontos positivos")` por `getByLabelText("Comentário (opcional)")` e o valor esperado pelo `gen` do resultado (no `result()` do arquivo, mude `feedback` para `{ pos: "", neg: "", gen: "Boa escuta." }`) |
| `duplaResultadoTela` · "Treinar outra estação (sem inverter papéis)…" | reescreva com os botões novos: "Nova estação · mesmo papel" chama `app_dupla_next_station` com `p_papel: "mesmo"` uma vez (clique duplo não duplica); o passo do servidor devolve `{ phase: "setup", round: 2, station: null, station_ready: false }` e a tela mostra "Escolher estação"; "Sair" abre "Encerrar treino?" |
| `duplaHistoricoTela` (linha 71) | a lista de botões ausentes no histórico vira `["Nova estação · mesmo papel", "Nova estação · trocar de papel", "Sair", "Solicitar revisão da nota", "Rever a nota"]` |
| `duplaSozinhoIATela` / `duplaSozinhoResultado` | o resultado do treino sozinho com `pos` preenchido continua mostrando "Pontos positivos" (campo antigo preenchido): deve passar sem mudança |

Rode de novo. Esperado: PASS.

- [ ] **Step 8: Commit**

```bash
cd "$W" && git add src/novo/app/dupla/room/ReviewPhase.jsx src/novo/app/dupla/room/ResultPhase.jsx src/novo/app/dupla/room/useRoom.js src/__tests__/duplaFluxoSimplesSala.test.tsx src/__tests__/duplaSalaConferencia.test.tsx src/__tests__/duplaSalaFases.test.tsx src/__tests__/duplaResultadoTela.test.tsx src/__tests__/duplaSalaEstacao.test.tsx src/__tests__/duplaHistoricoTela.test.tsx && git commit -m "$(cat <<'EOF'
Treino em Dupla, fluxo simples (nota e fim): um comentario opcional e Enviar nota; Nova estacao mesmo papel ou trocar de papel e Sair

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Convite — "te chamou para treinar como candidato", sem nada da estação; o convite por link do @ sai das telas

**Files:**
- Modify: `src/novo/app/dupla/MatchModal.jsx` (`DirectInviteDialog`; sai `RequestDialog` e o pedido de 24 h do `InviteWatcher`)
- Modify: `src/novo/app/dupla/live.js` (sai `useRequests`), `src/novo/app/dupla/radarApi.js` (saem as funções do link), `src/novo/app/dupla/HandleField.jsx`, `src/novo/app/dupla/RadarScreen.jsx` (sai o botão do link), `src/novo/app/App.jsx` (sai a rota `/convite/<@>`)
- Delete: `src/novo/app/dupla/InviteLinkButton.jsx`, `src/novo/app/dupla/InviteLinkScreen.jsx`, `src/__tests__/duplaConviteLinkTela.test.tsx`
- Create: `src/__tests__/duplaFluxoSimplesConvite.test.tsx`
- Modify: `src/__tests__/duplaRadarTempoReal.test.tsx`, `duplaArrobaTela.test.tsx`, `duplaRadarTela.test.tsx`, `duplaRotas.test.tsx`

**Interfaces:**
- Consumes: `app_dupla_invites()` → `{ invites: [{ id, room_id, kind, role, from, station: null, expires_at }] }` (014130); `app_dupla_answer_invite`. As funções do link recusam no banco desde a Tarefa 1.
- Produces: `DirectInviteDialog` com título `"{nome} te chamou para treinar como candidato"` (quando `invite.role === "candidate"`), botões "Aceitar" e "Recusar", contagem dos 60 s, sem estação. `InviteWatcher` sem pedido de 24 h (não chama `app_dupla_requests`). Nenhuma tela, rota ou botão do link do @; o @ continua (perfil, radar, busca).

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/__tests__/duplaFluxoSimplesConvite.test.tsx`:

```tsx
/**
 * Treino em Dupla · fluxo simples (desenho de 19/10): o aviso do convite ao candidato (Aceitar/Recusar, 60 s, sem nada da
 * estação) e o convite por link do @ fora das telas (decisão do dono, 2ª rodada). Pessoas de TESTE.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const backend: any = { rpc: vi.fn() };
vi.mock("../novo/app/session.jsx", () => ({ useSession: () => ({ backend, boot: { role: "admin" }, user: { id: "u-eu" } }) }));
vi.mock("../novo/app/dupla/sound.js", async (importOriginal) => {
  const real: any = await importOriginal();
  return { ...real, playMatchSound: vi.fn(), installAudioWake: vi.fn() };
});

import { InviteWatcher } from "../novo/app/dupla/MatchModal.jsx";

let invitesNow: any[];
let go: any;
const rpcCalls = (fn: string) => backend.rpc.mock.calls.filter((c: any[]) => c[0] === fn);
const direto = (extra: Record<string, unknown> = {}) => ({
  id: "c1", room_id: "sala-c1", kind: "direto", role: "candidate", from: { user_id: "u-ana", public_name: "Ana Souza" }, station: null,
  expires_at: new Date(Date.now() + 60000).toISOString(), ...extra,
});

beforeEach(() => {
  go = vi.fn();
  invitesNow = [];
  backend.rpc.mockReset();
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_dupla_invites") return { invites: invitesNow, server_now: new Date().toISOString() };
    if (fn === "app_dupla_requests") return { requests: [] };
    if (fn === "app_dupla_answer_invite") return { room_id: args.p_accept ? "sala-c1" : null };
    throw new Error(`rpc não simulada: ${fn}`);
  });
});
afterEach(() => cleanup());

const montar = () => render(<InviteWatcher go={go} meName="Bruno Lima" inviteTick={0} live={false} />);

describe("Fluxo simples · convite ao candidato", () => {
  it("'Ana Souza te chamou para treinar como candidato', sem estação, área, porta ou origem; Aceitar e Recusar", async () => {
    invitesNow = [direto()];
    montar();
    const dialog = await screen.findByRole("dialog", { name: "Ana Souza te chamou para treinar como candidato" });
    expect(within(dialog).getByText("A estação aparece quando o atendimento começar.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Aceitar" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Recusar" })).toBeTruthy();
    expect(within(dialog).getByText(/O convite expira em/)).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/Estação \d|Porta|min\b|Clínica|INEP/);
  });

  it("Aceitar vai à sala; Recusar responde não e não vai", async () => {
    invitesNow = [direto()];
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Aceitar" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-c1" }));
    cleanup();
    go.mockClear();
    backend.rpc.mockClear();
    invitesNow = [direto({ id: "c2" })];
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Recusar" }));
    await waitFor(() => expect(rpcCalls("app_dupla_answer_invite")).toEqual([["app_dupla_answer_invite", { p_invite_id: "c2", p_accept: false }]]));
    expect(go).not.toHaveBeenCalled();
  });

  it("o pedido de 24 h saiu: o aviso não consulta pedidos", async () => {
    montar();
    await waitFor(() => expect(rpcCalls("app_dupla_invites").length).toBeGreaterThan(0));
    expect(rpcCalls("app_dupla_requests")).toHaveLength(0);
  });

  it("o convite por link do @ saiu das telas: sem botão, sem tela, sem rota e sem pedido", () => {
    const raiz = path.resolve(__dirname, "../novo/app");
    for (const f of ["dupla/InviteLinkButton.jsx", "dupla/InviteLinkScreen.jsx"]) expect(fs.existsSync(path.join(raiz, f)), f).toBe(false);
    for (const f of ["App.jsx", "dupla/RadarScreen.jsx", "dupla/HandleField.jsx", "dupla/radarApi.js", "dupla/MatchModal.jsx", "dupla/live.js"]) {
      const txt = fs.readFileSync(path.join(raiz, f), "utf8");
      for (const proibido of ["InviteLink", "/convite/", "PendingInvite", "app_dupla_requests", "app_dupla_link_", "Copiar link de convite", "RequestDialog"]) {
        expect(txt, `${f}: ${proibido}`).not.toContain(proibido);
      }
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesConvite.test.tsx --maxWorkers=2
```
Esperado: FAIL — título "Ana Souza convidou você para treinar", "A estação se escolhe na sala.", botão "Agora não"; `app_dupla_requests` consultado; arquivos e textos do link existem.

- [ ] **Step 3: `MatchModal.jsx` — aviso do convite sem estação e sem pedido de 24 h**

(a) Troque o comentário JSDoc de `DirectInviteDialog` por:
```js
/**
 * Convite direto do radar (kind "direto"), fluxo simples (dono, 19/10): quem convida é o ator, então quem recebe é o candidato:
 * "{nome} te chamou para treinar como candidato". NADA da estação (nem número, área, porta, duração ou origem: o servidor nem
 * manda, 014130). Contagem dos 60 s, "Aceitar" e "Recusar". O som é o do "Deu match!" (desligável). Esc e clique no fundo valem
 * "Recusar".
 * @param {{ invite: { from?: { public_name?: string }, role?: string | null, expires_at: string }, busy?: boolean, nowMs: number,
 *   onAccept(): void, onDecline(): void }} p
 */
```

(b) Troque
```js
  const name = invite.from?.public_name ?? "";
  const station = invite.station ?? null;
  const left = Math.max(0, Math.ceil((Date.parse(invite.expires_at) - nowMs) / 1000));
  const minutes = station?.duration_ms ? Math.round(station.duration_ms / 60000) : null;
```
por
```js
  const name = invite.from?.public_name ?? "";
  const left = Math.max(0, Math.ceil((Date.parse(invite.expires_at) - nowMs) / 1000));
  const title = invite.role === "candidate" ? `${name} te chamou para treinar como candidato` : `${name} convidou você para treinar`;
```

(c) Troque `title={`${name} convidou você para treinar`}` por `title={title}` e, nos `actions` deste diálogo, troque o texto `Agora não` por `Recusar`.

(d) Troque o bloco
```jsx
          {station ? (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <Badge size="sm" tone="brand">{station.label}</Badge>
              {station.area && <Badge size="sm">{station.area}</Badge>}
              {minutes != null && <Badge size="sm" icon="timer">{`${minutes} min`}</Badge>}
            </div>
          ) : (
            <div style={{ font: "13px var(--font-sans)", color: "var(--text-tertiary)", marginTop: 4 }}>A estação se escolhe na sala.</div>
          )}
```
por
```jsx
          <div style={{ font: "13px var(--font-sans)", color: "var(--text-tertiary)", marginTop: 4 }}>A estação aparece quando o atendimento começar.</div>
```

(e) Apague a função `RequestDialog` inteira, com o comentário JSDoc dela (o que começa com `* Pedido de treino por link (vale 24 h)`).

(f) No `InviteWatcher`: troque `import { useInvites, useRequests } from "./live.js";` por `import { useInvites } from "./live.js";`; apague as linhas `const { requests, refresh: refreshRequests } = useRequests(inviteTick);` e `const [dismissed, setDismissed] = React.useState(() => new Set());`; apague o bloco que começa em `// Pedidos de treino por link: só aparecem quando não há convite na tela; fechar o aviso não recusa o pedido.` e termina no `};` de `answerRequest`; e apague o bloco
```jsx
      {request && !chat.chatOpen && !paused && (
        <RequestDialog
          key={request.id}
          request={request}
          busy={busy}
          onAccept={() => answerRequest(true)}
          onDecline={() => answerRequest(false)}
          onDismiss={() => setDismissed((prev) => new Set(prev).add(request.id))}
        />
      )}
```
Se `Badge` deixar de ser usado no arquivo, tire-o do import.

- [ ] **Step 4: Tirar o link do @ das outras telas**

(a) `src/novo/app/dupla/live.js`: apague a função `useRequests` inteira, com o comentário JSDoc dela (o que começa com `* Pedidos de treino que chegaram para mim`).

(b) `src/novo/app/dupla/radarApi.js`: apague tudo a partir da linha `// ------------------------------------------------------------------ convite por link do @` até o fim do arquivo (`invitePath`, `inviteLink`, `copyText`, `rememberPendingInvite`, `takePendingInvite`).

(c) `src/novo/app/dupla/HandleField.jsx`: apague `import { InviteLinkButton } from "./InviteLinkButton.jsx";` e a linha `{hasProfile && saved && <InviteLinkButton handle={saved} />}`; no texto de ajuda troque `Trocar o @ não muda seu nome, mas o link de convite antigo deixa de valer.` por `Trocar o @ não muda seu nome.`; no comentário do topo apague o trecho `, mas o link de convite antigo deixa de valer` (fica só o ponto final).

(d) `src/novo/app/dupla/RadarScreen.jsx`: apague `import { InviteLinkButton } from "./InviteLinkButton.jsx";` e o bloco
```jsx
          {saved.handle && (
            <div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ font: "13px var(--font-sans)", color: "var(--text-tertiary)" }}>
                Chame um colega que não está online: envie o seu link, por exemplo pelo WhatsApp. Ele só leva o seu @ ({`@${saved.handle}`}).
              </span>
              {/* O link leva só o @: o id da estação não vai na URL (o convidado pode ser o candidato). */}
              <InviteLinkButton handle={saved.handle} />
            </div>
          )}
```

(e) `src/novo/app/App.jsx`: apague as linhas `import { InviteLinkScreen } from "./dupla/InviteLinkScreen.jsx";` e `import { rememberPendingInvite, takePendingInvite } from "./dupla/radarApi.js";`; apague a entrada `convite: ["Convite para treinar", null],` dos títulos; tire `"convite"` de `PHASE2_ROUTES` e de `CONNECTED` (e a linha de comentário `// "convite" (convite por link do @, radar): …` acima de `PHASE2_ROUTES`); apague as duas linhas `// Convite por link do @ (/novo/convite/<@>): …` e `else if (route === "convite") body = <InviteLinkScreen … />;`; apague o `React.useEffect` de `Root` que começa no comentário `// Convite por link aberto sem conta: …` (o que chama `rememberPendingInvite`/`takePendingInvite`) — se `navigate`, `pathname` ou `search` ficarem sem uso em `Root`, tire-os também; apague a rota `<Route path="/convite/:handle" element={<Screen view="convite" />} />`. Um endereço antigo `/convite/<@>` cai na rota `*` e vai ao início.

(f) Apague os arquivos:
```bash
cd "$W" && git rm -q src/novo/app/dupla/InviteLinkButton.jsx src/novo/app/dupla/InviteLinkScreen.jsx src/__tests__/duplaConviteLinkTela.test.tsx
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesConvite.test.tsx --maxWorkers=2
```
Esperado: PASS (4 testes).

- [ ] **Step 6: Ajustar os testes antigos**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaRadarTempoReal.test.tsx src/__tests__/duplaArrobaTela.test.tsx src/__tests__/duplaRadarTela.test.tsx src/__tests__/duplaRotas.test.tsx src/__tests__/duplaMatchTela.test.tsx src/__tests__/duplaChatTela.test.tsx src/__tests__/duplaPerfilTela.test.tsx --maxWorkers=2
```

| Arquivo · teste | Correção |
|---|---|
| `duplaRadarTempoReal` · "abre 'X convidou você para treinar' com Estação N, área e minutos…" | o convite do teste ganha `role: "candidate"` e `station: null`: espere o diálogo `"Colega Teste Um te chamou para treinar como candidato"`, o texto "A estação aparece quando o atendimento começar." e o botão "Recusar"; sem "Estação 7", área e "10 min"; título do teste ajustado |
| `duplaRadarTempoReal` · "sem estação no convite: 'A estação se escolhe na sala.'" | apague (não existe mais) |
| `duplaRadarTempoReal` · "'Agora não' chama com p_accept false…" e "a tecla Esc vale 'Agora não'" (convite direto) | troque "Agora não" por "Recusar" nos dois |
| `duplaRadarTempoReal` · `describe("pedido de treino por link")` inteiro e o helper `request` | apague (o pedido saiu) |
| `duplaArrobaTela` · import de `copyText`, `inviteLink`, `invitePath`, `rememberPendingInvite`, `takePendingInvite` e os testes deles; `describe("Perfil de estudo · link de convite")` | apague; deixe só `filterPeople` no import |
| `duplaArrobaTela` · "…e o texto fixo sobre o link antigo" (linha 72-77) | espere `Trocar o @ não muda seu nome.` e que "link de convite" não apareça; título sem "link antigo" |
| `duplaRadarTela` · testes do link (linhas 416-470: "copia o link só com o @…", "sem estação o link leva só o @", "sem @ no perfil não há botão de link", cópia recusada, sem API de área de transferência) | apague; ponha um no lugar: `expect(screen.queryByRole("button", { name: "Copiar link de convite" })).toBeNull()` |
| `duplaRotas` · `vi.mock("../novo/app/dupla/InviteLinkScreen.jsx", …)` | apague o mock (o arquivo não existe mais) |
| `duplaRotas` · laço das rotas da 2ª fase com `"convite/colega.teste"` (linha 158) | tire `"convite/colega.teste"` da lista |
| `duplaRotas` · "convite por link: a equipe abre a tela do link…" (linha 174) | troque por `"convite por link saiu: /convite/<@> leva ao início para todos"`: para `bootOf("editor")` com `FECHADO_EQUIPE` e para `bootOf("student", 2)` com `ABERTO_COM_PLANO`, `renderApp("/convite/colega.teste", …)` e `expect(window.location.pathname).toMatch(AT_HOME)` |

Rode de novo. Esperado: PASS.

- [ ] **Step 7: Commit**

```bash
cd "$W" && git add src/novo/app/dupla/MatchModal.jsx src/novo/app/dupla/live.js src/novo/app/dupla/radarApi.js src/novo/app/dupla/HandleField.jsx src/novo/app/dupla/RadarScreen.jsx src/novo/app/App.jsx src/__tests__/duplaFluxoSimplesConvite.test.tsx src/__tests__/duplaRadarTempoReal.test.tsx src/__tests__/duplaArrobaTela.test.tsx src/__tests__/duplaRadarTela.test.tsx src/__tests__/duplaRotas.test.tsx && git commit -m "$(cat <<'EOF'
Treino em Dupla, fluxo simples (convite): te chamou para treinar como candidato, Aceitar ou Recusar, sem nada da estacao; convite por link do @ sai (botao, tela, rota e pedido de 24 h)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
(Os arquivos apagados já foram para o índice com `git rm` no Step 4.)

---

### Task 9: Lista e caminhos — Online/Perto, estação escolhida ao convidar, o Praticar abre a lista, match secundário, menu continua "Praticar"

**Files:**
- Modify: `src/novo/app/dupla/RadarScreen.jsx`, `src/novo/app/dupla/radarApi.js`, `src/novo/app/dupla/PracticeScreen.jsx` (o menu `src/novo/app/shell/navModel.js` NÃO muda: continua "Praticar")
- Modify: `src/__tests__/duplaFluxoSimplesConvite.test.tsx`
- Modify: `src/__tests__/duplaRadarTela.test.tsx`, `duplaPraticarTela.test.tsx`, `duplaMatchTela.test.tsx` e os que montam `PracticeScreen` esperando o baralho

**Interfaces:**
- Consumes: `app_dupla_radar(p_station_id, p_aba)` com `'online' | 'perto'`; `app_dupla_invite(p_to, p_station_id)` (estação obrigatória); `StationPicker({ title, onPick, onClose, roomId? })` de `room/StationPicker.jsx`.
- Produces: `ABAS = [{ value: "online", label: "Online" }, { value: "perto", label: "Perto de você" }]`; `PracticeScreen` mostra a lista (radar) por padrão e o baralho só com `?modo=baralho`; o item do menu da 2ª fase continua `["dupla", "users", "Praticar"]` (decisão do dono, 19/10).

- [ ] **Step 1: Escrever o teste que falha**

No fim de `src/__tests__/duplaFluxoSimplesConvite.test.tsx` (criado na Tarefa 8), acrescente (e junte aos imports do topo `import { MemoryRouter } from "react-router-dom";`, `import { RadarScreen } from "../novo/app/dupla/RadarScreen.jsx";`, `import { PracticeScreen } from "../novo/app/dupla/PracticeScreen.jsx";`, e `import { GROUPS_FASE2 } from "../novo/app/shell/navModel.js";`):

```tsx
const SAVED = {
  public_name: "Ana Souza", handle: "ana.teste", school: null, city: "Curitiba · PR", goal: "", exam: "2026/2", bio: "", areas: [], role_pref: "any",
  pace: "livre", days: [], shifts: [], radar_visible: true, allow_direct_invites: true, show_school: false, show_stats: false,
};
const COLEGA = { user_id: "u-bruno", public_name: "Bruno Lima", handle: "bruno.teste", school: null, city: "Curitiba · PR", areas: [], role_pref: "med", state: "livre", compat: 80, can_invite: true, why_not: null, near: "cidade" };
const ESTACOES = [{ id: "s9", name: "Outra estação", area: "Pediatria", area_code: "PED", number: 9 }];
function servidorDaLista() {
  backend.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === "app_dupla_radar") return { people: [COLEGA], online: 1, needs_city: false, open_room: null, me: { radar_visible: true } };
    if (fn === "app_dupla_invite") return { room_id: "sala-nova", partner: { user_id: args.p_to }, expires_at: new Date(Date.now() + 60000).toISOString() };
    if (fn === "app_dupla_stations") return ESTACOES;
    if (fn === "app_dupla_profile") return { profile: SAVED, defaults: null, stats: { done: 0, avg: null } };
    if (fn === "app_dupla_heartbeat") return { server_now: new Date().toISOString() };
    if (fn === "app_dupla_invites") return { invites: [], server_now: new Date().toISOString() };
    if (fn === "app_dupla_requests") return { requests: [] };
    if (fn === "app_dupla_deck") return { cards: [], hidden_by_role: 0, online: 0, matches_today: 0, open_room: null, server_now: new Date().toISOString() };
    throw new Error(`rpc não simulada: ${fn}`);
  });
}

describe("Fluxo simples · lista de colegas", () => {
  it("duas abas: 'Online' e 'Perto de você' (a aba 'Ator/avaliador' saiu)", async () => {
    servidorDaLista();
    render(<MemoryRouter><RadarScreen go={go} profile={{ setData: vi.fn() }} saved={SAVED} station={null} stationId={null} /></MemoryRouter>);
    await screen.findByText("Bruno Lima");
    expect(screen.getByRole("radio", { name: "Online" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Perto de você" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Ator/ })).toBeNull();
  });

  it("pelo colega: sem estação escolhida, 'Convidar' abre a lista de estações e o convite leva a estação", async () => {
    servidorDaLista();
    render(<MemoryRouter><RadarScreen go={go} profile={{ setData: vi.fn() }} saved={SAVED} station={null} stationId={null} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Convidar Bruno Lima" }));
    const dialog = await screen.findByRole("dialog", { name: /Escolha a estação para treinar com Bruno Lima/ });
    expect(rpcCalls("app_dupla_invite")).toHaveLength(0);
    fireEvent.click(await within(dialog).findByRole("button", { name: /Outra estação/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-nova" }));
    expect(rpcCalls("app_dupla_invite")).toEqual([["app_dupla_invite", { p_to: "u-bruno", p_station_id: "s9" }]]);
    expect(document.body.textContent).not.toMatch(/Sortear estação/);
  });

  it("pela estação: com a estação escolhida, 'Convidar' manda direto", async () => {
    servidorDaLista();
    render(<MemoryRouter><RadarScreen go={go} profile={{ setData: vi.fn() }} saved={SAVED} station={ESTACOES[0]} stationId="s9" /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Convidar Bruno Lima" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("dupla-sala", { sala: "sala-nova" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("o Praticar abre a lista; o match fica como opção secundária ('Encontrar por perfil (match)')", async () => {
    servidorDaLista();
    render(<MemoryRouter initialEntries={["/dupla?estacao=s9"]}><PracticeScreen go={go} /></MemoryRouter>);
    expect(await screen.findByText("Quem está online")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Encontrar por perfil (match)" }));
    expect(go).toHaveBeenCalledWith("dupla", { estacao: "s9", modo: "baralho" });
    cleanup();
    render(<MemoryRouter initialEntries={["/dupla?modo=baralho"]}><PracticeScreen go={go} /></MemoryRouter>);
    expect(await screen.findByText("Encontrar dupla")).toBeTruthy();
  });

  it("menu da 2ª fase continua 'Praticar' (guarda: já passa; não renomear)", () => {
    const grupo = (GROUPS_FASE2 as any[]).find((g) => g.id === "menu2");
    expect(grupo.items.find((i: any[]) => i[0] === "dupla")[2]).toBe("Praticar");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesConvite.test.tsx --maxWorkers=2
```
Esperado: FAIL — aba "Ator/avaliador" existe; "Convidar" sem estação manda `p_station_id: null`; `/dupla?estacao=s9` abre o baralho; não há "Encontrar por perfil (match)". (O teste do menu já passa: é a guarda contra renomear.)

- [ ] **Step 3: `radarApi.js`**

Troque
```js
export const ABAS = [
  { value: "online", label: "Online" },
  { value: "atores", label: "Ator/avaliador" },
  { value: "perto", label: "Perto de você" },
];
```
por
```js
export const ABAS = [
  { value: "online", label: "Online" },
  { value: "perto", label: "Perto de você" },
];
```
e no comentário acima troque `/** Abas do radar, na ordem da tela. O valor vai em `p_aba`. */` por `/** Abas do radar, na ordem da tela (fluxo simples, 19/10: a aba "Ator" saiu). O valor vai em `p_aba`. */`.

- [ ] **Step 4: `RadarScreen.jsx`**

(a) Import: depois de `import { installAudioWake } from "./sound.js";` acrescente `import { StationPicker } from "./room/StationPicker.jsx";`.

(b) Troque a função `invite` inteira (de `const invite = async (person) => {` até o `};` dela) por:
```js
  // Fluxo simples (dono, 19/10): quem convida é o ator e escolhe a estação. Sem estação escolhida, a lista do Banco de estações
  // abre antes do convite; o convite sempre leva a estação (o banco recusa sem ela).
  const sendInvite = async (person, chosen) => {
    if (inviting) return;
    setInviting(person.user_id);
    try {
      const res = await invitePerson(backend, person.user_id, chosen);
      go("dupla-sala", { sala: res.room_id });
    } catch (e) {
      showToast(messageOf(e), "danger");
      void radar.refresh();
      setInviting(null);
    }
  };
  const invite = (person) => (stationId ? sendInvite(person, stationId) : setPicking(person));
```
e, logo depois de `const [inviting, setInviting] = React.useState(null);`, acrescente `const [picking, setPicking] = React.useState(null);`.

(c) Logo depois de `<InviteWatcher go={go} meName={saved.public_name} inviteTick={inviteTick} live={live} />`, acrescente:
```jsx
      {picking && (
        <StationPicker
          title={`Escolha a estação para treinar com ${picking.public_name}`}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            const person = picking;
            setPicking(null);
            void sendInvite(person, id);
          }}
        />
      )}
```

(d) Troque o bloco do cabeçalho
```jsx
        <div>
          <button
            type="button"
            onClick={() => go("dupla", stationId ? { estacao: stationId } : undefined)}
```
… até o `</Button>` de "Meu perfil de estudo" (inclusive) por:
```jsx
        <div>
          <h2 style={{ margin: 0, font: "700 22px var(--font-sans)", color: "var(--text-primary)" }}>Quem está online</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" icon="layers" onClick={() => go("dupla", stationId ? { estacao: stationId, modo: "baralho" } : { modo: "baralho" })}>
            Encontrar por perfil (match)
          </Button>
          <Button variant="secondary" size="sm" icon="user-pen" onClick={() => go("dupla-perfil")}>
            Meu perfil de estudo
          </Button>
        </div>
```
(o `</div>` que fechava o cabeçalho continua depois). Confira que não ficou nenhum "Voltar para Praticar" no arquivo: `grep -c "Voltar para Praticar" src/novo/app/dupla/RadarScreen.jsx` → 0.

(e) Troque o texto `"Nenhuma estação escolhida: vocês escolhem na sala"` por `"Nenhuma estação escolhida: você escolhe ao convidar"`.

(f) No comentário do topo, troque `"Praticar" com `?modo=online`.` por `"Praticar" (rota "dupla"), a tela padrão desde o fluxo simples de 19/10; o baralho do match fica em `?modo=baralho`.` e acrescente ao fim do comentário `Fluxo simples: quem convida é o ator e escolhe a estação (sem estação, a lista do Banco de estações abre antes do convite).`

- [ ] **Step 5: `PracticeScreen.jsx`**

Troque
```js
  // `?modo=online` abre o radar de quem está online (tela própria); sem perfil de estudo o radar não existe (cai na tela abaixo).
  if (saved && modo === "online") {
```
por
```js
  // Fluxo simples (dono, 19/10): o Praticar abre a lista de colegas (radar) por padrão; o baralho do match é a opção
  // secundária (`?modo=baralho`). Sem perfil de estudo o radar não existe (cai na tela abaixo).
  if (saved && modo !== "baralho") {
```

- [ ] **Step 6: Rodar e ver passar**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/duplaFluxoSimplesConvite.test.tsx --maxWorkers=2
```
Esperado: PASS (9 testes: 4 da Tarefa 8 e 5 desta).

- [ ] **Step 7: Ajustar os testes antigos que o desenho muda**

```bash
cd "$W" && grep -ln "PracticeScreen" src/__tests__/*.tsx && nice bash "$FILA" npx vitest run src/__tests__/duplaRadarTela.test.tsx src/__tests__/duplaPraticarTela.test.tsx src/__tests__/duplaMatchTela.test.tsx src/__tests__/duplaChatTela.test.tsx src/__tests__/duplaCreditosTela.test.tsx src/__tests__/duplaRotas.test.tsx src/__tests__/duplaEstacoesTela.test.tsx src/__tests__/fase2TelasTela.test.tsx src/__tests__/menuCelularMais.test.tsx src/__tests__/duplaPerfilTela.test.tsx --maxWorkers=2
```

| Arquivo · teste | Correção |
|---|---|
| todo teste que monta `PracticeScreen` esperando o baralho ("Encontrar dupla", "Como a compatibilidade é calculada", "Estudar junto") | URL padrão `"/dupla"` → `"/dupla?modo=baralho"`; URL com estação `"/dupla?estacao=X"` → `"/dupla?estacao=X&modo=baralho"` (em `duplaPraticarTela`, `duplaMatchTela`, `duplaChatTela`, `duplaCreditosTela` e os outros que o `grep` listar) |
| `duplaRadarTela` · "sem estação escolhida o convite vai com p_station_id nulo" | troque por: sem estação, "Convidar" abre o diálogo "Escolha a estação para treinar com Colega Teste Um" e nenhum `app_dupla_invite` sai antes da escolha |
| `duplaRadarTela` · "cada aba chama app_dupla_radar com o p_aba certo" | só `online` e `perto` |
| `duplaRadarTela` · "'Voltar para Praticar' do radar chama go('dupla')" | troque por "'Encontrar por perfil (match)' leva ao baralho": `go("dupla", { modo: "baralho" })` |
| `duplaRadarTela` · "no baralho, 'Ver quem está online' navega…" e "…com estação, o atalho leva a estação junto" | monte em `/dupla?modo=baralho` (e `&estacao=…`) |
| `duplaRotas`, `menuCelularMais` | o menu continua "Praticar": sem mudança |
| `duplaEstacoesTela` · "Em dupla" | continua `go("dupla", { estacao })`, que agora abre a lista: sem mudança |

Rode de novo. Esperado: PASS.

- [ ] **Step 8: Commit**

```bash
cd "$W" && git add src/novo/app/dupla/RadarScreen.jsx src/novo/app/dupla/radarApi.js src/novo/app/dupla/PracticeScreen.jsx src/__tests__/duplaFluxoSimplesConvite.test.tsx src/__tests__/duplaRadarTela.test.tsx src/__tests__/duplaPraticarTela.test.tsx src/__tests__/duplaMatchTela.test.tsx src/__tests__/duplaChatTela.test.tsx src/__tests__/duplaCreditosTela.test.tsx && git commit -m "$(cat <<'EOF'
Treino em Dupla, fluxo simples (lista): abas Online e Perto de voce; sem estacao, Convidar abre a lista de estacoes; o Praticar abre a lista e o match fica secundario; menu continua Praticar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
(Tire do `git add` o que não mudou.)

---

### Task 10: Suíte inteira contra o main, varredura, build e SQL de produção com ensaio desfeito

**Files:**
- Create (fora do repositório): `/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples/` com `rodar-suite.sh`, `comparar.mjs`, `publicar-fluxo-simples.sql`, `conferir-fluxo-simples.sql`, `ensaiar.mjs` (cópia), `RELATORIO.md`
- Nenhum arquivo do repositório (se a suíte achar falha nova, ela volta para a tarefa dona do arquivo).

**Interfaces:**
- Consumes: tudo das Tarefas 1–9; `/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-etapa2/` (`publicar-etapa2.sql`, `antes-etapa2.sql`, `conferir-etapa2.sql`, `conferir-base-ontem.sql`, `preparo-aluno-temporario.sql`, `restaurar-aluno-temporario.sql`, `ensaiar.mjs`, `suite-main.json`).
- Produces: comparação da suíte com o main, `apoioVarredura` passando, build ok, SQL pronto e ensaiado **com ROLLBACK**.

- [ ] **Step 1: Pasta e roteiros**

```bash
P=/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples && E=/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-etapa2 && mkdir -p "$P" && cp "$E/ensaiar.mjs" "$P/ensaiar.mjs" && cat > "$P/rodar-suite.sh" <<'SH'
#!/bin/bash
# Suíte inteira (uma por vez), com relatório JSON. Uso: rodar-suite.sh <pasta-do-worktree> <nome>
cd "$1" || exit 1
P=/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples
export TMPDIR=/Volumes/StaziaMed/.tmp-aulas/tmp-correcoes
VITEST_TUDO=1 nice bash "/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/vaga-de-teste.sh" npx vitest run --maxWorkers=2 --reporter=json --outputFile="$P/suite-$2.json" > "$P/suite-$2.log" 2>&1
echo "codigo $?" >> "$P/suite-$2.log"
SH
chmod +x "$P/rodar-suite.sh" && cat > "$P/comparar.mjs" <<'JS'
// Compara duas suítes do vitest (--reporter=json): o que falha só no ramo, só no main e nos dois. Uso: node comparar.mjs <ramo.json> <main.json>
import fs from "node:fs";
const falhas = (arq) => {
  const j = JSON.parse(fs.readFileSync(arq, "utf8"));
  const s = new Set();
  for (const f of j.testResults ?? []) {
    const nome = f.name.replace(/^.*\/src\//, "src/");
    if (f.status === "failed" && !(f.assertionResults ?? []).some((a) => a.status === "failed")) s.add(`${nome} :: (arquivo não carregou)`);
    for (const a of f.assertionResults ?? []) if (a.status === "failed") s.add(`${nome} :: ${a.fullName}`);
  }
  return { s, total: j.numTotalTests, ok: j.numPassedTests, falhas: j.numFailedTests, pulados: j.numPendingTests };
};
const [r, m] = [falhas(process.argv[2]), falhas(process.argv[3])];
console.log("ramo:", { total: r.total, ok: r.ok, falhas: r.falhas, pulados: r.pulados });
console.log("main:", { total: m.total, ok: m.ok, falhas: m.falhas, pulados: m.pulados });
console.log("\nSÓ NO RAMO:\n" + ([...r.s].filter((x) => !m.s.has(x)).join("\n") || "(nenhuma)"));
console.log("\nSÓ NO MAIN:\n" + ([...m.s].filter((x) => !r.s.has(x)).join("\n") || "(nenhuma)"));
console.log("\nNOS DOIS:\n" + ([...r.s].filter((x) => m.s.has(x)).join("\n") || "(nenhuma)"));
JS
ls "$P"
```

- [ ] **Step 2: Suíte inteira do ramo**

```bash
bash /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples/rodar-suite.sh "/Volumes/StaziaMed/STAZIAMED REVALIDA/StaziaMed Revalida/.claude/worktrees/fase2-etapa2" ramo
tail -3 /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples/suite-ramo.log
```
(Rode em segundo plano se o terminal permitir; é uma suíte só, nada mais rodando junto.)

- [ ] **Step 3: Suíte do main e comparação**

```bash
cd "$W" && git rev-parse --short main
```
Se for `ade3ef1e`, use a suíte do main já gravada: `cp /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-etapa2/suite-main.json /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples/suite-main.json`. Se o main andou, rode a do main num worktree temporário e apague-o depois:

```bash
cd "$W" && git worktree add /Volumes/StaziaMed/.tmp-aulas/tmp-correcoes/main-suite main && ln -s "$W/node_modules" /Volumes/StaziaMed/.tmp-aulas/tmp-correcoes/main-suite/node_modules && bash /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples/rodar-suite.sh /Volumes/StaziaMed/.tmp-aulas/tmp-correcoes/main-suite main; git worktree remove --force /Volumes/StaziaMed/.tmp-aulas/tmp-correcoes/main-suite
```

Compare:
```bash
cd /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples && node comparar.mjs suite-ramo.json suite-main.json | tee comparacao.txt
```
Esperado em "NOS DOIS" só as falhas de base conhecidas: aceiteMaioridade, cadastroSemWhatsapp, termoAceite, termoCadastroDados, termoV2Declaracoes, termoV3 ("013950: aplique antes"), apoioT4Telas, fontesOficiaisBanco, questoesStaziaMedSoOficiais, registroAdministracao (as 4 `interesse.*`), jcodesmore (3 arquivos). Em "SÓ NO RAMO": nada, ou só tempo estourado sob carga — rode cada um desses SOZINHO pela fila; se passar sozinho, anote como "tempo sob carga"; se falhar sozinho, volte à tarefa dona do arquivo e corrija (pelo ciclo do teste).

- [ ] **Step 4: Varredura do aluno**

```bash
cd "$W" && nice bash "$FILA" npx vitest run src/__tests__/apoioVarredura.test.ts src/__tests__/apoioVarreduraServidor.test.ts src/__tests__/fase2PublicacaoEquipe.test.ts --maxWorkers=2
```
Esperado: PASS (`apoioVarredura` 34/34 ou mais).

- [ ] **Step 5: Build e apagar**

```bash
cd "$W" && nice bash "$FILA" npx vite build --outDir "$TMPDIR/dist-fluxo" > /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples/build.log 2>&1; echo "codigo $?"; tail -5 /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples/build.log; rm -rf "$TMPDIR/dist-fluxo"
```
Esperado: `codigo 0` e "built in …".

- [ ] **Step 6: SQL de produção**

```bash
cd "$W" && P=/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples && cat supabase/migrations/20261003014130_treino_dupla_fluxo_convite.sql supabase/migrations/20261003014140_treino_dupla_fluxo_sigilo.sql supabase/migrations/20261003014150_treino_dupla_fluxo_sala.sql > "$P/publicar-fluxo-simples.sql" && cat supabase/desfazer/20261003014150_treino_dupla_fluxo_sala.desfazer.sql supabase/desfazer/20261003014140_treino_dupla_fluxo_sigilo.desfazer.sql supabase/desfazer/20261003014130_treino_dupla_fluxo_convite.desfazer.sql > "$P/desfazer-fluxo-simples.sql" && shasum -a 256 "$P/publicar-fluxo-simples.sql" "$P/desfazer-fluxo-simples.sql"
```

Crie `$P/conferir-fluxo-simples.sql` (roda DEPOIS de `publicar-fluxo-simples.sql`, no mesmo ensaio; devolve linhas `{item, ok}`; troca papéis só dentro da transação e devolve):

```sql
-- CONFERÊNCIA DO FLUXO SIMPLES (014130–014150) — fase2-etapa2, 19/10/2026. Roda DEPOIS de publicar-fluxo-simples.sql, sempre pelo
-- ensaiar.mjs (que desfaz tudo no fim). Devolve linhas {item, ok}. O "aluno" é uma conta que não é administradora nem revisora,
-- trocada para 'student' só dentro do bloco e devolvida no fim. O fluxo da equipe roda com perfis de estudo criados só aqui.
create temp table if not exists _conf_fs (o int, item text, ok boolean) on commit drop;
truncate _conf_fs;
do $conf$
declare
  v_admin uuid;
  v_outro uuid;
  v_role public.app_role;
  v_est text;
  v_r jsonb;
  v_sala uuid;
  v_inv uuid;
  v_s jsonb;
  v_c jsonb;
  v_call text;
  v_recusa text := '';
begin
  insert into _conf_fs values
    (1, 'miolo do convite com 6 argumentos; o de 5 não existe',
       to_regprocedure('public.dupla_invite_core(uuid,uuid,text,boolean,uuid,boolean)') is not null
       and to_regprocedure('public.dupla_invite_core(uuid,uuid,text,boolean,uuid)') is null),
    (2, 'nova rodada (uuid, text); a (uuid) não existe',
       to_regprocedure('public.app_dupla_next_station(uuid,text)') is not null and to_regprocedure('public.app_dupla_next_station(uuid)') is null),
    (3, 'gatilho study_invites_accepted_setup existe', exists (select 1 from pg_trigger where tgname = 'study_invites_accepted_setup')),
    (4, 'início sem "os dois prontos" e com "Escolha a estação antes de iniciar"',
       (select prosrc from pg_proc where proname = 'app_dupla_start' and pronamespace = 'public'::regnamespace) not like '%Os dois precisam estar prontos%'
       and (select prosrc from pg_proc where proname = 'app_dupla_start' and pronamespace = 'public'::regnamespace) like '%Escolha a estação antes de iniciar%'),
    (5, 'estado e conteúdo escondem a estação antes de começar',
       (select prosrc from pg_proc where proname = 'dupla_room_state' and pronamespace = 'public'::regnamespace) like '%v_hide%'
       and (select prosrc from pg_proc where proname = 'app_dupla_room_content' and pronamespace = 'public'::regnamespace) like '%''waiting'', true%'
       and (select prosrc from pg_proc where proname = 'app_dupla_room_content' and pronamespace = 'public'::regnamespace) like '%dupla_sweep%'),
    (6, 'lista sem a aba atores; convites sem a estação',
       (select prosrc from pg_proc where proname = 'app_dupla_radar' and pronamespace = 'public'::regnamespace) not like '%''atores''%'
       and (select prosrc from pg_proc where proname = 'app_dupla_invites' and pronamespace = 'public'::regnamespace) not like '%dupla_station_meta%'),
    (7, 'permissões: app_* sem visitante; miolo, gatilho e estado só por dentro',
       not has_function_privilege('anon', 'public.app_dupla_next_station(uuid,text)', 'execute')
       and has_function_privilege('authenticated', 'public.app_dupla_next_station(uuid,text)', 'execute')
       and not has_function_privilege('anon', 'public.app_dupla_invite(uuid,text)', 'execute')
       and not has_function_privilege('authenticated', 'public.dupla_invite_core(uuid,uuid,text,boolean,uuid,boolean)', 'execute')
       and not has_function_privilege('authenticated', 'public.dupla_invite_accepted_setup()', 'execute')
       and not has_function_privilege('authenticated', 'public.dupla_room_state(public.checklist_rooms,uuid)', 'execute')),
    (8, 'Treino em Dupla continua desligado e a cota de créditos também',
       coalesce((select (value ->> 'aberto')::boolean from public.app_settings where key = 'treino_dupla'), false) = false
       and coalesce((select (value ->> 'ativa')::boolean from public.app_settings where key = 'creditos'), false) = false);
  insert into _conf_fs values
    (14, 'porta: dupla_porta existe, Pediatria é a porta 3 e o estado entrega a porta',
       to_regprocedure('public.dupla_porta(text)') is not null and public.dupla_porta('Pediatria') = 3
       and (select prosrc from pg_proc where proname = 'dupla_room_state' and pronamespace = 'public'::regnamespace) like '%dupla_porta%'
       and not has_function_privilege('authenticated', 'public.dupla_porta(text)', 'execute')),
    (15, 'início 2 s à frente (apito) e match limpa a estação de quem virou candidato',
       (select prosrc from pg_proc where proname = 'app_dupla_start' and pronamespace = 'public'::regnamespace) like '%interval ''2 seconds''%'
       and (select prosrc from pg_proc where proname = 'app_dupla_swipe' and pronamespace = 'public'::regnamespace) like '%v_chooser = v_cand%'),
    (16, 'convite por link do @ saiu: as três funções recusam e a lista de pedidos é vazia',
       (select bool_and(prosrc like '%O convite por link saiu%') from pg_proc
         where proname in ('app_dupla_link_lookup', 'app_dupla_link_request', 'app_dupla_answer_request') and pronamespace = 'public'::regnamespace)
       and (select prosrc from pg_proc where proname = 'app_dupla_requests' and pronamespace = 'public'::regnamespace) like '%''requests'', ''[]''::jsonb%');

  -- ---------------------------------------------------------------- aluno e visitante recusados
  select user_id into v_admin from public.user_roles where role = 'admin' order by user_id limit 1;
  select u.id into v_outro from auth.users u
   where not exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'admin')
     and not exists (select 1 from public.ch_reviewer_areas a where a.user_id = u.id)
   order by u.id limit 1;
  if v_outro is null then
    insert into _conf_fs values (9, 'aluno: não há conta (fora administrador e revisores) para conferir', false);
  else
    select role into v_role from public.user_roles where user_id = v_outro;
    update public.user_roles set role = 'student' where user_id = v_outro;
    perform set_config('request.jwt.claims', json_build_object('sub', v_outro, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    foreach v_call in array array[
      format('app_dupla_invite(%L::uuid, ''inep2025-1-e07'')', v_admin), 'app_dupla_radar(null, ''perto'')', 'app_dupla_invites()', 'app_dupla_requests()',
      'app_dupla_next_station(''00000000-0000-4000-8000-0000000000ff''::uuid, ''trocar'')', 'app_dupla_start(''00000000-0000-4000-8000-0000000000ff''::uuid)'] loop
      begin
        execute 'select public.' || v_call;
        v_recusa := v_recusa || v_call || ' ABRIU; ';
      exception when others then null;
      end;
    end loop;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    update public.user_roles set role = v_role where user_id = v_outro;
    insert into _conf_fs values (9, 'aluno: ' || case when v_recusa = '' then 'tudo do fluxo simples recusa' else v_recusa end, v_recusa = '');
    insert into _conf_fs values (10, 'aluno: papel devolvido', (select role from public.user_roles where user_id = v_outro) is not distinct from v_role);
  end if;
  v_recusa := '';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  foreach v_call in array array['app_dupla_invites()', 'app_dupla_radar()', 'app_dupla_next_station(''00000000-0000-4000-8000-0000000000ff''::uuid, ''mesmo'')'] loop
    begin
      execute 'select public.' || v_call;
      v_recusa := v_recusa || v_call || ' ABRIU; ';
    exception when others then null;
    end;
  end loop;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  insert into _conf_fs values (11, 'visitante: ' || case when v_recusa = '' then 'tudo recusa' else v_recusa end, v_recusa = '');

  -- ---------------------------------------------------------------- fluxo da equipe (administrador convida o editor)
  select r.user_id into v_outro from public.user_roles r where r.role = 'editor' order by r.user_id limit 1;
  select s.id into v_est from public.checklist_stations s
   where exists (select 1 from public.checklist_station_contents k where k.station_id = s.id) order by s.id limit 1;
  if v_admin is null or v_outro is null or v_est is null then
    insert into _conf_fs values (12, 'equipe: falta administrador, editor ou estação com conteúdo para conferir o fluxo', false);
  else
    insert into public.study_profiles (user_id, public_name) values (v_admin, 'Equipe Um'), (v_outro, 'Equipe Dois')
      on conflict (user_id) do nothing;
    update public.study_profiles set last_seen_at = now(), status = 'livre', radar_visible = true, allow_direct_invites = true
     where user_id in (v_admin, v_outro);
    update public.checklist_rooms set phase = 'closed', closed_reason = 'sem_sinal' where phase <> 'closed' and member_ids && array[v_admin, v_outro];
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_r := public.app_dupla_invite(v_outro, v_est);
    v_sala := (v_r ->> 'room_id')::uuid;
    execute 'reset role';
    select id into v_inv from public.study_invites where room_id = v_sala;
    perform set_config('request.jwt.claims', json_build_object('sub', v_outro, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_s := public.app_dupla_room(v_sala);
    v_c := public.app_dupla_room_content(v_sala);
    perform public.app_dupla_answer_invite(v_inv, true);
    execute 'reset role';
    insert into _conf_fs values (12, 'equipe: convite cria a sala na preparação, ator = quem convidou; o candidato recebe só a porta numerada',
      (select phase = 'setup' and evaluator_id = v_admin and candidate_id = v_outro from public.checklist_rooms where id = v_sala)
      and v_s -> 'station' = 'null'::jsonb and (v_s ->> 'station_ready')::boolean and (v_s ->> 'porta') ~ '^[1-5]$'
      and v_c -> 'station' = 'null'::jsonb);
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_s := public.app_dupla_start(v_sala);
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', v_outro, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_c := public.app_dupla_room(v_sala);
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    insert into _conf_fs values (13, 'equipe: um toque do ator inicia 2 s à frente (apito); em andamento o candidato vê a estação sem o nome',
      v_s ->> 'phase' = 'running' and v_c -> 'station' is not null and v_c -> 'station' <> 'null'::jsonb and not (v_c -> 'station' ? 'name')
      and (select started_at > now() + interval '1 second' and ends_at - started_at = coalesce(duration_ms, 600000) * interval '1 millisecond'
             from public.checklist_rooms where id = v_sala));
  end if;
end
$conf$;
select jsonb_agg(jsonb_build_object('item', item, 'ok', ok) order by o) as conferir_fluxo_simples,
       bool_and(ok) as tudo_ok
  from _conf_fs;
```

- [ ] **Step 7: Ensaio em produção, SÓ com ROLLBACK**

```bash
cd /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples && E=/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-etapa2 && node ensaiar.mjs "$E/antes-etapa2.sql" "$E/publicar-etapa2.sql" "$E/conferir-etapa2.sql" "$E/preparo-aluno-temporario.sql" "$E/conferir-base-ontem.sql" "$E/restaurar-aluno-temporario.sql" publicar-fluxo-simples.sql conferir-fluxo-simples.sql | tee saida-ensaio-1.txt
```
Esperado: 22/22 da etapa 2, 53/53 da base (as duas conferências rodam ANTES das três migrações novas, porque conferem o texto das funções da etapa 2 que o fluxo simples refaz), `tudo_ok: true` do fluxo simples, e a última linha `ENSAIO (desfeito)`.

Cadeia colada duas vezes (idempotência):
```bash
cd /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples && E=/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-etapa2 && node ensaiar.mjs "$E/publicar-etapa2.sql" publicar-fluxo-simples.sql publicar-fluxo-simples.sql conferir-fluxo-simples.sql | tee saida-ensaio-2.txt
```
Esperado: `tudo_ok: true`, `ENSAIO (desfeito)`.

Desfazer (cadeia + fluxo + desfazer do fluxo → conferências da etapa 2 voltam a passar):
```bash
cd /Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples && E=/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-etapa2 && node ensaiar.mjs "$E/antes-etapa2.sql" "$E/publicar-etapa2.sql" publicar-fluxo-simples.sql desfazer-fluxo-simples.sql "$E/conferir-etapa2.sql" | tee saida-ensaio-desfazer.txt
```
Esperado: 22/22 da etapa 2 (o banco volta à etapa 2), `ENSAIO (desfeito)`.

Se qualquer ensaio der "ERRO, nada gravado": leia o erro, corrija a migração na tarefa dona (pelo ciclo do teste), refaça o Step 6 e este.

- [ ] **Step 8: Relatório (fora do repositório) e conferência final**

Escreva `/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-fluxo-simples/RELATORIO.md` com: hash do ramo (`git -C "$W" rev-parse --short HEAD`); as três migrações e o sha256 de `publicar-fluxo-simples.sql`; a comparação da suíte (`comparacao.txt`: totais e "só no ramo"); `apoioVarredura`; build; os três ensaios; e "Para publicar (só com ordem do dono)": 1) SQL da etapa 2 (se ainda não foi) e depois `publicar-fluxo-simples.sql` pelo `/Volumes/StaziaMed/.tmp-aulas/pgaplicar/aplicar-sql.mjs --gravar`, conferindo com `node ensaiar.mjs conferir-fluxo-simples.sql`; 2) site (juntar no main, GitHub, Vercel); 3) **teste manual do dono com duas contas da equipe (computador e celular)** antes de qualquer abertura aos alunos: porta numerada, apito e porta abrindo juntos nos dois aparelhos, folha e 10 minutos ao abrir. Anote também que nenhum modelo do Vertex/Gemini foi usado em nenhum passo (nem para revisar).

Confira que nada foi gravado nem enviado:
```bash
cd "$W" && git status --short && git log --oneline -10 && git log origin/fase2-etapa2..HEAD --oneline 2>/dev/null | wc -l
```
Esperado: árvore limpa; os commits das Tarefas 1–9 no ramo; nenhum `push`. Nenhum comando com `--gravar`, `supabase db push` ou Vercel foi rodado.

---

## Self-review (feito ao escrever)

- **Cobertura do desenho (com a 2ª rodada, e8d458e5):** §1 um toque (T3, T5), ator escolhe (T1, T3, T9), telas limpas (T2, T5); §2 decisões 1 lista (T9), 2 só o ator convida (T1), 2b mesmo/trocar (T3, T7), 3 sem link de chamada (constraint + T5), 4 um botão (T3, T5), 5 comentário e revisão (T3, T7), 6 dois caminhos sem sortear estação (T9; "Em dupla" do Banco já leva a `go("dupla", { estacao })`, que agora abre a lista), 7 match secundário (T3 banco, T9 tela), 8 duas abas (T1, T9); §2b link do @ sai (T1 banco, T8 telas e rota), papéis do match pelas escolhas do perfil sem regra nova (T3 não toca em `dupla_assign`), estação limpa quando quem a trouxe vira candidato (T3: match e escolha de papéis), menu continua "Praticar" (T9, guarda), nenhum Vertex/Gemini (constraint, T10); §3.3 porta numerada desde a entrada e "O ator está escolhendo a estação" (T2, T5); §3.4 apito e porta sincronizados pelo relógio do servidor, som desligado e movimento reduzido (T3 grava +2 s, T6 linha do tempo e telas); recusa/fim do prazo avisam o ator (`ClosedPhase` "{nome} não entrou na sala.", já coberto em `duplaSalaFases`); §4 todos os itens (T1–T3); §5 telas e celular (T5–T9); §7 testes, varredura, suíte, build e ensaio (T1–T10).
- **Nomes:** `app_dupla_next_station(p_room_id, p_papel)`, `actions.nextStation(papel)`, `station_ready`, `porta`, `dupla_porta`, `waiting`, `role` do convite, `recolarFluxoSimples`, `candidateWaitText`, `APITO_MS`, `APITO_TOLERANCIA_MS`, `entrada`, `deveApitar`, `tempoMostrado`, `Porta`, `PortaEntrada` usados igual em todas as tarefas.
- **Sem placeholders:** as funções longas são copiadas por linha exata (`sed -n`) das bases citadas e recebem trocas com o texto exato de antes e depois; cada tarefa confere a cópia por `grep -c`.
