// @vitest-environment node
/**
 * Grupo B, Unidades e Detalhe (migração 9860):
 *  CC12 dose/contraindicação só é conferida por revisor médico cadastrado na área da afirmação;
 *  CC13 conflito decidido a favor da fonte que sustenta (ou evidência ligada errado e descartada) deixa de bloquear a publicação.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { abrirBanco, ADMIN, ALUNO, EDITOR, REVISOR, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { montarUnidade, noTema, preparaBanco, sha, TEMA_GO, TEMA_PED } from "./helpers/centralUnidades";

let db: PGlite; let sql: Sql; let rpc: Rpc;
const REVISOR_PED = "00000000-0000-4000-8000-0000000083c2";
const MIGRACAO = path.resolve(__dirname, "../../supabase/migrations/20261003009860_central_conferencia_e_conflitos.sql");
beforeAll(async () => {
  ({ db, sql, rpc } = await abrirBanco());
  await sql(`insert into auth.users (id, email) values ($1, 'revped83@t.dev')`, [REVISOR_PED]);
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'PEDIATRIA')`, [REVISOR_PED]);
  await preparaBanco(sql);
  await sql(`delete from public.ch_reviewer_areas where user_id = $1 and area_code <> 'GINECOLOGIA_OBSTETRICIA'`, [REVISOR]); // aqui o REVISOR é só de Ginecologia e Obstetrícia
}, 240_000);

async function afirmacaoComEvidencia(statement: string, critica: boolean, tema = TEMA_GO) {
  const fonte = (await rpc(ADMIN, "app_ch_register_source", { p_source: { title: `Fonte ${statement}`, organ: "Ministério da Saúde", version: "2022", sha256: sha(statement) } })).id as string;
  await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: fonte, p_level: "A" });
  const claim = await rpc(EDITOR, "app_ch_add_claim", { p_claim: { statement, theme_node_id: await noTema(sql, tema), critical_kinds: critica ? ["dose"] : [] } });
  await rpc(EDITOR, "app_ch_link_evidence", { p_claim_id: claim, p_evidence: { source_id: fonte, quote: statement, verdict: "compatible" } });
  return { claim: claim as string, fonte };
}

describe("CC12: conferir dose só o revisor médico da área", () => {
  it("editor, aluno e revisor de outra área são recusados; o revisor da área (e o administrador, que faz a aprovação médica) conferem", async () => {
    const { claim } = await afirmacaoComEvidencia("Ataque com 4 g por via intravenosa em 20 min.", true);
    const msg = /administrador ou de um revisor médico cadastrado na área \(GINECOLOGIA_OBSTETRICIA\)/;
    await expect(rpc(EDITOR, "app_ch_confirm_critical", { p_claim_id: claim })).rejects.toThrow(msg);
    await expect(rpc(REVISOR_PED, "app_ch_confirm_critical", { p_claim_id: claim })).rejects.toThrow(msg);
    await expect(rpc(ALUNO, "app_ch_confirm_critical", { p_claim_id: claim })).rejects.toThrow(/restrito à equipe/);
    expect((await sql(`select critical_checked_by from public.ch_claims where id = $1`, [claim]))[0].critical_checked_by).toBeNull();

    expect(await rpc(EDITOR, "app_ch_claim_can_confirm", { p_claim_id: claim })).toEqual({ areas: ["GINECOLOGIA_OBSTETRICIA"], can: false });
    expect(await rpc(REVISOR, "app_ch_claim_can_confirm", { p_claim_id: claim })).toEqual({ areas: ["GINECOLOGIA_OBSTETRICIA"], can: true });
    expect(await rpc(ADMIN, "app_ch_claim_can_confirm", { p_claim_id: claim })).toEqual({ areas: ["GINECOLOGIA_OBSTETRICIA"], can: true });
    expect(await rpc(REVISOR, "app_ch_confirm_critical", { p_claim_id: claim })).toBe(true);
    const [c] = await sql(`select critical_checked_by from public.ch_claims where id = $1`, [claim]);
    expect(c.critical_checked_by).toBe(REVISOR);
  });

  it("administrador que também é revisor da área confere; afirmação sem área não pode ser conferida", async () => {
    const { claim } = await afirmacaoComEvidencia("Manter 1 g por hora por 24 h.", true);
    await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'GINECOLOGIA_OBSTETRICIA')`, [ADMIN]);
    expect(await rpc(ADMIN, "app_ch_confirm_critical", { p_claim_id: claim })).toBe(true);
    await sql(`delete from public.ch_reviewer_areas where user_id = $1`, [ADMIN]);

    const semArea = await rpc(EDITOR, "app_ch_add_claim", { p_claim: { statement: "Dose de 5 mg ao dia.", critical_kinds: ["dose"] } });
    await expect(rpc(REVISOR, "app_ch_confirm_critical", { p_claim_id: semArea })).rejects.toThrow(/ainda não tem área definida/);
  });

  it("a área vem também da unidade que usa a afirmação; o revisor de Pediatria confere a de Pediatria", async () => {
    const { claim } = await afirmacaoComEvidencia("Oxigênio se saturação abaixo de 90 por cento.", true, TEMA_PED);
    await expect(rpc(REVISOR, "app_ch_confirm_critical", { p_claim_id: claim })).rejects.toThrow(/\(PEDIATRIA\)/);
    expect(await rpc(REVISOR_PED, "app_ch_confirm_critical", { p_claim_id: claim })).toBe(true);
  });
});

describe("CC13: conflito decidido ou evidência corrigida destrava a publicação", () => {
  const problemas = async (versao: string) => (await rpc(EDITOR, "app_ch_publish_problems", { p_version_id: versao })) as string[];
  const temConflito = (p: string[]) => p.some((x) => /Conflito entre referências|Afirmação pendente/.test(x));

  async function comConflito(titulo: string) {
    const u = await montarUnidade(sql, rpc, { titulo, semAprovar: true });
    const outra = (await rpc(ADMIN, "app_ch_register_source", { p_source: { title: `Protocolo estadual ${titulo}`, organ: "Secretaria Estadual de Saúde", version: "2024", sha256: sha(`outra ${titulo}`) } })).id as string;
    await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: outra, p_level: "A" });
    const ev = await rpc(EDITOR, "app_ch_link_evidence", { p_claim_id: u.afirmacao, p_evidence: { source_id: outra, quote: "Conduta diferente da apresentada no texto.", verdict: "conflicting" } });
    await rpc(ADMIN, "app_ch_conflicts_detect");
    const conflito = (await sql(`select id from public.ch_conflicts where claim_id = $1`, [u.afirmacao]))[0].id as string;
    return { ...u, outra, conflito, evidencia: ev.id as string };
  }

  it("com conflito aberto a unidade fica bloqueada", async () => {
    const u = await comConflito("Conflito aberto");
    expect(temConflito(await problemas(u.versao))).toBe(true);
    expect((await sql(`select status from public.ch_claims where id = $1`, [u.afirmacao]))[0].status).toBe("conflicting");
  });

  it("decidido a favor da fonte que sustenta: destrava; o conflito é registrado e a evidência continua guardada", async () => {
    const u = await comConflito("Conflito a favor da fonte que sustenta");
    await expect(rpc(EDITOR, "app_ch_conflict_decide", { p_conflict_id: u.conflito, p_status: "resolved", p_chosen_source: u.fonte, p_note: "A fonte do Ministério vale." })).rejects.toThrow(/restrito a administradores/);
    await rpc(ADMIN, "app_ch_conflict_decide", { p_conflict_id: u.conflito, p_status: "resolved", p_chosen_source: u.fonte, p_note: "A fonte do Ministério vale." });
    expect(temConflito(await problemas(u.versao))).toBe(false);
    expect((await sql(`select status from public.ch_claims where id = $1`, [u.afirmacao]))[0].status).toBe("compatible");
    expect((await sql(`select count(*)::int n from public.ch_evidence where id = $1 and verdict = 'conflicting'`, [u.evidencia]))[0].n).toBe(1);
    // outra evidência ligada depois não traz o bloqueio de volta
    const extra = (await rpc(ADMIN, "app_ch_register_source", { p_source: { title: "Outro manual", organ: "Ministério da Saúde", version: "2023", sha256: sha("extra") } })).id;
    await rpc(EDITOR, "app_ch_link_evidence", { p_claim_id: u.afirmacao, p_evidence: { source_id: extra, quote: "Mesma conduta do texto.", verdict: "compatible" } });
    expect(temConflito(await problemas(u.versao))).toBe(false);
    // mesmo se o processamento automático gravar a situação antiga de novo, a trava olha a decisão
    await sql(`update public.ch_claims set status = 'conflicting' where id = $1`, [u.afirmacao]);
    expect(temConflito(await problemas(u.versao))).toBe(false);
    const hist = await sql(`select event from public.ch_claim_history where claim_id = $1 and event like 'conflict_%'`, [u.afirmacao]);
    expect(hist).toEqual([{ event: "conflict_resolved" }]);
  });

  it("decidido a favor da fonte que discorda: continua bloqueado (o texto da afirmação precisa mudar); adiar não destrava", async () => {
    const u = await comConflito("Conflito a favor da fonte que discorda");
    await rpc(ADMIN, "app_ch_conflict_decide", { p_conflict_id: u.conflito, p_status: "deferred", p_chosen_source: null, p_note: "Decidir na próxima reunião." });
    expect(temConflito(await problemas(u.versao))).toBe(true);
    await rpc(ADMIN, "app_ch_conflict_decide", { p_conflict_id: u.conflito, p_status: "resolved", p_chosen_source: u.outra, p_note: "Vale o protocolo estadual." });
    expect(temConflito(await problemas(u.versao))).toBe(true);
  });

  it("descartar evidência ligada errado: motivo obrigatório, conflito só o administrador, nada é apagado", async () => {
    const u = await comConflito("Evidência descartada");
    await expect(rpc(EDITOR, "app_ch_discard_evidence", { p_evidence_id: u.evidencia, p_reason: "Ligada à fonte errada." })).rejects.toThrow(/decisão de um administrador/);
    await expect(rpc(ADMIN, "app_ch_discard_evidence", { p_evidence_id: u.evidencia, p_reason: "curto" })).rejects.toThrow(/pelo menos 10 caracteres/);
    await expect(rpc(ALUNO, "app_ch_discard_evidence", { p_evidence_id: u.evidencia, p_reason: "Ligada à fonte errada." })).rejects.toThrow(/restrito à equipe/);
    expect(temConflito(await problemas(u.versao))).toBe(true);
    const r = await rpc(ADMIN, "app_ch_discard_evidence", { p_evidence_id: u.evidencia, p_reason: "Ligada à fonte errada." });
    expect(r.claim_status).toBe("compatible");
    expect(temConflito(await problemas(u.versao))).toBe(false);
    const [e] = await sql(`select discarded_by, discard_reason, stale from public.ch_evidence where id = $1`, [u.evidencia]);
    expect(e).toEqual({ discarded_by: ADMIN, discard_reason: "Ligada à fonte errada.", stale: true });
    const lista = await rpc(EDITOR, "app_ch_claim_evidence", { p_claim_id: u.afirmacao });
    expect(lista.find((x: any) => x.id === u.evidencia)).toMatchObject({ discarded: true, discard_reason: "Ligada à fonte errada.", verdict: "conflicting" });
    await expect(rpc(ALUNO, "app_ch_claim_evidence", { p_claim_id: u.afirmacao })).rejects.toThrow(/restrito à equipe/);
    await expect(rpc(ADMIN, "app_ch_discard_evidence", { p_evidence_id: u.evidencia, p_reason: "Ligada à fonte errada." })).rejects.toThrow(/já foi descartada/);
    expect((await sql(`select event from public.ch_claim_history where claim_id = $1 and event = 'evidence_discarded'`, [u.afirmacao])).length).toBe(1);
  });

  it("o editor descarta evidência insuficiente; sem nenhuma evidência a afirmação volta a 'extracted' e a unidade segue bloqueada", async () => {
    const u = await montarUnidade(sql, rpc, { titulo: "Descartar a única evidência", semAprovar: true });
    const unica = (await sql(`select id from public.ch_evidence where claim_id = $1`, [u.afirmacao]))[0].id as string;
    const r = await rpc(EDITOR, "app_ch_discard_evidence", { p_evidence_id: unica, p_reason: "A fonte não trata deste caso." });
    expect(r.claim_status).toBe("extracted");
    expect((await problemas(u.versao)).join(" ")).toMatch(/sem evidência compatível/);
  });
});

describe("Colar a migração de novo", () => {
  it("duas vezes seguidas não dá erro nem muda o comportamento nem as permissões", async () => {
    await db.exec(fs.readFileSync(MIGRACAO, "utf8"));
    await db.exec(fs.readFileSync(MIGRACAO, "utf8"));
    const { claim } = await afirmacaoComEvidencia("Após colar de novo, dose de 2 mg.", true);
    await expect(rpc(EDITOR, "app_ch_confirm_critical", { p_claim_id: claim })).rejects.toThrow(/revisor médico/);
    expect(await rpc(REVISOR, "app_ch_confirm_critical", { p_claim_id: claim })).toBe(true);
    for (const fn of ["app_ch_confirm_critical(uuid)", "app_ch_discard_evidence(uuid, text)", "app_ch_claim_can_confirm(uuid)"])
      expect((await sql(`select has_function_privilege('anon', 'public.${fn}', 'execute') a, has_function_privilege('authenticated', 'public.${fn}', 'execute') b`))[0]).toEqual({ a: false, b: true });
    for (const fn of ["ch_publish_problems_base(uuid)", "ch_claim_recompute_status(uuid)", "ch_evidence_settled(uuid)"])
      expect((await sql(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') b`))[0].b).toBe(false);
  });
});
