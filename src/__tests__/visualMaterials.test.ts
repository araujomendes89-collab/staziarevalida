// @vitest-environment node
/**
 * Materiais visuais da Central de Conteúdo (supabase/migrations/…5100_materiais_visuais.sql, src/shared/visualMaterials,
 * server/contentHub/visual): tokens iguais ao pacote, especialidade e fallback, validação, comando do administrador,
 * HTML fiel às pranchas (alerta sempre vermelho, especialidade por extenso, guias só na prévia), versões, duplicação,
 * fila, par frente e verso gravado junto, rotas da equipe e a geração real (Chromium + PyMuPDF) com a conferência.
 * Os textos usados são de TESTE (visualSamples.ts), sem conteúdo clínico.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { execFileSync } from "child_process";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb } from "../../server/contentHub/infra";
import { createRenderer, type Renderer } from "../../server/contentHub/render";
import { runJob, type Job } from "../../server/contentHub/pipeline";
import { createVisualRouter, imageInfo } from "../../server/contentHub/visual/router";
import { generateVisualVersion, regenerateVisualMaterial, saveVisualMaterial, duplicateVisualMaterial, VisualValidationError } from "../../server/contentHub/visual/service";
import { pngSize, visualFontCss } from "../../server/contentHub/visual/render";
import {
  VISUAL_TOKENS,
  VISUAL_FIT_SCRIPT,
  buildVisualDocument,
  parseTable,
  parseVisualCommand,
  renderArtboards,
  resolveSpecialty,
  validateVisualInput,
  visualCommandText,
  visualFileName,
  STORY_SAFE,
  VISUAL_TEMPLATE_VERSION,
} from "../../src/shared/visualMaterials";
import { THEMES, sceneSvg, spotForText } from "../../src/shared/visualMaterials/kit";
import { COR_MODELO, PALETA_TEMAS, TONS_PROIBIDOS, conferirContraste, corDoCampo, distancia, hexParaOklch } from "../../src/shared/visualMaterials/temas";
import { A4_SAMPLE, CARD_SAMPLE, PIECE_SAMPLE, SPECIALTY_SAMPLES } from "./visualSamples";

vi.setConfig({ testTimeout: 120_000 });

const ROOT = path.resolve(__dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "visual-"));
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
let dev: DevDatabase;
let db: ContentDb;
const storage = localStorageDir(path.join(tmp, "files"));
const servers: Server[] = [];

const content = (input: Record<string, unknown>) => {
  const v = validateVisualInput(input);
  if (!v.ok) throw new Error(JSON.stringify(v.problems));
  return v.content;
};

/** PNG válido de w×h (cor única) para testar o envio de imagem. */
function tinyPng(w = 32, h = 24) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x7f)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ad@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev')`, [ADMIN, EDITOR, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 300_000);

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------- tokens e especialidade
describe("Tokens das especialidades", () => {
  it("são idênticos ao tokens-especialidades.json do pacote (cópia no repositório)", () => {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, "src/shared/visualMaterials/tokens-especialidades.json"), "utf8"));
    expect(JSON.parse(JSON.stringify(VISUAL_TOKENS))).toEqual(json);
  });

  it("cada chave aplica a sua paleta: rosa, azul, verde, vermelho, roxo e turquesa/petróleo", () => {
    const primary = Object.fromEntries(Object.entries(VISUAL_TOKENS.specialties).map(([k, v]) => [k, v.primary]));
    expect(primary).toEqual({ ginecologia: "#D95C82", pediatria: "#3A7BD5", clinica_medica: "#2E9B67", cirurgia: "#D94A4A", preventiva_mfc: "#7B5DB7", fallback: "#1FA6A0" });
    expect(VISUAL_TOKENS.specialties.fallback.dark).toBe("#0E6B74");
    expect(VISUAL_TOKENS.brand.alert.primary).toBe("#C8102E");
  });

  it("aceita a chave ou o nome por extenso; desconhecida cai no fallback e o NOME continua escrito", () => {
    expect(resolveSpecialty("cirurgia")).toMatchObject({ key: "cirurgia", label: "Cirurgia", matched: true });
    expect(resolveSpecialty("Clínica Médica")).toMatchObject({ key: "clinica_medica", label: "Clínica Médica" });
    expect(resolveSpecialty("Ginecologia e Obstetrícia")).toMatchObject({ key: "ginecologia", label: "Ginecologia" });
    expect(resolveSpecialty("MFC")).toMatchObject({ key: "preventiva_mfc", label: "Preventiva/MFC" });
    expect(resolveSpecialty("Neurologia")).toMatchObject({ key: "fallback", label: "Neurologia", matched: false });
    expect(resolveSpecialty("fallback", "Saúde mental")).toMatchObject({ key: "fallback", label: "Saúde mental", matched: true });
    // "fallback" sem nome: a peça ficaria sem a especialidade escrita
    const v = validateVisualInput({ modelo: "feed", especialidade: "fallback", titulo: "Teste" });
    expect(v.ok).toBe(false);
    expect(v.problems[0].field).toBe("especialidade_nome");
  });
});

