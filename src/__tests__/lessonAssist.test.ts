// @vitest-environment node
/**
 * Assistente de IA da "Nova aula" (server/lessons/assist.ts + rotas /api/lessons/assist): só a equipe usa; a IA (simulada aqui)
 * só vê o material enviado; as sugestões voltam com as páginas de origem; número fora do trecho citado vira aviso; nada é
 * gravado na aula. Nenhuma chamada real a IA.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, localStorageDir, type ContentDb } from "../../server/contentHub/infra";
import { createLessonsRouter } from "../../server/lessons/router";
import { buildAssistInput, mockAssistFromInput } from "../../server/lessons/assist";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "assist-"));
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
let dev: DevDatabase;
let db: ContentDb;
const servers: Server[] = [];
let base: string;
let custom: string;
let editor: string;
let student: string;
const seenInputs: string[] = [];

const PAGES = [
  { page: 3, text: "Bronquiolite viral aguda: primeiro episódio de sibilância em menores de 2 anos, geralmente pelo VSR." },
  { page: 4, text: "Tratamento de suporte: oxigênio se saturação abaixo de 90% e hidratação. Broncodilatador não é rotina." },
];

const listen = (mockAssist?: (req: { input: string }) => unknown) =>
  new Promise<string>((resolve) => {
    const app = express();
    app.use(express.json({ limit: "50mb" }));
    app.use(
      "/api/lessons",
      createLessonsRouter({
        db,
        storage: localStorageDir(path.join(tmp, "files")),
        mockAssist: mockAssist as any,
        checkHost: async () => {},
        fetchImpl: (async () => new Response("<html><head><title>Diretriz</title></head><body><p>Bronquiolite: suporte é a base do tratamento, com oxigênio quando a saturação cai.</p></body></html>", { status: 200, headers: { "content-type": "text/html" } })) as any,
      })
    );
    const srv = app.listen(0, () => resolve(`http://127.0.0.1:${(srv.address() as any).port}/api/lessons`));
    servers.push(srv);
  });
const call = async (url: string, token: string, body?: unknown) => {
  const r = await fetch(url, body === undefined ? { headers: { Authorization: `Bearer ${token}` } } : { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  await dev.db.query(`insert into auth.users (id, email) values ($1, 'ed@t.dev'), ($2, 'al@t.dev')`, [EDITOR, STUDENT]);
  await dev.db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  base = await listen();
  // "IA" que inventa uma dose (2 mg/kg não está no material) e cita trecho que não existe
  custom = await listen((req) => {
    seenInputs.push(req.input);
    return {
      title: "Bronquiolite viral aguda",
      topic: "Bronquiolite",
      area: "PEDIATRIA",
      summary: "Quadro de sibilância no lactente; o tratamento é de suporte.",
      summary_sources: [1, 2],
      key_points: [
        { text: "Oxigênio se saturação abaixo de 90%.", sources: [2] },
        { text: "Corticoide 2 mg/kg ajuda.", sources: [2] },
        { text: "Ponto sem fonte.", sources: [42] },
      ],
      missing: ["Critérios de internação não aparecem no material."],
    };
  });
  editor = await dev.createSession(EDITOR);
  student = await dev.createSession(STUDENT);
}, 300_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Assistente da aula", () => {
  it("só a equipe; as três IAs aparecem com o motivo quando faltam (e a simulação fora de produção)", async () => {
    expect((await call(`${base}/assist/providers`, student)).status).toBe(403);
    const list = (await call(`${base}/assist/providers`, editor)).body;
    expect(list.map((p: any) => p.kind)).toEqual(["gemini", "anthropic", "openai", "mock"]);
    expect(list.find((p: any) => p.kind === "mock")).toMatchObject({ ready: true, label: "Simulação (sem IA)" });
    expect((await call(`${base}/assist`, student, { provider: "mock", text: "x".repeat(200) })).status).toBe(403);
  });

  it("material obrigatório e com texto; provedor só da lista", async () => {
    expect((await call(`${base}/assist`, editor, { provider: "mock" })).status).toBe(400);
    expect((await call(`${base}/assist`, editor, { provider: "outra", text: "x".repeat(200) })).status).toBe(400);
    expect((await call(`${base}/assist`, editor, { provider: "mock", text: "curto" })).status).toBe(422);
    expect((await call(`${base}/assist`, editor, { provider: "mock", text: "a".repeat(400_001) })).status).toBe(413);
  });

  it("PDF lido no navegador (texto por página): sugestões com as páginas de origem; nada gravado na aula", async () => {
    const r = await call(`${base}/assist`, editor, { provider: "mock", pages: PAGES, topic: "Bronquiolite", area: "PEDIATRIA" });
    expect(r.status).toBe(200);
    expect(r.body.suggestion).toMatchObject({ topic: "Bronquiolite", area: "PEDIATRIA", summary_pages: [3, 4] });
    expect(r.body.suggestion.key_points).toEqual([
      { text: "Bronquiolite viral aguda: primeiro episódio de sibilância em menores de 2 anos, geralmente pelo VSR.", sources: [1], pages: [3] },
      { text: "Tratamento de suporte: oxigênio se saturação abaixo de 90% e hidratação.", sources: [2], pages: [4] },
    ]);
    expect(r.body.warnings).toEqual([]);
    expect(r.body.usage).toMatchObject({ provider: "mock" });
    expect((await dev.db.query<any>(`select count(*)::int n from public.lessons`)).rows[0].n).toBe(0);
    expect((await dev.db.query<any>(`select count(*)::int n from public.ai_usage_ledger`)).rows[0].n).toBe(0); // simulação não custa
  });

  it("número fora do trecho citado e ponto sem fonte viram aviso; o que falta no material volta como lista", async () => {
    const r = await call(`${custom}/assist`, editor, { provider: "mock", pages: PAGES, instructions: "foque em conduta" });
    expect(r.status).toBe(200);
    expect(r.body.warnings).toEqual(['Ponto-chave 2: "2 mg" não está nos trechos citados.', "Ponto-chave 3 sem trecho citado."]);
    expect(r.body.suggestion.key_points[2]).toEqual({ text: "Ponto sem fonte.", sources: [], pages: [] });
    expect(r.body.suggestion.missing).toEqual(["Critérios de internação não aparecem no material."]);
    // a IA recebeu só o material, numerado com a página, e o pedido da equipe
    expect(seenInputs[0]).toContain("[T1] (página 3)\nBronquiolite viral aguda");
    expect(seenInputs[0]).toContain("Pedido da equipe: foque em conduta");
  });

  it("texto colado e link (página vira texto) também servem de material", async () => {
    const t = await call(`${base}/assist`, editor, { provider: "mock", text: PAGES.map((p) => p.text).join("\n\n") });
    expect(t.status).toBe(200);
    expect(t.body.suggestion.key_points[0].pages).toEqual([]);
    const l = await call(`${base}/assist`, editor, { provider: "mock", url: "https://www.gov.br/saude/bronquiolite" });
    expect(l.status).toBe(200);
    expect(l.body.suggestion.key_points[0].text).toContain("suporte é a base do tratamento");
    expect((await call(`${base}/assist`, editor, { provider: "mock", url: "http://inseguro" })).status).toBe(400);
  });

  it("entrada da IA: material numerado e o que a equipe já preencheu", () => {
    const input = buildAssistInput({ chunks: [{ id: 1, source: "Material", doc: 1, page: 2, text: "Texto." }], title: "Aula X", topic: "Tema Y", area: "PEDIATRIA" });
    expect(input).toContain("Grande área informada pela equipe: PEDIATRIA");
    expect(input).toContain("<material>\n[T1] (página 2)\nTexto.\n</material>");
    expect(mockAssistFromInput(input)).toMatchObject({ topic: "Tema Y", area: "PEDIATRIA", key_points: [{ text: "Texto.", sources: [1] }] });
  });
});
