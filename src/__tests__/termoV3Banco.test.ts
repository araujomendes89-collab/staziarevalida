// @vitest-environment node
/**
 * Textos legais 3.0 (supabase/migrations/20261003013740_termo_v3.sql): Contrato de Assinatura com Termos de Uso 3.0, Política de
 * Privacidade 3.0 e Regulamento 1.0, novo aceite dos alunos, registro de versões (grupo de aceite), prova com IP, código do texto e
 * versões da Política e do Regulamento, cópia do sistema imutável, Minha Conta → Documentos e o desfazer.
 * Ensaio no PGlite: banco com todas as migrações de antes, contas criadas ANTES (aceite do 2.0, nenhum aceite, equipe), migração
 * aplicada duas vezes, desfeita e aplicada de novo. Nada aqui toca o banco real.
 */
import { beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const NOVA = "20261003013740_termo_v3.sql";
const ler = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const NOVA_SQL = ler(`supabase/migrations/${NOVA}`);
const DESFAZER = ler("supabase/desfazer/20261003013740_termo_v3.desfazer.sql");
const TEXTOS = {
  termo_uso: ler("src/novo/app/legal/textos/contrato-v3.0.md"),
  politica_privacidade: ler("src/novo/app/legal/textos/politica-privacidade-v3.0.md"),
  regulamento: ler("src/novo/app/legal/textos/regulamento-v1.0.md"),
};
const sha = (t: string) => crypto.createHash("sha256").update(t, "utf8").digest("hex");
const IP_HEADERS = { "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Teste/1" };

let db: PGlite;
let seq = 0;

async function call<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}, headers?: Record<string, string>): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    if (headers) await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(headers)]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0].result;
  });
}
async function recusa(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e: any) {
    return e.message;
  }
  throw new Error("Era para recusar, mas passou.");
}
async function signUp(meta: Record<string, unknown> = {}, role?: string) {
  const id = `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, "0")}`;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `pessoa${seq}@teste.dev`, { name: `P${seq}`, ...meta }]);
  if (role) await db.query(`update public.user_roles set role = $2 where user_id = $1`, [id, role]);
  return id;
}
const legal = async (uid: string) => (await call(uid, "app_bootstrap")).legal;
const aceitar = (uid: string, version: string, headers?: Record<string, string>, adult = true) =>
  call(uid, "app_accept_terms_declared", { p_document: "termo_uso", p_version: version, p_adult: adult, p_physician: null, p_origin: "tela_aceite", p_user_agent: "UA/teste" }, headers);
const provas = async (uid: string) =>
  (await db.query<any>(`select version, origin, host(ip) as ip, text_sha256, companions, plan, account_id from public.legal_acceptances
                        where account_id = $1 and document = 'termo_uso' order by id`, [uid])).rows;

let antigo2: string; // aceitou o 2.0 antes
let semNada: string; // nunca aceitou
let equipe: string; // administradora, sem aceite

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ler("supabase/tests/bootstrap.sql"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== NOVA).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  antigo2 = await signUp({ terms_version: "2.0", declares_adult: "true" });
  semNada = await signUp();
  equipe = await signUp({}, "admin");
  await db.exec(NOVA_SQL);
  await db.exec(NOVA_SQL);
}, 300_000);

describe("Termo 3.0 — textos e versões vigentes", () => {
  it("a migração traz os três textos idênticos aos do site e o banco calcula o mesmo código", async () => {
    for (const [doc, texto] of Object.entries(TEXTOS)) {
      expect(NOVA_SQL).toContain(texto);
      const t = await call(null, "app_legal_text", { p_document: doc });
      expect(t.body).toBe(texto);
      expect(t.sha256).toBe(sha(texto));
    }
    // o aviso interno do topo do rascunho não vai ao aluno
    for (const texto of Object.values(TEXTOS)) expect(texto).not.toContain("VERSÃO PARA REVISÃO FINAL DO ADVOGADO");
  });

  it("versões vigentes (também sem login): Contrato 3.0 com resumo e IP, Política 3.0, Regulamento 1.0; Tutores seguem 2.0", async () => {
    const v = await call(null, "app_legal_current");
    expect(v.termo_uso).toMatchObject({ version: "3.0", acceptance_group: "3.0", collects_ip: true, sha256: sha(TEXTOS.termo_uso) });
    expect(v.termo_uso.changes.length).toBeGreaterThanOrEqual(5);
    expect(v.politica_privacidade).toMatchObject({ version: "3.0", sha256: sha(TEXTOS.politica_privacidade) });
    expect(v.regulamento).toMatchObject({ version: "1.0", sha256: sha(TEXTOS.regulamento) });
    expect(v.tutor_ia.version).toBe("2.0");
  });

  it("texto de versão que não existe volta nulo", async () => {
    expect(await call(null, "app_legal_text", { p_document: "termo_uso", p_version: "9.9" })).toBeNull();
  });
});

