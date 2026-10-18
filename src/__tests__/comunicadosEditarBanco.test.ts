// @vitest-environment node
/**
 * Comunicados: editar, apagar (lógico) e restaurar, com o editor profissional (migração 013940), no banco local (PGlite, todas as
 * migrações do ramo, na ordem da produção):
 *   - editar: o aluno vê a versão nova com "editado" (lida continua lida); histórico com quem, quando, antes e depois; registro geral;
 *     edição sem mudança não cria versão; versão velha aberta em outra tela é recusada; público só muda enquanto ninguém leu;
 *   - apagar: some do sino e da lista do aluno (também da leitura direta da tabela), com quem, quando e motivo; filtro "apagados";
 *     restaurar devolve tudo como era;
 *   - formatação (rico): guardada no comunicado e na notificação; forma inválida ou grande demais é recusada; comunicado antigo sem
 *     formatação continua igual;
 *   - SEGURANÇA: aluno, editor e revisora são barrados em todas as funções da Administração e não gravam na tabela;
 *   - a migração pode ser colada duas vezes, desfeita e colada de novo (conferência OK/FALTA).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openDevDatabaseForTests, type DevDatabase } from "../../server/devDb/devDatabase";
import { devContentDb, type ContentDb } from "../../server/contentHub/infra";
import { campoDoDoc } from "../shared/docRico/campos";

const ROOT = path.resolve(__dirname, "../..");
const MIGRACAO = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261003013940_comunicados_editar_apagar.sql"), "utf8");
const DESFAZER = fs.readFileSync(path.join(ROOT, "supabase/desfazer/20261003013940_comunicados_editar_apagar.desfazer.sql"), "utf8");
const CONFERIR = fs.readFileSync(path.join(ROOT, "supabase/conferir/comunicados-editar-apagar.sql"), "utf8");

const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "comunicados-editar-"));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ANA, BRUNO, CARLA, ADMIN, EDITOR, REVISOR, ADMIN2] = [61, 62, 63, 64, 65, 66, 67].map(id);
const TODOS = [ANA, BRUNO, CARLA, ADMIN, EDITOR, REVISOR, ADMIN2];
let dev: DevDatabase;
let db: ContentDb;

const q = async (sql: string, args: unknown[] = []) => (await dev.db.query<any>(sql, args)).rows;
const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
const rpc = <T = any>(user: string, fn: string, args: Record<string, unknown> = {}) => db.asUser<T>({ id: user, email: null }, fn, args);
const comoAluno = (user: string, sql: string, args: unknown[] = []) =>
  dev.db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: "authenticated" })]);
    return (await tx.query<any>(sql, args)).rows;
  });
const enviar = (o: Record<string, unknown> = {}) =>
  rpc(ADMIN, "app_admin_comunicado_enviar", { p_titulo: "Aviso da equipe", p_texto: "Texto do comunicado.", p_link: null, p_publico: "todos", p_filtro: null, p_idem: `idem-${Math.random().toString(36).slice(2, 12)}`, ...o });
const centralDe = async (u: string) => rpc(u, "app_minhas_notificacoes");
const aviso = async (u: string, cid: number) => q1(`select * from public.avisos_aluno where user_id = $1 and comunicado_id = $2`, [u, cid]);
const naCentral = async (u: string, cid: number) => {
  const a = await aviso(u, cid);
  const c = await centralDe(u);
  return { item: a ? c.itens.find((i: any) => i.id === a.id) ?? null : null, naoLidas: c.nao_lidas as number };
};

// Documento rico de verdade (como o editor manda): título, negrito, lista e link.
const DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Simulado nacional" }] },
    { type: "paragraph", content: [{ type: "text", text: "Sábado, " }, { type: "text", text: "às 9h", marks: [{ type: "bold" }] }, { type: "text", text: "." }] },
    { type: "bulletList", content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Teoria" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Prática", marks: [{ type: "italic" }] }] }] },
    ] },
    { type: "paragraph", content: [{ type: "text", text: "Inscrição", marks: [{ type: "link", attrs: { href: "https://www.gov.br/inep" } }] }] },
  ],
};
const CAMPO = campoDoDoc(DOC);

beforeAll(async () => {
  dev = await openDevDatabaseForTests(path.join(tmp, "db"));
  db = devContentDb(async () => dev);
  for (const [i, uid] of TODOS.entries()) {
    await q(`insert into auth.users (id, email) values ($1, $2)`, [uid, `ce${i}@t.dev`]);
    await q(`update public.profiles set name = $2 where id = $1`, [uid, ["Ana", "Bruno", "Carla", "Admin Teste", "Editor", "Revisora", "Outra Admin"][i]]);
    await q(`insert into public.legal_acceptances (user_id, document, version, origin, email_hash) select $1, document, version, 'tela_aceite', 'x' from public.legal_versions where document = 'termo_uso'`, [uid]);
  }
  await q(`update public.user_roles set role = 'admin' where user_id = any($1::uuid[])`, [[ADMIN, ADMIN2]]);
  await q(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);
  await q(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA')`, [REVISOR]);
  await q(`delete from public.aluno_fases where user_id = any($1::uuid[])`, [[ANA, BRUNO, CARLA]]);
  const fase = (u: string, f: string, sit: string, plano: string | null) =>
    q(`insert into public.aluno_fases (user_id, fase, situacao, plano, inicio, fim, origem) values ($1, $2, $3, $4, now() - interval '1 day', now() + interval '20 days', 'equipe')`, [u, f, sit, plano]);
  await fase(ANA, "teoria", "paga", "pro");
  await fase(BRUNO, "teoria", "teste", null);
  await fase(CARLA, "teoria", "paga", "elite");
  await fase(CARLA, "pratica", "paga", "elite");
}, 300_000);

afterAll(async () => {
  await dev?.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("enviar com formatação", () => {
  it("o projetor do editor gera texto oficial + rico (o teste usa o mesmo caminho do editor)", () => {
    expect(CAMPO.rico).not.toBeNull();
    expect(CAMPO.texto).toContain("Simulado nacional");
    expect(CAMPO.texto).toContain("[Inscrição](https://www.gov.br/inep)");
  });

  it("guarda o rico no comunicado e na notificação de cada aluno; o aluno recebe o rico", async () => {
    const c = await enviar({ p_titulo: "Simulado no sábado", p_texto: CAMPO.texto, p_rico: CAMPO.rico });
    expect(c.rico).toEqual(CAMPO.rico);
    const { item } = await naCentral(ANA, c.id);
    expect(item).toMatchObject({ tipo: "comunicado", titulo: "Simulado no sábado", texto: CAMPO.texto, rico: CAMPO.rico, editado: false });
  });

  it("chamada antiga (sem p_rico) continua valendo e fica sem formatação", async () => {
    const c = await rpc(ADMIN, "app_admin_comunicado_enviar", { p_titulo: "Só texto", p_texto: "Comunicado simples.", p_link: null, p_publico: "todos", p_filtro: null, p_idem: "idem-antigo-1" });
    expect(c.rico).toBeNull();
    expect((await naCentral(BRUNO, c.id)).item).toMatchObject({ texto: "Comunicado simples.", rico: null, editado: false });
  });

  it("formatação com forma inválida ou grande demais é recusada", async () => {
    await expect(enviar({ p_rico: { f: "html", v: 1, doc: { type: "doc", content: [] } } })).rejects.toThrow(/formatação/);
    await expect(enviar({ p_rico: { f: "sdoc", v: 1, doc: { type: "doc", content: [] }, extra: "<script>" } })).rejects.toThrow(/formatação/);
    const grande = { f: "sdoc", v: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(70000) }] }] } };
    await expect(enviar({ p_rico: grande })).rejects.toThrow(/formatação/);
  });
});

describe("editar", () => {
  it("o aluno vê a versão nova com 'editado'; quem já leu continua com lida; histórico e registro com antes e depois", async () => {
    const c = await enviar({ p_titulo: "Aula ao vivo", p_texto: "Hoje às 20h." });
    await rpc(ANA, "app_notificacoes_lidas", { p_ids: [(await aviso(ANA, c.id)).id] });
    const e = await rpc(ADMIN2, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "Aula ao vivo (novo horário)", p_texto: CAMPO.texto, p_link: "/novo/atualizacoes", p_rico: CAMPO.rico, p_versao: 1 });
    expect(e).toMatchObject({ mudou: true, versao: 2, titulo: "Aula ao vivo (novo horário)", link: "/atualizacoes", editado_por: "Outra Admin", enviado_por: "Admin Teste" });
    const ana = (await naCentral(ANA, c.id)).item;
    expect(ana).toMatchObject({ titulo: "Aula ao vivo (novo horário)", texto: CAMPO.texto, rico: CAMPO.rico, editado: true, lida: true, rota: "link", link: "/atualizacoes", acao: "Abrir" });
    expect((await naCentral(BRUNO, c.id)).item).toMatchObject({ editado: true, lida: false });
    const h = await rpc(ADMIN, "app_admin_comunicado_historico", { p_id: c.id });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ acao: "editar", versao: 2, por: "Outra Admin" });
    expect(h[0].antes).toMatchObject({ titulo: "Aula ao vivo", texto: "Hoje às 20h.", rico: null, link: null });
    expect(h[0].depois).toMatchObject({ titulo: "Aula ao vivo (novo horário)", rico: CAMPO.rico, link: "/atualizacoes" });
    const log = await q1(`select * from public.admin_audit_log where action = 'comunicado.editar' and target = $1`, [String(c.id)]);
    expect(log.actor_id).toBe(ADMIN2);
    expect(log.details).toMatchObject({ titulo: "Aula ao vivo (novo horário)", titulo_antes: "Aula ao vivo", versao: 2, mudou_publico: false });
  });

  it("salvar sem mudar nada não cria versão nem histórico", async () => {
    const c = await enviar({ p_titulo: "Sem mudança", p_texto: "Igual." });
    const e = await rpc(ADMIN, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: " Sem mudança ", p_texto: "Igual.", p_link: null, p_rico: null });
    expect(e).toMatchObject({ mudou: false, versao: 1, editado_em: null });
    expect(await rpc(ADMIN, "app_admin_comunicado_historico", { p_id: c.id })).toEqual([]);
    expect((await naCentral(ANA, c.id)).item.editado).toBe(false);
  });

  it("tela aberta com versão velha é recusada (ninguém sobrescreve sem ver)", async () => {
    const c = await enviar({ p_titulo: "Concorrência", p_texto: "Versão 1." });
    await rpc(ADMIN, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "Concorrência", p_texto: "Versão 2.", p_link: null, p_versao: 1 });
    await expect(rpc(ADMIN2, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "Concorrência", p_texto: "Outra versão 2.", p_link: null, p_versao: 1 })).rejects.toThrow(/Outra pessoa/);
  });

  it("mesmas regras do enviar (título, texto, link)", async () => {
    const c = await enviar();
    await expect(rpc(ADMIN, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "ab", p_texto: "Texto.", p_link: null })).rejects.toThrow(/título/);
    await expect(rpc(ADMIN, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "Título", p_texto: "x".repeat(601), p_link: null })).rejects.toThrow(/texto/);
    await expect(rpc(ADMIN, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "Título", p_texto: "Texto.", p_link: "javascript:alert(1)" })).rejects.toThrow(/link/);
    await expect(rpc(ADMIN, "app_admin_comunicado_editar", { p_id: 999999, p_titulo: "Título", p_texto: "Texto.", p_link: null })).rejects.toThrow(/não encontrado/);
  });

  it("público muda enquanto ninguém leu (as notificações vão para o público novo); depois que alguém leu, fica fixo", async () => {
    const c = await enviar({ p_titulo: "Para todos", p_texto: "Primeiro público." });
    expect(c.destinatarios).toBe(3);
    const e = await rpc(ADMIN, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "Só PRO", p_texto: "Público novo.", p_link: null, p_publico: "plano", p_filtro: "pro" });
    expect(e).toMatchObject({ publico: "plano", filtro: "pro", destinatarios: 1, lidas: 0 });
    expect(await aviso(ANA, c.id)).toBeTruthy();
    expect(await aviso(BRUNO, c.id)).toBeUndefined();
    expect(await aviso(CARLA, c.id)).toBeUndefined();
    expect((await naCentral(ANA, c.id)).item).toMatchObject({ titulo: "Só PRO", editado: true });
    // público sem ninguém: recusado (nada muda)
    await expect(rpc(ADMIN, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "Só PRO", p_texto: "Público novo.", p_link: null, p_publico: "plano", p_filtro: "pratica" })).rejects.toThrow(/Nenhum aluno/);
    // Ana lê: público fica fixo
    await rpc(ANA, "app_notificacoes_lidas", { p_ids: [(await aviso(ANA, c.id)).id] });
    await expect(rpc(ADMIN, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "Só PRO", p_texto: "Público novo.", p_link: null, p_publico: "todos", p_filtro: null })).rejects.toThrow(/já leu/);
    // título e texto continuam editáveis (mesmo público = não conta como mudança de público)
    expect((await rpc(ADMIN, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "Só PRO (corrigido)", p_texto: "Público novo.", p_link: null, p_publico: "plano", p_filtro: "pro" })).mudou).toBe(true);
    expect((await naCentral(ANA, c.id)).item).toMatchObject({ titulo: "Só PRO (corrigido)", lida: true });
  });
});

describe("apagar e restaurar (apagamento lógico)", () => {
  it("some do sino e da lista do aluno (também pela tabela); fica no filtro 'apagados' com quem, quando e motivo; restaurar devolve", async () => {
    const c = await enviar({ p_titulo: "Vai ser apagado", p_texto: "Texto." });
    await rpc(BRUNO, "app_notificacoes_lidas", { p_ids: [(await aviso(BRUNO, c.id)).id] });
    const antesAna = (await centralDe(ANA)).nao_lidas;
    const r = await rpc(ADMIN, "app_admin_comunicado_apagar", { p_id: c.id, p_motivo: "  Enviado por engano  " });
    expect(r).toMatchObject({ mudou: true, apagado_por: "Admin Teste", apagado_motivo: "Enviado por engano" });
    expect(r.apagado_em).toBeTruthy();
    // aluno: some da lista, da contagem e da leitura direta (RLS)
    expect((await centralDe(ANA)).itens.some((i: any) => i.titulo === "Vai ser apagado")).toBe(false);
    expect((await centralDe(ANA)).nao_lidas).toBe(antesAna - 1);
    expect(await comoAluno(ANA, `select id from public.avisos_aluno where comunicado_id = $1`, [c.id])).toEqual([]);
    // não marca como lida o que foi apagado
    expect(await rpc(ANA, "app_notificacoes_lidas", { p_ids: [(await aviso(ANA, c.id)).id] })).toBe(0);
    // Administração: sai dos ativos, entra nos apagados
    expect((await rpc(ADMIN, "app_admin_comunicados", { p_limite: 100 })).some((x: any) => x.id === c.id)).toBe(false);
    expect((await rpc(ADMIN, "app_admin_comunicados", { p_limite: 100, p_situacao: "apagados" })).find((x: any) => x.id === c.id)).toMatchObject({ apagado_motivo: "Enviado por engano" });
    // não edita apagado; apagar de novo não muda nada
    await expect(rpc(ADMIN, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "Outro", p_texto: "Texto.", p_link: null })).rejects.toThrow(/Restaure/);
    expect((await rpc(ADMIN, "app_admin_comunicado_apagar", { p_id: c.id })).mudou).toBe(false);
    // nada foi apagado de verdade
    expect((await q1(`select count(*)::int n from public.avisos_aluno where comunicado_id = $1`, [c.id])).n).toBe(3);
    // restaurar (o "Desfazer" da tela): volta como era, inclusive a leitura do Bruno
    const v = await rpc(ADMIN, "app_admin_comunicado_restaurar", { p_id: c.id });
    expect(v).toMatchObject({ mudou: true, apagado_em: null, apagado_por: null, apagado_motivo: null });
    expect((await naCentral(ANA, c.id)).item).toMatchObject({ titulo: "Vai ser apagado", lida: false });
    expect((await naCentral(BRUNO, c.id)).item).toMatchObject({ lida: true });
    expect((await centralDe(ANA)).nao_lidas).toBe(antesAna);
    // histórico e registro geral
    const h = await rpc(ADMIN, "app_admin_comunicado_historico", { p_id: c.id });
    expect(h.map((x: any) => x.acao)).toEqual(["restaurar", "apagar"]);
    expect(h[1]).toMatchObject({ motivo: "Enviado por engano", por: "Admin Teste" });
    expect(h[1].antes.apagado).toBe(false);
    expect(h[1].depois.apagado).toBe(true);
    const acoes = (await q(`select action from public.admin_audit_log where target = $1 order by id`, [String(c.id)])).map((x) => x.action);
    expect(acoes).toEqual(["comunicado.enviar", "comunicado.apagar", "comunicado.restaurar"]);
  });

  it("motivo com mais de 300 letras é recusado; filtro desconhecido também", async () => {
    const c = await enviar();
    await expect(rpc(ADMIN, "app_admin_comunicado_apagar", { p_id: c.id, p_motivo: "x".repeat(301) })).rejects.toThrow(/300/);
    await expect(rpc(ADMIN, "app_admin_comunicados", { p_situacao: "tudo" })).rejects.toThrow(/Filtro/);
  });
});

describe("SEGURANÇA: só administrador; aluno, editor e revisora barrados (no servidor)", () => {
  it("aluno, editor e revisora não editam, não apagam, não restauram, não listam e não leem o histórico", async () => {
    const c = await enviar({ p_titulo: "Alvo de ataque", p_texto: "Texto original." });
    for (const u of [ANA, EDITOR, REVISOR]) {
      await expect(rpc(u, "app_admin_comunicado_editar", { p_id: c.id, p_titulo: "Hackeado", p_texto: "Hackeado.", p_link: null })).rejects.toThrow(/administradores/);
      await expect(rpc(u, "app_admin_comunicado_apagar", { p_id: c.id })).rejects.toThrow(/administradores/);
      await expect(rpc(u, "app_admin_comunicado_restaurar", { p_id: c.id })).rejects.toThrow(/administradores/);
      await expect(rpc(u, "app_admin_comunicados", {})).rejects.toThrow(/administradores/);
      await expect(rpc(u, "app_admin_comunicado_historico", { p_id: c.id })).rejects.toThrow(/administradores/);
      await expect(rpc(u, "app_admin_comunicado_enviar", { p_titulo: "Falso", p_texto: "Falso.", p_link: null, p_publico: "todos", p_filtro: null, p_idem: `idem-ataque-${u}` })).rejects.toThrow(/administradores/);
    }
    const linha = await q1(`select titulo, texto, apagado_em, versao from public.comunicados_equipe where id = $1`, [c.id]);
    expect(linha).toMatchObject({ titulo: "Alvo de ataque", texto: "Texto original.", apagado_em: null, versao: 1 });
    expect((await naCentral(ANA, c.id)).item).toMatchObject({ titulo: "Alvo de ataque", editado: false });
  });

  it("aluno não altera nem apaga a própria notificação pela tabela, não lê histórico nem comunicados_equipe", async () => {
    const c = await enviar({ p_titulo: "Tabela protegida", p_texto: "Texto." });
    await expect(comoAluno(ANA, `update public.avisos_aluno set titulo = 'x', apagado_em = now() where comunicado_id = $1`, [c.id])).rejects.toThrow(/permission denied/);
    await expect(comoAluno(ANA, `delete from public.avisos_aluno where comunicado_id = $1`, [c.id])).rejects.toThrow(/permission denied/);
    await expect(comoAluno(ANA, `update public.comunicados_equipe set apagado_em = now() where id = $1`, [c.id])).rejects.toThrow(/permission denied/);
    await expect(comoAluno(ANA, `select * from public.comunicados_historico`)).rejects.toThrow(/permission denied/);
    await expect(comoAluno(ANA, `select * from public.comunicados_equipe`)).rejects.toThrow(/permission denied/);
    await expect(comoAluno(ANA, `select public.comunicado_admin_linha($1)`, [c.id])).rejects.toThrow(/permission denied/);
    expect((await aviso(ANA, c.id))).toMatchObject({ titulo: "Tabela protegida", apagado_em: null });
  });

  it("sem login, nada", async () => {
    await expect(
      dev.db.transaction(async (tx) => {
        await tx.exec(`set local role anon`);
        return (await tx.query(`select public.app_admin_comunicado_apagar(1)`)).rows;
      })
    ).rejects.toThrow(/permission denied/);
  });
});

describe("comunicado antigo (só texto) continua funcionando", () => {
  it("linha gravada antes da 013940 (sem rico, sem versão nova) aparece igual e pode ser editada", async () => {
    const c = await enviar({ p_titulo: "Antigo", p_texto: "Sem formatação." });
    await q(`update public.comunicados_equipe set rico = null where id = $1`, [c.id]);
    expect((await naCentral(CARLA, c.id)).item).toMatchObject({ texto: "Sem formatação.", rico: null, editado: false });
    const lista = await rpc(ADMIN, "app_admin_comunicados", { p_limite: 100 });
    expect(lista.find((x: any) => x.id === c.id)).toMatchObject({ rico: null, versao: 1, por_email: false });
  });
});

describe("migração: colar duas vezes, desfazer e colar de novo (ensaio)", () => {
  const conferir = async () => (await q1(CONFERIR)).resultado as string;
  it("colar de novo não estraga nada", async () => {
    const antes = (await q1(`select count(*)::int n from public.avisos_aluno`)).n;
    expect(await conferir()).toBe("OK: Comunicados com editar, apagar e editor profissional (013940) no banco");
    await dev.db.exec(MIGRACAO);
    await dev.db.exec(MIGRACAO);
    expect((await q1(`select count(*)::int n from public.avisos_aluno`)).n).toBe(antes);
    expect(await conferir()).toBe("OK: Comunicados com editar, apagar e editor profissional (013940) no banco");
  });

  it("desfazer volta à 013830 (apagados saem de vez do aluno) e pode ser colado de novo", async () => {
    const c = await enviar({ p_titulo: "Apagado antes do desfazer", p_texto: "Texto." });
    await rpc(ADMIN, "app_admin_comunicado_apagar", { p_id: c.id });
    await dev.db.exec(DESFAZER);
    await dev.db.exec(DESFAZER);
    expect(await conferir()).toMatch(/^FALTA: .*comunicados_historico/);
    expect((await q1(`select count(*)::int n from public.avisos_aluno where comunicado_id = $1`, [c.id])).n).toBe(0);
    // a 013830 volta a valer: enviar de 6 parâmetros, lista de 1 parâmetro
    const velho = await rpc(ADMIN, "app_admin_comunicado_enviar", { p_titulo: "Depois do desfazer", p_texto: "Texto.", p_link: null, p_publico: "todos", p_filtro: null, p_idem: "idem-desfazer-1" });
    expect(velho.destinatarios).toBe(3);
    expect((await rpc(ADMIN, "app_admin_comunicados", { p_limite: 5 }))[0].titulo).toBe("Depois do desfazer");
    expect((await centralDe(ANA)).aluno).toBe(true);
    await dev.db.exec(MIGRACAO);
    expect(await conferir()).toBe("OK: Comunicados com editar, apagar e editor profissional (013940) no banco");
    expect((await rpc(ADMIN, "app_admin_comunicados", { p_limite: 5 }))[0]).toMatchObject({ titulo: "Depois do desfazer", versao: 1 });
  });
});
