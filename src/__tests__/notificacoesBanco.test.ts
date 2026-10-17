// @vitest-environment node
/**
 * Central de Notificações do aluno (migração 013830) no banco local (PGlite, todas as migrações do ramo):
 *   - fonte única: os avisos de cobrança (013760) aparecem na Central; ler no pop-up conta como lido na Central (e o contrário);
 *   - o pop-up continua só com os avisos de cobrança (comunicado e contrato ficam só na Central);
 *   - segurança: o aluno não lê a do outro, não cria, não altera, não apaga, não marca a do outro; sem duplicata (chave única);
 *   - contrato novo no prazo da cláusula 6.5-A: uma notificação por versão, lida sozinha depois do aceite;
 *   - comunicados da equipe: só administrador; prévia com o número de alunos; público por plano/fase; equipe não recebe;
 *     link só do app ou https; o mesmo envio não sai duas vezes; registro de quem enviou;
 *   - a migração pode ser colada duas vezes, desfeita e colada de novo (conferência OK/FALTA).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";

const ROOT = path.resolve(__dirname, "../..");
const MIGRACAO = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003013830_central_notificacoes.sql"), "utf8");
const DESFAZER = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013830_central_notificacoes.desfazer.sql"), "utf8");
const CONFERIR = fs.readFileSync(path.join(ROOT, "supabase/conferir/central-notificacoes.sql"), "utf8");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "notificacoes-"));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ANA, BRUNO, CARLA, ADMIN, EDITOR, REVISOR, DIEGO] = [41, 42, 43, 44, 45, 46, 47].map(id);
const TODOS = [ANA, BRUNO, CARLA, ADMIN, EDITOR, REVISOR, DIEGO];
let dev: DevDatabase;
let db: ContentDb;

const q = async (sql: string, args: unknown[] = []) => (await dev.db.query<any>(sql, args)).rows;
const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
const rpc = <T = any>(user: string, fn: string, args: Record<string, unknown> = {}) => db.asUser<T>({ id: user, email: null }, fn, args);
/** SQL direto como o aluno logado (papel authenticated + RLS), igual ao Supabase. */
const comoAluno = (user: string, sql: string, args: unknown[] = []) =>
  dev.db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: "authenticated" })]);
    return (await tx.query<any>(sql, args)).rows;
  });
const criarAviso = (user: string, tipo: string, chave: string, titulo: string, rota = "planos") =>
  q1(`select public.avisos_criar($1, $2, $3, $4, 'Texto do aviso de teste.', $5) as novo`, [user, tipo, chave, titulo, rota]);