describe("Termo 3.0 — novo aceite", () => {
  it("aluno que aceitou o 2.0 vê a tela de aceite da 3.0; equipe continua dispensada", async () => {
    expect(await legal(antigo2)).toMatchObject({ gate_required: true, declarations_required: true, termo_uso: { current: "3.0", accepted: "2.0", valid: false } });
    expect(await legal(semNada)).toMatchObject({ gate_required: true, termo_uso: { current: "3.0", accepted: null, valid: false } });
    expect(await legal(equipe)).toMatchObject({ gate_required: false, student: false });
  });

  it("aceitar a versão velha ou sem a maioridade é recusado", async () => {
    expect(await recusa(aceitar(antigo2, "2.0"))).toBe("Versão desatualizada do termo.");
    expect(await recusa(aceitar(antigo2, "3.0", undefined, false))).toBe("Confirme que você tem 18 anos ou mais.");
  });

  it("aceite pela tela grava versão, data, IP, navegador, código do texto, Política e Regulamento vigentes e o plano", async () => {
    const r = await aceitar(antigo2, "3.0", IP_HEADERS);
    expect(r.legal).toMatchObject({ gate_required: false, termo_uso: { current: "3.0", accepted: "3.0", valid: true } });
    const [, nova] = await provas(antigo2);
    expect(nova).toMatchObject({
      version: "3.0", origin: "tela_aceite", ip: "203.0.113.7", text_sha256: sha(TEXTOS.termo_uso), account_id: antigo2,
      companions: { politica_privacidade: { version: "3.0", sha256: sha(TEXTOS.politica_privacidade) }, regulamento: { version: "1.0", sha256: sha(TEXTOS.regulamento) } },
    });
    expect(nova.plan).toHaveProperty("plan");
    const [{ adult }] = (await db.query<any>(`select d.adult from public.legal_declarations d join public.legal_acceptances a on a.id = d.acceptance_id
                                             where a.account_id = $1 and a.version = '3.0'`, [antigo2])).rows;
    expect(adult).toBe(true);
  });

  it("o cabeçalho do Cloudflare vale antes do x-forwarded-for; cabeçalho inválido grava sem IP", async () => {
    const a = await signUp();
    await aceitar(a, "3.0", { "cf-connecting-ip": "2001:db8::5", "x-forwarded-for": "198.51.100.1" });
    expect((await provas(a))[0].ip).toBe("2001:db8::5");
    const b = await signUp();
    await aceitar(b, "3.0", { "x-forwarded-for": "não é ip" });
    expect((await provas(b))[0]).toMatchObject({ version: "3.0", ip: null });
  });

  it("cadastro com a 3.0 grava o aceite (sem IP no gatilho) e o mesmo navegador completa o IP uma vez", async () => {
    const id = await signUp({ terms_version: "3.0", declares_adult: "true", user_agent: "UA/1" });
    expect(await legal(id)).toMatchObject({ gate_required: false, termo_uso: { accepted: "3.0", valid: true } });
    expect((await provas(id))[0]).toMatchObject({ origin: "cadastro", ip: null, text_sha256: sha(TEXTOS.termo_uso) });
    expect(await call(null, "app_legal_cadastro_ip", { p_user: id }, { "x-forwarded-for": "198.51.100.20" })).toBe(true);
    expect((await provas(id))[0].ip).toBe("198.51.100.20");
    // de novo (ou de outro lugar) não troca
    expect(await call(null, "app_legal_cadastro_ip", { p_user: id }, { "x-forwarded-for": "198.51.100.99" })).toBe(false);
    expect((await provas(id))[0].ip).toBe("198.51.100.20");
  });

  it("o IP do cadastro não é completado depois de 5 minutos, nem para quem aceitou pela tela", async () => {
    const velho = await signUp({ terms_version: "3.0", declares_adult: "true" });
    await db.exec(`alter table public.legal_acceptances disable trigger legal_acceptances_imutavel`);
    await db.query(`update public.legal_acceptances set accepted_at = now() - interval '6 minutes' where account_id = $1`, [velho]);
    await db.exec(`alter table public.legal_acceptances enable trigger legal_acceptances_imutavel`);
    expect(await call(null, "app_legal_cadastro_ip", { p_user: velho }, { "x-forwarded-for": "198.51.100.30" })).toBe(false);
    const tela = await signUp();
    await aceitar(tela, "3.0");
    expect(await call(null, "app_legal_cadastro_ip", { p_user: tela }, { "x-forwarded-for": "198.51.100.31" })).toBe(false);
  });

  it("cadastro com a versão velha não grava: a tela de aceite pede a 3.0 depois", async () => {
    const id = await signUp({ terms_version: "2.0", declares_adult: "true" });
    expect(await provas(id)).toEqual([]);
    expect(await legal(id)).toMatchObject({ gate_required: true });
  });
});

