// @vitest-environment node
/**
 * Adaptação licenciada: registro da licença e retirada das referências do licenciante.
 * Material e licença SINTÉTICOS ("Apostila Modelo", "Curso Modelo"): nenhum texto de terceiros foi usado.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { applyReferenceCleanup, cleanBlockText, planCleanup, previewReferenceCleanup, undoReferenceCleanup } from "../../server/contentHub/referenceCleanup";
import { checkDraft } from "../../server/contentHub/pipeline";

const TERMS = ["Curso Modelo", "Apostila Modelo", "cursomodelo.com.br", "Prof. Fulano de Tal"];

describe("Retirada de referências (puro)", () => {
  it("tira o nome do licenciante com ou sem acento e caixa, sem mexer em palavras parecidas", () => {
    expect(cleanBlockText("Material do CURSO MODELO sobre bronquiolite.", TERMS)).toEqual({ after: "Material do sobre bronquiolite.", removed: ["CURSO MODELO"] });
    expect(cleanBlockText("Conteúdo do curso modelo, atualizado.", TERMS)?.after).toBe("Conteúdo do, atualizado.".replace("do,", "do,"));
    expect(cleanBlockText("O cursomodelos não é o mesmo nome.", ["cursomodelo"])).toBeNull(); // dentro de outra palavra
    expect(cleanBlockText("Texto clínico sem nenhuma referência.", TERMS)).toBeNull();
  });

  it("leva o endereço inteiro quando o nome está dentro de um link ou @; links oficiais ficam", () => {
    const r = cleanBlockText("Veja mais em https://www.cursomodelo.com.br/aula-12 e no PCDT: https://www.gov.br/saude/pcdt.", TERMS)!;
    expect(r.removed).toEqual(["https://www.cursomodelo.com.br/aula-12"]);
    expect(r.after).toContain("https://www.gov.br/saude/pcdt");
    expect(r.after).not.toContain("cursomodelo");
    expect(cleanBlockText("Siga @cursomodelo no Instagram.", ["cursomodelo"])?.removed).toEqual(["@cursomodelo"]);
  });

  it("avisos de direitos e contatos genéricos saem; parênteses vazios e pontuação solta não sobram", () => {
    const r = cleanBlockText("A saturação abaixo de 92% indica oxigênio (Apostila Modelo). © 2024 Curso Modelo. Todos os direitos reservados.", TERMS)!;
    expect(r.after).toBe("A saturação abaixo de 92% indica oxigênio.");
    expect(cleanBlockText("Siga @alguem para dicas.", [])?.removed).toEqual(["@alguem"]);
  });

  it("planeja: bloco só de referência é excluído; os demais são editados; blocos já excluídos ou ilegíveis são ignorados", () => {
    const b = (id: string, text: string, status = "extracted") => ({ id, page_no: 1, idx: 0, type: "paragraph", status, text });
    const plan = planCleanup([
      b("1", "Curso Modelo"),
      b("2", "© Curso Modelo — todos os direitos reservados"),
      b("3", "Prof. Fulano de Tal explica: use oxigênio abaixo de 92%."),
      b("4", "Texto limpo sem referência."),
      b("5", "Curso Modelo", "excluded"),
      b("6", "Curso Modelo ilegível", "illegible"),
    ], TERMS);
    expect(plan.map((c) => [c.block_id, c.exclude])).toEqual([["1", true], ["2", true], ["3", false]]);
    expect(plan[2].after).toBe("explica: use oxigênio abaixo de 92%.");
  });

  it("o conteúdo clínico (números, doses, negações) passa intacto", () => {
    const t = "Amoxicilina 90 mg/kg/dia por 10 dias; não usar em alérgicos. (Curso Modelo)";
    expect(cleanBlockText(t, TERMS)?.after).toBe("Amoxicilina 90 mg/kg/dia por 10 dias; não usar em alérgicos.");
  });

  it("o texto novo gerado não pode voltar a citar o licenciante (rascunho de adaptação)", () => {
    const base = new Map([["c1", "Oxigênio abaixo de 92%."]]);
    const sections = [{ heading: "Manejo", paragraphs: [
      { text: "Segundo o Curso Modelo, oxigênio abaixo de 92%.", clinical: true, claim_ids: ["c1"] },
      { text: "Oxigênio abaixo de 92%.", clinical: true, claim_ids: ["c1"] },
    ] }];
    const r = checkDraft(sections, base, { independent: false, forbiddenTerms: TERMS });
    expect(r.sections[0].paragraphs).toHaveLength(1);
    expect(r.flags[0]).toMatchObject({ kind: "other", detail: expect.stringMatching(/menciona o licenciante/) });
    expect(checkDraft(sections, base, { independent: false }).sections[0].paragraphs).toHaveLength(2); // sem licença que autorize, nada é barrado por isso
  });
});

describe("Licença e retirada no banco", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lic-"));
  let dev: DevDatabase;
  let db: ContentDb;
  const ADMIN = "00000000-0000-4000-8000-0000000000ad";
  const EDITOR = "00000000-0000-4000-8000-0000000000ed";
  const sql = async <T = any>(q: string, p: unknown[] = []) => (await dev.db.query<T>(q, p)).rows;
  const as = <T>(uid: string, fn: (q: (s: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) =>
    dev.db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
      return fn(async (s, p = []) => (await tx.query<any>(s, p)).rows);
    });
  const rpc = async (uid: string, fn: string, ...args: unknown[]) => (await as(uid, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args.map((a) => (a !== null && typeof a === "object" ? JSON.stringify(a) : a)))))[0].r;
  let doc: string;
  const licence = (over: Record<string, unknown> = {}) => ({
    licensor: "Curso Modelo Ltda.", work_title: "Apostila Modelo de Pediatria", granted_on: "2026-09-01", expires_on: "2028-09-01",
    allows_adaptation: true, allows_visual_redesign: true, allows_attribution_removal: true, allows_commercial_use: true,
    authorization_reference: "Contrato 2026/09 (e-mail de 01/09/2026, arquivado na pasta Jurídico)",
    terms_text: "TEXTO SINTÉTICO DE TESTE: o licenciante autoriza a adaptação do material, inclusive a retirada de suas marcas e referências, para uso comercial.",
    reference_terms: TERMS, ...over,
  });
  const blocks = () => sql(`select id, original_text, revised_text, status, flags from public.ch_blocks where document_id = $1 order by page_no, idx`, [doc]);

  beforeAll(async () => {
    dev = await openDevDatabaseForTests(path.join(tmp, "db"));
    db = devContentDb(async () => dev);
    await dev.db.query(`insert into auth.users (id, email) values ($1, 'a@t.dev'), ($2, 'e@t.dev')`, [ADMIN, EDITOR]);
    await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
    await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
    doc = (await sql(`insert into public.ch_documents (owner_id, name, sha256, storage_path, mime, rights_status) values ($1, 'Apostila Modelo', $2, 'documents/x.pdf', 'application/pdf', 'unknown') returning id`, [ADMIN, crypto.randomBytes(32).toString("hex")]))[0].id;
    await db.service("ch_worker_save_extraction", {
      p_document_id: doc, p_text_kind: "text", p_pages: [{ page_no: 1, kind: "text" }, { page_no: 2, kind: "text" }],
      p_blocks: [
        { page_no: 1, idx: 0, type: "heading", text: "Bronquiolite viral aguda" },
        { page_no: 1, idx: 1, type: "paragraph", text: "Oxigênio quando a saturação estiver abaixo de 92% (Apostila Modelo)." },
        { page_no: 1, idx: 2, type: "paragraph", text: "Prof. Fulano de Tal — Curso Modelo" },
        { page_no: 2, idx: 0, type: "paragraph", text: "O salbutamol não deve ser usado de rotina. Mais em https://cursomodelo.com.br/dicas." },
        { page_no: 2, idx: 1, type: "paragraph", text: "Texto clínico limpo, sem referência alguma." },
      ],
    });
  }, 300_000);
  afterAll(async () => {
    await dev?.db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("sem licença cadastrada não há retirada; a licença exige o texto, a referência do documento e o que identifica o licenciante", async () => {
    await expect(previewReferenceCleanup(db, doc)).rejects.toThrow(/não tem licença/);
    await expect(rpc(EDITOR, "app_ch_register_license", doc, licence())).rejects.toThrow(/administradores/);
    await expect(rpc(ADMIN, "app_ch_register_license", doc, licence({ allows_adaptation: false }))).rejects.toThrow(/autorize adaptar/);
    await expect(rpc(ADMIN, "app_ch_register_license", doc, licence({ terms_text: "curto" }))).rejects.toThrow();
    await expect(rpc(ADMIN, "app_ch_register_license", doc, licence({ authorization_reference: "x" }))).rejects.toThrow();
    await expect(rpc(ADMIN, "app_ch_register_license", doc, licence({ reference_terms: [] }))).rejects.toThrow(/o que o identifica/);
    await expect(rpc(ADMIN, "app_ch_register_license", doc, licence({ granted_on: "" }))).rejects.toThrow(/data da concessão/);
  });

  it("licença que NÃO autoriza retirar referências: a retirada é recusada", async () => {
    await rpc(ADMIN, "app_ch_register_license", doc, licence({ allows_attribution_removal: false, reference_terms: [] }));
    expect((await sql(`select rights_status from public.ch_documents where id = $1`, [doc]))[0].rights_status).toBe("licensed_adaptation");
    await expect(previewReferenceCleanup(db, doc)).rejects.toThrow(/não autoriza retirar/);
    await expect(applyReferenceCleanup(db, doc, ADMIN)).rejects.toThrow(/não autoriza retirar/);
  });

  it("licença com autorização: a prévia mostra antes e depois e não grava nada", async () => {
    await rpc(ADMIN, "app_ch_register_license", doc, licence());
    expect((await sql(`select count(*)::int n from public.ch_licenses where document_id = $1 and status = 'active'`, [doc]))[0].n).toBe(1);
    const before = await blocks();
    const p = await previewReferenceCleanup(db, doc);
    expect(p).toMatchObject({ edited: 2, excluded: 1, terms: TERMS });
    expect(p.changes.find((c) => c.after?.includes("salbutamol"))?.after).toBe("O salbutamol não deve ser usado de rotina. Mais em.".replace("Mais em.", "").trim());
    expect(await blocks()).toEqual(before);
  });

  it("aplicar: texto revisado sem as referências, bloco só de referência excluído, ORIGINAL intacto, tudo registrado e auditado", async () => {
    const r = await applyReferenceCleanup(db, doc, ADMIN);
    expect(r).toMatchObject({ edited: 2, excluded: 1, skipped: 0 });
    const b = await blocks();
    expect(b[1]).toMatchObject({ original_text: "Oxigênio quando a saturação estiver abaixo de 92% (Apostila Modelo).", revised_text: "Oxigênio quando a saturação estiver abaixo de 92%." });
    expect(b[1].flags).toEqual([expect.objectContaining({ code: "reference_removed" })]);
    expect(b[2]).toMatchObject({ status: "excluded", original_text: "Prof. Fulano de Tal — Curso Modelo" });
    expect(b[3].revised_text).not.toMatch(/cursomodelo|https/);
    expect(b[3].revised_text).toContain("salbutamol não deve ser usado de rotina");
    expect(b[4].revised_text).toBeNull();
    expect((await sql(`select count(*)::int n from public.ch_reference_cleanups where document_id = $1 and undone_at is null`, [doc]))[0].n).toBe(3);
    expect((await sql(`select details from public.ch_audit where action = 'license.clean_references'`))[0].details).toMatchObject({ edited: 2, excluded: 1 });
    // o worker passa a ler o texto limpo; repetir a retirada não acha mais nada
    const read = await db.service<any[]>("ch_worker_blocks", { p_document_id: doc });
    expect(read.find((x) => x.idx === 1 && x.page_no === 1).text).toBe("Oxigênio quando a saturação estiver abaixo de 92%.");
    expect((await previewReferenceCleanup(db, doc)).changes).toEqual([]);
    const list = await rpc(EDITOR, "app_ch_reference_cleanups", doc, 50);
    expect(list).toHaveLength(3);
    expect(list.map((x: any) => x.action).sort()).toEqual(["edited", "edited", "excluded"]);
  });

  it("o texto original é imutável mesmo para administrador", async () => {
    await expect(sql(`update public.ch_blocks set original_text = 'adulterado' where document_id = $1 and idx = 1 and page_no = 1`, [doc])).rejects.toThrow(/original/);
  });

  it("desfazer: restaura o que ninguém revisou depois; bloco revisado por pessoa é preservado", async () => {
    // alguém revisa o bloco da página 2 depois da retirada
    await sql(`update public.ch_blocks set revised_text = 'Revisão humana posterior.' where document_id = $1 and page_no = 2 and idx = 0`, [doc]);
    const r = await undoReferenceCleanup(db, doc, ADMIN);
    expect(r).toMatchObject({ undone: 2, skipped: 1 });
    const b = await blocks();
    expect(b[1]).toMatchObject({ revised_text: null, flags: [] });
    expect(b[2].status).toBe("extracted");
    expect(b[3].revised_text).toBe("Revisão humana posterior.");
  });

  it("licença vencida ou revogada: nada é retirado, o documento deixa de ser adaptação", async () => {
    await sql(`update public.ch_licenses set expires_on = current_date - 1, granted_on = current_date - 30 where document_id = $1 and status = 'active'`, [doc]);
    await expect(previewReferenceCleanup(db, doc)).rejects.toThrow(/vencida/);
    expect((await db.service<any>("ch_worker_license", { p_document_id: doc })).expired).toBe(true);
    const lic = (await rpc(ADMIN, "app_ch_licenses", doc))[0];
    expect(lic).toMatchObject({ expired: true, status: "active" });
    await expect(rpc(EDITOR, "app_ch_revoke_license", lic.id, "Licença encerrada pelo licenciante.")).rejects.toThrow(/administradores/);
    await expect(rpc(ADMIN, "app_ch_revoke_license", lic.id, "curto")).rejects.toThrow(/motivo/);
    await rpc(ADMIN, "app_ch_revoke_license", lic.id, "Licença encerrada pelo licenciante.");
    expect((await sql(`select rights_status from public.ch_documents where id = $1`, [doc]))[0].rights_status).toBe("reference_only");
    expect(await db.service<any>("ch_worker_license", { p_document_id: doc })).toBeNull();
    // novo registro substitui o anterior (só uma licença ativa por documento)
    await rpc(ADMIN, "app_ch_register_license", doc, licence());
    await rpc(ADMIN, "app_ch_register_license", doc, licence({ work_title: "Apostila Modelo — 2ª edição" }));
    expect((await sql(`select count(*)::int n from public.ch_licenses where document_id = $1 and status = 'active'`, [doc]))[0].n).toBe(1);
  });
});
