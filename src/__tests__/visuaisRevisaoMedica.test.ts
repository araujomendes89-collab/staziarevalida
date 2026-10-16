// @vitest-environment node
/**
 * Grupo B, CC28 (migração 9863): material visual com dose ou contraindicação não sai para baixar sem revisão médica da área.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { abrirBanco, ADMIN, ALUNO, EDITOR, type Rpc, type Sql } from "./helpers/publicacaoCentral";
import { sha } from "./helpers/centralUnidades";

let db: PGlite; let sql: Sql; let rpc: Rpc;
const MIGRACAO = path.resolve(__dirname, "../../supabase/migrations/20261003009863_visuais_revisao_medica.sql");
beforeAll(async () => {
  ({ db, sql, rpc } = await abrirBanco());
  // o EDITOR é também revisor médico de Ginecologia e Obstetrícia (revisor médico só da área não entra no painel dos materiais visuais)
  await sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'GINECOLOGIA_OBSTETRICIA')`, [EDITOR]);
}, 240_000);

let n = 0;
/** Material visual pronto (gerado e conferido), já com os arquivos no banco. */
async function material(content: Record<string, unknown>, key = "ginecologia") {
  n++;
  const [m] = await sql(`insert into public.ch_visual_materials (model, specialty_key, specialty_label, title, created_by, updated_by) values ('feed', $1, 'Especialidade', $2, $3, $3) returning id`, [key, `Material visual ${n}`, ADMIN]);
  const [v] = await sql(`insert into public.ch_visual_versions (material_id, version, content, content_hash, specialty_key, specialty_label, render_status, rendered_at) values ($1, 1, $2::jsonb, $3, $4, 'Especialidade', 'ready', now()) returning id`,
    [m.id, JSON.stringify({ model: "feed", ...content }), sha(`${n}`), key]);
  const [f] = await sql(`insert into public.ch_visual_files (version_id, format, side, storage_path, sha256, bytes, specialty_key, batch_order, template_version) values ($1, 'png', 'single', $2, $3, 10, $4, 1, 't') returning id`,
    [v.id, `visual/${n}.png`, sha(`f${n}`), key]);
  return { material: m.id as string, versao: v.id as string, arquivo: f.id as string };
}

describe("Reconhecer conteúdo clínico pelo texto", () => {
  const clinico = async (texto: string) => (await sql(`select public.ch_visual_is_clinical($1::jsonb) c`, [JSON.stringify({ titulo: "Título", pontos_chave: [texto] })]))[0].c as boolean;
  it("dose, unidade de medicamento e contraindicação pedem revisão", async () => {
    for (const t of ["Ataque com 4 g IV em 20 min", "Amoxicilina 500 mg de 8 em 8 horas", "Dose de ataque", "10 mL/kg de cristaloide", "Contraindicado na gestação", "Contra-indicação absoluta", "Posologia pediátrica", "0,5 mcg/kg/min", "mg/kg/dia", "Tomar 2 comprimidos"])
      expect(await clinico(t), t).toBe(true);
  });
  it("texto sem dose não pede revisão", async () => {
    for (const t of ["Pré-natal de risco habitual", "Calendário vacinal da criança", "Rastreamento aos 50 anos", "Sinais de alarme na gestação", "Paciente com 5 gestações", "Consultas e exames"])
      expect(await clinico(t), t).toBe(false);
  });
});