const enviar = (user: string, o: Record<string, unknown>) =>
  rpc(user, "app_admin_comunicado_enviar", { p_titulo: "Aviso da equipe", p_texto: "Texto do comunicado.", p_link: null, p_publico: "todos", p_filtro: null, p_idem: `idem-${Math.random().toString(36).slice(2, 12)}`, ...o });

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const [i, uid] of TODOS.entries()) {
    await q(`insert into auth.users (id, email) values ($1, $2)`, [uid, `nt${i}@t.dev`]);
    await q(`update public.profiles set name = $2 where id = $1`, [uid, ["Ana", "Bruno", "Carla", "Admin Teste", "Editor", "Revisora", "Diego"][i]]);
    // Diego aceitou só a versão antiga do Contrato (2.0): fica no prazo da cláusula 6.5-A quando tiver plano pago ativo
    if (uid === DIEGO) await q(`insert into public.legal_acceptances (user_id, document, version, origin, email_hash) values ($1, 'termo_uso', '2.0', 'tela_aceite', 'x')`, [uid]);
    else await q(`insert into public.legal_acceptances (user_id, document, version, origin, email_hash) select $1, document, version, 'tela_aceite', 'x' from public.legal_versions where document = 'termo_uso'`, [uid]);
  }
  await q(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await q(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await q(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA')`, [REVISOR]);
  // fases: Ana PRO pago; Bruno em teste da teoria; Carla ELITE (teoria e prática pagas); Diego sem acesso (cancelada)
  await q(`delete from public.aluno_fases where user_id = any($1::uuid[])`, [[ANA, BRUNO, CARLA, DIEGO]]);
  const fase = (u: string, f: string, sit: string, plano: string | null, dias: number) =>
    q(`insert into public.aluno_fases (user_id, fase, situacao, plano, inicio, fim, origem) values ($1, $2, $3, $4, now() - interval '1 day', now() + make_interval(days => $5), 'equipe')`, [u, f, sit, plano, dias]);
  await fase(ANA, "teoria", "paga", "pro", 20);
  await fase(BRUNO, "teoria", "teste", null, 5);
  await fase(CARLA, "teoria", "paga", "elite", 20);
  await fase(CARLA, "pratica", "paga", "elite", 20);
  await fase(DIEGO, "teoria", "cancelada", null, -3);
}, 300_000);

afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("fonte única: avisos de cobrança na Central", () => {
  it("o aviso de cobrança aparece na Central com o botão certo e conta como não lido", async () => {
    expect((await criarAviso(ANA, "renovacao", "renovacao:2026-11-20:7", "Seu PRO vence em 7 dias")).novo).toBe(true);
    expect((await criarAviso(ANA, "acesso_bloqueado", "bloqueado:2026-11-20", "Seu acesso pago foi pausado")).novo).toBe(true);
    const r = await rpc(ANA, "app_minhas_notificacoes");
    expect(r.aluno).toBe(true);
    expect(r.nao_lidas).toBe(2);
    expect(r.itens.map((i: any) => i.tipo)).toEqual(["acesso_bloqueado", "renovacao"]); // mais novo primeiro
    expect(r.itens.map((i: any) => i.acao)).toEqual(["Pagar agora", "Pagar agora"]);
    expect(r.itens[0]).toMatchObject({ lida: false, rota: "planos", link: null });
  });

  it("sem duplicata: a mesma chave não cria outra notificação", async () => {
    expect((await criarAviso(ANA, "renovacao", "renovacao:2026-11-20:7", "Seu PRO vence em 7 dias")).novo).toBe(false);
    expect((await q1(`select count(*)::int n from public.avisos_aluno where user_id = $1 and chave = 'renovacao:2026-11-20:7'`, [ANA])).n).toBe(1);
  });

  it("ler no pop-up conta como lido na Central", async () => {
    const pop = await rpc(ANA, "app_meus_avisos");
    const renov = pop.novos.find((a: any) => a.tipo === "renovacao");
    expect(await rpc(ANA, "app_avisos_vistos", { p_ids: [renov.id] })).toBe(1);
    const r = await rpc(ANA, "app_minhas_notificacoes");
    expect(r.nao_lidas).toBe(1);
    expect(r.itens.find((i: any) => i.id === renov.id).lida).toBe(true);
  });

  it("marcar como lida na Central tira do pop-up", async () => {
    const r = await rpc(ANA, "app_minhas_notificacoes");
    const bloq = r.itens.find((i: any) => i.tipo === "acesso_bloqueado");
    expect(await rpc(ANA, "app_notificacoes_lidas", { p_ids: [bloq.id] })).toBe(1);
    expect((await rpc(ANA, "app_meus_avisos")).novos).toEqual([]);
    expect((await rpc(ANA, "app_minhas_notificacoes")).nao_lidas).toBe(0);
  });

  it("textos dos botões por tipo", async () => {
    await criarAviso(BRUNO, "renovacao", "renovacao:2026-11-21:3", "Seu PRO renova em 3 dias");
    await criarAviso(BRUNO, "renovacao", "renovacao-aceite:2026-11-21:3", "Para renovar o seu PRO, aceite o contrato novo", "aceite");
    await criarAviso(BRUNO, "acesso_liberado", "liberado:asaas:pay_1", "Pagamento confirmado");
    const acoes = Object.fromEntries((await rpc(BRUNO, "app_minhas_notificacoes")).itens.map((i: any) => [i.titulo, i.acao]));
    expect(acoes).toMatchObject({ "Seu PRO renova em 3 dias": "Ver meu plano", "Para renovar o seu PRO, aceite o contrato novo": "Ler o contrato", "Pagamento confirmado": "Ver meu plano" });
    await q(`delete from public.avisos_aluno where user_id = $1`, [BRUNO]);
  });
});

describe("segurança: cada aluno só as próprias, só lendo e marcando", () => {
  it("o aluno não lê a notificação de outro (nem pela tabela, nem pela função)", async () => {
    await criarAviso(BRUNO, "pagamento_falhou", "falhou:x1", "O pagamento não passou");
    const deAna = await comoAluno(ANA, `select id, user_id from public.avisos_aluno`);
    expect(deAna.length).toBeGreaterThan(0);
    expect(deAna.every((r: any) => r.user_id === ANA)).toBe(true);
    expect((await rpc(ANA, "app_minhas_notificacoes")).itens.some((i: any) => i.titulo === "O pagamento não passou")).toBe(false);
  });

  it("o aluno não marca como lida a de outro", async () => {
    const deBruno = (await q1(`select id from public.avisos_aluno where user_id = $1 and chave = 'falhou:x1'`, [BRUNO])).id;
    expect(await rpc(ANA, "app_notificacoes_lidas", { p_ids: [deBruno] })).toBe(0);
    expect(await rpc(ANA, "app_avisos_vistos", { p_ids: [deBruno] })).toBe(0);
    expect(await rpc(ANA, "app_notificacoes_lidas", { p_ids: null })).toBe(0); // "todas" = só as dela
    expect((await q1(`select visto_em from public.avisos_aluno where id = $1`, [deBruno])).visto_em).toBeNull();
  });

  it("o aluno não cria, não altera e não apaga notificação (nem a própria)", async () => {
    await expect(comoAluno(ANA, `insert into public.avisos_aluno (user_id, tipo, chave, titulo, texto) values ($1, 'comunicado', 'falso:1', 'Ganhou um prêmio', 'Clique aqui')`, [ANA])).rejects.toThrow(/permission denied/i);
    await expect(comoAluno(ANA, `update public.avisos_aluno set titulo = 'mudado', visto_em = now() where user_id = $1`, [ANA])).rejects.toThrow(/permission denied/i);
    await expect(comoAluno(ANA, `delete from public.avisos_aluno where user_id = $1`, [ANA])).rejects.toThrow(/permission denied/i);
    await expect(comoAluno(ANA, `select public.avisos_criar($1, 'comunicado', 'falso:2', 'Ganhou', 'Clique')`, [ANA])).rejects.toThrow(/permission denied/i);
  });

  it("o aluno não lê nem grava os comunicados da equipe e não chama as funções internas", async () => {
    await expect(comoAluno(ANA, `select * from public.comunicados_equipe`)).rejects.toThrow(/permission denied/i);
    await expect(comoAluno(ANA, `insert into public.comunicados_equipe (titulo, texto, publico, idem_chave) values ('abc', 'abc', 'todos', 'idem-falso-1')`)).rejects.toThrow(/permission denied/i);
    await expect(comoAluno(ANA, `select public.comunicado_alunos('todos', null)`)).rejects.toThrow(/permission denied/i);
    await expect(comoAluno(ANA, `select public.notificacao_contrato_sincronizar($1)`, [BRUNO])).rejects.toThrow(/permission denied/i);
  });

  it("sem login, nada", async () => {
    await expect(db.asUser(null as any, "app_minhas_notificacoes", {})).rejects.toThrow();
  });
});

describe("pop-up só com os avisos de cobrança", () => {
  it("comunicado e contrato ficam fora do pop-up (e do histórico da Assinatura), mas na Central", async () => {
    const c = await enviar(ADMIN, { p_titulo: "Simulado nacional no sábado", p_publico: "todos" });
    expect(c.repetido).toBe(false);
    const pop = await rpc(BRUNO, "app_meus_avisos");
    expect(pop.novos.every((a: any) => a.tipo !== "comunicado")).toBe(true);
    expect(pop.recentes.every((a: any) => a.tipo !== "comunicado")).toBe(true);
    const central = await rpc(BRUNO, "app_minhas_notificacoes");
    expect(central.itens[0]).toMatchObject({ tipo: "comunicado", titulo: "Simulado nacional no sábado", rota: "nenhuma", acao: null, lida: false });
  });
});

describe("comunicados da equipe", () => {
  it("só administrador prevê, envia e lista", async () => {
    for (const quem of [ANA, EDITOR, REVISOR]) {
      await expect(rpc(quem, "app_admin_comunicado_previa", { p_publico: "todos", p_filtro: null })).rejects.toThrow(/Só administradores/);
      await expect(enviar(quem, {})).rejects.toThrow(/Só administradores/);
      await expect(rpc(quem, "app_admin_comunicados")).rejects.toThrow(/Só administradores/);
    }
  });

  it("prévia: quantos alunos recebem, por público (equipe e revisora nunca contam)", async () => {
    const n = async (p: string, f: string | null) => (await rpc(ADMIN, "app_admin_comunicado_previa", { p_publico: p, p_filtro: f })).destinatarios;
    const alunos = (await q1(`select count(*)::int n from public.user_roles r where r.role = 'student' and not exists (select 1 from public.ch_reviewer_areas a where a.user_id = r.user_id)`)).n;
    expect(await n("todos", null)).toBe(alunos);
    expect(await n("plano", "pro")).toBe(1); // Ana
    expect(await n("plano", "elite")).toBe(1); // Carla
    expect(await n("plano", "teste")).toBeGreaterThanOrEqual(1); // Bruno (e quem a carga puser em teste)
    expect(await n("fase", "pratica")).toBe(1); // Carla
    await expect(n("plano", "ouro")).rejects.toThrow(/Escolha para quem vai/);
    await expect(n("todos", "pro")).rejects.toThrow(/Escolha para quem vai/);
  });

  it("enviar para um plano: só quem é do plano recebe; registro de quem enviou; o mesmo envio não repete", async () => {
    const idem = "idem-elite-0001";
    const c = await enviar(ADMIN, { p_titulo: "Aula ao vivo da 2ª fase", p_texto: "Hoje às 20h.", p_link: "/novo/atualizacoes", p_publico: "plano", p_filtro: "elite", p_idem: idem });
    expect(c).toMatchObject({ destinatarios: 1, link: "/atualizacoes", enviado_por: ADMIN, repetido: false });
    const de2 = await enviar(ADMIN, { p_titulo: "Aula ao vivo da 2ª fase", p_publico: "plano", p_filtro: "elite", p_idem: idem });
    expect(de2).toMatchObject({ id: c.id, repetido: true });
    expect((await q1(`select count(*)::int n from public.avisos_aluno where comunicado_id = $1`, [c.id])).n).toBe(1);
    const carla = (await rpc(CARLA, "app_minhas_notificacoes")).itens.find((i: any) => i.titulo === "Aula ao vivo da 2ª fase");
    expect(carla).toMatchObject({ tipo: "comunicado", rota: "link", link: "/atualizacoes", acao: "Abrir" });
    expect((await rpc(ANA, "app_minhas_notificacoes")).itens.some((i: any) => i.titulo === "Aula ao vivo da 2ª fase")).toBe(false);
    const log = await q1(`select actor_id, details from public.admin_audit_log where action = 'comunicado.enviar' and target = $1`, [String(c.id)]);
    expect(log).toMatchObject({ actor_id: ADMIN, details: { publico: "plano", filtro: "elite", destinatarios: 1 } });
    // lista da Administração: quem enviou e quantos leram
    await rpc(CARLA, "app_notificacoes_lidas", { p_ids: [carla.id] });
    const lista = await rpc(ADMIN, "app_admin_comunicados");
    expect(lista[0]).toMatchObject({ id: c.id, enviado_por: "Admin Teste", destinatarios: 1, lidas: 1 });
  });

  it("equipe e revisores não recebem comunicado e não têm Central", async () => {
    await enviar(ADMIN, { p_titulo: "Manutenção hoje à noite" });
    for (const quem of [ADMIN, EDITOR, REVISOR]) {
      expect((await q1(`select count(*)::int n from public.avisos_aluno where user_id = $1`, [quem])).n).toBe(0);
      expect(await rpc(quem, "app_minhas_notificacoes")).toMatchObject({ aluno: false, itens: [], nao_lidas: 0 });
    }
  });

  it("link só de tela do app ou https; texto e título com tamanho certo", async () => {
    for (const link of ["javascript:alert(1)", "http://site.com", "//site.com", "/Planos<script>"]) {
      await expect(enviar(ADMIN, { p_link: link })).rejects.toThrow(/O link precisa ser/);
    }
    await expect(enviar(ADMIN, { p_titulo: "oi" })).rejects.toThrow(/título/);
    await expect(enviar(ADMIN, { p_texto: "x".repeat(601) })).rejects.toThrow(/texto/);
    const ok = await enviar(ADMIN, { p_link: "https://www.gov.br/inep/revalida" });
    expect(ok.link).toBe("https://www.gov.br/inep/revalida");
  });

  it("marcar todas como lidas", async () => {
    expect((await rpc(BRUNO, "app_minhas_notificacoes")).nao_lidas).toBeGreaterThan(1);
    expect(await rpc(BRUNO, "app_notificacoes_lidas", { p_ids: null })).toBeGreaterThan(1);
    expect((await rpc(BRUNO, "app_minhas_notificacoes")).nao_lidas).toBe(0);
  });
});

describe("contrato novo no prazo da cláusula 6.5-A", () => {
  it("cria uma vez por versão e fica lida sozinha depois do aceite", async () => {
    // Diego aceitou só a versão antiga (beforeAll) e passa a ter plano pago ativo: está no prazo (grace_until)
    expect((await rpc(DIEGO, "app_minhas_notificacoes")).itens.some((i: any) => i.tipo === "contrato_novo")).toBe(false); // sem plano ativo: nada
    await q(`update public.subscriptions set plan = 'pro', status = 'active', current_period_end = now() + interval '12 days' where user_id = $1`, [DIEGO]);
    const r1 = await rpc(DIEGO, "app_minhas_notificacoes");
    const contrato = r1.itens.filter((i: any) => i.tipo === "contrato_novo");
    expect(contrato).toHaveLength(1);
    expect(contrato[0]).toMatchObject({ rota: "aceite", acao: "Ler o contrato", lida: false });
    expect(contrato[0].titulo).toMatch(/Atualizamos o Contrato \(versão 3\.0\)/);
    expect(contrato[0].texto).toMatch(/Você continua com o seu plano até \d{2}\/\d{2}\/\d{4}/);
    await rpc(DIEGO, "app_minhas_notificacoes");
    expect((await q1(`select count(*)::int n from public.avisos_aluno where user_id = $1 and tipo = 'contrato_novo'`, [DIEGO])).n).toBe(1);
    expect((await rpc(DIEGO, "app_meus_avisos")).novos).toEqual([]); // fora do pop-up (o topo do app já tem o aviso)
    expect((await q1(`select email_status from public.avisos_aluno where user_id = $1 and tipo = 'contrato_novo'`, [DIEGO])).email_status).toBe("so_tela");
    // aceitou a versão vigente: a notificação fica lida
    await q(`insert into public.legal_acceptances (user_id, document, version, origin, email_hash) values ($1, 'termo_uso', '3.0', 'tela_aceite', 'x')`, [DIEGO]);
    const r2 = await rpc(DIEGO, "app_minhas_notificacoes");
    expect(r2.itens.find((i: any) => i.tipo === "contrato_novo").lida).toBe(true);
    expect(r2.nao_lidas).toBe(r2.itens.filter((i: any) => !i.lida).length);
  });

  it("quem já aceitou a vigente não recebe nada de contrato", async () => {
    await rpc(CARLA, "app_minhas_notificacoes");
    expect((await q1(`select count(*)::int n from public.avisos_aluno where user_id = $1 and tipo = 'contrato_novo'`, [CARLA])).n).toBe(0);
  });
});

describe("migração: colar duas vezes, desfazer e colar de novo (ensaio)", () => {
  const conferir = async () => (await q1(CONFERIR)).resultado as string;
  it("colar de novo não estraga nada nem apaga notificações", async () => {
    const antes = (await q1(`select count(*)::int n from public.avisos_aluno`)).n;
    await dev.db.exec(MIGRACAO);
    await dev.db.exec(MIGRACAO);
    expect((await q1(`select count(*)::int n from public.avisos_aluno`)).n).toBe(antes);
    expect(await conferir()).toBe("OK: Central de Notificações (013830) no banco");
  });

  it("desfazer volta à 013760 (cobrança intacta) e pode ser colado de novo", async () => {
    const cobranca = (await q1(`select count(*)::int n from public.avisos_aluno where tipo in ('renovacao', 'pagamento_falhou', 'acesso_bloqueado', 'acesso_liberado')`)).n;
    await dev.db.exec(DESFAZER);
    await dev.db.exec(DESFAZER);
    expect(await conferir()).toMatch(/^FALTA: .*comunicados_equipe/);
    expect((await q1(`select count(*)::int n from public.avisos_aluno`)).n).toBe(cobranca);
    expect(await rpc(ANA, "app_meus_avisos")).toHaveProperty("novos");
    await dev.db.exec(MIGRACAO);
    expect(await conferir()).toBe("OK: Central de Notificações (013830) no banco");
    expect((await rpc(ANA, "app_minhas_notificacoes")).aluno).toBe(true);
  });
});