describe("Termo 3.0 — a prova e a cópia do sistema não mudam", () => {
  it("a prova não pode ser alterada nem apagada; o texto publicado também não", async () => {
    await expect(db.query(`update public.legal_acceptances set version = '9.9' where account_id = $1`, [antigo2])).rejects.toThrow(/não pode ser alterada/);
    await expect(db.query(`update public.legal_acceptances set ip = '1.2.3.4' where account_id = $1 and version = '3.0'`, [antigo2])).rejects.toThrow(/não pode ser alterada/);
    await expect(db.query(`delete from public.legal_acceptances where account_id = $1`, [antigo2])).rejects.toThrow(/não pode ser apagada/);
    await expect(db.query(`update public.legal_texts set body = body || 'x' where document = 'termo_uso'`)).rejects.toThrow(/não pode ser alterado/);
    await expect(db.query(`delete from public.legal_texts`)).rejects.toThrow(/não pode ser alterado/);
  });

  it("o navegador não grava a prova nem os textos", async () => {
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query(`insert into public.legal_texts (document, version, title, body, acceptance_group) values ('termo_uso', '9.0', 'x', repeat('x', 200), '9.0')`);
    })).rejects.toThrow();
    const r = (await db.query<any>(`select has_function_privilege('anon', 'public.legal_publish(text, text, text, text, text, boolean, jsonb, boolean)', 'execute') as a,
                                    has_function_privilege('authenticated', 'public.legal_publish(text, text, text, text, text, boolean, jsonb, boolean)', 'execute') as b,
                                    has_function_privilege('anon', 'public.app_my_legal_documents()', 'execute') as c,
                                    has_function_privilege('anon', 'public.app_legal_current()', 'execute') as d`)).rows[0];
    expect(r).toEqual({ a: false, b: false, c: false, d: true });
  });

  it("conta apagada: a prova fica com o identificador da conta, a versão, o IP e o código", async () => {
    const id = await signUp();
    await aceitar(id, "3.0", IP_HEADERS);
    await db.query(`delete from auth.users where id = $1`, [id]);
    const [p] = await provas(id);
    expect(p).toMatchObject({ account_id: id, version: "3.0", ip: "203.0.113.7", text_sha256: sha(TEXTOS.termo_uso) });
    const [{ user_id }] = (await db.query<any>(`select user_id from public.legal_acceptances where account_id = $1`, [id])).rows;
    expect(user_id).toBeNull();
  });
});

describe("Termo 3.0 — Minha Conta → Documentos e exportação", () => {
  it("documentos: os aceites da própria pessoa, com versão, data, código e versões da Política e do Regulamento", async () => {
    const docs = await call(antigo2, "app_my_legal_documents");
    expect(docs.map((d: any) => d.version)).toEqual(["3.0", "2.0"]);
    expect(docs[0]).toMatchObject({ title: "Contrato de Assinatura e Termos de Uso", stored: true, text_sha256: sha(TEXTOS.termo_uso), companions: { regulamento: { version: "1.0" } } });
    expect(docs[1]).toMatchObject({ stored: false });
    expect(await recusa(call(null, "app_my_legal_documents"))).toMatch(/permission denied/);
  });

  it("a exportação dos dados leva o IP e o código do texto aceito", async () => {
    const data = await call(antigo2, "app_export_my_data");
    const a = data.acceptances.find((x: any) => x.version === "3.0");
    expect(a).toMatchObject({ ip: "203.0.113.7", text_sha256: sha(TEXTOS.termo_uso) });
  });
});

