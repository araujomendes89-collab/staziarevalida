// @vitest-environment node
/**
 * Podcasts (supabase/migrations/…4700_podcasts.sql + server/podcasts/*): fontes com a origem (PDF, DOCX, texto, link, aula),
 * roteiro com IA simulada (cada fala cita os trechos; o servidor confere números e trechos), aprovação humana, áudio em partes
 * (voz simulada e Gemini com rede simulada), publicação só pelo administrador, aluno só ouve publicado, Flashcast da aula e
 * apagar com os arquivos. Nenhuma chamada real a IA: tudo simulado.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb, type Storage } from "../../server/contentHub/infra";
import { createPodcastsRouter, type PodcastsDeps } from "../../server/podcasts/router";
import { chunkPages, fetchLink, htmlToText, privateAddress } from "../../server/podcasts/extract";
import { checkScript, mockScriptFromInput, buildScriptInput, ungroundedNumbers, type PodcastScript } from "../../server/podcasts/script";
import { pcmToMp3, pickVoices, silence, splitParts, toPcm, SAMPLE_RATE } from "../../server/podcasts/audio";
import { AiInvalidOutput } from "../../server/contentHub/ai/provider";

// ler PDF e DOCX carrega bibliotecas grandes na primeira vez (lento no disco externo): mais tempo por teste
vi.setConfig({ testTimeout: 60_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podcasts-"));
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const GEMINI_KEY = "g".repeat(40);
let dev: DevDatabase;
let db: ContentDb;
const servers: Server[] = [];
let base: string; // voz simulada
let gem: string; // Gemini com rede simulada
let admin: string, editor: string, student: string;
let lessonId: string;
let podcastId: string;
const geminiCalls: any[] = [];

const files = localStorageDir(path.join(tmp, "podcasts"));
const lessonFiles = localStorageDir(path.join(tmp, "lessons"));

/** PDF mínimo com texto (Helvetica), uma página por item. */
function makePdf(pages: string[]): Buffer {
  const objs: string[] = [`<< /Type /Catalog /Pages 2 0 R >>`, `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`];
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td 16 TL ${text.split("\n").map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ")} ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function makeDocx(paragraphs: string[]): Promise<Buffer> {
  const JSZip = ((await import("jszip")) as any).default;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

/** WAV 24 kHz mono 16 bits com `ms` de silêncio (o que a voz do Gemini devolve, em base64). */
function wav(ms: number): Buffer {
  const pcm = silence(ms);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "latin1");
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8, "latin1");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "latin1");
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Roteiro "da IA": usa os trechos que recebeu; uma fala erra a dose (6 g, o trecho diz 4 g) e outra cita trecho inexistente. */
const mockScript = (req: { input: string }) => {
  const ids = [...req.input.matchAll(/\[T(\d+)\]/g)].map((m) => Number(m[1]));
  const dose = ids.find((id) => new RegExp(`\\[T${id}\\][^\\[]*4 g`).test(req.input)) ?? ids[0];
  return {
    title_suggestion: "Pré-eclâmpsia na prática",
    lines: [
      { speaker: "ANA", text: "Hoje a conversa é sobre pré-eclâmpsia, só com o material da equipe.", style: "acolhedora", sources: [] },
      { speaker: "BRUNO", text: "Boa! O que define o quadro?", style: "curioso", sources: [] },
      { speaker: "ANA", text: "Hipertensão depois de 20 semanas com proteinúria, como está no material.", style: "didática", sources: [ids[0]] },
      { speaker: "BRUNO", text: "E a dose de ataque do sulfato?", style: "curioso", sources: [] },
      { speaker: "ANA", text: "O material traz 6 g IV no ataque.", style: "firme", sources: [dose] },
      { speaker: "BRUNO", text: "Anotado!", style: "animado", sources: [99999999] },
    ],
    missing: ["A dose de manutenção não aparece nas fontes."],
  };
};

const sqlAs = (uid: string, q: string, p: unknown[] = []) =>
  dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
    return (await tx.query<any>(q, p)).rows;
  });
