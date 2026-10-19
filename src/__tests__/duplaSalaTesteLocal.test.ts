// @vitest-environment node
/**
 * Treino em Dupla, Tarefa 10: as rotas de teste do banco LOCAL (`/api/dev-db/dupla/preparar` e `/dupla/sala-teste`) e o script
 * `npm run dupla:sala-teste`. Banco de desenvolvimento de verdade (PGlite em pasta temporária) num express na porta 0;
 * nada de Supabase, rede externa ou chave.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { createDevDbRouter } from "../../server/devDb/router";
import { FASES, SENHA_TESTE } from "../../server/dupla/salaTeste";
import { executar, lerArgumentos } from "../../scripts/dupla/sala-teste";

let dev: DevDatabase;
let server: Server;
let porta: number;
let base: string;
let tmp: string;

const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function post(caminho: string, body: unknown, token?: string) {
  const r = await fetch(`${base}${caminho}`, { ...json(body), headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { status: r.status, body: await r.json() };
}
async function entrar(email: string, senha = SENHA_TESTE): Promise<string> {
  const r = await post("/auth/signin", { email, password: senha });
  expect(r.status).toBe(200);
  return r.body.token;
}
async function rpc<T = any>(token: string, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await post("/rpc", { fn, args }, token);
  if (r.status !== 200) throw new Error(r.body?.error?.message ?? `erro ${r.status}`);
  return r.body.data;
}
async function criarConta(email: string, nome = "Conta de teste") {
  const r = await post("/auth/signup", { name: nome, email, password: "senha-segura-123" });
  expect(r.status).toBe(200);
  return { id: r.body.user.id as string, token: r.body.token as string };
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dupla-sala-teste-"));
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  const app = express();
  app.use("/api/dev-db", createDevDbRouter(async () => dev));
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  porta = (server.address() as any).port;
  base = `http://127.0.0.1:${porta}/api/dev-db`;
}, 180_000);

afterAll(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(null)));
  await dev?.db.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Rota /dupla/preparar", () => {
  it("deixa a conta com Pro ativo, aceites vigentes, WhatsApp de teste e a chave aberta", async () => {
    const a = await criarConta("preparar-a@teste.dev");
    const b = await criarConta("preparar-b@teste.dev");
    // antes: aluno novo, no teste grátis, com a tela de aceite obrigatória e o módulo fechado
    const antes = await rpc(a.token, "app_bootstrap");
    expect(antes.legal.gate_required).toBe(true);
    expect(await rpc(a.token, "app_dupla_access")).toMatchObject({ aberto: false, permitido: false });

    const r = await post("/dupla/preparar", { emails: ["preparar-a@teste.dev", "PREPARAR-B@teste.dev "] });
    expect(r).toEqual({ status: 200, body: { ok: true } });

    const depois = await rpc(a.token, "app_bootstrap");
    expect(depois.legal.gate_required).toBe(false);
    expect(depois.subscription).toMatchObject({ plan: "pro", status: "active" });
    expect(await rpc(a.token, "app_dupla_access")).toEqual({ aberto: true, permitido: true, planos: ["pro", "elite"], equipe: false });
    const fones = (await dev.db.query<any>(`select id, phone from public.profiles where id in ($1, $2) order by phone`, [a.id, b.id])).rows;
    expect(fones.map((f) => f.phone)).toEqual(["+5511999990001", "+5511999990002"]);
    expect(fones.find((f) => f.id === a.id).phone).toBe("+5511999990001");

    // repetir não muda nada nem duplica aceites
    expect((await post("/dupla/preparar", { emails: ["preparar-a@teste.dev"] })).status).toBe(200);
    const aceites = (await dev.db.query<any>(`select count(*)::int as n from public.legal_acceptances where user_id = $1`, [a.id])).rows[0].n;
    expect(aceites).toBe(2);
    // WhatsApp que a pessoa já tinha não é trocado
    expect((await dev.db.query<any>(`select phone from public.profiles where id = $1`, [a.id])).rows[0].phone).toBe("+5511999990001");
  });

  it("e-mail sem conta e lista vazia viram 400 em português", async () => {
    const sem = await post("/dupla/preparar", { emails: ["ninguem@teste.dev"] });
    expect(sem.status).toBe(400);
    expect(sem.body.error.message).toBe("Conta não encontrada: ninguem@teste.dev. Crie a conta antes.");
    const vazio = await post("/dupla/preparar", { emails: [] });
    expect(vazio.status).toBe(400);
    expect(vazio.body.error.message).toBe("Informe os e-mails das contas.");
    expect((await post("/dupla/preparar", {})).status).toBe(400);
  });
});

describe("Rota /dupla/sala-teste", () => {
  it("fase inválida → 400 'Fase inválida.'", async () => {
    for (const fase of ["nao-existe", "", undefined, 3]) {
      const r = await post("/dupla/sala-teste", { fase });
      expect(r.status).toBe(400);
      expect(r.body.error.message).toBe("Fase inválida.");
    }
    expect((await post("/dupla/sala-teste", { fase: "closed", motivo: "x" })).body.error.message).toBe("Motivo inválido.");
  });

  it("cria as duas contas (com perfil de estudo e plano) e a sala; a resposta traz o link e as contas", async () => {
    const r = await post("/dupla/sala-teste", { fase: "roles" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      room_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      url: `/novo/dupla/sala/${r.body.room_id}`,
      candidato: { email: "candidato@dupla.local", senha: "dupla-local-123" },
      avaliador: { email: "avaliador@dupla.local", senha: "dupla-local-123" },
    });
    const perfis = (await dev.db.query<any>(`select public_name from public.study_profiles p join auth.users u on u.id = p.user_id where u.email in ('candidato@dupla.local','avaliador@dupla.local') order by public_name`)).rows;
    expect(perfis.map((p) => p.public_name)).toEqual(["Avaliador de teste", "Candidato de teste"]);

    const cand = await entrar("candidato@dupla.local");
    expect(await rpc(cand, "app_dupla_access")).toMatchObject({ aberto: true, permitido: true });
    expect((await rpc(cand, "app_bootstrap")).legal.gate_required).toBe(false);
    expect((await rpc(cand, "app_bootstrap")).profile.name).toBe("Candidato de teste");
    // repetir usa as mesmas contas
    const de_novo = await post("/dupla/sala-teste", { fase: "roles" });
    expect(de_novo.status).toBe(200);
    expect(de_novo.body.room_id).not.toBe(r.body.room_id);
    expect((await dev.db.query<any>(`select count(*)::int as n from auth.users where email like '%@dupla.local'`)).rows[0].n).toBe(2);
    // a sala anterior fecha: uma sala aberta por dupla
    const sala_antiga = await rpc(cand, "app_dupla_room", { p_room_id: r.body.room_id });
    expect(sala_antiga.phase).toBe("closed");
    const nova = await rpc(cand, "app_dupla_room", { p_room_id: de_novo.body.room_id });
    expect(nova.phase).toBe("roles");
  });

  it.each(FASES)("fase %s: a sala nasce na fase, com o que ela precisa, vista pelas duas contas", async (fase) => {
    const r = await post("/dupla/sala-teste", { fase });
    expect(r.status).toBe(200);
    const id = r.body.room_id;
    const cand = await entrar(r.body.candidato.email, r.body.candidato.senha);
    const aval = await entrar(r.body.avaliador.email, r.body.avaliador.senha);

    const c = await rpc(cand, "app_dupla_room", { p_room_id: id });
    const a = await rpc(aval, "app_dupla_room", { p_room_id: id });
    expect(c.phase).toBe(fase);
    expect(a.phase).toBe(fase);
    // Etapa P: o candidato só recebe o nome e o id da estação no resultado; o avaliador sempre.
    // Fluxo simples (014140): antes do início, o candidato recebe só a porta (a estação de teste é de Clínica Médica: porta 1).
    const antes = ["roles", "connecting", "setup"].includes(fase) || (fase === "closed" && !c.started_at);
    if (antes) { expect(c.station).toBeNull(); expect(c.porta).toBe(1); } else { if (fase === "result") expect(c.station).toMatchObject({ id: "teste-inep2020-e01", area_code: "CM" }); else expect(c.station).toEqual(expect.not.objectContaining({ id: expect.anything(), name: expect.anything() })); expect(c.station).toMatchObject({ label: "Estação 1", area_code: "CM" }); }
    expect(a.station).toMatchObject({ id: "teste-inep2020-e01", area_code: "CM" });
    expect(c.me).toMatchObject({ public_name: "Candidato de teste", role: "candidate" });
    expect(c.partner).toMatchObject({ public_name: "Avaliador de teste", role: "evaluator" });
    expect(a.me).toMatchObject({ role: "evaluator" });

    const confirmados = fase === "roles" || fase === "closed" ? false : true;
    expect(c.me.confirmed).toBe(confirmados);
    expect(c.partner.confirmed).toBe(confirmados);
    expect(c.me.connected).toBe(["setup", "running", "review", "result"].includes(fase));
    expect(c.call_link === null).toBe(!["setup", "running", "review", "result"].includes(fase));
    if (fase === "setup") {
      expect(a.me.ready).toBe(true);
      expect(c.me.ready).toBe(false);
    }
    if (fase === "running") {
      expect(c.me.ready && a.me.ready).toBe(true);
      expect(c.started_at).toBeTruthy();
      expect(new Date(c.ends_at).getTime() - new Date(c.server_now).getTime()).toBeGreaterThan(0);
      expect(c.finished_at).toBeNull();
      expect(c.released_pressings).toEqual(["d1"]); // o esfregaço (Impresso 1 na tela); o relato é inicial
      expect(a.released_pressings).toEqual(["teste-inep2020-e01-p2"]);
    }
    if (fase === "review" || fase === "result") {
      expect(c.finished_at).toBeTruthy();
      expect(c.released_pressings).toEqual([]);
    }
    if (fase === "closed") {
      expect(c.closed_reason).toBe("saiu");
      expect(c.closed_by).toEqual({ user_id: expect.any(String), public_name: "Avaliador de teste", me: false });
      expect(a.closed_by.me).toBe(true);
    }

    // conteúdo por papel: o candidato não recebe o roteiro do ator nem os impressos não liberados
    if (fase === "connecting" || fase === "setup") {
      expect((await rpc(cand, "app_dupla_room_content", { p_room_id: id })).station).toBeNull(); // fluxo simples (014140)
    }
    if (["running", "review", "result"].includes(fase)) {
      const conteudoC = await rpc(cand, "app_dupla_room_content", { p_room_id: id });
      const conteudoA = await rpc(aval, "app_dupla_room_content", { p_room_id: id });
      expect(conteudoC.role).toBe("candidate");
      expect(conteudoA.role).toBe("evaluator");
      expect(conteudoC.station.actor_script).toBeUndefined();
      expect(conteudoA.station.actor_script).toBeDefined();
      expect(conteudoA.pressings).toHaveLength(2);
      expect(conteudoC.pressings.map((p: any) => p.id)).toEqual(fase === "running" ? ["i1", "d1"] : ["i1"]);
    }

    // marcações do PEP: poucas durante a estação, todas na conferência e no resultado; só o avaliador as lê
    const marcas = await rpc(aval, "app_dupla_marks", { p_room_id: id });
    expect(marcas).toHaveLength(fase === "running" ? 3 : fase === "review" || fase === "result" ? 8 : 0);
    await expect(rpc(cand, "app_dupla_marks", { p_room_id: id })).rejects.toThrow("Só o avaliador vê as marcações durante a rodada.");

    // resultado só na última fase, para os dois
    if (fase === "result") {
      const res = await rpc(cand, "app_dupla_result", { p_room_id: id, p_round: 1 });
      expect(res).toMatchObject({ round: 1, viewer: "candidate", max_score: 10, candidate: { public_name: "Candidato de teste" }, evaluator: { public_name: "Avaliador de teste" } });
      expect(res.items).toHaveLength(8);
      expect(res.score).toBeGreaterThan(0);
      expect(res.score).toBeLessThan(10);
      expect(res.items.reduce((s: number, i: any) => s + i.points, 0)).toBeCloseTo(res.score, 3);
      expect(res.feedback.pos).toBeTruthy();
      expect((await rpc(aval, "app_dupla_result", { p_room_id: id, p_round: 1 })).viewer).toBe("evaluator");
    } else {
      await expect(rpc(cand, "app_dupla_result", { p_room_id: id, p_round: 1 })).rejects.toThrow("Resultado ainda não liberado.");
    }
  });

  it.each(["saiu", "convite_recusado", "convite_expirado", "sem_sinal"])("fase closed com o motivo %s", async (motivo) => {
    const r = await post("/dupla/sala-teste", { fase: "closed", motivo });
    expect(r.status).toBe(200);
    const cand = await entrar(r.body.candidato.email);
    const sala = await rpc(cand, "app_dupla_room", { p_room_id: r.body.room_id });
    expect(sala.phase).toBe("closed");
    expect(sala.closed_reason).toBe(motivo);
    expect(sala.closed_by === null).toBe(motivo === "convite_expirado" || motivo === "sem_sinal");
  });

  it("a sala aberta não fecha logo: o sinal das duas contas está fresco", async () => {
    const r = await post("/dupla/sala-teste", { fase: "running" });
    const seen = (await dev.db.query<any>(`select max(extract(epoch from (now() - last_seen_at)))::float as s from public.study_profiles p join auth.users u on u.id = p.user_id where u.email like '%@dupla.local'`)).rows[0].s;
    expect(seen).toBeLessThan(60);
    const cand = await entrar("candidato@dupla.local");
    expect((await rpc(cand, "app_dupla_room", { p_room_id: r.body.room_id })).phase).toBe("running");
  });
});

describe("Script npm run dupla:sala-teste", () => {
  it("lê as opções: fase (padrão roles), preparar, motivo e porta", () => {
    expect(lerArgumentos([])).toEqual({ fase: "roles", faseInformada: false, motivo: null, preparar: null, porta: 3000 });
    expect(lerArgumentos(["--fase", "setup", "--porta", "3001"])).toMatchObject({ fase: "setup", faseInformada: true, porta: 3001 });
    expect(lerArgumentos(["--preparar", "a@x.com", "b@x.com"])).toMatchObject({ preparar: ["a@x.com", "b@x.com"], faseInformada: false });
    expect(lerArgumentos(["--preparar", "a@x.com", "--fase", "result", "--motivo", "saiu"])).toMatchObject({ preparar: ["a@x.com"], fase: "result", motivo: "saiu" });
    expect(() => lerArgumentos(["--preparar"])).toThrow("Informe os e-mails depois de --preparar.");
    expect(() => lerArgumentos(["--porta", "abc"])).toThrow("Porta inválida.");
    expect(() => lerArgumentos(["--outra"])).toThrow("Opção desconhecida: --outra");
  });

  it("chama as rotas, imprime o link e as contas; só fala com 127.0.0.1", async () => {
    const visitadas: string[] = [];
    const linhas = await executar(["--fase", "setup", "--porta", String(porta)], (url, init) => {
      visitadas.push(url);
      return fetch(url, init as any);
    });
    expect(visitadas).toHaveLength(1);
    expect(visitadas[0]).toBe(`http://127.0.0.1:${porta}/api/dev-db/dupla/sala-teste`);
    const texto = linhas.join("\n");
    expect(texto).toMatch(new RegExp(`http://127\\.0\\.0\\.1:${porta}/novo/dupla/sala/[0-9a-f-]{36}`));
    expect(texto).toContain("candidato@dupla.local");
    expect(texto).toContain("avaliador@dupla.local");
    expect(texto).toContain("dupla-local-123");
  });

  it("--preparar sozinho só prepara as contas (sem criar sala); com --fase faz as duas coisas", async () => {
    await criarConta("script-a@teste.dev");
    const salasAntes = (await dev.db.query<any>(`select count(*)::int as n from public.checklist_rooms`)).rows[0].n;
    const linhas = await executar(["--preparar", "script-a@teste.dev", "--porta", String(porta)]);
    expect(linhas.join("\n")).toContain("Contas preparadas");
    expect((await dev.db.query<any>(`select count(*)::int as n from public.checklist_rooms`)).rows[0].n).toBe(salasAntes);
    const duas = await executar(["--preparar", "script-a@teste.dev", "--fase", "roles", "--porta", String(porta)]);
    expect(duas.join("\n")).toContain("Sala de teste");
  });

  it("servidor fora do ar e recusas viram frases em português", async () => {
    await expect(executar(["--porta", "1"], () => Promise.reject(new Error("recusou")))).rejects.toThrow("Não encontrei o servidor local na porta 1.");
    await expect(executar(["--fase", "nada", "--porta", String(porta)])).rejects.toThrow("Fase inválida.");
  });
});
