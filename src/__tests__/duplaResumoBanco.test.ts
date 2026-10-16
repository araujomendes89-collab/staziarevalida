/**
 * Treino em Dupla · pedido 4 do dono (16/10), migração 013380 parte 2: "Resumo sobre o tema" (D9) com revisão médica, sobre o
 * banco local (PGlite, migrações reais).
 *  - a equipe escreve o rascunho em Administração › Estações; aprova só o revisor médico da área ou um administrador, com quem
 *    e quando; texto novo (por qualquer caminho) volta a rascunho;
 *  - na sala, o "summary" vai só ao avaliador e só aprovado; o candidato nunca recebe (texto bruto);
 *  - o "summary" do conteúdo da estação (o da Montagem) não vai mais para a sala;
 *  - a tabela fica fora do alcance de aluno e visitante.
 * TODO o texto de resumo daqui é EXEMPLO DE TESTE (não é conteúdo médico).
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addStation, makeRoom, MIGRATIONS_DIR, openDuplaDb, setDupla, setPlan, STATION, U, type DuplaDb } from "./helpers/duplaDb";

const MIGRACAO = "20261003013380_treino_dupla_ajustes_1610.sql";
const EDITORA = U.eva; // equipe (editor), não é revisora médica
const REV_CM = U.gil; // revisor médico de Clínica Médica (papel de aluno)
const REV_PED = U.fabio; // revisor médico de Pediatria (papel de aluno)
const EXEMPLO = "ZZEXEMPLO de teste: resumo fictício para conferir o caminho, não é conteúdo médico.";
const EXEMPLO2 = "ZZEXEMPLO de teste, versão 2: texto fictício.";

// Estação de TESTE com um "summary" no conteúdo (como a Montagem grava): ele não pode mais aparecer na sala.
const ESTACAO = { ...STATION, id: "teste-dupla-resumo", name: "ZZNOME estação do resumo", summary: [{ topic: "ZZMONTAGEM", summary: "Texto da Montagem" }] };

describe("Migração 013380 (parte 2): resumo sobre o tema com revisão médica", () => {
  let d: DuplaDb;
  let sala: string;
  beforeAll(async () => {
    d = await openDuplaDb();
    await setDupla(d.db, { aberto: true, planos: ["pro", "elite"] });
    for (const u of [U.ana, U.bruno]) await setPlan(d.db, u, "pro", "active");
    await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITORA]);
    await d.sql(`update public.profiles set name = 'Editora de Teste' where id = $1`, [EDITORA]);
    await d.sql(`update public.profiles set name = 'Revisor de Teste' where id = $1`, [REV_CM]);
    await d.sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA'), ($2, 'PEDIATRIA')`, [REV_CM, REV_PED]);
    await addStation(d.db, ESTACAO);
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });
  beforeEach(async () => {
    await d.sql(`delete from public.checklist_station_summaries`);
    await d.sql(`delete from public.checklist_rooms`);
    sala = await makeRoom(d.db, {
      members: [U.ana, U.bruno], phase: "running", candidate: U.ana, evaluator: U.bruno, station: ESTACAO.id,
      extra: { started_at: new Date().toISOString(), ends_at: new Date(Date.now() + 300000).toISOString() },
    });
  });

  const salvar = (uid: string | null, body: string | null) => d.rpc<any>(uid, "app_admin_save_station_summary", { p_station_id: ESTACAO.id, p_body: body });
  const revisar = (uid: string | null, status: string) => d.rpc<any>(uid, "app_admin_review_station_summary", { p_station_id: ESTACAO.id, p_status: status });
  const doAvaliador = async () => (await d.rpc<any>(U.bruno, "app_dupla_room_content", { p_room_id: sala })).station.summary;
  const doCandidato = () => d.rpc<any>(U.ana, "app_dupla_room_content", { p_room_id: sala });
  const linha = async () => (await d.sql<any>(`select * from public.checklist_station_summaries where station_id = $1`, [ESTACAO.id]))[0];

  it("rascunho não aparece na sala; aprovado aparece só ao avaliador; o candidato nunca recebe (texto bruto)", async () => {
    expect(await doAvaliador()).toBeNull(); // sem resumo: nada (o "summary" da Montagem não vai mais à sala)
    const r = await salvar(EDITORA, `  ${EXEMPLO}  `);
    expect(r).toMatchObject({ body: EXEMPLO, status: "draft", origin: "equipe", updated_by: "Editora de Teste", approved_at: null, approved_by: null, can_approve: false });
    expect(await doAvaliador()).toBeNull();
    const ok = await revisar(REV_CM, "approved");
    expect(ok).toMatchObject({ status: "approved", approved_by: "Revisor de Teste" });
    expect(ok.approved_at).not.toBeNull();
    expect(await linha()).toMatchObject({ approved_by: REV_CM, status: "approved" });
    expect(await doAvaliador()).toBe(EXEMPLO);
    const cand = await doCandidato();
    expect(cand.station).not.toHaveProperty("summary");
    for (const marca of ["ZZEXEMPLO", "ZZMONTAGEM", "ZZNOME"]) expect(JSON.stringify(cand)).not.toContain(marca);
    // no resultado o candidato também não recebe o resumo (só o avaliador lê o conteúdo do avaliador)
    await d.sql(`update public.checklist_rooms set phase = 'result' where id = $1`, [sala]);
    expect(JSON.stringify(await doCandidato())).not.toContain("ZZEXEMPLO");
  });

  it("quem aprova: revisor médico da área ou administrador; editor e revisor de outra área não; aluno nem abre", async () => {
    await salvar(EDITORA, EXEMPLO);
    await expect(revisar(EDITORA, "approved")).rejects.toThrow("A aprovação deste resumo é de um revisor médico cadastrado em Clínica Médica ou de um administrador.");
    await expect(revisar(REV_PED, "approved")).rejects.toThrow(/revisor médico cadastrado em Clínica Médica/);
    await expect(revisar(U.ana, "approved")).rejects.toThrow("Acesso restrito à equipe e aos revisores médicos.");
    await expect(salvar(U.ana, "x")).rejects.toThrow("Acesso restrito à equipe e aos revisores médicos.");
    await expect(d.rpc(U.ana, "app_admin_station_summary", { p_station_id: ESTACAO.id })).rejects.toThrow("Acesso restrito à equipe e aos revisores médicos.");
    await expect(revisar(null, "approved")).rejects.toThrow(/permission denied/);
    expect((await revisar(U.admin, "approved")).status).toBe("approved");
    await expect(revisar(U.admin, "approved")).rejects.toThrow("Este resumo já está aprovado.");
    await expect(revisar(U.admin, "publicado")).rejects.toThrow("Situação inválida.");
    // o revisor médico também escreve o rascunho e vê se pode aprovar
    expect(await d.rpc(REV_CM, "app_admin_station_summary", { p_station_id: ESTACAO.id })).toMatchObject({ status: "approved", can_approve: true });
  });

  it("texto novo volta a rascunho (pela aba ou por comando direto); texto igual mantém a aprovação; voltar a rascunho; vazio apaga", async () => {
    await salvar(EDITORA, EXEMPLO);
    await revisar(REV_CM, "approved");
    // mesmo texto (com espaços nas pontas): nada muda
    expect((await salvar(EDITORA, ` ${EXEMPLO} `)).status).toBe("approved");
    // texto novo: rascunho, sem registro da aprovação, fora da sala
    expect(await salvar(REV_CM, EXEMPLO2)).toMatchObject({ body: EXEMPLO2, status: "draft", approved_by: null, approved_at: null });
    expect(await doAvaliador()).toBeNull();
    // por comando direto no banco também volta a rascunho
    await revisar(REV_CM, "approved");
    await d.sql(`update public.checklist_station_summaries set body = $2 where station_id = $1`, [ESTACAO.id, EXEMPLO]);
    expect(await linha()).toMatchObject({ status: "draft", approved_by: null, approved_at: null });
    // inserir já "aprovado" por fora não aprova
    await d.sql(`delete from public.checklist_station_summaries`);
    await d.sql(`insert into public.checklist_station_summaries (station_id, body, status, approved_by, approved_at) values ($1, $2, 'approved', $3, now())`, [ESTACAO.id, EXEMPLO, U.admin]);
    expect(await linha()).toMatchObject({ status: "draft", approved_by: null });
    // voltar a rascunho de propósito
    await revisar(U.admin, "approved");
    expect((await revisar(EDITORA, "draft")).status).toBe("draft");
    await expect(revisar(EDITORA, "draft")).rejects.toThrow("Este resumo já está em rascunho.");
    expect(await doAvaliador()).toBeNull();
    // limite e texto vazio (apaga)
    await expect(salvar(EDITORA, "x".repeat(8001))).rejects.toThrow("O resumo tem no máximo 8.000 caracteres.");
    expect(await salvar(EDITORA, "   ")).toMatchObject({ body: null, status: null });
    expect(await linha()).toBeUndefined();
    await expect(revisar(U.admin, "approved")).rejects.toThrow("Esta estação ainda não tem resumo.");
  });

  it("lista da aba traz a situação do resumo; o registro fica no Registro de ações", async () => {
    const situacao = async () => (await d.rpc<any[]>(U.admin, "app_admin_stations")).find((s) => s.id === ESTACAO.id).summary_status;
    expect(await situacao()).toBeNull();
    await salvar(EDITORA, EXEMPLO);
    expect(await situacao()).toBe("draft");
    await revisar(REV_CM, "approved");
    expect(await situacao()).toBe("approved");
    const log = await d.sql<any>(`select action, target from public.admin_audit_log where target = $1 order by created_at, action`, [ESTACAO.id]);
    expect(log.map((x: any) => x.action)).toEqual(expect.arrayContaining(["station.summary.save", "station.summary.review"]));
  });

  it("a tabela do resumo é fechada para aluno, visitante e até para a equipe por fora das funções", async () => {
    await salvar(EDITORA, EXEMPLO);
    for (const uid of [U.ana, EDITORA, U.admin]) {
      await expect(d.asUser(uid, `select * from public.checklist_station_summaries`)).rejects.toThrow(/permission denied/);
    }
    await expect(d.asUser(U.ana, `update public.checklist_station_summaries set status = 'approved'`)).rejects.toThrow(/permission denied/);
  });

  it("colar a 013380 de novo dá o mesmo banco; funções com search_path vazio e fechadas ao visitante", async () => {
    await salvar(EDITORA, EXEMPLO);
    await revisar(REV_CM, "approved");
    const defs = () =>
      d.sql<{ id: string; def: string; acl: string | null }>(
        `select p.oid::regprocedure::text as id, pg_get_functiondef(p.oid) as def, p.proacl::text as acl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`
      );
    const antes = await defs();
    await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACAO), "utf8"));
    expect(await defs()).toEqual(antes);
    expect(await linha()).toMatchObject({ body: EXEMPLO, status: "approved" }); // o dado continua
    const acl = Object.fromEntries(antes.map((f) => [f.id, f.acl]));
    for (const f of ["app_admin_station_summary(text)", "app_admin_save_station_summary(text,text)", "app_admin_review_station_summary(text,text)"]) {
      expect(acl[f], f).toBe(acl["app_admin_stations()"]);
    }
    const f = await d.sql(`select proname, prosecdef, proconfig from pg_proc where proname = any ($1) order by 1`, [
      ["app_admin_station_summary", "app_admin_save_station_summary", "app_admin_review_station_summary", "checklist_station_summary_guard", "app_dupla_next_station", "app_dupla_room_done_stations", "dupla_station_done_in_room"],
    ]);
    expect(f).toHaveLength(7);
    for (const x of f) expect(x, x.proname).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'] });
  });
});