// ---------------------------------------------------------------------------- validação e comando
describe("Validação do conteúdo (a mesma no formulário, na rota e no comando)", () => {
  it("exige os campos de cada modelo e os limites do sistema visual", () => {
    expect(validateVisualInput({ especialidade: "cirurgia" }).problems.map((p) => p.field)).toContain("modelo");
    expect(validateVisualInput({ modelo: "flashcard_a6", especialidade: "cirurgia", pergunta: "P?" }).problems.map((p) => p.field)).toContain("resposta");
    const muitos = validateVisualInput({ modelo: "feed", especialidade: "pediatria", titulo: "T", pontos_chave: ["1", "2", "3", "4"] });
    expect(muitos.problems.some((p) => /até 3 pontos-chave/.test(p.message))).toBe(true);
    expect(validateVisualInput({ modelo: "a4", especialidade: "pediatria", titulo: "T", pontos_chave: ["1", "2", "3", "4"] }).ok).toBe(true);
    const id = validateVisualInput({ modelo: "flashcard_digital", especialidade: "cirurgia", pergunta: "P?", resposta: "R", card_id: "com espaço" });
    expect(id.problems.map((p) => p.field)).toContain("card_id");
  });

  it("normaliza o texto (NFC, sem caracteres de controle) e avisa o campo que o modelo não mostra", () => {
    const v = validateVisualInput({ modelo: "flashcard_a6", especialidade: "cirurgia", pergunta: "Ação?\u0007", resposta: "R", explicacao: "Só no digital" });
    expect(v.content.pergunta).toBe("Ação?");
    expect(v.warnings.some((w) => w.field === "explicacao")).toBe(true);
  });

  it("tabela em linhas 'A | B | C' com !destaque e !alerta", () => {
    const t = parseTable("| Coluna A | Coluna B | Coluna C |\n|---|---|---|\n| L1 | 1 | 2 |\n| !alerta L2 | 3 | 4 |");
    expect(t).toEqual({ titulo: "", colunas: ["Coluna A", "Coluna B", "Coluna C"], linhas: [{ celulas: ["L1", "1", "2"], tipo: "normal" }, { celulas: ["L2", "3", "4"], tipo: "alerta" }] });
  });

  it("comando de texto e JSON viram o mesmo conteúdo; o texto gerado do conteúdo volta igual", () => {
    const text = `modelo: feed\nespecialidade: Clínica Médica\nTítulo: ${PIECE_SAMPLE.titulo}\nTome nota: ${PIECE_SAMPLE.tome_nota}\npontos_chave:\n- um\n- dois\ntabela:\n| A | B |\n| !destaque x | y |\nilustracao.icone: cruz\nilustracao.legenda: Legenda de teste`;
    const p = parseVisualCommand(text);
    expect(p.problems).toEqual([]);
    const a = validateVisualInput(p.input);
    expect(a.ok).toBe(true);
    expect(a.content).toMatchObject({ model: "feed", specialty: { key: "clinica_medica" }, pontos_chave: ["um", "dois"], ilustracao: { tipo: "icone", icone: "cruz" } });
    expect(a.content.tabela?.linhas[0].tipo).toBe("destaque");
    const again = validateVisualInput(parseVisualCommand(visualCommandText(a.content)).input);
    expect(again.content).toEqual(a.content);
    const fromJson = validateVisualInput(parseVisualCommand(JSON.stringify({ modelo: "a6", especialidade: "pediatria", pergunta: "P?", resposta: "R" })).input);
    expect(fromJson.ok && fromJson.content.model).toBe("flashcard_a6");
  });
});

