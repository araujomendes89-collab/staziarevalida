// @vitest-environment node
/**
 * Lista de interesse da 2ª fase (migração 013960) no banco local (PGlite, todas as migrações do ramo, na ordem da produção):
 *   - inscrever: WhatsApp obrigatório em E.164 (Brasil com DDD; Paraguai, Bolívia, Argentina e outros com o código), único por fase e
 *     "não verificado"; e-mail opcional; prova do consentimento (texto exato, versão, data); IP só como código; mesma resposta para
 *     número novo e repetido; ninguém muda a inscrição de outra pessoa; limites por IP, por e-mail e teto geral (contados no banco);
 *   - dupla confirmação SÓ do e-mail: abrir o link não confirma (precisa do botão); link vencido não vale; sem e-mail, nada sai;
 *   - grupo do WhatsApp: link na configuração (só convite do WhatsApp), clique registrado;
 *   - sair: um clique + confirmação; cancela o que não saiu; voltar depois é inscrição nova;
 *   - fila de serviço: confirmação e aviso saem pela email_saida (sem conta), na ordem certa, com o limite do dia; "avisado" quando sai;
 *   - Administração: resumo por dia, lista com busca (WhatsApp, e-mail, nome), exportar (registrado), link do grupo, tirar da lista,
 *     avisar por e-mail só confirmados e uma vez só;
 *   - SEGURANÇA: aluno, editor e visitante são barrados nas funções da Administração; ninguém lê ou grava as tabelas direto; as
 *     funções do servidor (ch_worker_*) não abrem para aluno nem visitante;
 *   - a migração pode ser colada duas vezes, desfeita e colada de novo (conferência OK/FALTA).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { CONSENTIMENTO_TEXTO, CONSENTIMENTO_VERSAO, montarWhatsapp } from "../../server/interesse/consentimento";

const ROOT = path.resolve(__dirname, "../..");
const MIGRACAO = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003013960_lista_interesse.sql"), "utf8");
const DESFAZER = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013960_lista_interesse.desfazer.sql"), "utf8");
const CONFERIR = fs.readFileSync(path.join(ROOT, "supabase/conferir/lista-interesse.sql"), "utf8");
const OK = "OK: Lista de interesse da 2ª fase (013960) no banco";
const LINK = "https://chat.whatsapp.com/AbCdEfGhIj0123456789xy";

const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "lista-interesse-"));
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ALUNO, ADMIN, EDITOR] = [91, 92, 93].map(uid);
let dev: DevDatabase;
let db: ContentDb;

const q = async (sql: string, args: unknown[] = []) => (await dev.db.query<any>(sql, args)).rows;
const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
const rpc = <T = any>(user: string, fn: string, args: Record<string, unknown> = {}) => db.asUser<T>({ id: user, email: null }, fn, args);
const svc = <T = any>(fn: string, args: Record<string, unknown> = {}) => db.service<T>(fn, args);
const comoPapel = (papel: "anon" | "authenticated", sql: string, args: unknown[] = [], user: string | null = null) =>
  dev.db.transaction(async (tx) => {
    await tx.exec(`set local role ${papel}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(user ? { sub: user, role: papel } : { role: papel })]);
    return (await tx.query<any>(sql, args)).rows;
  });
const recusa = async (p: Promise<unknown>) => {
  try {
    await p;
    return "passou";
  } catch (e) {
    return (e as Error).message;
  }
};
const hex = (c: string) => c.repeat(64);
let ipN = 0;
/** cada chamada com um IP novo (o limite por IP tem teste próprio) */
const novoIp = () => (ipN++).toString(16).padStart(64, "a");
let telN = 0;
/** um celular do Brasil novo a cada chamada */
const novoTel = () => `+55119${String(10000000 + telN++).slice(-8)}`;
const inscrever = (whatsapp: string, o: Record<string, unknown> = {}) =>
  svc("ch_worker_interesse_inscrever", { p_whatsapp: whatsapp, p_email: null, p_nome: null, p_origem: "site_inicio", p_utm: null, p_versao: CONSENTIMENTO_VERSAO, p_ip_hash: novoIp(), p_user_agent: "Chrome · Android", ...o });
const porTel = (w: string) => q1(`select * from public.lista_interesse where whatsapp = $1`, [w]);
const porEmail = (e: string) => q1(`select * from public.lista_interesse where email = $1`, [e]);
const filaDe = (id: number) => q(`select * from public.email_saida where interessado_id = $1 order by id`, [id]);
/** passa o relógio da fila: e-mails "ficam velhos" (o limite por e-mail olha as últimas 24 h e o intervalo de 2 min) */
const envelhecerFila = (id: number, intervalo: string) =>
  q(`update public.email_saida set created_at = created_at - $2::interval where interessado_id = $1`, [id, intervalo]);
