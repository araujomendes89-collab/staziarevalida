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
import { chunkPages, chunkPagesInfo, fetchLink, htmlToText, privateAddress } from "../../server/podcasts/extract";
import { checkScript, generateScript, mockScriptFromInput, buildScriptInput, ungroundedNumbers, type PodcastScript } from "../../server/podcasts/script";
import { pcmToMp3, pickVoices, silence, splitParts, synthesizePart, toPcm, ttsStatus, SAMPLE_RATE } from "../../server/podcasts/audio";
import { AiInvalidOutput } from "../../server/contentHub/ai/provider";

// ler PDF e DOCX carrega bibliotecas grandes na primeira vez (lento no disco externo): mais tempo por teste
vi.setConfig({ testTimeout: 60_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podcasts-"));
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const GEMINI_KEY = "g".repeat(40);
const OPENAI_KEY = "o".repeat(40);
let dev: DevDatabase;
let db: ContentDb;
const servers: Server[] = [];
let base: string; // voz simulada
let gem: string; // Gemini ligada (PODCAST_TTS_GEMINI_ENABLED=1) com rede simulada
let oa: string; // padrão: OpenAI com rede simulada; Gemini com chave, mas desligada
let admin: string, editor: string, student: string;
let lessonId: string;
let podcastId: string;
const geminiCalls: any[] = [];
const oaCalls: any[] = []; // tudo o que o servidor "oa" tentou chamar (OpenAI ou Gemini)

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
      env: { NODE_ENV: "test", CONTENT_HUB_AI_ALLOW_EXTERNAL: "1", GEMINI_API_KEY: GEMINI_KEY, PODCAST_TTS_GEMINI_ENABLED: "1" },
      fetchImpl: (async (url: string, init: any) => {
        geminiCalls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ steps: [{ content: [{ type: "audio", data: wav(1500).toString("base64") }] }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }) as any,
    },
  });
  oa = await listen({
    db,
    storage: files,
    lessons: lessonFiles,
    mockScript,
    tts: {
      env: { NODE_ENV: "test", CONTENT_HUB_AI_ALLOW_EXTERNAL: "1", GEMINI_API_KEY: GEMINI_KEY, OPENAI_API_KEY: OPENAI_KEY },
      fetchImpl: (async (url: string, init: any) => {
        oaCalls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
        return new Response(silence(400), { status: 200, headers: { "Content-Type": "application/octet-stream" } });
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

  it("documento longo: o corte em 600 trechos é avisado, com a última página que entrou", () => {
    const pages = Array.from({ length: 700 }, (_, i) => ({ page: i + 1, text: `Página ${i + 1}: ${"Conduta clínica detalhada. ".repeat(10)}` }));
    const info = chunkPagesInfo(pages);
    expect(info.chunks).toHaveLength(600);
    expect(info).toMatchObject({ total: 700, truncated: true, lastPage: 600, pagesTotal: 700 });
    expect(chunkPages(pages)).toEqual(info.chunks); // quem já usava chunkPages não muda
    const curto = chunkPagesInfo(pages.slice(0, 3));
    expect(curto).toMatchObject({ total: 3, truncated: false, lastPage: 3 });
  });

  it("número com unidade precisa estar no trecho citado (vírgula e ponto valem igual)", () => {
    expect(ungroundedNumbers("Faça 4 g IV e repita em 1,5 h.", ["Sulfato de magnésio 4 g IV; reavaliar em 1.5 h"])).toEqual([]);
    expect(ungroundedNumbers("Faça 6 g IV.", ["Sulfato de magnésio 4 g IV"])).toEqual(["6 g"]);
    expect(ungroundedNumbers("Saturação abaixo de 92%, por 1 ano ou 1 mês.", ["Saturação abaixo de 90%"])).toEqual(["92%", "1 ano", "1 mês"]);
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

  it("conferência: trecho que existe no episódio mas não foi enviado à IA é recusado como citação", () => {
    const sent = new Map([[1, { id: 1, source: "PCDT", doc: 1, page: 2, text: "Sulfato de magnésio 4 g IV em 20 minutos" }]]);
    const all = new Map([...sent, [2, { id: 2, source: "PCDT", doc: 1, page: 9, text: "Dose de manutenção 2 g por hora" }]]);
    const script: PodcastScript = { missing: [], lines: [
      { speaker: "ANA", text: "Manutenção de 2 g por hora.", style: "", sources: [2] },
      { speaker: "BRUNO", text: "E o ataque?", style: "", sources: [1] },
      { speaker: "ANA", text: "Foi citado outro.", style: "", sources: [9] },
    ] };
    expect(checkScript(script, sent, all)).toEqual([
      { line: 0, kind: "unknown_source", detail: "Trecho que a IA não recebeu: T2" },
      { line: 0, kind: "ungrounded_number", detail: '"2 g" não está nos trechos citados' },
      { line: 2, kind: "unknown_source", detail: "Trecho inexistente: T9" },
    ]);
    // sem o terceiro argumento, tudo o que existe vale (a revisão da equipe confere o roteiro editado com todos os trechos)
    expect(checkScript(script, all).map((w) => w.detail)).toEqual(["Trecho inexistente: T9"]);
  });

  it("roteiro da IA que cita trecho que ela não recebeu volta com aviso (e a correção é pedida na segunda tentativa)", async () => {
    const big = (id: number) => ({ id, source: "Livro", doc: 1, page: id, text: `Trecho ${id} sobre pré-eclâmpsia. ${"conteúdo clínico ".repeat(3500)}` });
    const chunks = [big(1), big(2), big(3)]; // ~60 mil caracteres cada: só dois cabem nos 120 mil enviados
    const sentIds: number[] = [];
    const inputs: string[] = [];
    const r = await generateScript({
      kind: "mock",
      topic: "pré-eclâmpsia",
      minutes: 3,
      chunks,
      db,
      mockRespond: (req: any) => {
        inputs.push(req.input);
        const ids = [...req.input.matchAll(/\[T(\d+)\]/g)].map((m: RegExpMatchArray) => Number(m[1]));
        if (!sentIds.length) sentIds.push(...ids);
        const notSent = [1, 2, 3].find((i) => !ids.includes(i))!;
        return { title_suggestion: "x", missing: [], lines: [
          { speaker: "ANA", text: "Abertura.", style: "", sources: [] },
          { speaker: "BRUNO", text: "Pergunta.", style: "", sources: [] },
          { speaker: "ANA", text: "Resposta citando algo que não recebi.", style: "", sources: [notSent] },
          { speaker: "BRUNO", text: "Fim.", style: "", sources: [] },
        ] };
      },
    });
    expect(sentIds).toHaveLength(2);
    expect(r.warnings.some((w) => w.kind === "unknown_source" && /não recebeu/.test(w.detail))).toBe(true);
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toContain("Trecho que a IA não recebeu");
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

  it("voz: a OpenAI é a que vale; a do Gemini só liga com PODCAST_TTS_GEMINI_ENABLED=1 e é recusada antes de qualquer chamada", async () => {
    const env = { NODE_ENV: "test", CONTENT_HUB_AI_ALLOW_EXTERNAL: "1", GEMINI_API_KEY: GEMINI_KEY, OPENAI_API_KEY: OPENAI_KEY };
    // Gemini com chave e autorização, mas sem a variável: não fica pronta e o motivo é claro
    const off = ttsStatus("gemini", env);
    expect(off).toMatchObject({ ready: false, kind: "gemini" });
    expect(off.pending).toMatch(/indisponível por enquanto/);
    expect(off.pending).not.toMatch(/PODCAST_TTS|[A-Z]{3,}_[A-Z_]+/); // o nome da variável não vai para a tela
    expect(off.technical).toContain("PODCAST_TTS_GEMINI_ENABLED=1"); // fica só para o registro interno
    expect(ttsStatus("gemini", { ...env, PODCAST_TTS_GEMINI_ENABLED: "0" }).ready).toBe(false);
    expect(ttsStatus("gemini", { ...env, PODCAST_TTS_GEMINI_ENABLED: "true" }).ready).toBe(false);
    // ligada: volta como antes (e, sem a chave, o motivo volta a ser a chave)
    expect(ttsStatus("gemini", { ...env, PODCAST_TTS_GEMINI_ENABLED: "1" })).toEqual({ ready: true, kind: "gemini", model: "gemini-3.8-flash-tts", pending: null });
    expect(ttsStatus("gemini", { NODE_ENV: "test", CONTENT_HUB_AI_ALLOW_EXTERNAL: "1", PODCAST_TTS_GEMINI_ENABLED: "1" }).pending).toMatch(/chave da voz do Gemini não está configurada/);
    // OpenAI segue pronta, com o modelo padrão
    expect(ttsStatus("openai", env)).toEqual({ ready: true, kind: "openai", model: "gpt-4o-mini-tts", pending: null });
    // a geração recusa a Gemini desligada sem chamar ninguém
    const fetchImpl = vi.fn();
    const lines = [{ speaker: "ANA" as const, text: "Olá!", style: "", sources: [] }];
    await expect(synthesizePart("gemini", lines, pickVoices("gemini", null), { env, fetchImpl: fetchImpl as any })).rejects.toMatchObject({ status: 503, message: expect.stringContaining("indisponível por enquanto") });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("erros da voz: português simples na tela; o código do erro e o nome da variável só no detalhe interno", async () => {
    const env = { NODE_ENV: "test", CONTENT_HUB_AI_ALLOW_EXTERNAL: "1", GEMINI_API_KEY: GEMINI_KEY, OPENAI_API_KEY: OPENAI_KEY, PODCAST_TTS_GEMINI_ENABLED: "1" };
    const lines = [{ speaker: "ANA" as const, text: "Olá!", style: "", sources: [] }];
    const answer = (status: number, body = "rate limit exceeded: quota") => (async () => new Response(body, { status })) as any;
    const tecnico = /\b(429|401|403|500|503)\b|respondeu|quota|rate limit|CONTENT_HUB|_API_KEY|PODCAST_TTS|fetch failed|aborted|timeout/i;
    for (const kind of ["openai", "gemini"] as const) {
      const casos: [number, RegExp][] = [[429, /muitas chamadas|Espere/], [401, /recusou|acesso|administrador/i], [403, /recusou|acesso|administrador/i], [400, /recusou/], [500, /problema|instável|Tente de novo/], [503, /problema|instável|Tente de novo/]];
      for (const [status, esperado] of casos) {
        const error: any = await synthesizePart(kind, lines, pickVoices(kind, null), { env, fetchImpl: answer(status) }).catch((e) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error.message, `${kind} ${status}`).toMatch(esperado);
        expect(error.message, `${kind} ${status}`).not.toMatch(tecnico);
        expect(error.technical).toContain(String(status)); // o detalhe fica para o registro interno
        expect(error.technical).not.toContain(kind === "gemini" ? GEMINI_KEY : OPENAI_KEY);
      }
    }
    // sem rede / tempo esgotado: nada de mensagem em inglês
    for (const raw of [new TypeError("fetch failed"), Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })]) {
      const error: any = await synthesizePart("openai", lines, pickVoices("openai", null), { env, fetchImpl: (async () => { throw raw; }) as any }).catch((e) => e);
      expect(error.message).toMatch(/serviço de voz/);
      expect(error.message).not.toMatch(tecnico);
      expect(error.technical).toContain(raw.message);
    }
    // resposta do Gemini sem áudio
    const semAudio: any = await synthesizePart("gemini", lines, pickVoices("gemini", null), { env, fetchImpl: (async () => new Response(JSON.stringify({ steps: [] }), { status: 200 })) as any }).catch((e) => e);
    expect(semAudio.message).toMatch(/não devolveu áudio/);
    // sem autorização de envio / sem chave: o motivo na tela não traz nome de variável
    for (const [kind, e] of [["openai", { NODE_ENV: "test" }], ["openai", { NODE_ENV: "test", CONTENT_HUB_AI_ALLOW_EXTERNAL: "1" }], ["gemini", { NODE_ENV: "test", CONTENT_HUB_AI_ALLOW_EXTERNAL: "1", PODCAST_TTS_GEMINI_ENABLED: "1" }]] as const) {
      const st = ttsStatus(kind, e as any);
      expect(st.ready).toBe(false);
      expect(st.pending).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
      expect(st.technical).toMatch(/[A-Z]{3,}_[A-Z_]+/);
    }
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

describe("Fonte longa demais", () => {
  it("texto que passa de 600 trechos entra cortado e a equipe é avisada de quanto entrou", async () => {
    const created = await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Fonte longa", topic: "Teste", area: "CLINICA_MEDICA", target_minutes: 5 } });
    const paragraphs = Array.from({ length: 612 }, (_, i) => `Item ${i + 1}: ${"x".repeat(630)}`.replace(/x/g, "a"));
    const text = paragraphs.join("\n\n");
    expect(text.length).toBeLessThan(400_000);
    const r = await post(`${base}/${created.id}/sources/text`, editor, { title: "Texto enorme", text });
    expect(r.status).toBe(201);
    expect(r.body.note).toMatch(/entraram só os primeiros 600 de 612 trechos/);
    expect(r.body.note).toMatch(/o resto não foi usado/i);
    expect(r.body.sources[0].chunks).toBe(600);
    // fonte curta não leva aviso
    const ok = await post(`${base}/${created.id}/sources/text`, editor, { title: "Curto", text: "Um parágrafo curto com mais de oitenta caracteres para a fonte entrar inteira, sem nenhum aviso. ".repeat(2) });
    expect(ok.status).toBe(201);
    expect(ok.body.note).toBeUndefined();
    await call(`${base}/${created.id}`, admin, { method: "DELETE" });
  });
});

describe("PDF da aula como fonte e o limite de tamanho", () => {
  it("PDF da aula acima de 30 MB não é lido (nem baixado); o resumo e os pontos-chave entram e a equipe é avisada", async () => {
    const created = await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Aula com PDF grande", topic: "Teste", area: "CLINICA_MEDICA", target_minutes: 5 } });
    const key = `lessons/${lessonId}/slides-grande.pdf`;
    await lessonFiles.put(key, makePdf(["Conteudo do PDF da aula: sulfato de magnesio 4 g IV no ataque."]), "application/pdf");
    const mat = await dev.db.query<any>(`insert into public.lesson_materials (lesson_id, kind, title, storage_path, content_type, size_bytes) values ($1, 'slides', 'Slides', $2, 'application/pdf', $3) returning id`, [lessonId, key, 40 * 1024 * 1024]);
    const spy = vi.spyOn(lessonFiles, "get");
    try {
      // tamanho declarado acima do limite: não baixa o arquivo
      const big = await post(`${base}/${created.id}/sources/lesson`, editor, { lesson_id: lessonId });
      expect(big.status).toBe(201);
      expect(big.body.note).toMatch(/PDF da aula/);
      expect(big.body.note).toMatch(/30 MB/);
      expect(spy).not.toHaveBeenCalled();
      expect(big.body.sources[0]).toMatchObject({ kind: "lesson" });
      const texto = await dev.db.query<any>(`select string_agg(text, ' ') t from public.podcast_chunks where podcast_id = $1`, [created.id]);
      expect(texto.rows[0].t).toContain("Sulfato de magnésio 4 g IV no ataque"); // resumo e pontos-chave
      expect(texto.rows[0].t).not.toContain("Conteudo do PDF da aula");
      // tamanho dentro do limite: o PDF entra
      await dev.db.query(`update public.lesson_materials set size_bytes = 1000 where id = $1`, [mat.rows[0].id]);
      await call(`${base}/${created.id}/sources/${big.body.sources[0].id}`, editor, { method: "DELETE" });
      const ok = await post(`${base}/${created.id}/sources/lesson`, editor, { lesson_id: lessonId });
      expect(ok.status).toBe(201);
      expect(ok.body.note).toBeUndefined();
      expect(spy).toHaveBeenCalledTimes(1);
      const dentro = await dev.db.query<any>(`select string_agg(text, ' ') t from public.podcast_chunks where podcast_id = $1`, [created.id]);
      expect(dentro.rows[0].t).toContain("Conteudo do PDF da aula");
      // tamanho declarado errado (menor que o real): o arquivo baixado é conferido antes de ser lido
      await call(`${base}/${created.id}/sources/${ok.body.sources[0].id}`, editor, { method: "DELETE" });
      const huge = Buffer.alloc(31 * 1024 * 1024);
      huge.write("%PDF-1.4\n", 0, "latin1");
      await lessonFiles.put(key, huge, "application/pdf");
      const lied = await post(`${base}/${created.id}/sources/lesson`, editor, { lesson_id: lessonId });
      expect(lied.status).toBe(201);
      expect(lied.body.note).toMatch(/30 MB/);
    } finally {
      spy.mockRestore();
      await dev.db.query(`delete from public.lesson_materials where id = $1`, [mat.rows[0].id]);
      await call(`${base}/${created.id}`, admin, { method: "DELETE" });
    }
  });
});

describe("Conferência do roteiro lembra o que foi enviado à IA", () => {
  it("o aviso de trecho que a IA não recebeu volta em toda nova conferência, mesmo depois de editar outra fala", async () => {
    const created = await rpc(EDITOR, "app_admin_save_podcast", { p_podcast: { title: "Muitas fontes", topic: "Pré-eclâmpsia", area: "CLINICA_MEDICA", target_minutes: 5 } });
    const bloco = (n: number) => Array.from({ length: 150 }, (_, i) => `Fonte ${n} item ${i + 1}: ${"a".repeat(640)}`).join("\n\n");
    expect((await post(`${base}/${created.id}/sources/text`, editor, { title: "Fonte A", text: bloco(1) })).status).toBe(201);
    expect((await post(`${base}/${created.id}/sources/text`, editor, { title: "Fonte B", text: bloco(2) })).status).toBe(201);
    const all = (await dev.db.query<any>(`select id from public.podcast_chunks where podcast_id = $1 order by id`, [created.id])).rows.map((r) => Number(r.id));
    let naoEnviado = 0;
    const url = await listen({
      db, storage: files, lessons: lessonFiles,
      mockScript: (req: any) => {
        const sent = new Set([...req.input.matchAll(/\[T(\d+)\]/g)].map((m: RegExpMatchArray) => Number(m[1])));
        naoEnviado = all.find((id) => !sent.has(id))!;
        return { title_suggestion: "x", missing: [], lines: [
          { speaker: "ANA", text: "Abertura.", style: "", sources: [] },
          { speaker: "BRUNO", text: "Pergunta.", style: "", sources: [] },
          { speaker: "ANA", text: "Resposta citando algo que a IA não recebeu.", style: "", sources: [naoEnviado] },
          { speaker: "BRUNO", text: "Fim.", style: "", sources: [] },
        ] };
      },
    });
    const gen = await post(`${url}/${created.id}/script`, editor, { provider: "mock" });
    expect(gen.status).toBe(200);
    expect(naoEnviado).toBeGreaterThan(0);
    expect(gen.body.warnings.some((w: any) => /não recebeu/.test(w.detail))).toBe(true);
    // a equipe corrige outra fala e salva: o aviso apagado do banco volta pela conferência, que usa só o que foi enviado
    const p = await rpc(EDITOR, "app_admin_podcast", { p_id: created.id });
    expect(p.script_meta.sent_chunks).toEqual(expect.any(Array));
    expect(p.script_meta.sent_chunks).not.toContain(naoEnviado);
    const lines = p.script.lines.map((l: any, i: number) => (i === 0 ? { ...l, text: "Abertura, corrigida." } : l));
    const saved = await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: created.id, p_script: { lines, missing: [] } });
    expect(saved.script_meta.warnings).toBeUndefined();
    expect(saved.script_meta.sent_chunks).toEqual(p.script_meta.sent_chunks);
    const check = (await call(`${url}/${created.id}/script/check`, editor)).body;
    expect(check.warnings).toEqual([expect.objectContaining({ line: 2, kind: "unknown_source", detail: `Trecho que a IA não recebeu: T${naoEnviado}` })]);
    // tirando a citação inválida do texto, o aviso some
    const limpo = lines.map((l: any, i: number) => (i === 2 ? { ...l, sources: [] } : l));
    await rpc(EDITOR, "app_admin_podcast_save_script", { p_id: created.id, p_script: { lines: limpo, missing: [] } });
    expect((await call(`${url}/${created.id}/script/check`, editor)).body.warnings.filter((w: any) => w.kind === "unknown_source")).toEqual([]);
    await call(`${base}/${created.id}`, admin, { method: "DELETE" });
  });
});

describe("Nome da fonte", () => {
  it("equipe renomeia a fonte; aluno não; nome vazio ou fonte alheia é recusado", async () => {
    const view = await rpc(EDITOR, "app_admin_podcast", { p_id: podcastId });
    const docx = view.sources.find((s: any) => s.kind === "docx");
    const url = `${base}/${podcastId}/sources/${docx.id}`;
    const patch = (token: string, body: unknown, u = url) => call(u, token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await patch(student, { title: "Qualquer" })).status).toBe(403);
    expect((await patch(editor, { title: "   " })).status).toBe(400);
    expect((await patch(editor, { title: "x".repeat(201) })).status).toBe(400);
    expect((await patch(editor, { title: "Nome" }, `${base}/${podcastId}/sources/00000000-0000-4000-8000-000000000001`)).status).toBe(404);
    const ok = await patch(editor, { title: "  Resumo de eclâmpsia da equipe " });
    expect(ok.status).toBe(200);
    expect(ok.body.sources.find((s: any) => s.id === docx.id).title).toBe("Resumo de eclâmpsia da equipe");
    // o roteiro não é mexido por causa do nome
    expect(ok.body.status).toBe((await rpc(EDITOR, "app_admin_podcast", { p_id: podcastId })).status);
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

  it("voz padrão é a OpenAI (rede simulada): sem 'provider' usa a OpenAI; a Gemini desligada é recusada sem chamar ninguém; ligada, aparece pronta", async () => {
    const provs = (await call(`${oa}/providers`, editor)).body;
    expect(provs.tts.map((p: any) => p.kind)).toEqual(["openai", "gemini", "mock"]);
    expect(provs.tts.find((p: any) => p.kind === "openai")).toMatchObject({ ready: true, model: "gpt-4o-mini-tts", pending: null });
    expect(provs.tts.find((p: any) => p.kind === "gemini")).toMatchObject({ ready: false, pending: expect.stringContaining("indisponível por enquanto") });
    expect((await call(`${gem}/providers`, editor)).body.tts.find((p: any) => p.kind === "gemini")).toMatchObject({ ready: true, pending: null });

    const refused = await post(`${oa}/${podcastId}/audio/start`, editor, { provider: "gemini" });
    expect(refused.status).toBe(503);
    expect(refused.body.error).toMatch(/Voz indisponível.*indisponível por enquanto/);
    expect(refused.body.error).not.toMatch(/PODCAST_TTS/);
    expect(JSON.stringify(provs.tts)).not.toMatch(/PODCAST_TTS|technical|_API_KEY|ALLOW_EXTERNAL/); // o detalhe técnico não sai do servidor
    expect(oaCalls).toHaveLength(0);

    const before = (await rpc(EDITOR, "app_admin_podcast", { p_id: podcastId })).audio_path;
    const start = await post(`${oa}/${podcastId}/audio/start`, editor, { voices: { ana: "coral", bruno: "voz-inventada" } });
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({ provider: "openai", model: "gpt-4o-mini-tts", voices: { ana: "coral", bruno: "cedar" }, lines: 5 });
    for (let i = 0; i < start.body.parts; i++) expect((await post(`${oa}/${podcastId}/audio/part`, editor, { job: start.body.job, index: i })).status).toBe(200);
    const fin = await post(`${oa}/${podcastId}/audio/finish`, editor, { job: start.body.job });
    expect(fin.status).toBe(200);
    expect(fin.body.audio_meta).toMatchObject({ provider: "openai", model: "gpt-4o-mini-tts", voices: { ana: "coral", bruno: "cedar" } });
    expect(oaCalls).toHaveLength(5); // uma chamada por fala, todas na OpenAI
    for (const c of oaCalls) {
      expect(c.url).toBe("https://api.openai.com/v1/audio/speech");
      expect(c.headers.Authorization).toBe(`Bearer ${OPENAI_KEY}`);
      expect(c.body).toMatchObject({ model: "gpt-4o-mini-tts", response_format: "pcm" });
      expect(JSON.stringify(c.body)).not.toContain(OPENAI_KEY);
    }
    expect(oaCalls.map((c) => c.body.voice)).toEqual(["coral", "cedar", "coral", "cedar", "coral"]);
    expect(JSON.stringify(fin.body)).not.toContain(OPENAI_KEY);
    const ledger = await dev.db.query<any>(`select provider, model, estimated_cost_usd from public.ai_usage_ledger where feature = 'podcast_tts' and provider = 'openai'`);
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

  it("nova tentativa de uma parte já gerada não chama a voz de novo (não cobra duas vezes)", async () => {
    const start = await post(`${oa}/${podcastId}/audio/start`, editor, {});
    expect(start.status).toBe(200);
    const before = oaCalls.length;
    const first = await post(`${oa}/${podcastId}/audio/part`, editor, { job: start.body.job, index: 0 });
    expect(first.status).toBe(200);
    const gastas = oaCalls.length - before;
    expect(gastas).toBeGreaterThan(0); // a primeira vez chama a voz
    // a resposta "se perdeu" e o navegador tenta de novo: o servidor devolve a parte guardada
    const again = await post(`${oa}/${podcastId}/audio/part`, editor, { job: start.body.job, index: 0 });
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(oaCalls.length - before).toBe(gastas);
    // parte que ainda não existe continua sendo gerada normalmente
    if (start.body.parts > 1) {
      expect((await post(`${oa}/${podcastId}/audio/part`, editor, { job: start.body.job, index: 1 })).status).toBe(200);
      expect(oaCalls.length - before).toBeGreaterThan(gastas);
    }
    // só o MP3 guardado (sem o registro de que a parte terminou) não conta como parte pronta
    const key = `podcasts/${podcastId}/tmp/${start.body.job}`;
    fs.rmSync(path.join(tmp, "podcasts", key, "part-0.json"));
    const total = oaCalls.length;
    expect((await post(`${oa}/${podcastId}/audio/part`, editor, { job: start.body.job, index: 0 })).status).toBe(200);
    expect(oaCalls.length).toBeGreaterThan(total);
  });

  it("duas chamadas ao mesmo tempo para a mesma parte chamam a voz uma vez só; marcador de outra instância faz esperar", async () => {
    process.env.PODCASTS_PART_POLL_MS = "100";
    const rapido = await listen({ db, storage: files, lessons: lessonFiles, mockScript, tts: { env: { NODE_ENV: "test", CONTENT_HUB_AI_ALLOW_EXTERNAL: "1", OPENAI_API_KEY: OPENAI_KEY }, fetchImpl: (async (url: string, init: any) => {
      oaCalls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      await new Promise((r) => setTimeout(r, 300)); // a voz demora: dá tempo da segunda chamada chegar
      return new Response(silence(400), { status: 200 });
    }) as any } });
    delete process.env.PODCASTS_PART_POLL_MS;
    const start = await post(`${rapido}/${podcastId}/audio/start`, editor, {});
    const before = oaCalls.length;
    const [a, b] = await Promise.all([1, 2].map(() => post(`${rapido}/${podcastId}/audio/part`, editor, { job: start.body.job, index: 0 })));
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body).toEqual(b.body);
    const gastas = oaCalls.length - before;
    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, "podcasts", `podcasts/${podcastId}/tmp/${start.body.job}/manifest.json`), "utf8"));
    expect(gastas).toBe(manifest.parts[0].length); // a OpenAI cobra uma chamada por fala: a parte foi paga uma vez só
    // o marcador "em geração" não fica para trás
    const dir = path.join(tmp, "podcasts", `podcasts/${podcastId}/tmp/${start.body.job}`);
    expect(fs.existsSync(path.join(dir, "part-0.lock"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "part-0.mp3"))).toBe(true);
    // outra instância está gerando a parte 0 (marcador recente, sem os arquivos): esta espera os arquivos aparecerem e não chama a voz
    const mp3 = fs.readFileSync(path.join(dir, "part-0.mp3"));
    const json = fs.readFileSync(path.join(dir, "part-0.json"));
    fs.rmSync(path.join(dir, "part-0.mp3"));
    fs.rmSync(path.join(dir, "part-0.json"));
    fs.writeFileSync(path.join(dir, "part-0.lock"), JSON.stringify({ at: Date.now() }));
    setTimeout(() => {
      fs.writeFileSync(path.join(dir, "part-0.json"), json);
      fs.writeFileSync(path.join(dir, "part-0.mp3"), mp3);
    }, 700);
    const total = oaCalls.length;
    const esperou = await post(`${rapido}/${podcastId}/audio/part`, editor, { job: start.body.job, index: 0 });
    expect(esperou.status).toBe(200);
    expect(esperou.body).toEqual(a.body);
    expect(oaCalls.length).toBe(total);
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
    // o aluno não lê o nome do arquivo enviado: PDF vira "Documento 1" (a posição da fonte); o DOCX foi renomeado pela equipe
    expect(ep.sources.find((s: any) => s.kind === "pdf")).toMatchObject({ title: "Documento 1", pages: [1] });
    expect(ep.sources.some((s: any) => /PCDT pré-eclâmpsia\.pdf|eclampsia\.docx/.test(s.title))).toBe(false);
    expect(ep.sources.find((s: any) => s.kind === "docx")?.title).toBe("Resumo de eclâmpsia da equipe");
    expect((await call(`${base}/${podcastId}/audio/link`, student)).body).toEqual({ url: null });
    expect((await call(`${base}/${podcastId}/audio/file`, student)).status).toBe(200);
    // publicado não aceita mudança de fonte nem de roteiro
    expect((await post(`${base}/${podcastId}/sources/text`, editor, { title: "x", text: "y".repeat(100) })).status).toBe(400);
    await expect(rpc(EDITOR, "app_admin_podcast_save_script", { p_id: podcastId, p_script: { lines: ep.lines } })).rejects.toThrow(/Despublique/);
  });

  it("Flashcast: só o administrador, com confirmação e com o episódio publicado; o MP3 vira o áudio da aula ligada", async () => {
    const lessonMaterials = async () => (await dev.db.query<any>(`select count(*)::int n from public.lesson_materials where lesson_id = $1 and kind = 'flashcast'`, [lessonId])).rows[0].n;
    // editor não copia áudio para a aula (nem com confirmação); aluno também não
    expect((await post(`${base}/${podcastId}/flashcast`, editor, { confirm: true })).status).toBe(403);
    expect((await post(`${base}/${podcastId}/flashcast`, student, { confirm: true })).status).toBe(403);
    expect(await lessonMaterials()).toBe(0);
    // administrador sem confirmar: nada acontece
    const semConfirmar = await post(`${base}/${podcastId}/flashcast`, admin, {});
    expect(semConfirmar.status).toBe(400);
    expect(semConfirmar.body.error).toMatch(/confirm/i);
    expect(await lessonMaterials()).toBe(0);
    // episódio não publicado: recusa, mesmo para o administrador
    await rpc(ADMIN, "app_admin_podcast_publish", { p_id: podcastId, p_published: false });
    const naoPublicado = await post(`${base}/${podcastId}/flashcast`, admin, { confirm: true });
    expect(naoPublicado.status).toBe(409);
    expect(naoPublicado.body.error).toMatch(/publicado/);
    expect(await lessonMaterials()).toBe(0);
    await rpc(ADMIN, "app_admin_podcast_publish", { p_id: podcastId, p_published: true });
    // administrador, confirmado e publicado: copia
    const r = await post(`${base}/${podcastId}/flashcast`, admin, { confirm: true });
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