const rpc = async (uid: string, fn: string, args: Record<string, unknown> = {}) => {
  const keys = Object.keys(args);
  return (await sqlAs(uid, `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => args[k])))[0].r;
};
const listen = (deps: PodcastsDeps) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json({ limit: "50mb" }));
    app.use("/api/podcasts", createPodcastsRouter(deps));
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/podcasts`));
    servers.push(srv);
  });
const call = async (url: string, token: string, init: RequestInit = {}) => {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const type = r.headers.get("content-type") ?? "";
  return { status: r.status, body: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
const post = (url: string, token: string, body: unknown = {}) => call(url, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const postRaw = (url: string, token: string, type: string, body: Buffer, name: string) => call(url, token, { method: "POST", headers: { "Content-Type": type, "X-File-Name": encodeURIComponent(name) }, body });

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'ed@t.dev'), ($3, 'al@t.dev')`, [ADMIN, EDITOR, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  lessonId = (await rpc(EDITOR, "app_admin_save_lesson", { p_lesson: { area: "GINECOLOGIA_OBSTETRICIA", topic: "Pré-eclâmpsia", title: "Pré-eclâmpsia grave", summary: "Pré-eclâmpsia é hipertensão após 20 semanas com proteinúria ou lesão de órgão-alvo. Sulfato de magnésio previne eclâmpsia.", key_points: ["Sulfato de magnésio 4 g IV no ataque", "Parto é o tratamento definitivo"], published: true } })).id;
  base = await listen({ db, storage: files, lessons: lessonFiles, mockScript });
  gem = await listen({
    db,
    storage: files,
    lessons: lessonFiles,
    mockScript,
    tts: {
      env: { NODE_ENV: "test", CONTENT_HUB_AI_ALLOW_EXTERNAL: "1", GEMINI_API_KEY: GEMINI_KEY },
      fetchImpl: (async (url: string, init: any) => {
        geminiCalls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ steps: [{ content: [{ type: "audio", data: wav(1500).toString("base64") }] }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }) as any,
    },
  });
  admin = await dev.createSession(ADMIN);
  editor = await dev.createSession(EDITOR);
  student = await dev.createSession(STUDENT);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Peças do servidor (sem rede)", () => {
  it("trechos guardam a página; parágrafo longo é cortado em frase; cabeçalho curto sai", () => {
    const long = "Frase de teste com conteúdo clínico relevante. ".repeat(60);
    const chunks = chunkPages([{ page: 3, text: `Cabeçalho\n\n${long}` }, { page: 4, text: "Critérios de gravidade: PA maior ou igual a 160 x 110 mmHg." }], 1200, 40);
    expect(chunks.every((c) => c.text.length <= 1200)).toBe(true);
    expect(chunks.filter((c) => c.page === 3).length).toBeGreaterThan(1);
    expect(chunks.at(-1)).toEqual({ page: 4, text: "Critérios de gravidade: PA maior ou igual a 160 x 110 mmHg." });
    expect(chunks.some((c) => c.text === "Cabeçalho")).toBe(false);
  });

  it("número com unidade precisa estar no trecho citado (vírgula e ponto valem igual)", () => {
    expect(ungroundedNumbers("Faça 4 g IV e repita em 1,5 h.", ["Sulfato de magnésio 4 g IV; reavaliar em 1.5 h"])).toEqual([]);
    expect(ungroundedNumbers("Faça 6 g IV.", ["Sulfato de magnésio 4 g IV"])).toEqual(["6 g"]);
    const chunks = new Map([[1, { id: 1, source: "PCDT", doc: 1, page: 2, text: "Sulfato de magnésio 4 g IV em 20 minutos" }]]);
    const script: PodcastScript = { missing: [], lines: [
      { speaker: "ANA", text: "Ataque com 4 g IV em 20 minutos.", style: "", sources: [1] },
      { speaker: "BRUNO", text: "E manutenção de 2 g por hora?", style: "", sources: [1] },
      { speaker: "ANA", text: "Isso.", style: "", sources: [7] },
    ] };
    expect(checkScript(script, chunks)).toEqual([
      { line: 1, kind: "ungrounded_number", detail: '"2 g" não está nos trechos citados' },
      { line: 2, kind: "unknown_source", detail: "Trecho inexistente: T7" },
    ]);
  });

  it("simulação do roteiro só usa frases dos trechos e cita de onde vieram", () => {
    const input = buildScriptInput({ topic: "Pré-eclâmpsia", minutes: 3, chunks: [{ id: 11, source: "PCDT", doc: 1, page: 5, text: "Pré-eclâmpsia é hipertensão após 20 semanas. Outra frase." }] });
    const s = mockScriptFromInput(input, 3);
    const cited = s.lines.filter((l) => l.sources.length);
    expect(cited).toHaveLength(1);
    expect(cited[0]).toMatchObject({ sources: [11], text: expect.stringContaining("Pré-eclâmpsia é hipertensão após 20 semanas.") });
  });

  it("áudio: partes sem quebrar fala; WAV vira PCM; PCM vira MP3; vozes fora da lista voltam ao padrão", async () => {
    const lines = Array.from({ length: 6 }, (_, i) => ({ speaker: (i % 2 ? "BRUNO" : "ANA") as "ANA" | "BRUNO", text: "x".repeat(500), style: "", sources: [] }));
    expect(splitParts(lines, 1400)).toEqual([[0, 1], [2, 3], [4, 5]]);
    const { pcm, rate } = toPcm(wav(500));
    expect(rate).toBe(SAMPLE_RATE);
    expect(pcm.length).toBe(SAMPLE_RATE); // 0,5 s × 24 000 × 2 bytes
    const mp3 = await pcmToMp3(silence(1000));
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
    expect(pickVoices("gemini", { ana: "Kore", bruno: "voz-inventada" })).toEqual({ ana: "Kore", bruno: "Puck" });
    expect(pickVoices("openai", null)).toEqual({ ana: "marin", bruno: "cedar" });
  });

  it("links: só https, nada da rede interna, página vira texto sem menu nem script", async () => {
    expect(privateAddress("10.1.2.3")).toBe(true);
    expect(privateAddress("192.168.0.10")).toBe(true);
    expect(privateAddress("169.254.169.254")).toBe(true);
    expect(privateAddress("8.8.8.8")).toBe(false);
    const neverFetch = (async () => {
      throw new Error("não devia buscar");
    }) as any;
    await expect(fetchLink("http://exemplo.gov.br/x", neverFetch)).rejects.toThrow(/Só links https/);
    await expect(fetchLink("https://localhost/x", neverFetch)).rejects.toThrow(/Endereço interno/);
    await expect(fetchLink("https://10.0.0.5/x", neverFetch)).rejects.toThrow(/Endereço interno/);
    // redirecionamento para http é barrado
    const redirect = (async () => new Response(null, { status: 302, headers: { location: "http://exemplo.gov.br/y" } })) as any;
    await expect(fetchLink("https://exemplo.gov.br/x", redirect, async () => {})).rejects.toThrow(/Só links https/);
    const { title, text } = htmlToText("<html><head><title>PCDT &amp; Cia</title><script>alert(1)</script></head><body><nav>Menu</nav><p>Sulfato 4 g</p><footer>Rodapé</footer></body></html>");
    expect(title).toBe("PCDT & Cia");
    expect(text).toBe("Sulfato 4 g");
  });
});

describe("Episódio, fontes e permissões", () => {
  it("aluno não mexe em nada da equipe; editor cria o episódio", async () => {
    await expect(rpc(STUDENT, "app_admin_podcasts")).rejects.toThrow();
    await expect(rpc(STUDENT, "app_admin_save_podcast", { p_podcast: { title: "Tentativa" } })).rejects.toThrow();
    const view = await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Pré-eclâmpsia em 5 minutos", topic: "Pré-eclâmpsia", area: "GINECOLOGIA_OBSTETRICIA", lesson_id: lessonId, target_minutes: 5 } });
    podcastId = view.id;
    expect(view).toMatchObject({ status: "draft", target_minutes: 5, language: "pt-BR", format: "two_hosts", sources: [], chunks_total: 0, lesson: { id: lessonId } });
    expect((await call(`${base}/providers`, student)).status).toBe(403);
    const providers = (await call(`${base}/providers`, editor)).body;
    expect(providers.script.choices.map((p: any) => p.kind)).toEqual(["gemini", "anthropic", "openai", "ollama", "mock"]);
    expect(providers.script).toMatchObject({ override_allowed: true, configured: false, current: null });
    expect(providers.tts.find((p: any) => p.kind === "mock")).toMatchObject({ ready: true });
  });

  it("PDF: texto por página vira trechos com a página; aluno não envia", async () => {
    const pdf = makePdf(["Pre-eclampsia: hipertensao apos 20 semanas com proteinuria.\nSulfato de magnesio 4 g IV no ataque.", "Criterios de gravidade: PA de 160 x 110 mmHg ou mais."]);
    expect((await postRaw(`${base}/${podcastId}/sources/file`, student, "application/pdf", pdf, "pcdt.pdf")).status).toBe(403);
    expect((await postRaw(`${base}/${podcastId}/sources/file`, editor, "application/pdf", Buffer.from("não é PDF"), "x.pdf")).status).toBe(415);
    const r = await postRaw(`${base}/${podcastId}/sources/file`, editor, "application/pdf", pdf, "PCDT pré-eclâmpsia.pdf");
    expect(r.status).toBe(201);
    expect(r.body.sources[0]).toMatchObject({ kind: "pdf", title: "PCDT pré-eclâmpsia.pdf", pages: 2 });
    const chunks = await dev.db.query<any>(`select page, text from public.podcast_chunks where podcast_id = $1 order by ord`, [podcastId]);
    expect(chunks.rows.map((c) => c.page)).toEqual([1, 2]);
    expect(chunks.rows[0].text).toContain("Sulfato de magnesio 4 g IV");
    expect(await files.exists(r.body.sources[0].storage_path)).toBe(true);
  });

  it("DOCX, texto colado, aula e link entram como fontes; PDF sem texto é recusado com o caminho certo", async () => {
    const docx = await makeDocx(["Eclâmpsia: convulsão em gestante com pré-eclâmpsia.", "Conduta: sulfato de magnésio e estabilização materna antes do parto."]);
    const d = await postRaw(`${base}/${podcastId}/sources/file`, editor, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx, "eclampsia.docx");
    expect(d.status).toBe(201);
    expect(d.body.sources.at(-1)).toMatchObject({ kind: "docx", pages: null });

    expect((await post(`${base}/${podcastId}/sources/text`, editor, { title: "Curto", text: "pouco" })).status).toBe(400);
    const t = await post(`${base}/${podcastId}/sources/text`, editor, { title: "Anotações", text: "Na prova, a pegadinha é tratar a pressão sem pensar no sulfato de magnésio para prevenir convulsão. ".repeat(2) });
    expect(t.status).toBe(201);

    const l = await post(`${base}/${podcastId}/sources/lesson`, editor, { lesson_id: lessonId });
    expect(l.status).toBe(201);
    expect(l.body.sources.at(-1)).toMatchObject({ kind: "lesson", title: "Aula: Pré-eclâmpsia grave", lesson_id: lessonId });

    expect((await post(`${base}/${podcastId}/sources/link`, editor, { url: "http://inseguro.gov.br" })).status).toBe(400);
    expect((await post(`${base}/${podcastId}/sources/link`, editor, { url: "https://localhost/admin" })).status).toBe(422);

    const blank = makePdf([""]);
    const b = await postRaw(`${base}/${podcastId}/sources/file`, editor, "application/pdf", blank, "escaneado.pdf");
    expect(b.status).toBe(422);
    expect(b.body.error).toMatch(/escaneado|OCR/);
    expect((await rpc(EDITOR, "app_admin_podcast", { p_id: podcastId })).sources).toHaveLength(4);
  });
});

describe("Roteiro com revisão humana", () => {
  let warnings: any[];

  it("a IA escreve Ana e Bruno citando trechos; o servidor marca dose fora do trecho e trecho inexistente; nada é aprovado", async () => {
    expect((await post(`${base}/${podcastId}/script`, student, { provider: "mock" })).status).toBe(403);
    expect((await post(`${base}/${podcastId}/script`, editor, { provider: "chatgpt" })).status).toBe(400);
    const r = await post(`${base}/${podcastId}/script`, editor, { provider: "mock", notes: "foque na prova" });
    expect(r.status).toBe(200);
    warnings = r.body.warnings;
    expect(warnings).toEqual([
      { line: 4, kind: "ungrounded_number", detail: '"6 g" não está nos trechos citados' },
      { line: 5, kind: "unknown_source", detail: "Trecho inexistente: T99999999" },
    ]);
    const p = r.body.podcast;
    expect(p).toMatchObject({ status: "script_ready", approved_at: null, script_meta: { simulated: true, warnings } });
    expect(p.script.lines.map((l: any) => l.speaker)).toEqual(["ANA", "BRUNO", "ANA", "BRUNO", "ANA", "BRUNO"]);
    expect(p.script.missing).toEqual(["A dose de manutenção não aparece nas fontes."]);
    const cited = p.script.lines[2].sources[0];
    expect(p.cited[String(cited)]).toMatchObject({ source: "PCDT pré-eclâmpsia.pdf", page: 1 });
    // simulação não entra no custo
    expect((await dev.db.query<any>(`select count(*)::int n from public.ai_usage_ledger where feature = 'podcast_script'`)).rows[0].n).toBe(0);
  });

  it("áudio só depois da aprovação; aprovar exige dizer o que foi conferido; aluno não aprova", async () => {
    const early = await post(`${base}/${podcastId}/audio/start`, editor, { provider: "mock" });
    expect(early.status).toBe(400);
    expect(early.body.error).toMatch(/Aprove o roteiro/);
    await expect(rpc(STUDENT, "app_admin_podcast_approve", { p_id: podcastId, p_note: "conferi tudo nas páginas" })).rejects.toThrow();
    await expect(rpc(EDITOR, "app_admin_podcast_approve", { p_id: podcastId, p_note: "ok" })).rejects.toThrow(/pelo menos 10/);
  });

  it("Podcasts: roteiro registra em ai_calls e guarda o provedor e o modelo de quem respondeu", async () => {
    await dev.db.query("delete from public.ai_calls");
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
    const off = await listen({ db, storage: files, lessons: lessonFiles, aiMaker: () => null });
    const { invalidateAiConfig } = await import("../../server/ai/config");
    invalidateAiConfig(db);
    const refused = await post(`${off}/${podcastId}/script`, editor, { provider: "gemini" });
    expect(refused.status).toBe(503);
    expect(refused.body.error).toContain("Gemini está desligada na Central de IAs");
    invalidateAiConfig(db);
    const url = await listen({
      db,
      storage: files,
      lessons: lessonFiles,
      aiMaker: (ref) => ({ name: ref.provider, model: ref.model, isMock: false, async generate(req: any) { return { output: mockScript(req), provider: ref.provider, model: ref.model, inputTokens: 7, outputTokens: 9, latencyMs: 1, costUsd: null } as any; } }) as any,
    });
    const r = await post(`${url}/${podcastId}/script`, editor, { provider: "anthropic" });
    expect(r.status).toBe(200);
    expect(r.body.podcast.script_meta).toMatchObject({ provider: "anthropic", simulated: false, calls: 2, input_tokens: 14, output_tokens: 18 });
    expect(r.body.podcast.script_meta.model).toBeTruthy();
    const rows = (await dev.db.query<any>(`select provider, model, source, item_id, actor_id from public.ai_calls order by id`)).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({ provider: "anthropic", source: "podcast", item_id: podcastId, actor_id: EDITOR });
    expect(rows[0].model).toBe(r.body.podcast.script_meta.model);
  });

  it("Podcasts: resposta sempre fora do formato, sem reserva, gasta no máximo 2 chamadas (principal e nova tentativa) e responde erro", async () => {
    await dev.db.query("delete from public.ai_calls");
    await db.service("ch_worker_ai_set_provider", { p_actor: ADMIN, p_provider: "anthropic", p_enabled: true });
    const { invalidateAiConfig } = await import("../../server/ai/config");
    invalidateAiConfig(db);
    vi.stubEnv("CONTENT_HUB_AI_FALLBACK_PROVIDER", "");
    try {
      const calls: string[] = [];
      const url = await listen({
        db,
        storage: files,
        lessons: lessonFiles,
        aiMaker: (ref) => ({ name: ref.provider, model: ref.model, isMock: false, async generate() { calls.push(`${ref.provider}:${ref.model}`); throw new AiInvalidOutput("Resposta fora do formato: teste", { x: 1 }); } }) as any,
      });
      const r = await post(`${url}/${podcastId}/script`, editor, { provider: "anthropic" });
      expect(r.status).toBe(502);
      expect(r.body.error).toContain("A IA do roteiro falhou");
      // o roteiro também tenta de novo ao receber AiInvalidOutput; o adaptador não deixa a classe passar, para não multiplicar
      expect(calls).toHaveLength(2);
      expect((await dev.db.query<any>(`select source from public.ai_calls order by id`)).rows.map((x) => x.source)).toEqual(["podcast", "podcast"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("Podcasts: simulação em produção responde 503, sem ai_calls e sem salvar roteiro simulado", async () => {
    await dev.db.query("delete from public.ai_calls");
    const before = (await rpc(EDITOR, "app_admin_podcast", { p_id: podcastId })).script_meta;
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const r = await post(`${base}/${podcastId}/script`, editor, { provider: "mock" });
      expect(r.status).toBe(503);
      expect(r.body.error).toContain("O modo de simulação não existe em produção.");
    } finally {
      process.env.NODE_ENV = old;
    }
    expect((await dev.db.query<any>(`select count(*)::int n from public.ai_calls`)).rows[0].n).toBe(0);
    expect((await rpc(EDITOR, "app_admin_podcast", { p_id: podcastId })).script_meta).toEqual(before);
  });

  it("a equipe corrige a dose e tira a fala ruim; editar tira os avisos antigos e a conferência roda de novo", async () => {
    const p = await rpc(EDITOR, "app_admin_podcast", { p_id: podcastId });
    const lines = p.script.lines.slice(0, 5).map((l: any, i: number) => (i === 4 ? { ...l, text: "O material traz 4 g IV no ataque." } : l));
    const edited = await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: podcastId, p_script: { lines, missing: p.script.missing } });
    expect(edited).toMatchObject({ status: "script_ready", approved_at: null });
    expect(edited.script_meta.warnings).toBeUndefined();
    expect(edited.script_meta.edited_by).toBe(EDITOR);
    expect((await call(`${base}/${podcastId}/script/check`, editor)).body).toEqual({ warnings: [] });
    await expect(rpc(EDITOR, "app_admin_podcast_save_script", { p_id: podcastId, p_script: { lines: [{ speaker: "CARLOS", text: "oi" }, lines[0]] } })).rejects.toThrow(/ANA ou BRUNO/);
    const ok = await rpc(EDITOR, "app_admin_podcast_approve", { p_id: podcastId, p_note: "Conferi a dose de ataque na página 1 do PCDT." });
    expect(ok).toMatchObject({ status: "approved", approved_by: EDITOR, approval_note: "Conferi a dose de ataque na página 1 do PCDT." });
    expect(ok.approved_by_name).toBe("ed@t.dev");
  });
});

describe("Áudio em partes, publicação e Flashcast", () => {
  it("voz simulada: começa, gera cada parte e junta num MP3; ninguém ouve antes de publicar", async () => {
    const start = await post(`${base}/${podcastId}/audio/start`, editor, { provider: "mock" });
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({ provider: "mock", lines: 5 });
    for (let i = 0; i < start.body.parts; i++) expect((await post(`${base}/${podcastId}/audio/part`, editor, { job: start.body.job, index: i })).status).toBe(200);
    expect((await post(`${base}/${podcastId}/audio/part`, editor, { job: start.body.job, index: 99 })).status).toBe(400);
    expect((await post(`${base}/${podcastId}/audio/finish`, editor, { job: "nao-e-um-job" })).status).toBe(400);
    const fin = await post(`${base}/${podcastId}/audio/finish`, editor, { job: start.body.job });
    expect(fin.status).toBe(200);
    expect(fin.body).toMatchObject({ status: "audio_ready", audio_meta: { provider: "mock", simulated: true } });
    expect(fin.body.audio_seconds).toBeGreaterThan(0);
    // arquivos temporários da geração saem
    expect(fs.existsSync(path.join(tmp, "podcasts", "podcasts", podcastId, "tmp", start.body.job))).toBe(false);
    // equipe ouve para revisar; aluno ainda não
    expect((await call(`${base}/${podcastId}/audio/link`, editor)).body).toEqual({ url: null });
    const file = await call(`${base}/${podcastId}/audio/file`, editor);
    expect(file.status).toBe(200);
    expect((file.body as Buffer)[0]).toBe(0xff);
    expect((await call(`${base}/${podcastId}/audio/link`, student)).status).toBe(404);
    expect(await rpc(STUDENT, "app_podcasts")).toEqual([]);
    expect(await rpc(STUDENT, "app_podcast", { p_id: podcastId })).toBeNull();
  });

  it("Gemini (rede simulada): duas vozes na mesma chamada, estilo por fala, chave só no cabeçalho; custo vai para o registro", async () => {
    const before = (await rpc(EDITOR, "app_admin_podcast", { p_id: podcastId })).audio_path;
    const start = await post(`${gem}/${podcastId}/audio/start`, editor, { provider: "gemini", voices: { ana: "Kore", bruno: "voz-inventada" } });
    expect(start.status).toBe(200);
    expect(start.body.voices).toEqual({ ana: "Kore", bruno: "Puck" });
    for (let i = 0; i < start.body.parts; i++) expect((await post(`${gem}/${podcastId}/audio/part`, editor, { job: start.body.job, index: i })).status).toBe(200);
    const fin = await post(`${gem}/${podcastId}/audio/finish`, editor, { job: start.body.job });
    expect(fin.status).toBe(200);
    expect(fin.body.audio_meta).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash-tts", voices: { ana: "Kore", bruno: "Puck" } });
    const c = geminiCalls[0];
    expect(c.url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(c.headers["x-goog-api-key"]).toBe(GEMINI_KEY);
    expect(JSON.stringify(c.body)).not.toContain(GEMINI_KEY);
    expect(c.body.generation_config.speech_config).toEqual({ mode: "conversational", speakers: [{ speaker: "Ana", voice: "Kore" }, { speaker: "Bruno", voice: "Puck" }] });
    expect(c.body.input[0].content[0].annotations[0]).toMatchObject({ type: "speech_metadata", speaker: "Ana" });
    expect(c.body.input[0].content[1].annotations[0]).toMatchObject({ type: "speech_metadata", speaker: "Bruno" });
    expect(JSON.stringify(fin.body)).not.toContain(GEMINI_KEY);
    const ledger = await dev.db.query<any>(`select provider, model, duration_seconds, estimated_cost_usd from public.ai_usage_ledger where feature = 'podcast_tts'`);
    expect(ledger.rows).toHaveLength(1);
    expect(Number(ledger.rows[0].estimated_cost_usd)).toBeGreaterThan(0);
    // o áudio anterior foi substituído e apagado
    expect(await files.exists(before)).toBe(false);
    expect(await files.exists(fin.body.audio_path)).toBe(true);
  });

  it("se o roteiro muda no meio da geração, o áudio para", async () => {
    const start = await post(`${base}/${podcastId}/audio/start`, editor, { provider: "mock" });
    const p = await rpc(EDITOR, "app_admin_podcast", { p_id: podcastId });
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: podcastId, p_script: { lines: p.script.lines, missing: [] } });
    await rpc(EDITOR, "app_admin_podcast_approve", { p_id: podcastId, p_note: "Conferido de novo depois da edição." });
    const part = await post(`${base}/${podcastId}/audio/part`, editor, { job: start.body.job, index: 0 });
    expect(part.status).toBe(409);
    expect(part.body.error).toMatch(/roteiro mudou/);
    // gera de novo com o roteiro atual
    const again = await post(`${base}/${podcastId}/audio/start`, editor, { provider: "mock" });
    for (let i = 0; i < again.body.parts; i++) await post(`${base}/${podcastId}/audio/part`, editor, { job: again.body.job, index: i });
    expect((await post(`${base}/${podcastId}/audio/finish`, editor, { job: again.body.job })).body.status).toBe("audio_ready");
  });

  it("só o administrador publica; o aluno ouve, lê a transcrição e vê as fontes com as páginas", async () => {
    await expect(rpc(EDITOR, "app_admin_podcast_publish", { p_id: podcastId, p_published: true })).rejects.toThrow();
    const pub = await rpc(ADMIN, "app_admin_podcast_publish", { p_id: podcastId, p_published: true });
    expect(pub).toMatchObject({ status: "published", published_by: ADMIN });
    const list = await rpc(STUDENT, "app_podcasts");
    expect(list).toEqual([expect.objectContaining({ id: podcastId, title: "Pré-eclâmpsia em 5 minutos", area: "GINECOLOGIA_OBSTETRICIA", lesson: { id: lessonId, title: "Pré-eclâmpsia grave" } })]);
    expect(await rpc(STUDENT, "app_podcasts", { p_area: "PEDIATRIA" })).toEqual([]);
    const ep = await rpc(STUDENT, "app_podcast", { p_id: podcastId });
    expect(ep.lines[0]).toEqual({ speaker: "ANA", text: "Hoje a conversa é sobre pré-eclâmpsia, só com o material da equipe." });
    expect(ep.sources.find((s: any) => s.title === "PCDT pré-eclâmpsia.pdf")).toMatchObject({ kind: "pdf", pages: [1] });
    expect((await call(`${base}/${podcastId}/audio/link`, student)).body).toEqual({ url: null });
    expect((await call(`${base}/${podcastId}/audio/file`, student)).status).toBe(200);
    // publicado não aceita mudança de fonte nem de roteiro
    expect((await post(`${base}/${podcastId}/sources/text`, editor, { title: "x", text: "y".repeat(100) })).status).toBe(400);
    await expect(rpc(EDITOR, "app_admin_podcast_save_script", { p_id: podcastId, p_script: { lines: ep.lines } })).rejects.toThrow(/Despublique/);
  });

  it("Flashcast: o MP3 aprovado vira o áudio da aula ligada", async () => {
    const r = await post(`${base}/${podcastId}/flashcast`, editor, {});
    expect(r.status).toBe(201);
    const m = r.body.lesson.materials.find((x: any) => x.kind === "flashcast");
    expect(m).toMatchObject({ title: "Flashcast: Pré-eclâmpsia em 5 minutos", content_type: "audio/mpeg", has_file: true });
    const row = await dev.db.query<any>(`select storage_path from public.lesson_materials where id = $1`, [m.id]);
    expect(row.rows[0].storage_path).toMatch(new RegExp(`^lessons/${lessonId}/flashcast-[0-9a-f]{16}\\.mp3$`));
    expect(await lessonFiles.exists(row.rows[0].storage_path)).toBe(true);
  });

  it("apagar é do administrador e leva os arquivos junto", async () => {
    const p = await rpc(ADMIN, "app_admin_podcast", { p_id: podcastId });
    const paths = [p.audio_path, ...p.sources.map((s: any) => s.storage_path).filter(Boolean)];
    expect(paths.length).toBeGreaterThan(2);
    expect((await call(`${base}/${podcastId}`, editor, { method: "DELETE" })).status).toBe(403);
    expect((await call(`${base}/${podcastId}`, admin, { method: "DELETE" })).body).toEqual({ deleted: true });
    for (const k of paths) expect(await files.exists(k)).toBe(false);
    expect(await rpc(STUDENT, "app_podcasts")).toEqual([]);
    expect((await dev.db.query<any>(`select count(*)::int n from public.podcast_chunks where podcast_id = $1`, [podcastId])).rows[0].n).toBe(0);
  });
});

describe("Isolamento", () => {
  it("tabelas fechadas para o aluno; funções do servidor não abrem para ninguém do app", async () => {
    expect(await sqlAs(STUDENT, `select count(*)::int n from public.podcasts`)).toEqual([{ n: 0 }]);
    for (const fn of ["ch_worker_podcast_material(p_user => $1, p_podcast => $1)", "ch_worker_podcast_audio_path(p_user => $1, p_podcast => $1)", "user_is_staff(p_user => $1)"]) {
      await expect(sqlAs(EDITOR, `select public.${fn}`, [EDITOR])).rejects.toThrow(/permission|permissão/i);
    }
  });
});