/** manda tudo o que está na fila (como /api/legal/email com o servidor de e-mail aceitando) e devolve o que saiu */
async function esvaziarFila() {
  const saiu: any[] = [];
  for (;;) {
    const lote = (await svc<any[]>("ch_worker_email_pegar", { p_limite: 20 })) ?? [];
    if (!lote.length) break;
    for (const it of lote) {
      saiu.push(it);
      await svc("ch_worker_email_marcar", { p_id: it.id, p_resultado: "enviado", p_erro: null });
    }
  }
  return saiu;
}
/** inscreve com e-mail, pega a confirmação na fila e confirma (o caminho completo da pessoa) */
async function inscreverEConfirmar(email: string, nome: string | null = null) {
  const tel = novoTel();
  await inscrever(tel, { p_email: email, p_nome: nome });
  const it = (await esvaziarFila()).find((x) => x.email === email && x.kind === "interesse_confirmar");
  expect(await svc("ch_worker_interesse_confirmar", { p_token: it.payload.confirmar, p_confirmar: true })).toMatchObject({ valido: true, email_estado: "confirmado" });
  return tel;
}

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const [i, u] of [ALUNO, ADMIN, EDITOR].entries()) await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `li${i}@t.dev`]);
  await q(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await q(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
}, 300_000);

afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("migração e validação", () => {
  it("conferência OK; o texto do consentimento do banco é o mesmo do site", async () => {
    expect((await q1(CONFERIR)).resultado).toBe(OK);
    expect((await q1(`select public.lista_interesse_consentimento($1) as t`, [CONSENTIMENTO_VERSAO])).t).toBe(CONSENTIMENTO_TEXTO);
    expect(CONSENTIMENTO_TEXTO).toBe("Quero receber avisos da 2ª fase do StaziaMed pelo WhatsApp (e por e-mail, se informei). Posso sair a qualquer momento.");
  });

  it("WhatsApp normalizado em E.164 (Brasil e de fora); o que não é número válido é recusado", async () => {
    const casos: [string, string | null][] = [
      ["(11) 98765-4321", "+5511987654321"],
      ["11987654321", "+5511987654321"],
      ["011 98765-4321", "+5511987654321"],
      ["+55 11 98765-4321", "+5511987654321"],
      ["55 11 98765 4321", "+5511987654321"],
      ["(61) 3333-4444", "+556133334444"],
      ["+595 981 123456", "+595981123456"],
      ["+591 71234567", "+59171234567"],
      ["+54 9 11 2345-6789", "+5491123456789"],
      ["0054 9 11 2345 6789", "+5491123456789"],
      ["+1 415 555 0100", "+14155550100"],
      ["(11) 8765-4321", null], // 8 dígitos começando com 8: nem fixo nem celular
      ["(01) 98765-4321", null], // DDD com zero
      ["98765-4321", null], // sem DDD
      ["595981123456", null], // de fora sem + : não dá para saber o país
      ["+55 11 98765-4321 ramal 2", null],
      ["11+987654321", null],
      ["", null],
      ["+0 1234567", null],
    ];
    for (const [entrada, esperado] of casos) {
      expect((await q1(`select public.lista_interesse_whatsapp($1) as w`, [entrada])).w, entrada).toBe(esperado);
    }
    // o servidor junta o país do seletor e o número: o banco normaliza do mesmo jeito
    const w = async (pais: string, n: string) => (await q1(`select public.lista_interesse_whatsapp($1) as w`, [montarWhatsapp(pais, n)])).w;
    expect(await w("55", "(11) 98765-4321")).toBe("+5511987654321");
    expect(await w("55", "5511987654321")).toBe("+5511987654321");
    expect(await w("595", "0981 123456")).toBe("+595981123456");
    expect(await w("591", "71234567")).toBe("+59171234567");
    expect(await w("54", "9 11 2345-6789")).toBe("+5491123456789");
    expect(await w("outro", "+351 912 345 678")).toBe("+351912345678");
    expect(await w("outro", "912 345 678")).toBeNull();
  });
});

