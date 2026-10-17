// @vitest-environment node
/**
 * Treino em Dupla · folha do candidato em imagem (migração 013390), num Postgres em memória (PGlite) com todas as migrações.
 * Regra do relato (impresso 1 "Relato do caso"/"Instruções ao participante" vai para a folha e sai da fila de liberação),
 * fonte sem nome nem tema, pedido só da equipe, gravação pelo servidor com a marca do conteúdo, a sala mostrando a imagem só
 * enquanto ela corresponde ao conteúdo, e a fila do comando. Tudo é dado de TESTE.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addStation, makeRoom, openDuplaDb, setDupla, setPlan, STATION, U, type DuplaDb } from "./helpers/duplaDb";

const SHA = "a".repeat(64);
const SHA2 = "b".repeat(64);
const caminho = (sha: string) => `dupla/folhas/${sha}.png`;

// Estação com o relato como impresso 1 SEM a marca initially_visible (como a Montagem publica): a regra põe na folha.
const RELATO = {
  ...STATION,
  id: "teste-inep2020-e03",
  name: "ZZNOME estação da folha",
  topic: "ZZTEMA reservado",
  area: "Pediatria",
  duration_ms: 600000,
  doctor_scene: "Cenário da folha, linha um.\n\nCenário da folha, parágrafo dois.",
  doctor_tasks: "1. ler o impresso 1;\n2. examinar.",
  pressings: [
    { id: "r-p1", name: "Relato de caso clínico", content: "Menino, 5 anos.\nLiberação: logo no início.\nFebre há 2 dias.", image_url: null },
    { id: "r-p2", name: "Hemograma", content: "Hb 11.", image_url: null },
    { id: "r-p3", name: "Radiografia", content: "Sem alterações.", image_url: null },
  ],
  pressing_assets: {},
};
// Instruções + relato em sequência, e um exame.
const DUPLO = {
  ...STATION,
  id: "teste-dupla-duplo",
  pressings: [
    { id: "d-p1", name: "INSTRUÇÕES PARA O(A) PARTICIPANTE", content: "Instruções.", image_url: null },
    { id: "d-p2", name: "Relato do caso", content: "Relato.", image_url: null },
    { id: "d-p3", name: "Gasometria", content: "pH 7,3.", image_url: null },
  ],
};
// Impresso inicial que não é relato: a folha em imagem o esconderia → bloqueio.
const BLOQ = {
  ...STATION,
  id: "teste-dupla-bloq",
  pressings: [{ id: "b-p1", name: "Foto da lesão", content: "Imagem.", image_url: null, initially_visible: true }],
};
// Relato não é o impresso 1: não vai para a folha.
const MEIO = {
  ...STATION,
  id: "teste-dupla-meio",
  pressings: [
    { id: "m-p1", name: "Hemograma", content: "Hb 9.", image_url: null },
    { id: "m-p2", name: "Relato do caso", content: "Relato tardio.", image_url: null },
  ],
};

describe("Migração 013390: folha do candidato em imagem", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    for (const u of [U.ana, U.bruno]) await setPlan(d.db, u, "pro", "active");
    await addStation(d.db, STATION);
    await addStation(d.db, RELATO);
    await addStation(d.db, DUPLO);
    await addStation(d.db, BLOQ);
    await addStation(d.db, MEIO, { medical_review: "pending" });
  }, 120_000);
  afterAll(async () => {
    await d?.db.close();
  });
  beforeEach(async () => {
    await d.sql(`delete from public.checklist_rooms`);
  });

  const impressos = async (id: string) =>
    d.sql(`select p.id, p.initially_visible as inicial, p.screen_number as tela
             from public.checklist_station_contents k, public.dupla_pressings_tela(k.content) p where k.station_id = $1 order by p.n`, [id]);
  const gravar = (id: string, hash: string, sha = SHA) =>
    d.sql(`select public.ch_worker_dupla_folha_gravar(null, $1, $2, $3, $4, 1604, 2400, 1000, 'folha-1.1') as r`, [id, hash, caminho(sha), sha]);
  const fonte = async (id: string) => (await d.sql(`select public.ch_worker_dupla_folha_fonte($1) as r`, [id]))[0].r;

  it("regra do relato: o impresso 1 (e os seguidos) com nome de relato/instruções fica inicial; os outros seguem 1, 2, 3", async () => {
    expect(await impressos(RELATO.id)).toEqual([
      { id: "r-p1", inicial: true, tela: 1 },
      { id: "r-p2", inicial: false, tela: 1 },
      { id: "r-p3", inicial: false, tela: 2 },
    ]);
    expect(await impressos(DUPLO.id)).toEqual([
      { id: "d-p1", inicial: true, tela: 1 },
      { id: "d-p2", inicial: true, tela: 2 },
      { id: "d-p3", inicial: false, tela: 1 },
    ]);
    // relato fora da posição 1 e estação comum: nada muda
    expect((await impressos(MEIO.id)).map((p: any) => p.inicial)).toEqual([false, false]);
    expect((await impressos(STATION.id)).map((p: any) => p.inicial)).toEqual([false, false]);
  });

  it("fonte: número da estação, área, cenário, tarefas e o texto do relato sem a linha de liberação; nunca o nome nem o tema", async () => {
    const { fonte: f, hash } = await fonte(RELATO.id);
    expect(f).toEqual({
      numero: 3,
      area: "Pediatria",
      duracao_ms: 600000,
      cenario: RELATO.doctor_scene,
      tarefas: RELATO.doctor_tasks,
      impressos: [{ nome: "Relato de caso clínico", texto: "Menino, 5 anos.\nFebre há 2 dias." }],
      bloqueio: null,
    });
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(f)).not.toMatch(/ZZNOME|ZZTEMA/);
    // sem relato: a folha só com as instruções
    expect((await fonte(STATION.id)).fonte.impressos).toEqual([]);
    expect((await fonte(BLOQ.id)).fonte.bloqueio).toMatch(/impresso visível desde o início que não é o relato/);
  });

  it("pedir: só a equipe; aluno e visitante barrados; bloqueio recusa; a situação fica 'pedida'", async () => {
    await expect(d.rpc(U.ana, "app_admin_dupla_folha_pedir", { p_station_id: RELATO.id })).rejects.toThrow(/só a equipe/);
    await expect(d.rpc(null, "app_admin_dupla_folha_pedir", { p_station_id: RELATO.id })).rejects.toThrow(/permission denied/);
    await expect(d.rpc(U.ana, "app_admin_dupla_folha", { p_station_id: RELATO.id })).rejects.toThrow(/restrito/);
    await expect(d.rpc(U.admin, "app_admin_dupla_folha_pedir", { p_station_id: BLOQ.id })).rejects.toThrow(/não é o relato/);
    await expect(d.rpc(U.admin, "app_admin_dupla_folha_pedir", { p_station_id: "nao-existe" })).rejects.toThrow(/não encontrada/);
    const s = await d.rpc(U.admin, "app_admin_dupla_folha_pedir", { p_station_id: RELATO.id });
    expect(s).toMatchObject({ estado: "pedida", tem_imagem: false, com_relato: true, bloqueio: null });
    const uma = await d.rpc(U.admin, "app_admin_dupla_folha", { p_station_id: RELATO.id });
    expect(uma.fonte.numero).toBe(3);
    expect(uma.situacao.estado).toBe("pedida");
    const todas = await d.rpc(U.admin, "app_admin_dupla_folhas");
    expect(todas[RELATO.id].estado).toBe("pedida");
    expect(todas[STATION.id].estado).toBe("nenhuma");
    expect(todas[BLOQ.id].bloqueio).toMatch(/não é o relato/);
  });

  it("fila do comando: pedidas primeiro; com 'todas', as aprovadas sem folha (sem as bloqueadas nem as pendentes de revisão)", async () => {
    const fila = async (todas: boolean) => (await d.sql(`select public.ch_worker_dupla_folhas_a_gerar($1, 50) as r`, [todas]))[0].r;
    expect(await fila(false)).toEqual([RELATO.id]);
    const todas = await fila(true);
    expect(todas[0]).toBe(RELATO.id);
    expect(todas).toEqual(expect.arrayContaining([STATION.id, DUPLO.id]));
    expect(todas).not.toContain(BLOQ.id);
    expect(todas).not.toContain(MEIO.id);
  });

  it("gravar: confere a marca do conteúdo e o caminho; aponta a estação para a imagem; a sala entrega só enquanto vale", async () => {
    const { hash } = await fonte(RELATO.id);
    await expect(gravar(RELATO.id, "0".repeat(32))).rejects.toThrow(/mudou durante a geração/);
    await expect(d.sql(`select public.ch_worker_dupla_folha_gravar(null, $1, $2, 'dupla/folhas/outro.png', $3, 1, 1, 1, 'x')`, [RELATO.id, hash, SHA])).rejects.toThrow(/inválido/);
    await expect(d.sql(`select public.ch_worker_dupla_folha_gravar($1, $2, $3, $4, $5, 1, 1, 1, 'x')`, [U.ana, RELATO.id, hash, caminho(SHA), SHA])).rejects.toThrow(/só a equipe/);
    const [{ r }] = await gravar(RELATO.id, hash);
    expect(r).toMatchObject({ estado: "pronta", imagem_valendo: true, tem_imagem: true, modelo: "folha-1.1" });
    const [{ content }] = await d.sql(`select content from public.checklist_station_contents where station_id = $1`, [RELATO.id]);
    expect(content.pressing_assets).toEqual({ candidate_sheet: { folha: SHA } });
    // o resto do conteúdo não mudou
    expect(content.pressings).toEqual(RELATO.pressings);

    // sala em andamento: ana candidata, bruno avaliador
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "running", candidate: U.ana, evaluator: U.bruno, station: RELATO.id });
    const cand = await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: sala });
    expect(cand.station.candidate_sheet).toEqual({ has_image: true });
    // o relato não aparece entre os liberáveis do candidato; os exames seguem 1, 2
    expect(cand.pressing_count).toBe(2);
    expect(cand.pressings.map((p: any) => [p.id, p.initially_visible])).toEqual([["i1", true]]);
    expect(JSON.stringify(cand)).not.toMatch(/ZZNOME|ZZTEMA/);
    expect(await d.rpc(U.ana, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" })).toBe(caminho(SHA));
    expect(await d.rpc(U.bruno, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" })).toBe(caminho(SHA));

    // o conteúdo mudou (cenário editado): a imagem deixa de valer, a sala volta ao texto e a Administração pede para regerar
    await d.sql(`update public.checklist_station_contents set content = jsonb_set(content, '{doctor_scene}', '"Cenário novo."') where station_id = $1`, [RELATO.id]);
    expect(await d.rpc(U.ana, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" })).toBeNull();
    expect(await d.rpc(U.admin, "app_admin_dupla_folhas").then((m: any) => m[RELATO.id].estado)).toBe("desatualizada");
    expect(await d.rpc(U.admin, "app_admin_dupla_folha_caminho", { p_station_id: RELATO.id })).toBe(caminho(SHA));

    // gerar de novo vale de novo
    const [{ r: r2 }] = await gravar(RELATO.id, (await fonte(RELATO.id)).hash, SHA2);
    expect(r2.estado).toBe("pronta");
    expect(await d.rpc(U.ana, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" })).toBe(caminho(SHA2));

    // publicado de novo (conteúdo trocado inteiro, sem a chave): fica desatualizada e a sala não mostra a imagem
    await addStation(d.db, RELATO);
    expect(await d.rpc(U.admin, "app_admin_dupla_folhas").then((m: any) => m[RELATO.id].estado)).toBe("desatualizada");
    const cand2 = await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: sala });
    expect(cand2.station.candidate_sheet).toEqual({ has_image: false });
  });

  it("falha fica registrada com o motivo; o pedido seguinte limpa", async () => {
    const [{ r }] = await d.sql(`select public.ch_worker_dupla_folha_falha($1, 'Chromium caiu.') as r`, [DUPLO.id]);
    expect(r).toMatchObject({ estado: "falhou", erro: "Chromium caiu." });
    const s = await d.rpc(U.admin, "app_admin_dupla_folha_pedir", { p_station_id: DUPLO.id });
    expect(s).toMatchObject({ estado: "pedida", erro: null });
  });

  it("estação SEM relato (decisão do dono de 17/10): o botão e o comando geram; folha só com as instruções; a sala entrega a imagem", async () => {
    // sem relato no impresso 1: nada vai para a folha além das instruções, e não há bloqueio
    const f = await fonte(STATION.id);
    expect(f.fonte.impressos).toEqual([]);
    expect(f.fonte.bloqueio).toBeNull();
    // botão (Administração › Estações › Gerar folha): o pedido é aceito
    const s = await d.rpc(U.admin, "app_admin_dupla_folha_pedir", { p_station_id: STATION.id });
    expect(s).toMatchObject({ estado: "pedida", com_relato: false, bloqueio: null });
    // comando (dupla:folhas): a estação entra na fila, pedida ou não
    const fila = (await d.sql(`select public.ch_worker_dupla_folhas_a_gerar(false, 50) as r`))[0].r;
    expect(fila).toContain(STATION.id);
    // gravada: pronta, sem relato, e a sala do candidato mostra a imagem; os impressos seguem 1, 2 e liberáveis
    const [{ r }] = await gravar(STATION.id, f.hash, SHA2);
    expect(r).toMatchObject({ estado: "pronta", com_relato: false, tem_imagem: true });
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "running", candidate: U.ana, evaluator: U.bruno, station: STATION.id });
    const cand = await d.rpc(U.ana, "app_dupla_room_content", { p_room_id: sala });
    expect(cand.station.candidate_sheet).toEqual({ has_image: true });
    expect(cand.pressing_count).toBe(2);
    expect(cand.pressings.filter((p: any) => p.initially_visible)).toEqual([]);
    expect(await d.rpc(U.ana, "app_dupla_print_path", { p_room_id: sala, p_pressing_id: "candidate_sheet" })).toBe(caminho(SHA2));
  });

  it("permissões: tabela fechada; ch_worker_* só o servidor; dupla_folha_* só dentro das funções", async () => {
    await expect(d.asUser(U.admin, `select * from public.dupla_station_sheets`)).rejects.toThrow(/permission denied/);
    await expect(d.rpc(U.admin, "ch_worker_dupla_folha_fonte", { p_station_id: RELATO.id })).rejects.toThrow(/permission denied/);
    await expect(d.rpc(U.admin, "ch_worker_dupla_folhas_a_gerar", { p_todas: true, p_limit: 5 })).rejects.toThrow(/permission denied/);
    await expect(d.rpc(U.admin, "dupla_folha_fonte", { p_station_id: RELATO.id })).rejects.toThrow(/permission denied/);
    const funcs = await d.sql(`select proname, prosecdef, proconfig from pg_proc where proname like 'dupla\\_folha\\_%' or proname like '%dupla\\_folha%' order by 1`);
    expect(funcs.length).toBeGreaterThanOrEqual(13);
    for (const f of funcs) expect(f, f.proname).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'] });
    const rls = await d.sql(`select relrowsecurity from pg_class where relname = 'dupla_station_sheets'`);
    expect(rls).toEqual([{ relrowsecurity: true }]);
  });
});