// ---------------------------------------------------------------------------- HTML dos modelos
describe("Modelo criativo-1 (estilo do modelo do dono) e kit de ilustrações", () => {
  it("é o modelo padrão; o clássico visual-1.0 continua disponível", () => {
    const c = content({ modelo: "feed", especialidade: "pediatria", ...PIECE_SAMPLE });
    expect(VISUAL_TEMPLATE_VERSION).toBe("criativo-1");
    expect(renderArtboards(c)[0].html).toContain('data-template="criativo-1"');
    expect(renderArtboards(c, { template: "visual-1.0" })[0].html).not.toContain('data-template="criativo-1"');
  });

  it("os 5 modelos têm o mesmo contrato: especialidade escrita, pegadinha em #C8102E (mesmo em Cirurgia), campos marcados para a conferência", () => {
    for (const modelo of ["feed", "a4", "story", "flashcard_digital", "flashcard_a6"]) {
      const flash = modelo.startsWith("flash");
      const c = content({ modelo, especialidade: "cirurgia", ...(flash ? { ...CARD_SAMPLE, card_id: "CIR-0001" } : modelo === "a4" ? A4_SAMPLE : PIECE_SAMPLE) });
      const html = renderArtboards(c).map((a) => a.html).join("");
      expect(html, modelo).toMatch(/data-role="specialty"[^>]*>.*?<span>Cirurgia<\/span>/);
      expect(/<div data-role="alert"[^>]*style="([^"]*)"/.exec(html)![1]).toContain("solid #C8102E");
      expect(html).toMatch(/data-role="alert-title"[^>]*color:#C8102E/);
      expect(html).toContain(flash ? 'data-k="pergunta"' : 'data-k="titulo"');
      expect(html).not.toMatch(/\[[A-ZÁÉÍÓÚ ]{3,}\]/);
    }
  });

  it("story: só a ilustração (decorativa) fica na zona segura do topo; o rodapé reserva os 150 px da base", () => {
    const html = renderArtboards(content({ modelo: "story", especialidade: "ginecologia", ...PIECE_SAMPLE }))[0].html;
    expect(html).toContain(`padding:${STORY_SAFE.top + 24}px 64px`);
    expect(html).toContain(`padding:0 56px ${STORY_SAFE.bottom}px`);
  });

  it("cena do cabeçalho pelo ícone escolhido; ids dos gradientes únicos entre frente e verso", () => {
    const c = content({ modelo: "flashcard_digital", especialidade: "clinica_medica", ...CARD_SAMPLE, card_id: "CM-1", ilustracao: { tipo: "icone", icone: "pulmao" } });
    const [front, back] = renderArtboards(c).map((a) => a.html);
    expect(front).toContain('id="fd-front-lung"');
    expect(back).toContain('id="fd-back-lung"');
    const ids = (h: string) => [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(front).filter((i) => ids(back).includes(i))).toEqual([]);
  });

  it("ícone pelo texto (só decoração) e todo desenho sem texto dentro do SVG", () => {
    expect(spotForText("Avaliar todos os contatos e oferecer teste de HIV")).toBe("pessoas");
    expect(spotForText("Esquema básico 2RHZE/4RH, com baciloscopia mensal")).toBe("capsulas");
    expect(spotForText("Baciloscopia de controle mensal")).toBe("microscopio");
    expect(spotForText("Algo sem palavra conhecida")).toBe("ok");
    for (const k of Object.keys(THEMES)) expect(sceneSvg(THEMES[k].scene, "t", { glow: "#fff", primary: "#000" }, "")).not.toMatch(/<text/);
  });
});