describe("inscrever", () => {
  it("só WhatsApp: grava normalizado, não verificado, sem e-mail e sem nada na fila; devolve o código do grupo", async () => {
    const ip = hex("b");
    const r = await inscrever("(21) 99876-5432", { p_nome: "  Maria   da Silva ", p_utm: { utm_source: "instagram", utm_campaign: "fase2", outro: "x" }, p_ip_hash: ip, p_user_agent: "Safari · iPhone" });
    expect(r).toMatchObject({ resultado: "ok", acao: "novo", email: "sem_email" });
    expect(r.grupo).toMatch(/^[0-9a-f]{64}$/);
    const l = await porTel("+5521998765432");
    expect(l).toMatchObject({
      fase: "2a_fase", whatsapp_verificado: false, nome: "Maria da Silva", email: null, email_estado: "sem_email", estado: "ativo",
      origem: "site_inicio", utm: { utm_source: "instagram", utm_campaign: "fase2" },
      consentimento_texto: CONSENTIMENTO_TEXTO, consentimento_versao: CONSENTIMENTO_VERSAO, ip_hash: ip, user_agent: "Safari · iPhone",
      token_grupo: r.grupo, token_confirmar: null,
    });
    expect(l.consentimento_em).toBeTruthy();
    expect(await filaDe(l.id)).toHaveLength(0);
  });

  it("com e-mail: e-mail normalizado, pendente, confirmação na fila (sem conta)", async () => {
    const r = await inscrever("+595 981 123456", { p_email: "  Ana.Souza@Exemplo.COM " });
    expect(r).toMatchObject({ resultado: "ok", acao: "novo", email: "enviado" });
    const l = await porTel("+595981123456");
    expect(l).toMatchObject({ email: "ana.souza@exemplo.com", email_estado: "pendente" });
    expect(l.token_confirmar).toMatch(/^[0-9a-f]{64}$/);
    expect(l.token_sair).not.toBe(l.token_confirmar);
    const fila = await filaDe(l.id);
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({ kind: "interesse_confirmar", user_id: null, status: "pendente" });
  });

  it("número repetido (qualquer forma) não duplica, a resposta é igual e nada muda (nome, e-mail confirmado)", async () => {
    const a = await inscrever("(31) 99999-0001", { p_nome: "Primeiro" });
    const b = await inscrever("+55 31 99999-0001", { p_nome: "Outro nome" });
    expect(b).toMatchObject({ resultado: "ok", acao: "ja_na_lista", grupo: a.grupo });
    expect((await q1(`select count(*)::int n from public.lista_interesse where whatsapp = '+5531999990001'`)).n).toBe(1);
    expect((await porTel("+5531999990001")).nome).toBe("Primeiro");
  });

  it("inscrição sem e-mail pode GANHAR um e-mail depois (com confirmação); um e-mail diferente do já informado é ignorado", async () => {
    await inscrever("(41) 99999-0002");
    expect(await inscrever("(41) 99999-0002", { p_email: "depois@exemplo.com" })).toMatchObject({ acao: "ja_na_lista", email: "enviado" });
    const l = await porTel("+5541999990002");
    expect(l).toMatchObject({ email: "depois@exemplo.com", email_estado: "pendente" });
    await envelhecerFila(l.id, "5 minutes");
    expect(await inscrever("(41) 99999-0002", { p_email: "outro@exemplo.com" })).toMatchObject({ acao: "ja_na_lista", email: "ignorado" });
    expect((await porTel("+5541999990002")).email).toBe("depois@exemplo.com");
    // o mesmo e-mail ainda pendente: pede a confirmação de novo (a anterior que não saiu é trocada)
    expect(await inscrever("(41) 99999-0002", { p_email: "depois@exemplo.com" })).toMatchObject({ email: "enviado" });
    expect((await filaDe(l.id)).map((f: any) => f.status)).toEqual(["cancelado", "pendente"]);
  });

  it("e-mail já usado em OUTRA inscrição: a nova vale só com o WhatsApp (nada revelado)", async () => {
    const r = await inscrever("(51) 99999-0003", { p_email: "ana.souza@exemplo.com" });
    expect(r).toMatchObject({ resultado: "ok", acao: "novo", email: "em_outra_inscricao" });
    expect(await porTel("+5551999990003")).toMatchObject({ email: null, email_estado: "sem_email" });
  });

  it("WhatsApp inválido, e-mail inválido e versão de consentimento desconhecida são recusados (nada gravado)", async () => {
    for (const w of ["", "123", "abc", "(11) 1234"]) expect((await inscrever(w)).resultado).toBe("whatsapp_invalido");
    for (const e of ["semarroba", "a@b", "a b@c.com", "<x>@c.com", "a@@c.com", "a..b@c.com", `${"x".repeat(65)}@c.com`]) {
      expect((await inscrever("(11) 97777-0000", { p_email: e })).resultado).toBe("email_invalido");
    }
    expect((await inscrever("(11) 97777-0000", { p_versao: "v-velha" })).resultado).toBe("versao_invalida");
    expect(await porTel("+5511977770000")).toBeUndefined();
  });

  it("nome com marcação e controle é limpo; utm só com as chaves conhecidas e até 100 letras; origem estranha vira 'site'", async () => {
    await inscrever("(11) 96666-0000", { p_nome: "<b>Zé</b>\u0007 Souza", p_utm: { utm_term: "y".repeat(300), utm_medium: "" }, p_origem: "Origem Inválida!" });
    const l = await porTel("+5511966660000");
    expect(l.nome).toBe("bZé/b Souza");
    expect(l.utm).toEqual({ utm_term: "y".repeat(100) });
    expect(l.origem).toBe("site");
  });

  it("limite por IP (no banco): 10 em 10 minutos", async () => {
    const ip = hex("c");
    for (let i = 0; i < 10; i++) expect((await inscrever(novoTel(), { p_ip_hash: ip })).resultado).toBe("ok");
    const tel = novoTel();
    expect((await inscrever(tel, { p_ip_hash: ip })).resultado).toBe("limite_ip");
    expect(await porTel(tel)).toBeUndefined();
    // passados 10 minutos, volta (o limite de 24 h é 50)
    await q(`update public.lista_interesse_tentativas set em = em - interval '11 minutes' where ip_hash = $1`, [ip]);
    expect((await inscrever(tel, { p_ip_hash: ip })).resultado).toBe("ok");
  });

  it("limite por e-mail: 2 minutos entre confirmações e 3 por dia; passando, a resposta é a mesma e nada sai", async () => {
    const tel = novoTel();
    await inscrever(tel, { p_email: "bomba@exemplo.com" });
    const l = await porTel(tel);
    const de_novo = () => inscrever(tel, { p_email: "bomba@exemplo.com" });
    expect(await de_novo()).toMatchObject({ resultado: "ok", email: "limite_email" });
    await envelhecerFila(l.id, "3 minutes");
    expect(await de_novo()).toMatchObject({ resultado: "ok", email: "enviado" });
    await envelhecerFila(l.id, "3 minutes");
    expect(await de_novo()).toMatchObject({ resultado: "ok", email: "enviado" });
    await envelhecerFila(l.id, "3 minutes");
    expect(await de_novo()).toMatchObject({ resultado: "ok", email: "limite_email" });
    expect(await filaDe(l.id)).toHaveLength(3);
    await envelhecerFila(l.id, "1 day");
    expect((await de_novo()).email).toBe("enviado");
  });

  it("teto geral de confirmações por dia (protege o limite do Google): a inscrição vale, o e-mail não sai agora", async () => {
    const n = (await q1(`select count(*)::int n from public.email_saida where kind = 'interesse_confirmar' and created_at > now() - interval '24 hours'`)).n;
    const base = await porTel("+595981123456");
    await q(`insert into public.email_saida (kind, interessado_id, chave, status) select 'interesse_confirmar', $1, 'teto-' || g, 'enviado' from generate_series(1, $2::int) g`, [base.id, 500 - n]);
    const tel = novoTel();
    expect(await inscrever(tel, { p_email: "teto@exemplo.com" })).toMatchObject({ resultado: "ok", acao: "novo", email: "teto" });
    expect(await filaDe((await porTel(tel)).id)).toHaveLength(0);
    await q(`delete from public.email_saida where chave like 'teto-%'`);
  });
});