describe("Download travado até a revisão médica da área", () => {
  it("material com dose: lista e página avisam, o arquivo não baixa; o revisor da área libera; só vale para aquela versão", async () => {
    const m = await material({ titulo: "Pré-eclâmpsia", pontos_chave: ["Sulfato de magnésio: ataque de 4 g IV em 20 min."] });
    expect((await rpc(ADMIN, "app_ch_visual_list", { p_filters: {} })).find((x: any) => x.id === m.material)).toMatchObject({ review_pending: true, status: "ready" });
    const pag = await rpc(ADMIN, "app_ch_visual_material", { p_id: m.material });
    expect(pag.versions[0].medical_review).toMatchObject({ required: true, done: false, area: "GINECOLOGIA_OBSTETRICIA", can_review: false });
    await expect(rpc(ADMIN, "app_ch_visual_file", { p_file_id: m.arquivo })).rejects.toThrow(/ainda não passou pela revisão médica da área/);
    await expect(rpc(EDITOR, "app_ch_visual_file", { p_file_id: m.arquivo })).rejects.toThrow(/revisão médica/);
    // quem não é revisor da área não libera; aluno nem entra
    await expect(rpc(ADMIN, "app_ch_visual_review", { p_version_id: m.versao, p_note: "Conferi." })).rejects.toThrow(/revisor médico cadastrado na área \(GINECOLOGIA_OBSTETRICIA\)/);
    await expect(rpc(ALUNO, "app_ch_visual_review", { p_version_id: m.versao })).rejects.toThrow();
    // worker (comando do administrador) não recebe os arquivos
    const travado = (await sql(`select public.ch_worker_visual_files($1) r`, [m.versao]))[0].r;
    expect(travado).toMatchObject({ review_pending: true, files: [] });

    expect((await rpc(EDITOR, "app_ch_visual_material", { p_id: m.material })).versions[0].medical_review.can_review).toBe(true);
    await rpc(EDITOR, "app_ch_visual_review", { p_version_id: m.versao, p_note: "Dose conferida no manual do Ministério." });
    expect(await rpc(ADMIN, "app_ch_visual_file", { p_file_id: m.arquivo })).toMatchObject({ format: "png", render_status: "ready" });
    const depois = (await rpc(ADMIN, "app_ch_visual_material", { p_id: m.material })).versions[0].medical_review;
    expect(depois).toMatchObject({ required: true, done: true, note: "Dose conferida no manual do Ministério." });
    expect(depois.by_name).toBeTruthy();
    expect((await rpc(ADMIN, "app_ch_visual_list", { p_filters: {} })).find((x: any) => x.id === m.material).review_pending).toBe(false);
    expect((await sql(`select public.ch_worker_visual_files($1) r`, [m.versao]))[0].r.files).toHaveLength(1);
    expect((await sql(`select action from public.ch_audit where action = 'visual.medical_review' and target = $1`, [m.material])).length).toBe(1);
    // versão nova (edição) pede a revisão de novo
    const [v2] = await sql(`insert into public.ch_visual_versions (material_id, version, content, content_hash, specialty_key, specialty_label, render_status) values ($1, 2, $2::jsonb, $3, 'ginecologia', 'Especialidade', 'ready') returning id`,
      [m.material, JSON.stringify({ model: "feed", titulo: "Pré-eclâmpsia", pontos_chave: ["Ataque de 5 g IV."] }), sha("v2")]);
    const [f2] = await sql(`insert into public.ch_visual_files (version_id, format, side, storage_path, sha256, bytes, specialty_key, batch_order, template_version) values ($1, 'png', 'single', 'visual/v2.png', $2, 10, 'ginecologia', 1, 't') returning id`, [v2.id, sha("f2")]);
    await expect(rpc(ADMIN, "app_ch_visual_file", { p_file_id: f2.id })).rejects.toThrow(/revisão médica/);
  });

  it("revisor de outra área não libera; especialidade 'outra' aceita qualquer revisor médico", async () => {
    const ped = await material({ titulo: "Bronquiolite", pontos_chave: ["Dose de oxigênio conforme saturação."] }, "pediatria");
    await expect(rpc(EDITOR, "app_ch_visual_review", { p_version_id: ped.versao })).rejects.toThrow(/\(PEDIATRIA\)/);
    const outra = await material({ titulo: "Outra", pontos_chave: ["Contraindicação: alergia."] }, "fallback");
    await rpc(EDITOR, "app_ch_visual_review", { p_version_id: outra.versao });
    expect(await rpc(ADMIN, "app_ch_visual_file", { p_file_id: outra.arquivo })).toMatchObject({ render_status: "ready" });
  });

  it("material sem conteúdo clínico baixa direto e não precisa de revisão", async () => {
    const m = await material({ titulo: "Rastreamento", pontos_chave: ["Consultas e exames de rotina."] });
    expect(await rpc(ADMIN, "app_ch_visual_file", { p_file_id: m.arquivo })).toMatchObject({ format: "png" });
    expect((await rpc(ADMIN, "app_ch_visual_material", { p_id: m.material })).versions[0].medical_review).toMatchObject({ required: false, done: false });
    await expect(rpc(EDITOR, "app_ch_visual_review", { p_version_id: m.versao })).rejects.toThrow(/não precisa de revisão médica/);
  });

  it("colar a migração de novo não perde as revisões nem as permissões", async () => {
    const m = await material({ titulo: "Antes de colar", pontos_chave: ["Dose de 1 g."] });
    await rpc(EDITOR, "app_ch_visual_review", { p_version_id: m.versao });
    await db.exec(fs.readFileSync(MIGRACAO, "utf8"));
    await db.exec(fs.readFileSync(MIGRACAO, "utf8"));
    expect(await rpc(ADMIN, "app_ch_visual_file", { p_file_id: m.arquivo })).toMatchObject({ format: "png" });
    for (const fn of ["ch_visual_is_clinical(jsonb)", "ch_visual_review_pending(uuid)", "ch_worker_visual_files(uuid)"])
      expect((await sql(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') a, has_function_privilege('anon', 'public.${fn}', 'execute') b`))[0]).toEqual({ a: false, b: false });
    expect((await sql(`select has_function_privilege('anon', 'public.app_ch_visual_file(uuid)', 'execute') b`))[0].b).toBe(false);
  });
});