describe("Termo 3.0 — desfazer e aplicar de novo", () => {
  it("o desfazer volta o 2.0 sem apagar nenhum aceite; a migração colada de novo volta o 3.0", async () => {
    const antes = (await db.query<any>(`select count(*)::int as n from public.legal_acceptances`)).rows[0].n;
    const so3 = await signUp({ terms_version: "3.0", declares_adult: "true" });
    await db.exec(DESFAZER);
    await db.exec(DESFAZER);
    expect((await db.query<any>(`select count(*)::int as n from public.legal_acceptances`)).rows[0].n).toBe(antes + 1);
    expect(await legal(antigo2)).toMatchObject({ gate_required: false, termo_uso: { current: "2.0", accepted: "2.0" } });
    expect(await legal(so3)).toMatchObject({ gate_required: true, termo_uso: { current: "2.0" } });
    expect(await recusa(call(null, "app_legal_current"))).toMatch(/does not exist|não existe/);
    // com o 2.0 de volta, o cadastro e o aceite funcionam como antes
    const novo = await signUp({ terms_version: "2.0", declares_adult: "true" });
    expect(await legal(novo)).toMatchObject({ gate_required: false });

    await db.exec(NOVA_SQL);
    expect(await legal(antigo2)).toMatchObject({ gate_required: false, termo_uso: { current: "3.0", valid: true } });
    expect(await legal(so3)).toMatchObject({ gate_required: false });
    expect(await legal(novo)).toMatchObject({ gate_required: true });
  });

  it("recusa aplicar num banco ainda com o WhatsApp obrigatório (sem a 013660) e não muda nada", async () => {
    await db.exec("begin");
    try {
      // a regra de antes da 013660 (tela de aceite também para quem não tem WhatsApp)
      await db.exec(`create or replace function public.app_legal_state() returns jsonb language plpgsql stable as $f$
        declare v_phone_missing boolean := true; begin return jsonb_build_object('gate_required', false or v_phone_missing); end $f$`);
      await expect(db.exec(NOVA_SQL)).rejects.toThrow(/aplique antes a 20261003013660/);
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("Termo 3.0 — versões depois da revisão do advogado (por último: muda a vigente)", () => {
  it("mesma versão com outro texto é recusada", async () => {
    await expect(db.query(`select public.legal_publish('termo_uso', '3.0', 'Contrato', $1, '3.0', true, '[]', true)`, [TEXTOS.termo_uso + "\nmudou"]))
      .rejects.toThrow(/já foi publicada com outro texto/);
  });

  it("3.0.1 sem mudança relevante (mesmo grupo): ninguém aceita de novo; quem entra novo aceita a 3.0.1", async () => {
    await db.query(`select public.legal_publish('termo_uso', '3.0.1', 'Contrato de Assinatura e Termos de Uso', $1, '3.0', true, '[]', true)`, [TEXTOS.termo_uso + "\nCorreção de digitação."]);
    expect(await legal(antigo2)).toMatchObject({ gate_required: false, termo_uso: { current: "3.0.1", accepted: "3.0", valid: true } });
    const novo = await signUp();
    expect(await legal(novo)).toMatchObject({ gate_required: true });
    expect(await recusa(aceitar(novo, "3.0"))).toBe("Versão desatualizada do termo.");
    await aceitar(novo, "3.0.1");
    expect((await provas(novo))[0].text_sha256).toBe(sha(TEXTOS.termo_uso + "\nCorreção de digitação."));

    // 3.1 com mudança relevante (grupo novo): todos aceitam de novo
    await db.query(`select public.legal_publish('termo_uso', '3.1', 'Contrato de Assinatura e Termos de Uso', $1, '3.1', true, '["Mudou o prazo X."]', true)`, [TEXTOS.termo_uso + "\nMudança relevante."]);
    expect(await legal(antigo2)).toMatchObject({ gate_required: true, termo_uso: { current: "3.1", valid: false } });
    expect((await call(null, "app_legal_current")).termo_uso.changes).toEqual(["Mudou o prazo X."]);
  });
});
