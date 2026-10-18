// @vitest-environment node
/**
 * Lista de interesse da 2ª fase (013960): as rotas /api/interesse de verdade (Express) contra o banco local (PGlite) e a fila de e-mail
 * (/api/legal: enviarFila com um "carteiro" falso, sem rede):
 *   - formulário com JS (JSON) e sem JS (formulário comum → página simples), mesma resposta para número novo e repetido;
 *   - honeypot, caixa de consentimento, WhatsApp e e-mail inválidos, limite por IP (429);
 *   - botão do grupo: só aparece com link configurado; registra o clique e leva ao WhatsApp;
 *   - dupla confirmação do e-mail pelo link do e-mail (abrir não confirma; o botão confirma: "Pronto, avisaremos…");
 *   - sair da lista (um clique + confirmação) pelo link do e-mail;
 *   - Administração: visitante (401), aluno e editor (403) barrados; administrador vê resumo e lista, exporta CSV (com WhatsApp,
 *     fórmula neutralizada), grava o link do grupo (só https://chat.whatsapp.com/…), vê a prévia do aviso e avisa uma vez só.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import http from "node:http";
import type net from "node:net";
import express from "express";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { createInteresseRouter, celulaCsv } from "../../server/interesse/router";
import { enviarFila } from "../../server/legal/router";
import { renderItem } from "../../server/legal/emails";
import type { Mailer, MailMessage } from "../../server/email/smtp";
import { CONSENTIMENTO_VERSAO, montarWhatsapp, resumirNavegador } from "../../server/interesse/consentimento";

const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "lista-interesse-rota-"));
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ALUNO, ADMIN, EDITOR] = [81, 82, 83].map(uid);
const LINK = "https://chat.whatsapp.com/DNC7gB0Yku2ARNf0f55Abc";
const BASE = "https://app.exemplo.test";
let dev: DevDatabase;
let db: ContentDb;
let srv: http.Server;
let url = "";
const tokens: Record<string, string> = {};
const enviados: MailMessage[] = [];
const carteiro: Mailer = { from: "nao-responda@staziamed.com.br", async send(m) {
  enviados.push(m);
} };

const q = async (sql: string, args: unknown[] = []) => (await dev.db.query<any>(sql, args)).rows;
const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
let ipN = 1;
const novoIp = () => `10.0.${Math.floor(ipN / 250)}.${ipN++ % 250}`;
const postJson = (body: Record<string, unknown>, ip = novoIp()) =>
  fetch(`${url}/api/interesse`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "x-real-ip": ip, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Safari/604.1" }, body: JSON.stringify(body) });
const postForm = (body: Record<string, string>, ip = novoIp()) =>
  fetch(`${url}/api/interesse`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": ip }, body: new URLSearchParams(body).toString(), redirect: "manual" });
const valido = (o: Record<string, unknown> = {}) => ({ pais: "55", whatsapp: "(11) 98888-0001", nome: "", email: "", consentimento: "sim", versao: CONSENTIMENTO_VERSAO, website: "", origem: "site_inicio", ...o });
const admin = (p: string, init: RequestInit = {}, quem = ADMIN) =>
  fetch(`${url}/api/interesse/admin${p}`, { ...init, headers: { ...(init.headers ?? {}), ...(quem ? { authorization: `Bearer ${tokens[quem]}` } : {}), "content-type": "application/json" } });
const linkDoTexto = (m: MailMessage, pagina: string) => m.text.match(new RegExp(`${BASE}/api/interesse/${pagina}\\?t=([0-9a-f]{64})`))![1];
const linha = (w: string) => q1(`select * from public.lista_interesse where whatsapp = $1`, [w]);

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const [i, u] of [ALUNO, ADMIN, EDITOR].entries()) {
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `rota${i}@t.dev`]);
    tokens[u] = await dev.createSession(u);
  }
  await q(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await q(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/interesse", createInteresseRouter({ db, baseUrl: BASE }));
  srv = await new Promise<http.Server>((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  url = `http://127.0.0.1:${(srv.address() as net.AddressInfo).port}`;
}, 300_000);

afterAll(async () => {
  await new Promise((r) => srv?.close(() => r(null)));
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("peças do servidor", () => {
  it("país do seletor + número; navegador resumido; célula do CSV", () => {
    expect(montarWhatsapp("55", "(11) 98765-4321")).toBe("+5511987654321");
    expect(montarWhatsapp("595", "0981 123456")).toBe("+595981123456");
    expect(montarWhatsapp("x", "11987654321")).toBe("11987654321");
    expect(montarWhatsapp("55", "+54 9 11 2345 6789")).toBe("+54 9 11 2345 6789");
    expect(resumirNavegador("Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/129 Mobile Safari/537")).toBe("Chrome · Android");
    expect(resumirNavegador("curl/8.0")).toBe("robô ou programa · outro");
    expect(celulaCsv("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(celulaCsv("+5511987654321")).toBe("'+5511987654321");
    expect(celulaCsv("a;b")).toBe('"a;b"');
  });
});

describe("inscrição pelo site", () => {
  it("JSON: 'Pronto!' sem botão enquanto não há link do grupo; número repetido recebe exatamente a mesma resposta", async () => {
    const a = await postJson(valido());
    expect(a.status).toBe(200);
    const ja = await a.json();
    expect(ja).toEqual({ ok: true, mensagem: "Pronto! Você está na lista de interesse da 2ª fase.", grupo: null });
    expect(a.headers.get("cache-control")).toBe("no-store");
    const b = await postJson(valido({ whatsapp: "+55 11 98888-0001", nome: "Outro" }));
    expect(await b.json()).toEqual(ja);
    expect(await linha("+5511988880001")).toMatchObject({ user_agent: "Safari · iPhone", whatsapp_verificado: false });
    expect((await linha("+5511988880001")).ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("com link do grupo: a resposta traz o botão; o botão registra o clique e leva ao WhatsApp", async () => {
    const s = await admin("/grupo", { method: "POST", body: JSON.stringify({ link: LINK }) });
    expect(s.status).toBe(200);
    const r = await (await postJson(valido({ whatsapp: "(11) 98888-0002" }))).json();
    expect(r.grupo).toMatch(/^\/api\/interesse\/grupo\?t=[0-9a-f]{64}$/);
    const g = await fetch(url + r.grupo, { redirect: "manual" });
    expect(g.status).toBe(302);
    expect(g.headers.get("location")).toBe(LINK);
    expect(g.headers.get("referrer-policy")).toBe("no-referrer");
    expect((await linha("+5511988880002")).grupo_clicado_em).toBeTruthy();
    expect((await fetch(`${url}/api/interesse/grupo?t=${"a".repeat(64)}`, { redirect: "manual" })).status).toBe(404);
    expect((await fetch(`${url}/api/interesse/grupo?t=nada`, { redirect: "manual" })).status).toBe(400);
  });

  it("sem JS (formulário comum): página simples 'Pronto!' com o botão do grupo em outra aba", async () => {
    const r = await postForm(valido({ whatsapp: "21 98888-0003", email: "semjs@exemplo.com" }) as Record<string, string>);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/html/);
    const html = await r.text();
    expect(html).toContain("Pronto!");
    expect(html).toContain("Entrar no grupo do WhatsApp");
    expect(html).toMatch(/href="\/api\/interesse\/grupo\?t=[0-9a-f]{64}" target="_blank" rel="noopener noreferrer"/);
    expect(html).toContain("mandamos um link para confirmar");
    expect(html).not.toMatch(/<script/i);
    expect(await linha("+5521988880003")).toMatchObject({ email: "semjs@exemplo.com", email_estado: "pendente" });
  });

  it("honeypot preenchido: resposta igual de sucesso e nada gravado", async () => {
    const r = await postJson(valido({ whatsapp: "(11) 98888-0004", website: "http://spam.example" }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, mensagem: "Pronto! Você está na lista de interesse da 2ª fase." });
    expect(await linha("+5511988880004")).toBeUndefined();
    const f = await postForm(valido({ whatsapp: "(11) 98888-0004", website: "x" }) as Record<string, string>);
    expect(await f.text()).toContain("Pronto!");
    expect(await linha("+5511988880004")).toBeUndefined();
  });

  it("sem consentimento, WhatsApp ou e-mail inválido: 400 com a mensagem em português (JSON e página)", async () => {
    const semCaixa = await postJson(valido({ whatsapp: "(11) 98888-0005", consentimento: "" }));
    expect(semCaixa.status).toBe(400);
    expect((await semCaixa.json()).error).toMatch(/caixa de consentimento/);
    const zap = await postJson(valido({ whatsapp: "1234" }));
    expect(zap.status).toBe(400);
    expect((await zap.json()).error).toMatch(/WhatsApp com DDD/);
    const mail = await postJson(valido({ whatsapp: "(11) 98888-0006", email: "nao-e-email" }));
    expect(mail.status).toBe(400);
    expect((await mail.json()).error).toMatch(/Confira o e-mail/);
    const pagina = await postForm(valido({ whatsapp: "1234" }) as Record<string, string>);
    expect(pagina.status).toBe(400);
    expect(await pagina.text()).toContain("Falta um detalhe");
    expect(await linha("+5511988880005")).toBeUndefined();
  });

  it("limite por IP (no banco): a 11ª tentativa em 10 minutos recebe 429", async () => {
    const ip = "192.0.2.77";
    for (let i = 0; i < 10; i++) expect((await postJson(valido({ whatsapp: `(11) 97000-00${String(i).padStart(2, "0")}` }), ip)).status).toBe(200);
    const r = await postJson(valido({ whatsapp: "(11) 97000-0099" }), ip);
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("600");
    expect((await r.json()).error).toMatch(/Muitas tentativas/);
  });
});

describe("e-mail: dupla confirmação e sair", () => {
  it("o e-mail de confirmação sai pela fila com o link; abrir não confirma; o botão confirma: 'Pronto, avisaremos…'", async () => {
    await postJson(valido({ whatsapp: "(11) 98888-0010", email: "Joana@Exemplo.com", nome: "Joana Lima" }));
    enviados.length = 0;
    const r = await enviarFila({ db, mailer: carteiro, baseUrl: BASE });
    const m = enviados.find((e) => e.to === "joana@exemplo.com")!;
    expect(r.enviados).toBeGreaterThanOrEqual(1);
    expect(m.subject).toBe("Confirme seu e-mail para o aviso da 2ª fase · StaziaMed");
    expect(m.text).toContain("Olá, Joana!");
    expect(m.html).toContain("Confirmar meu e-mail");
    const t = linkDoTexto(m, "confirmar");
    const abrir = await fetch(`${url}/api/interesse/confirmar?t=${t}`);
    expect(await abrir.text()).toContain("Confirmar meu e-mail");
    expect((await linha("+5511988880010")).email_estado).toBe("pendente");
    const ok = await fetch(`${url}/api/interesse/confirmar?t=${t}`, { method: "POST" });
    const html = await ok.text();
    expect(html).toContain("Pronto, avisaremos quando a 2ª fase abrir");
    expect(html).toContain("Entrar no grupo do WhatsApp");
    expect((await linha("+5511988880010")).email_estado).toBe("confirmado");
    expect((await fetch(`${url}/api/interesse/confirmar?t=${"b".repeat(64)}`)).status).toBe(404);
  });

  it("sair pelo link do e-mail: abrir mostra a confirmação; o POST tira da lista", async () => {
    await postJson(valido({ whatsapp: "(11) 98888-0011", email: "sai@exemplo.com" }));
    enviados.length = 0;
    await enviarFila({ db, mailer: carteiro, baseUrl: BASE });
    const m = enviados.find((e) => e.to === "sai@exemplo.com")!;
    const t = linkDoTexto(m, "sair");
    expect(await (await fetch(`${url}/api/interesse/sair?t=${t}`)).text()).toContain("Confirmar: quero sair da lista");
    expect((await linha("+5511988880011")).estado).toBe("ativo");
    expect(await (await fetch(`${url}/api/interesse/sair?t=${t}`, { method: "POST" })).text()).toContain("Pronto, você saiu da lista");
    expect((await linha("+5511988880011")).estado).toBe("descadastrado");
    expect(await (await fetch(`${url}/api/interesse/sair?t=${t}`)).text()).toContain("Você já saiu da lista");
  });
});

describe("Administração", () => {
  it("visitante 401, aluno e editor 403 em todas as rotas; nada muda", async () => {
    const rotas: [string, RequestInit][] = [
      ["/resumo", {}], ["/lista", {}], ["/csv", {}], ["/aviso/previa", {}],
      ["/grupo", { method: "POST", body: JSON.stringify({ link: "" }) }], ["/tirar", { method: "POST", body: JSON.stringify({ id: 1 }) }],
      ["/aviso", { method: "POST", body: JSON.stringify({ esperado: 1 }) }],
    ];
    for (const [p, init] of rotas) {
      expect((await admin(p, init, "")).status, `anon ${p}`).toBe(401);
      expect((await admin(p, init, ALUNO)).status, `aluno ${p}`).toBe(403);
      expect((await admin(p, init, EDITOR)).status, `editor ${p}`).toBe(403);
    }
    expect((await q1(`select grupo_link from public.lista_interesse_config`)).grupo_link).toBe(LINK);
  });

  it("administrador: resumo e lista com busca", async () => {
    const r = await (await admin("/resumo")).json();
    expect(r.total).toBeGreaterThan(5);
    expect(r.grupo.link).toBe(LINK);
    const l = await (await admin(`/lista?busca=${encodeURIComponent("98888-0010")}`)).json();
    expect(l.itens).toHaveLength(1);
    expect(l.itens[0]).toMatchObject({ whatsapp: "+5511988880010", email: "joana@exemplo.com", email_estado: "confirmado", nome: "Joana Lima" });
  });

  it("link do grupo: recusa o que não é convite do WhatsApp (inclusive com ?s=…)", async () => {
    for (const link of ["https://chat.whatsapp.com/DNC7gB0Yku2ARNf0f55USz?s=cl&p=a", "https://evil.example/x", "javascript:alert(1)"]) {
      const r = await admin("/grupo", { method: "POST", body: JSON.stringify({ link }) });
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/chat\.whatsapp\.com/);
    }
    expect((await q1(`select grupo_link from public.lista_interesse_config`)).grupo_link).toBe(LINK);
  });

  it("CSV: WhatsApp, e-mail e clique no grupo; separador ';' com BOM; fórmula neutralizada", async () => {
    await postJson(valido({ whatsapp: "(11) 98888-0020", nome: "=CMD()" }));
    const r = await admin("/csv");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/csv/);
    expect(r.headers.get("content-disposition")).toMatch(/attachment; filename="lista-interesse-2a-fase-\d{4}-\d{2}-\d{2}\.csv"/);
    const bytes = Buffer.from(await r.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM: o Excel abre com acento certo
    const csv = bytes.toString("utf8");
    expect(csv).toContain("WhatsApp;WhatsApp verificado;Nome;E-mail");
    expect(csv).toContain("'+5511988880010;não;Joana Lima;joana@exemplo.com;confirmado;na lista");
    expect(csv).toContain("'=CMD()");
    expect(csv).not.toMatch(/;=CMD/);
    expect((await q1(`select count(*)::int n from public.admin_audit_log where action = 'interesse.exportar'`)).n).toBe(1);
  });

  it("aviso por e-mail: prévia com o e-mail que vai sair; confirmação com o número; uma vez só; sai pela fila", async () => {
    const p = await (await admin("/aviso/previa")).json();
    expect(p.destinatarios).toBe(1);
    expect(p.email.assunto).toBe("A 2ª fase do StaziaMed abriu");
    expect(p.email.html).toContain("grupo do WhatsApp");
    expect((await admin("/aviso", { method: "POST", body: JSON.stringify({ esperado: 2 }) })).status).toBe(400);
    expect((await admin("/aviso", { method: "POST", body: JSON.stringify({}) })).status).toBe(400);
    const ok = await admin("/aviso", { method: "POST", body: JSON.stringify({ esperado: 1 }) });
    expect(await ok.json()).toEqual({ emails: 1 });
    const de_novo = await admin("/aviso", { method: "POST", body: JSON.stringify({ esperado: 1 }) });
    expect(de_novo.status).toBe(400);
    expect((await de_novo.json()).error).toMatch(/ninguém/);
    enviados.length = 0;
    await enviarFila({ db, mailer: carteiro, baseUrl: BASE });
    expect(enviados.map((e) => e.to)).toEqual(["joana@exemplo.com"]);
    expect(enviados[0].subject).toBe("A 2ª fase do StaziaMed abriu");
    expect(enviados[0].headers?.["List-Unsubscribe"]).toMatch(/^<https:\/\/app\.exemplo\.test\/api\/interesse\/sair\?t=[0-9a-f]{64}>$/);
    expect(enviados[0].text).toMatch(/\/api\/interesse\/grupo\?t=[0-9a-f]{64}/);
    expect((await linha("+5511988880010")).email_estado).toBe("avisado");
  });

  it("tirar da lista pela Administração", async () => {
    const l = await linha("+5511988880020");
    const r = await admin("/tirar", { method: "POST", body: JSON.stringify({ id: l.id }) });
    expect(await r.json()).toMatchObject({ estado: "descadastrado", descadastrado_por: "equipe" });
  });
});

describe("modelos de e-mail", () => {
  it("confirmação e aviso recusam montar sem os códigos (nada sai sem link de sair)", () => {
    const base = { id: 1, tentativas: 1, email: "x@exemplo.com", nome: null };
    expect(() => renderItem({ ...base, kind: "interesse_confirmar", payload: {} }, null)).toThrow();
    expect(() => renderItem({ ...base, kind: "interesse_aviso", payload: {} }, null)).toThrow();
    const a = renderItem({ ...base, kind: "interesse_aviso", payload: { sair: "c".repeat(64), grupo: "d".repeat(64), tem_grupo: false } }, null);
    expect(a.html).not.toContain("grupo do WhatsApp");
    expect(a.text).toContain("Olá!");
  });
});