describe("dupla confirmação do e-mail, grupo, fila e sair", () => {
  it("o e-mail de confirmação sai pela fila (sem conta) com os links; abrir não confirma; o botão confirma; segundo clique só mostra", async () => {
    const tel = novoTel();
    await inscrever(tel, { p_email: "confirma@exemplo.com", p_nome: "Ana" });
    const it = (await esvaziarFila()).find((x) => x.email === "confirma@exemplo.com");
    expect(it).toMatchObject({ kind: "interesse_confirmar", nome: "Ana", payload: { fase: "2a_fase", tem_grupo: false } });
    for (const k of ["confirmar", "sair", "grupo"]) expect(it.payload[k]).toMatch(/^[0-9a-f]{64}$/);
    expect(await svc("ch_worker_interesse_confirmar", { p_token: it.payload.confirmar, p_confirmar: false })).toMatchObject({ valido: true, email_estado: "pendente" });
    expect((await porTel(tel)).email_estado).toBe("pendente");
    expect(await svc("ch_worker_interesse_confirmar", { p_token: it.payload.confirmar, p_confirmar: true })).toMatchObject({ valido: true, email_estado: "confirmado", grupo: it.payload.grupo });
    const l = await porTel(tel);
    expect(l.email_estado).toBe("confirmado");
    expect(l.email_confirmado_em).toBeTruthy();
    expect(l.whatsapp_verificado).toBe(false);
    expect(await svc("ch_worker_interesse_confirmar", { p_token: it.payload.confirmar, p_confirmar: true })).toMatchObject({ valido: true, email_estado: "confirmado" });
    expect(await inscrever(tel, { p_email: "confirma@exemplo.com" })).toMatchObject({ acao: "ja_na_lista", email: "ja_confirmado" });
  });

  it("código inválido ou vencido (7 dias) não confirma; pedir de novo dá link novo", async () => {
    expect(await svc("ch_worker_interesse_confirmar", { p_token: "x", p_confirmar: true })).toEqual({ valido: false });
    expect(await svc("ch_worker_interesse_confirmar", { p_token: hex("d"), p_confirmar: true })).toEqual({ valido: false });
    const tel = novoTel();
    await inscrever(tel, { p_email: "vencido@exemplo.com" });
    const l = await porTel(tel);
    await q(`update public.lista_interesse set token_confirmar_em = now() - interval '8 days' where id = $1`, [l.id]);
    expect(await svc("ch_worker_interesse_confirmar", { p_token: l.token_confirmar, p_confirmar: true })).toEqual({ valido: false, expirado: true });
    await envelhecerFila(l.id, "1 day");
    await inscrever(tel, { p_email: "vencido@exemplo.com" });
    const l2 = await porTel(tel);
    expect(l2.token_confirmar).not.toBe(l.token_confirmar);
    expect(await svc("ch_worker_interesse_confirmar", { p_token: l2.token_confirmar, p_confirmar: true })).toMatchObject({ valido: true, email_estado: "confirmado" });
  });

  it("grupo: sem link configurado não conta clique; com link, devolve o link e registra o clique", async () => {
    const r = await inscrever(novoTel());
    expect(await svc("ch_worker_interesse_tem_grupo")).toBe(false);
    expect(await svc("ch_worker_interesse_grupo", { p_token: r.grupo })).toEqual({ valido: true, link: null });
    expect(await svc("ch_worker_interesse_grupo", { p_token: hex("9") })).toEqual({ valido: false });
    await rpc(ADMIN, "app_admin_interesse_grupo_salvar", { p_link: LINK });
    expect(await svc("ch_worker_interesse_tem_grupo")).toBe(true);
    expect(await svc("ch_worker_interesse_grupo", { p_token: r.grupo })).toEqual({ valido: true, link: LINK });
    await svc("ch_worker_interesse_grupo", { p_token: r.grupo });
    const l = await q1(`select * from public.lista_interesse where token_grupo = $1`, [r.grupo]);
    expect(l.grupo_cliques).toBe(2);
    expect(l.grupo_clicado_em).toBeTruthy();
  });

  it("sair: abrir não tira; confirmar tira, cancela o que não saiu, tira o e-mail não confirmado e invalida o link; voltar é inscrição nova", async () => {
    const tel = novoTel();
    await inscrever(tel, { p_email: "sair@exemplo.com" });
    const l = await porTel(tel);
    expect(await svc("ch_worker_interesse_sair", { p_token: l.token_sair, p_confirmar: false })).toEqual({ valido: true, inscrito: true });
    expect((await porTel(tel)).estado).toBe("ativo");
    expect(await svc("ch_worker_interesse_sair", { p_token: l.token_sair, p_confirmar: true })).toEqual({ valido: true, inscrito: false });
    const d = await porTel(tel);
    expect(d).toMatchObject({ estado: "descadastrado", descadastrado_por: "link_email", token_confirmar: null, email: null, email_estado: "sem_email" });
    expect((await filaDe(l.id)).map((f: any) => f.status)).toEqual(["cancelado"]);
    expect(await svc("ch_worker_interesse_confirmar", { p_token: l.token_confirmar, p_confirmar: true })).toEqual({ valido: false });
    expect(await svc("ch_worker_interesse_grupo", { p_token: l.token_grupo })).toEqual({ valido: false });
    expect(await svc("ch_worker_interesse_sair", { p_token: l.token_sair, p_confirmar: true })).toEqual({ valido: true, inscrito: false });
    await envelhecerFila(l.id, "3 minutes");
    expect(await inscrever(tel, { p_nome: "Voltei" })).toMatchObject({ resultado: "ok", acao: "voltou", grupo: l.token_grupo });
    expect(await porTel(tel)).toMatchObject({ estado: "ativo", nome: "Voltei", descadastrado_em: null, descadastrado_por: null });
  });

  it("confirmação pendente de quem já confirmou ou saiu não sai mais", async () => {
    const tel = novoTel();
    await inscrever(tel, { p_email: "duplo@exemplo.com" });
    const l = await porTel(tel);
    await svc("ch_worker_interesse_confirmar", { p_token: l.token_confirmar, p_confirmar: true });
    expect((await esvaziarFila()).some((x) => x.email === "duplo@exemplo.com")).toBe(false);
    expect((await filaDe(l.id))[0]).toMatchObject({ status: "cancelado", erro: "E-mail já confirmado ou fora da lista." });
  });

  it("limpeza: e-mail não confirmado em 30 dias sai (o WhatsApp fica); quem saiu é apagado 30 dias depois; tentativas antigas também", async () => {
    const tel = novoTel();
    await inscrever(tel, { p_email: "velho@exemplo.com" });
    const l = await porTel(tel);
    await q(`update public.lista_interesse set token_confirmar_em = now() - interval '31 days' where id = $1`, [l.id]);
    const saiu = await inscreverEConfirmar("saiu-velho@exemplo.com");
    const s = await porTel(saiu);
    await svc("ch_worker_interesse_sair", { p_token: s.token_sair, p_confirmar: true });
    await q(`update public.lista_interesse set descadastrado_em = now() - interval '31 days' where id = $1`, [s.id]);
    await q(`insert into public.lista_interesse_tentativas (ip_hash, em) values ($1, now() - interval '3 days')`, [hex("e")]);
    const r = await svc("ch_worker_interesse_limpar");
    expect(r.emails_nao_confirmados_retirados).toBeGreaterThanOrEqual(1);
    expect(r.descadastrados_apagados).toBeGreaterThanOrEqual(1);
    expect(r.tentativas_apagadas).toBeGreaterThanOrEqual(1);
    expect(await porTel(tel)).toMatchObject({ estado: "ativo", email: null, email_estado: "sem_email", token_confirmar: null });
    expect((await filaDe(l.id)).every((f: any) => f.status !== "pendente")).toBe(true);
    expect(await porTel(saiu)).toBeUndefined();
  });
});