describe("Cor de cada tema (tema_cor, paleta dos 100 Grandes Temas)", () => {
  it("GR-001 é a cor-modelo, sem mudança; os 100 temas existem", () => {
    expect(PALETA_TEMAS["GR-001"]).toMatchObject(COR_MODELO);
    expect(COR_MODELO).toEqual({ primaria: "#2E9B67", escura: "#1B6B45", clara: "#E9F6EF", brilho: "#5FE6C0" });
    expect(Object.keys(PALETA_TEMAS)).toHaveLength(100);
  });

  it("todos os temas passam no contraste (o mesmo exigido do GR-001) e nenhum usa o vermelho ou o amarelo de alerta", () => {
    for (const t of Object.values(PALETA_TEMAS)) {
      expect(conferirContraste(t).filter((c) => !c.ok), t.id).toEqual([]);
      const h = hexParaOklch(t.primaria)[2];
      expect(TONS_PROIBIDOS.some((f) => h >= f.de && h <= f.ate), `${t.id} tom ${h}`).toBe(false);
      expect(distancia(t.primaria, "#C8102E")).toBeGreaterThan(0.1);
      expect(distancia(t.primaria, "#F2B705")).toBeGreaterThan(0.1);
    }
  });

  it("temas vizinhos na lista têm cores bem diferentes", () => {
    const ids = Object.keys(PALETA_TEMAS).sort();
    for (let i = 1; i < ids.length; i++) expect(distancia(PALETA_TEMAS[ids[i]].primaria, PALETA_TEMAS[ids[i - 1]].primaria), ids[i]).toBeGreaterThan(0.02);
  });

  it("campo tema_cor: vazio mantém a cor da especialidade; GR-xxx ou #RRGGBB trocam a cor; valor inválido é recusado", () => {
    const base = { modelo: "feed", especialidade: "clinica_medica", ...PIECE_SAMPLE };
    const semCor = renderArtboards(content(base))[0].html;
    expect(semCor).toContain("#2E9B67");
    const t = PALETA_TEMAS["GR-043"];
    const comCor = renderArtboards(content({ ...base, tema_cor: "gr-043" }))[0].html;
    expect(comCor).toContain(t.primaria);
    expect(comCor).toContain(t.brilho);
    expect(comCor).toMatch(/data-role="alert"[^>]*solid #C8102E/);
    const livre = corDoCampo("#3366CC")!;
    expect(renderArtboards(content({ ...base, tema_cor: "#3366CC" }))[0].html).toContain(`linear-gradient(90deg, ${livre.escura} 0%, ${livre.primaria} 100%)`);
    expect(validateVisualInput({ ...base, tema_cor: "GR-999" }).problems.map((p) => p.field)).toContain("tema_cor");
    expect(parseVisualCommand("modelo: feed\nespecialidade: cm\ntitulo: T\ncor do tema: GR-094").input.tema_cor).toBe("GR-094");
  });
});

describe("Modelos (HTML fiel às pranchas)", () => {
  it("pegadinha e linha de alerta ficam no vermelho de alerta mesmo em Cirurgia; a especialidade aparece por extenso", () => {
    const c = content({ modelo: "a4", especialidade: "cirurgia", ...A4_SAMPLE });
    const html = renderArtboards(c, { template: "visual-1.0" })[0].html;
    const alert = /<div data-role="alert"[^>]*style="([^"]*)"/.exec(html)![1];
    expect(alert).toContain("border:2px solid #C8102E");
    expect(alert).not.toContain("#D94A4A");
    expect(html).toMatch(/data-role="alert-title"[^>]*color:#C8102E/);
    expect(html).toMatch(/data-role="alert-row"[^>]*background:#FFF3F4/);
    expect(html).toMatch(/data-role="specialty"[^>]*>Cirurgia</);
    expect(html).toContain("#A12B2B"); // specialty.dark da Cirurgia no selo e na faixa
  });

  it("não sobra nenhum texto de exemplo ([TÍTULO DO TEMA]…) e campo vazio some", () => {
    for (const c of [content({ modelo: "feed", especialidade: "pediatria", titulo: "Só o título" }), content({ modelo: "flashcard_digital", especialidade: "pediatria", pergunta: "P?", resposta: "R", card_id: "PED-1" })]) {
      const html = renderArtboards(c).map((a) => a.html).join("");
      expect(html).not.toMatch(/\[[A-ZÁÉÍÓÚ ]{3,}\]/);
      expect(html).not.toContain('data-k="pegadinha"');
    }
  });

  it("todo texto é escapado", () => {
    const c = content({ modelo: "feed", especialidade: "pediatria", titulo: '<img src=x onerror="alert(1)">' });
    const html = renderArtboards(c)[0].html;
    expect(html).not.toContain("<img src=x");
    // o modelo criativo divide o título em duas cores: as duas partes saem escapadas
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("onerror=&quot;alert(1)&quot;&gt;");
    expect(renderArtboards(c, { template: "visual-1.0" })[0].html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("guias só na prévia; a geração final nunca leva guias", () => {
    for (const modelo of ["story", "flashcard_a6", "feed"]) {
      const c = content({ modelo, especialidade: "pediatria", ...(modelo.startsWith("flash") ? { ...CARD_SAMPLE, card_id: "PED-9" } : PIECE_SAMPLE) });
      expect(renderArtboards(c, { guides: true }).some((a) => a.html.includes("<div data-guide"))).toBe(true);
      expect(buildVisualDocument(c, { guides: true }).html).not.toContain("<div data-guide");
    }
  });

  it("story: a faixa do topo cobre a zona segura e o rodapé reserva os 150 px da base", () => {
    const html = renderArtboards(content({ modelo: "story", especialidade: "ginecologia", ...PIECE_SAMPLE }), { template: "visual-1.0" })[0].html;
    const band = Number(/data-region="safe-top" style="height:(\d+)px/.exec(html)![1]);
    expect(band).toBeGreaterThan(STORY_SAFE.top + 40);
    expect(html).toContain(`padding:26px 64px ${STORY_SAFE.bottom}px`);
  });

  it("flashcards: frente e verso com o mesmo card_id, specialty_key e ordem; A6 com sangria de 3 mm", () => {
    const c = content({ modelo: "flashcard_a6", especialidade: "preventiva_mfc", card_id: "MFC-0007", ordem: 3, ...CARD_SAMPLE });
    const sides = renderArtboards(c);
    expect(sides.map((a) => a.side)).toEqual(["front", "back"]);
    for (const a of sides) expect(a.html).toMatch(/data-specialty="preventiva_mfc" data-card-id="MFC-0007" data-order="3"/);
    const doc = buildVisualDocument(c);
    expect(doc.page).toEqual({ width: 1240 + 72, height: 1748 + 72 });
    expect(doc.html.match(/class="vm-sheet"/g)?.length).toBe(2);
  });

  it("o roteiro de encaixe e conferência vai junto no documento", () => {
    expect(buildVisualDocument(content({ modelo: "feed", especialidade: "cirurgia", titulo: "T" })).html).toContain(VISUAL_FIT_SCRIPT.slice(0, 200));
  });

  it("nome do arquivo para baixar: ID do card, modelo, versão e lado", () => {
    expect(visualFileName({ model: "flashcard_a6", card_id: "CIR-0001" }, 2, "pair", "pdf")).toBe("CIR-0001_flashcard-a6_v2_frente-e-verso.pdf");
    expect(visualFileName({ model: "feed", card_id: null, title: "Título de Teste!" }, 1, "single", "png")).toBe("titulo-de-teste_feed_v1.png");
  });
});

// ---------------------------------------------------------------------------- banco
describe("Banco: versões, duplicação, fila e par gravado junto", () => {
  const flash = { modelo: "flashcard_digital", especialidade: "cirurgia", ...CARD_SAMPLE };

  it("só a equipe grava; o aluno é recusado", async () => {
    await expect(saveVisualMaterial(db, STUDENT, flash)).rejects.toThrow(/restrito à equipe/);
    await expect(saveVisualMaterial(db, EDITOR, { ...flash, resposta: "" })).rejects.toBeInstanceOf(VisualValidationError);
  });

  it("card_id gerado pela especialidade e fixo; editar cria versão nova e guarda a anterior; sem mudança não cria", async () => {
    const r1 = await saveVisualMaterial(db, EDITOR, flash);
    expect(r1).toMatchObject({ created: true, version: 1, queued: false });
    expect(r1.card_id).toMatch(/^CIR-\d{4}$/);
    const r2 = await saveVisualMaterial(db, ADMIN, { ...flash, resposta: "Resposta curta de teste 2" }, { materialId: r1.material_id });
    expect(r2).toMatchObject({ created: false, version: 2, card_id: r1.card_id });
    const same = await saveVisualMaterial(db, ADMIN, { ...flash, resposta: "Resposta curta de teste 2" }, { materialId: r1.material_id });
    expect(same).toMatchObject({ unchanged: true, version: 2 });
    await expect(saveVisualMaterial(db, ADMIN, { ...flash, card_id: "OUTRO-1" }, { materialId: r1.material_id })).rejects.toThrow(/não muda/);
    await expect(saveVisualMaterial(db, ADMIN, { modelo: "feed", especialidade: "cirurgia", titulo: "T" }, { materialId: r1.material_id })).rejects.toThrow(/modelo de um material não muda/);
    const m = await db.asUser<any>({ id: EDITOR, email: "ed@t.dev" }, "app_ch_visual_material", { p_id: r1.material_id });
    expect(m.versions.map((v: any) => v.version)).toEqual([2, 1]);
    expect(m.versions[1].content.resposta).toBe(CARD_SAMPLE.resposta);
    expect(m.created_by_name).toBe("ed@t.dev");
    const dup = await duplicateVisualMaterial(db, EDITOR, r1.material_id);
    expect(dup.card_id).not.toBe(r1.card_id);
    expect(dup.duplicated_from).toBe(r1.material_id);
    const list = await db.asUser<any[]>({ id: EDITOR, email: "ed@t.dev" }, "app_ch_visual_list", { p_filters: { model: "flashcard_digital" } });
    expect(list.length).toBeGreaterThanOrEqual(2);
    await expect(db.asUser({ id: STUDENT, email: "al@t.dev" }, "app_ch_visual_list", { p_filters: {} })).rejects.toThrow(/restrito/);
  });

  it("card_id repetido é recusado", async () => {
    await saveVisualMaterial(db, EDITOR, { ...flash, card_id: "CIR-REP-1" });
    await expect(saveVisualMaterial(db, EDITOR, { ...flash, card_id: "CIR-REP-1" })).rejects.toThrow(/Já existe um card/);
  });

  it("gerar põe na fila (etapa visual_render, sem duplicar) e gerar de novo devolve à fila", async () => {
    const r = await saveVisualMaterial(db, EDITOR, flash, { generate: true });
    const jobs = await dev.db.query<any>(`select step, status, document_id from public.ch_jobs where scope_key = $1`, [`visual:${r.version_id}`]);
    expect(jobs.rows).toEqual([{ step: "visual_render", status: "queued", document_id: null }]);
    await dev.db.query(`update public.ch_jobs set status = 'dead' where scope_key = $1`, [`visual:${r.version_id}`]);
    await regenerateVisualMaterial(db, EDITOR, r.material_id);
    const again = await dev.db.query<any>(`select status from public.ch_jobs where scope_key = $1`, [`visual:${r.version_id}`]);
    expect(again.rows).toEqual([{ status: "queued" }]);
    const v = await dev.db.query<any>(`select render_status from public.ch_visual_versions where id = $1`, [r.version_id]);
    expect(v.rows[0].render_status).toBe("queued");
  });

  it("os arquivos do par são gravados juntos e com a mesma identificação; lado sozinho é recusado", async () => {
    const r = await saveVisualMaterial(db, EDITOR, flash);
    const base = { sha256: "a".repeat(64), bytes: 10, card_id: r.card_id, specialty_key: "cirurgia", batch_order: 1, width: 1080, height: 1350 };
    const file = (format: string, side: string, extra: Record<string, unknown> = {}) => ({ ...base, format, side, pages: side === "pair" ? 2 : 1, storage_path: `visual/t/${format}-${side}`, ...extra });
    const save = (files: unknown[]) => db.service("ch_worker_visual_save_files", { p_version_id: r.version_id, p_files: files, p_check: { ok: true }, p_template: "t" });
    await expect(save([file("png", "front"), file("pdf", "pair")])).rejects.toThrow(/incompleto/);
    await expect(save([file("png", "front"), file("png", "back"), file("pdf", "pair", { pages: 1 })])).rejects.toThrow(/2 páginas/);
    await expect(save([file("png", "front"), file("png", "back", { card_id: "OUTRO" }), file("pdf", "pair")])).rejects.toThrow(/identificação diferente/);
    await expect(save([file("png", "front"), file("png", "back", { specialty_key: "pediatria" }), file("pdf", "pair")])).rejects.toThrow(/identificação diferente/);
    await save([file("png", "front"), file("png", "back"), file("pdf", "pair")]);
    const rows = await dev.db.query<any>(`select f.side, f.card_id, f.specialty_key, f.batch_order from public.ch_visual_files f join public.ch_visual_versions v on v.id = f.version_id where v.id = $1 order by f.side`, [r.version_id]);
    expect(rows.rows.map((x: any) => x.side)).toEqual(["back", "front", "pair"]);
    expect(new Set(rows.rows.map((x: any) => `${x.card_id}|${x.specialty_key}|${x.batch_order}`)).size).toBe(1);
  });

  it("A6 só tem o PDF com os dois lados (PNG de um lado é recusado)", async () => {
    const r = await saveVisualMaterial(db, EDITOR, { ...flash, modelo: "flashcard_a6" });
    const base = { sha256: "b".repeat(64), bytes: 10, card_id: r.card_id, specialty_key: "cirurgia", batch_order: 1 };
    await expect(
      db.service("ch_worker_visual_save_files", { p_version_id: r.version_id, p_files: [{ ...base, format: "png", side: "front", storage_path: "visual/t/x" }, { ...base, format: "pdf", side: "pair", pages: 2, storage_path: "visual/t/y" }], p_check: { ok: true }, p_template: "t" })
    ).rejects.toThrow(/incompleto/);
  });
});

// ---------------------------------------------------------------------------- rotas da equipe
describe("Rotas /api/content-hub/visual", () => {
  let base: string;
  const tokens: Record<string, string> = {};
  beforeAll(async () => {
    tokens.editor = await dev.createSession(EDITOR);
    tokens.student = await dev.createSession(STUDENT);
    const deps = { db, storage, ai: { provider: null, status: { ready: false } }, renderer: null } as any;
    base = await new Promise<string>((resolve) => {
      const app = express();
      app.use("/api/content-hub/visual", createVisualRouter(deps));
      const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/content-hub/visual`));
      servers.push(srv);
    });
  });
  const call = (who: string, method: string, p: string, body?: unknown, type = "application/json") =>
    fetch(base + p, { method, headers: { Authorization: `Bearer ${tokens[who]}`, ...(body ? { "Content-Type": type } : {}) }, body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined });

  it("aluno não entra; equipe cria, recebe os problemas da validação, edita e duplica", async () => {
    expect((await call("student", "POST", "/materials", { input: { modelo: "feed" } })).status).toBe(403);
    const bad = await call("editor", "POST", "/materials", { input: { modelo: "feed", especialidade: "cirurgia" } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).problems.map((p: any) => p.field)).toContain("titulo");
    const ok = await call("editor", "POST", "/materials", { input: { modelo: "feed", especialidade: "cirurgia", ...PIECE_SAMPLE }, generate: true });
    expect(ok.status).toBe(201);
    const r = await ok.json();
    expect(r).toMatchObject({ version: 1, queued: true, card_id: null });
    const v2 = await call("editor", "PUT", `/materials/${r.material_id}`, { input: { modelo: "feed", especialidade: "cirurgia", ...PIECE_SAMPLE, subtitulo: "Outro subtítulo" } });
    expect((await v2.json()).version).toBe(2);
    expect((await call("editor", "POST", `/materials/${r.material_id}/duplicate`)).status).toBe(201);
    expect((await call("editor", "POST", `/materials/${r.material_id}/regenerate`, {})).status).toBe(200);
  });

  it("imagem: só PNG/JPEG/WebP de verdade (pela assinatura), e o material só aceita imagem enviada", async () => {
    expect(imageInfo(tinyPng(40, 30))).toEqual({ mime: "image/png", ext: "png", width: 40, height: 30 });
    expect((await call("editor", "POST", "/assets", Buffer.from("<svg onload=alert(1)>"), "image/png")).status).toBe(415);
    const up = await call("editor", "POST", "/assets", tinyPng(), "image/png");
    expect(up.status).toBe(201);
    const { name } = await up.json();
    expect(name).toMatch(/^[0-9a-f]{64}\.png$/);
    const img = await call("editor", "GET", `/assets/${name}`);
    expect(img.headers.get("content-type")).toBe("image/png");
    const withImage = await call("editor", "POST", "/materials", { input: { modelo: "story", especialidade: "pediatria", titulo: "T", ilustracao: { tipo: "imagem", imagem: name } } });
    expect(withImage.status).toBe(201);
    const fake = await call("editor", "POST", "/materials", { input: { modelo: "story", especialidade: "pediatria", titulo: "T", ilustracao: { tipo: "imagem", imagem: `${"c".repeat(64)}.png` } } });
    expect(fake.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------- geração real
const pythonOk = (() => {
  try {
    execFileSync(process.env.CONTENT_HUB_PYTHON ?? "pdfpython", ["-c", "import pymupdf"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
// decidido ao montar os testes (antes do beforeAll): sem Chromium ou sem PyMuPDF, a geração real fica de fora
const chromiumOk = await import("playwright").then((m) => fs.existsSync(m.chromium.executablePath())).catch(() => false);

describe("Geração com Chromium e conferência do PDF (PyMuPDF)", () => {
  let renderer: Renderer | null = null;
  beforeAll(async () => {
    renderer = pythonOk ? await createRenderer() : null;
  });
  afterAll(async () => {
    await renderer?.close();
  });
  const skip = () => !(pythonOk && chromiumOk);

  const pdfInfo = (file: string) =>
    JSON.parse(
      execFileSync(process.env.CONTENT_HUB_PYTHON ?? "pdfpython", [
        "-c",
        `import json,sys,pymupdf\nd=pymupdf.open(sys.argv[1])\nprint(json.dumps({"pages":d.page_count,"meta":d.metadata,"texts":[p.get_text() for p in d],"trim":[list(p.trimbox) for p in d],"bleed":[list(p.bleedbox) for p in d],"size":[[p.rect.width,p.rect.height] for p in d],"fonts":sorted({s["font"] for p in d for b in p.get_text("dict")["blocks"] for l in b.get("lines",[]) for s in l["spans"] if s["text"].strip()})}))`,
        file,
      ]).toString()
    );

  async function generate(input: Record<string, unknown>) {
    const r = await saveVisualMaterial(db, EDITOR, input, { generate: true });
    const job = await db.service<Job | null>("ch_worker_visual_claim", { p_version_id: r.version_id });
    expect(job).not.toBeNull();
    const out = await runJob({ db, storage, ai: { provider: null, status: { ready: false } } as any, renderer }, job!);
    const files = await db.service<any>("ch_worker_visual_files", { p_version_id: r.version_id });
    return { r, out, files };
  }

  it.skipIf(skip())("um exemplo de cada formato e de cada especialidade: todos aprovados na conferência", async () => {
    const cases: Record<string, unknown>[] = [
      { modelo: "feed", especialidade: "ginecologia", ...PIECE_SAMPLE },
      { modelo: "a4", especialidade: "pediatria", ...A4_SAMPLE },
      { modelo: "story", especialidade: "clinica_medica", ...PIECE_SAMPLE },
      { modelo: "flashcard_digital", especialidade: "cirurgia", ...CARD_SAMPLE },
      { modelo: "flashcard_a6", especialidade: "preventiva_mfc", ...CARD_SAMPLE },
    ];
    expect(new Set(cases.map((c) => c.especialidade))).toEqual(new Set(SPECIALTY_SAMPLES));
    for (const input of cases) {
      const { files, out } = await generate(input);
      expect(out.status, JSON.stringify(out)).toBe("succeeded");
      expect(files.render_status, JSON.stringify(files.check_result.problems)).toBe("ready");
      for (const f of files.files) expect(fs.existsSync(path.join(tmp, "files", f.storage_path))).toBe(true);
    }
  });

  it.skipIf(skip())("par digital: dois PNG de 1080×1350 e PDF de 2 páginas com o mesmo card_id nos dois lados", async () => {
    const { r, files } = await generate({ modelo: "flashcard_digital", especialidade: "clinica_medica", ...CARD_SAMPLE });
    const sides = files.files.map((f: any) => `${f.format}:${f.side}`).sort();
    expect(sides).toEqual(["pdf:pair", "png:back", "png:front"]);
    for (const f of files.files.filter((x: any) => x.format === "png")) expect(pngSize(await storage.get(f.storage_path))).toEqual({ width: 1080, height: 1350 });
    const pdf = files.files.find((x: any) => x.format === "pdf");
    const file = path.join(tmp, "files", pdf.storage_path);
    const info = pdfInfo(file);
    expect(info.pages).toBe(2);
    expect(info.size).toEqual([[810, 1012.5], [810, 1012.5]]);
    for (const t of info.texts) expect(t).toContain(r.card_id);
    expect(info.meta.keywords).toContain(`card_id=${r.card_id}`);
    expect(info.fonts.every((f: string) => /barlow|caveat/i.test(f))).toBe(true);
    expect(new Set(files.files.map((f: any) => f.card_id))).toEqual(new Set([r.card_id]));
  });

  it.skipIf(skip())("par A6: um PDF com frente e verso, corte de 105 × 148 mm, sangria de 3 mm e o mesmo card_id", async () => {
    const { r, files } = await generate({ modelo: "flashcard_a6", especialidade: "pediatria", ...CARD_SAMPLE });
    expect(files.files.map((f: any) => `${f.format}:${f.side}`)).toEqual(["pdf:pair"]);
    const info = pdfInfo(path.join(tmp, "files", files.files[0].storage_path));
    const mm = (pt: number) => (pt / 72) * 25.4;
    expect(info.pages).toBe(2);
    for (let i = 0; i < 2; i++) {
      const [x0, y0, x1, y1] = info.trim[i];
      expect(mm(x1 - x0)).toBeCloseTo(105, 1);
      expect(mm(y1 - y0)).toBeCloseTo(148, 1);
      expect(mm(x0 - info.bleed[i][0])).toBeGreaterThanOrEqual(3);
      expect(info.texts[i]).toContain(r.card_id);
    }
    expect(info.meta.keywords).toContain("duplex=long_edge");
  });

  it.skipIf(skip())("especialidade desconhecida: paleta turquesa/petróleo e o nome escrito na peça", async () => {
    const { files } = await generate({ modelo: "feed", especialidade: "Neurologia", ...PIECE_SAMPLE });
    expect(files.render_status).toBe("ready");
    const pdf = files.files.find((x: any) => x.format === "pdf");
    expect(pdfInfo(path.join(tmp, "files", pdf.storage_path)).texts[0].toUpperCase()).toContain("NEUROLOGIA");
    const row = await dev.db.query<any>(`select m.specialty_key, m.specialty_label from public.ch_visual_materials m join public.ch_visual_versions v on v.material_id = m.id where v.id = (select version_id from public.ch_visual_files where storage_path = $1)`, [pdf.storage_path]);
    expect(row.rows[0]).toEqual({ specialty_key: "fallback", specialty_label: "Neurologia" });
  });

  it.skipIf(skip())("no navegador, a pegadinha de Cirurgia é #C8102E (não o vermelho #D94A4A da especialidade)", async () => {
    const page = await renderer!.newPage!({ viewport: { width: 1240, height: 1748 } });
    try {
      const c = content({ modelo: "flashcard_a6", especialidade: "cirurgia", card_id: "CIR-COR-1", ...CARD_SAMPLE });
      await page.setContent(buildVisualDocument(c, { fontCss: visualFontCss().css }).html, { waitUntil: "load" });
      await page.waitForFunction(() => (window as any).__visual?.done === true);
      const colors = await page.evaluate(() => ({
        alert: getComputedStyle(document.querySelector('[data-role="alert"]')!).borderTopColor,
        title: getComputedStyle(document.querySelector('[data-role="alert-title"]')!).color,
        stripe: getComputedStyle(document.querySelector(".vm-artboard [data-bg]")!).backgroundColor,
        problems: (window as any).__visual.problems,
      }));
      expect(colors.alert).toBe("rgb(200, 16, 46)");
      expect(colors.title).toBe("rgb(200, 16, 46)");
      expect(colors.stripe).toBe("rgb(217, 74, 74)"); // #D94A4A só como acento da especialidade
      expect(colors.problems).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it.skipIf(skip())("texto que não cabe é reprovado na conferência (sem apagar o rascunho) e caractere fora das fontes é apontado", async () => {
    const long = "Texto de teste comprido para estourar a caixa ".repeat(4).trim();
    const { files, r } = await generate({ modelo: "feed", especialidade: "pediatria", ...PIECE_SAMPLE, pontos_chave: [long.slice(0, 170), long.slice(0, 170), long.slice(0, 170)], pegadinha: long.slice(0, 230), tome_nota: long.slice(0, 170) });
    expect(files.render_status).toBe("check_failed");
    expect(files.check_result.problems.some((p: any) => ["overflow", "lines", "overlap"].includes(p.code))).toBe(true);
    const kept = await dev.db.query<any>(`select content ->> 'pegadinha' as p from public.ch_visual_versions where id = $1`, [r.version_id]);
    expect(kept.rows[0].p).toBe(long.slice(0, 230));
    const arrow = await generate({ modelo: "flashcard_digital", especialidade: "pediatria", ...CARD_SAMPLE, resposta: "A → B" });
    expect(arrow.files.check_result.problems.some((p: any) => p.code === "glyph" && p.message.includes("→"))).toBe(true);
  });

  it.skipIf(skip())("sem gerador, a geração fica pendente e a versão volta para a fila com o motivo", async () => {
    const r = await saveVisualMaterial(db, EDITOR, { modelo: "feed", especialidade: "pediatria", titulo: "Sem gerador" }, { generate: true });
    await expect(generateVisualVersion({ db, storage, renderer: null }, r.version_id)).rejects.toThrow(/indisponível/);
    const v = await dev.db.query<any>(`select render_status, render_error from public.ch_visual_versions where id = $1`, [r.version_id]);
    expect(v.rows[0].render_status).toBe("queued");
    expect(v.rows[0].render_error).toMatch(/Aguardando o processamento/);
  });
});