describe("Administração", () => {
  it("link do grupo: só convite do WhatsApp sem nada depois; vazio tira o botão; fica no registro", async () => {
    await expect(rpc(ADMIN, "app_admin_interesse_grupo_salvar", { p_link: "https://chat.whatsapp.com/DNC7gB0Yku2ARNf0f55USz?s=cl" })).rejects.toThrow(/convite de grupo/);
    await expect(rpc(ADMIN, "app_admin_interesse_grupo_salvar", { p_link: "https://evil.com/chat.whatsapp.com/abcdefghijk" })).rejects.toThrow(/convite de grupo/);
    await expect(rpc(ADMIN, "app_admin_interesse_grupo_salvar", { p_link: "http://chat.whatsapp.com/abcdefghijk" })).rejects.toThrow(/convite de grupo/);
    expect(await rpc(ADMIN, "app_admin_interesse_grupo_salvar", { p_link: " " })).toEqual({ link: null });
    expect(await svc("ch_worker_interesse_tem_grupo")).toBe(false);
    expect(await rpc(ADMIN, "app_admin_interesse_grupo_salvar", { p_link: LINK })).toEqual({ link: LINK });
    const log = await q1(`select * from public.admin_audit_log where action = 'interesse.grupo_link' order by id desc limit 1`);
    expect(log).toMatchObject({ actor_id: ADMIN, details: { antes: null, depois: LINK } });
    expect((await rpc(ADMIN, "app_admin_interesse_resumo")).grupo).toMatchObject({ link: LINK });
  });

  it("resumo: totais e por dia (inscrições, e-mails confirmados, cliques no grupo)", async () => {
    const r = await rpc(ADMIN, "app_admin_interesse_resumo", { p_dias: 7 });
    const t = await q1(`select count(*) filter (where estado = 'ativo')::int total, count(*) filter (where estado = 'ativo' and email_estado = 'confirmado')::int conf,
                               count(*) filter (where (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date)::int hoje
                        from public.lista_interesse`);
    expect(r.total).toBe(t.total);
    expect(r.contagem.email_confirmado).toBe(t.conf);
    expect(r.contagem.clicaram_grupo).toBeGreaterThanOrEqual(1);
    expect(r.por_dia).toHaveLength(7);
    expect(r.por_dia[0]).toMatchObject({ inscritos: t.hoje });
    expect(r.por_dia[0].emails_confirmados).toBeGreaterThanOrEqual(2);
    expect(r.por_dia[0].cliques_grupo).toBeGreaterThanOrEqual(1);
    expect(r.a_avisar).toBe(t.conf);
  });

  it("lista com busca por WhatsApp (só dígitos), e-mail ou nome, filtros e página; '%' na busca é letra comum", async () => {
    const a = await rpc(ADMIN, "app_admin_interesse_lista", { p_busca: "(21) 99876" });
    expect(a.itens.map((i: any) => i.whatsapp)).toEqual(["+5521998765432"]);
    expect(a.itens[0]).toMatchObject({ whatsapp_verificado: false, nome: "Maria da Silva", email_estado: "sem_email" });
    for (const k of ["ip_hash", "token_sair", "token_grupo", "token_confirmar", "user_agent"]) expect(a.itens[0]).not.toHaveProperty(k);
    expect((await rpc(ADMIN, "app_admin_interesse_lista", { p_busca: "ANA.SOUZA" })).itens.map((i: any) => i.email)).toEqual(["ana.souza@exemplo.com"]);
    expect((await rpc(ADMIN, "app_admin_interesse_lista", { p_busca: "maria" })).total).toBe(1);
    expect((await rpc(ADMIN, "app_admin_interesse_lista", { p_busca: "%" })).total).toBe(0);
    const cl = await rpc(ADMIN, "app_admin_interesse_lista", { p_filtro: "clicaram_grupo" });
    expect(cl.total).toBeGreaterThanOrEqual(1);
    expect(cl.itens.every((i: any) => i.grupo_clicado_em)).toBe(true);
    const p = await rpc(ADMIN, "app_admin_interesse_lista", { p_limite: 2, p_offset: 0 });
    expect(p.itens).toHaveLength(2);
    expect(p.total).toBeGreaterThan(2);
    await expect(rpc(ADMIN, "app_admin_interesse_lista", { p_filtro: "qualquer" })).rejects.toThrow(/Filtro/);
  });

  it("exportar devolve as linhas com o WhatsApp e fica no registro da Administração", async () => {
    const v = await rpc<any[]>(ADMIN, "app_admin_interesse_exportar", { p_filtro: "ativos" });
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => x.estado === "ativo" && /^\+\d+$/.test(x.whatsapp))).toBe(true);
    const log = await q1(`select * from public.admin_audit_log where action = 'interesse.exportar' order by id desc limit 1`);
    expect(log).toMatchObject({ actor_id: ADMIN, details: { filtro: "ativos", linhas: v.length } });
  });

  it("tirar da lista (pedido pelo WhatsApp): sai, com registro", async () => {
    const tel = novoTel();
    await inscrever(tel);
    const l = await porTel(tel);
    expect(await rpc(ADMIN, "app_admin_interesse_tirar", { p_id: l.id })).toMatchObject({ estado: "descadastrado", descadastrado_por: "equipe" });
    expect((await q1(`select * from public.admin_audit_log where action = 'interesse.tirar' order by id desc limit 1`)).target).toBe(String(l.id));
    await expect(rpc(ADMIN, "app_admin_interesse_tirar", { p_id: 999999 })).rejects.toThrow(/não encontrada/);
  });

  it("avisar por e-mail: prévia, número esperado conferido, só e-mails confirmados, uma vez só; 'avisado' quando sai; quem sai antes não recebe", async () => {
    await esvaziarFila();
    const vaiSair = await inscreverEConfirmar("vai-sair@exemplo.com");
    const pendente = novoTel();
    await inscrever(pendente, { p_email: "so-pendente@exemplo.com" });
    await esvaziarFila();
    const previa = await rpc(ADMIN, "app_admin_interesse_aviso_previa");
    const confirmados = (await q1(`select count(*)::int n from public.lista_interesse where estado = 'ativo' and email_estado = 'confirmado'`)).n;
    expect(previa.destinatarios).toBe(confirmados);
    expect(previa.so_whatsapp).toBeGreaterThan(0);
    await expect(rpc(ADMIN, "app_admin_interesse_avisar", { p_esperado: confirmados + 1 })).rejects.toThrow(/mudou/);
    await expect(rpc(ADMIN, "app_admin_interesse_avisar", { p_esperado: null })).rejects.toThrow(/mudou/);
    expect(await rpc(ADMIN, "app_admin_interesse_avisar", { p_esperado: confirmados })).toEqual({ emails: confirmados });
    expect((await q1(`select * from public.admin_audit_log where action = 'interesse.avisar' order by id desc limit 1`)).details).toMatchObject({ emails: confirmados });
    expect((await rpc(ADMIN, "app_admin_interesse_aviso_previa")).destinatarios).toBe(0);
    await expect(rpc(ADMIN, "app_admin_interesse_avisar", { p_esperado: 0 })).rejects.toThrow(/ninguém/);
    const vs = await porTel(vaiSair);
    await svc("ch_worker_interesse_sair", { p_token: vs.token_sair, p_confirmar: true });
    const avisos = (await esvaziarFila()).filter((x) => x.kind === "interesse_aviso");
    expect(avisos).toHaveLength(confirmados - 1);
    expect(avisos.some((x) => x.email === "vai-sair@exemplo.com" || x.email === "so-pendente@exemplo.com")).toBe(false);
    expect(avisos[0].payload).toMatchObject({ tem_grupo: true });
    expect(avisos[0].payload.sair).toMatch(/^[0-9a-f]{64}$/);
    expect(avisos[0].payload).not.toHaveProperty("confirmar");
    expect(await porEmail("confirma@exemplo.com")).toMatchObject({ email_estado: "avisado" });
    expect((await porEmail("confirma@exemplo.com")).avisado_em).toBeTruthy();
    // quem confirma depois do aviso entra numa próxima rodada (cada pessoa recebe uma vez)
    const l = await porTel(pendente);
    await svc("ch_worker_interesse_confirmar", { p_token: l.token_confirmar, p_confirmar: true });
    expect((await rpc(ADMIN, "app_admin_interesse_aviso_previa")).destinatarios).toBe(1);
    expect(await rpc(ADMIN, "app_admin_interesse_avisar", { p_esperado: 1 })).toEqual({ emails: 1 });
    expect((await esvaziarFila()).map((x) => x.email)).toEqual(["so-pendente@exemplo.com"]);
    expect((await rpc(ADMIN, "app_admin_interesse_resumo")).aviso).toMatchObject({ na_fila: 0, enviados: confirmados, nao_enviados: 1 });
  });
});

describe("fila de serviço continua igual para o resto", () => {
  it("ordem: aviso de conta inativa, confirmação da lista, comunicado e aviso da 2ª fase; limite do dia vale para todos", async () => {
    await esvaziarFila();
    const tel = await inscreverEConfirmar("ordem@exemplo.com");
    const la = await porTel(tel);
    await q(`insert into public.email_saida (kind, interessado_id, chave) values ('interesse_aviso', $1, 'ordem-1')`, [la.id]);
    await q(`insert into public.email_saida (kind, user_id, chave, payload) values ('aviso_inatividade', $1, 'i-ordem', '{"acao":"zerar_coins","ultimo_acesso":"2025-01-01T00:00:00Z"}')`, [ALUNO]);
    const tel2 = novoTel();
    await inscrever(tel2, { p_email: "ordem-conf@exemplo.com" });
    const um = await svc<any[]>("ch_worker_email_pegar", { p_limite: 1 });
    expect(um[0].kind).toBe("aviso_inatividade");
    expect(um[0].email).toBe("li0@t.dev");
    const dois = await svc<any[]>("ch_worker_email_pegar", { p_limite: 1 });
    expect(dois[0]).toMatchObject({ kind: "interesse_confirmar", email: "ordem-conf@exemplo.com" });
    const tres = await svc<any[]>("ch_worker_email_pegar", { p_limite: 1 });
    expect(tres[0]).toMatchObject({ kind: "interesse_aviso", email: "ordem@exemplo.com" });
    for (const it of [...um, ...dois, ...tres]) await svc("ch_worker_email_marcar", { p_id: it.id, p_resultado: "enviado", p_erro: null });
    // limite do dia: com o teto já usado, nada sai
    const tel3 = novoTel();
    await inscrever(tel3, { p_email: "teto-dia@exemplo.com" });
    await q(`insert into public.email_saida (kind, interessado_id, chave, status, pego_em) select 'interesse_aviso', $1, 'dia-' || g, 'enviado', now() from generate_series(1, 1500) g`, [la.id]);
    expect(await svc("ch_worker_email_pegar", { p_limite: 20 })).toEqual([]);
    await q(`delete from public.email_saida where chave like 'dia-%'`);
    expect((await svc<any[]>("ch_worker_email_pegar", { p_limite: 20 })).map((x) => x.email)).toEqual(["teto-dia@exemplo.com"]);
  });
});

describe("SEGURANÇA", () => {
  const ADMIN_FNS: [string, Record<string, unknown>][] = [
    ["app_admin_interesse_resumo", {}],
    ["app_admin_interesse_lista", {}],
    ["app_admin_interesse_exportar", {}],
    ["app_admin_interesse_aviso_previa", {}],
    ["app_admin_interesse_avisar", { p_esperado: 1 }],
    ["app_admin_interesse_grupo_salvar", { p_link: LINK }],
    ["app_admin_interesse_tirar", { p_id: 1 }],
  ];

  it("aluno e editor são barrados em todas as funções da Administração", async () => {
    for (const u of [ALUNO, EDITOR]) {
      for (const [fn, args] of ADMIN_FNS) expect(await recusa(rpc(u, fn, args)), `${u} ${fn}`).toMatch(/restrito a administradores/);
    }
  });

  it("visitante (anon) não executa nada da lista; aluno não executa as funções do servidor", async () => {
    const chamadas = [
      `select public.app_admin_interesse_resumo()`,
      `select public.app_admin_interesse_exportar()`,
      `select public.app_admin_interesse_grupo_salvar('${LINK}')`,
      `select public.ch_worker_interesse_inscrever('+5511987654321')`,
      `select public.ch_worker_interesse_confirmar('${hex("1")}', true)`,
      `select public.ch_worker_interesse_sair('${hex("1")}', true)`,
      `select public.ch_worker_interesse_grupo('${hex("1")}')`,
      `select public.ch_worker_interesse_limpar()`,
      `select public.ch_worker_email_pegar(20)`,
      `select public.lista_interesse_consentimento('2a_fase-v1')`,
    ];
    for (const sql of chamadas) expect(await recusa(comoPapel("anon", sql)), sql).toMatch(/permission denied/);
    for (const sql of chamadas.slice(3)) expect(await recusa(comoPapel("authenticated", sql, [], ALUNO)), sql).toMatch(/permission denied/);
  });

  it("ninguém lê nem grava as tabelas direto (visitante, aluno, e o próprio admin pelo navegador)", async () => {
    for (const [papel, u] of [["anon", null], ["authenticated", ALUNO], ["authenticated", ADMIN]] as const) {
      for (const t of ["lista_interesse", "lista_interesse_tentativas", "lista_interesse_config", "email_saida"]) {
        expect(await recusa(comoPapel(papel, `select * from public.${t}`, [], u)), `${papel} ${t}`).toMatch(/permission denied/);
      }
      expect(await recusa(comoPapel(papel, `update public.lista_interesse_config set grupo_link = null`, [], u))).toMatch(/permission denied/);
      expect(await recusa(comoPapel(papel, `insert into public.lista_interesse (whatsapp, consentimento_texto, consentimento_versao, consentimento_em, token_sair, token_grupo) values ('+5511987654321', 'xxxxxxxxxxxx', 'v', now(), $1, $1)`, [hex("2")], u))).toMatch(/permission denied/);
    }
  });
});

describe("colar de novo, desfazer e colar outra vez", () => {
  it("colar duas vezes não quebra nem apaga (link do grupo fica); desfazer tira (FALTA) e a fila volta à 013950; colar de novo volta ao OK", async () => {
    const antes = (await q1(`select count(*)::int n from public.lista_interesse`)).n;
    await dev.db.exec(MIGRACAO);
    expect((await q1(CONFERIR)).resultado).toBe(OK);
    expect((await q1(`select count(*)::int n from public.lista_interesse`)).n).toBe(antes);
    expect(await svc("ch_worker_interesse_tem_grupo")).toBe(true);
    await dev.db.exec(DESFAZER);
    await dev.db.exec(DESFAZER);
    expect((await q1(CONFERIR)).resultado).toMatch(/^FALTA: /);
    expect(await q1(`select to_regclass('public.lista_interesse') as t`)).toEqual({ t: null });
    expect((await q1(`select count(*)::int n from pg_proc where proname like '%interesse%' and pronamespace = 'public'::regnamespace`)).n).toBe(0);
    const pegar = (await q1(`select prosrc from pg_proc where oid = 'public.ch_worker_email_pegar(integer)'::regprocedure`)).prosrc;
    expect(pegar).toContain("email_saida_teto_dia");
    expect(pegar).not.toContain("interesse");
    expect((await q1(`select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'email_saida' and column_name = 'user_id'`)).is_nullable).toBe("NO");
    expect(await svc("ch_worker_email_pegar", { p_limite: 1 })).toEqual([]);
    await dev.db.exec(MIGRACAO);
    expect((await q1(CONFERIR)).resultado).toBe(OK);
    expect((await inscrever(novoTel())).resultado).toBe("ok");
  });
});
