// @vitest-environment node
/**
 * Fontes oficiais com IA — banco (supabase/migrations/…9610_fontes_oficiais_ia.sql): lista de sites oficiais (a equipe lê, só o
 * administrador grava), pedido de busca (uma busca por tema, na fila sem documento, sem repetir a que ainda está andando),
 * candidatos só para o administrador, repetidos por link normalizado e por SHA-256, a regra única de substituição e a função
 * "Busca de fontes oficiais" (`busca_fontes`) na Central de IAs.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { openFontesDb, type FontesDb } from "./helpers/fontesDb";

vi.setConfig({ testTimeout: 120_000 });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fontes-banco-"));
let t: FontesDb;

beforeAll(async () => {
  t = await openFontesDb(path.join(tmp, "db"));
}, 300_000);

// o fechamento do banco pode passar dos 10 s do padrão quando a máquina está sobrecarregada (várias suítes ao mesmo tempo)
afterAll(async () => {
  await t?.dev.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}, 120_000);

const RESTRITO = /Acesso restrito a administradores/;
const sql = async (q: string, params: unknown[] = []) => (await t.dev.db.query<any>(q, params)).rows;
/** SHA-256 de mentira, mas no formato certo (64 caracteres hexadecimais). */
const sha = (n: number) => n.toString(16).padStart(64, "0");
const asAdmin = <T = any>(fn: string, args: Record<string, unknown> = {}) => t.db.asUser<T>(t.adminUser, fn, args);
const known = (url: string | null, sha256: string | null) => t.db.service<string | null>("ch_worker_source_known", { p_url: url, p_sha256: sha256 });
const norm = async (url: string) => (await sql(`select public.ch_url_norm($1) as v`, [url]))[0].v as string | null;

/** Lê uma tabela direto, como a pessoa (papel authenticated + claims), com o RLS valendo. */
async function selectAs(userId: string, q: string) {
  return t.dev.db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
    return (await tx.query<any>(q)).rows;
  });
}

let themeSeq = 0;
/** Pede uma busca de um tema novo (sem repetir nenhuma outra do arquivo) e devolve o id. */
async function newSearch(area: string | null = "CLINICA_MEDICA"): Promise<string> {
  const r = await asAdmin("app_ch_source_search_start", { p_request: { area, theme: `Tema de teste ${++themeSeq}` } });
  return r.searches[0].id;
}

/** Candidato criado como o processamento cria (ch_worker_source_candidate_create), no site gov.br/saude por padrão. */
async function createCandidate(over: Record<string, unknown> = {}) {
  const site = (await sql(`select id from public.ch_official_domains where address = 'www.gov.br/saude'`))[0];
  const searchId = await newSearch();
  const n = ++themeSeq;
  const link = `https://www.gov.br/saude/pt-br/documento-${n}.pdf`;
  return t.db.service<{ id: string; duplicate: boolean }>("ch_worker_source_candidate_create", {
    p_candidate: {
      search_id: searchId,
      domain_id: site.id,
      requested_url: link,
      final_url: link,
      ai_title: `Protocolo Clínico ${n}`,
      ai_institution: "Ministério da Saúde",
      ai_published: "2025-03-14",
      ai_nature: "PCDT",
      ai_kind: "final",
      ai_level: "A",
      ai_reason: "Documento oficial do tema pedido.",
      file_title: `Protocolo Clínico ${n}`,
      file_date: "2025-03-14",
      quote: "Gestantes com pré-eclâmpsia grave devem ser encaminhadas ao centro de referência.",
      quote_page: 2,
      seen_in_search: true,
      file_kind: "pdf",
      sha256: sha(0x100000 + n),
      size_bytes: 123456,
      page_count: 12,
      storage_path: `source-candidates/${sha(0x100000 + n)}.pdf`,
      preview: "Texto das primeiras páginas.",
      suggested_level: "A",
      suggested_kind: "final",
      suggested_nature: "PCDT",
      ...over,
    },
  });
}

describe("Banco", () => {
  it("sites oficiais: 11 sementes + 10 da Vigilância científica (9940), a equipe lê, só administrador grava", async () => {
    const list = await t.db.asUser<any[]>(t.editorUser, "app_ch_official_domains");
    expect(list).toHaveLength(21);
    // governo, internacional, sociedade; dentro de cada tipo, pelo endereço (os sites que as fontes vigiadas do catálogo já usam
    // entraram com a Vigilância científica, 9940: o vigia só baixa site da lista)
    expect(list.map((d) => [d.kind, d.address])).toEqual([
      ["governo", "bvsms.saude.gov.br"],
      ["governo", "download.inep.gov.br"],
      ["governo", "linhasdecuidado.saude.gov.br"],
      ["governo", "ninho.inca.gov.br"],
      ["governo", "portal.cfm.org.br"],
      ["governo", "www.gov.br/aids"],
      ["governo", "www.gov.br/anvisa"],
      ["governo", "www.gov.br/conitec"],
      ["governo", "www.gov.br/inca"],
      ["governo", "www.gov.br/inep"],
      ["governo", "www.gov.br/mec"],
      ["governo", "www.gov.br/saude"],
      ["governo", "www.in.gov.br"],
      ["governo", "www.inca.gov.br"],
      ["governo", "www.planalto.gov.br"],
      ["internacional", "iris.paho.org"],
      ["internacional", "paho.org"],
      ["internacional", "who.int"],
      ["sociedade", "febrasgo.org.br"],
      ["sociedade", "portal.cardiol.br"],
      ["sociedade", "sbp.com.br"],
    ]);
    expect(list.find((d) => d.address === "www.gov.br/saude")).toMatchObject({ institution: "Ministério da Saúde", active: true });
    expect(list.find((d) => d.address === "iris.paho.org")).toMatchObject({ institution: "Repositório IRIS da OPAS" });
    expect(list.find((d) => d.address === "portal.cardiol.br")).toMatchObject({ institution: "Sociedade Brasileira de Cardiologia" });
    await expect(t.db.asUser(t.studentUser, "app_ch_official_domains")).rejects.toThrow(/restrito/);
    await expect(
      t.db.asUser(t.editorUser, "app_ch_save_official_domain", { p_domain: { address: "exemplo.gov.br", institution: "Exemplo", kind: "governo" } })
    ).rejects.toThrow(RESTRITO);
    // RLS: a equipe lê a tabela; o aluno não
    expect((await selectAs(t.EDITOR, "select id from public.ch_official_domains")).length).toBe(21);
    expect(await selectAs(t.STUDENT, "select id from public.ch_official_domains")).toEqual([]);
  });

  it("endereço do site: tira https:// e barra final, recusa acento", async () => {
    const save = (p_domain: Record<string, unknown>) => asAdmin("app_ch_save_official_domain", { p_domain });
    const saved = await save({ address: "https://Exemplo.gov.br/Saude/", institution: "Exemplo", kind: "governo" });
    expect(saved).toMatchObject({ address: "exemplo.gov.br/saude", institution: "Exemplo", kind: "governo", active: true, created_by: t.ADMIN });
    await expect(save({ address: "saúde.gov.br", institution: "Exemplo", kind: "governo" })).rejects.toThrow(/use só letras sem acento/);
    await expect(save({ address: "exemplo gov.br", institution: "Exemplo", kind: "governo" })).rejects.toThrow(/use só letras sem acento/);
    await expect(save({ address: "exemplo", institution: "Exemplo", kind: "governo" })).rejects.toThrow(/Endereço do site inválido/);
    await expect(save({ address: "exemplo2.gov.br", institution: "Exemplo", kind: "estadual" })).rejects.toThrow(/governo, internacional ou sociedade/);
    await expect(save({ address: "exemplo2.gov.br", institution: " ", kind: "governo" })).rejects.toThrow(/instituição/);
    await expect(save({ address: "EXEMPLO.gov.br/saude", institution: "Outro", kind: "governo" })).rejects.toThrow(/já está na lista/);
    // editar: desativar o mesmo site
    const off = await save({ id: saved.id, address: saved.address, institution: "Exemplo", kind: "governo", active: false });
    expect(off).toMatchObject({ id: saved.id, active: false, updated_by: t.ADMIN });
    const log = await sql(`select details from public.ch_audit where action = 'source_domain.save' and target = $1 order by id`, [saved.id]);
    expect(log.map((l) => l.details.active)).toEqual([true, false]);
  });

  it("pedido de busca cria a busca e o trabalho sem documento; igual na fila não repete", async () => {
    const r = await asAdmin("app_ch_source_search_start", { p_request: { area: "CLINICA_MEDICA", theme: "Dengue", top_themes: null, free_text: "PCDT mais recente" } });
    expect(r.searches).toHaveLength(1);
    expect(r.searches[0]).toMatchObject({ theme: "Dengue", duplicate: false });
    const id = r.searches[0].id;
    const [s] = await sql(`select * from public.ch_source_searches where id = $1`, [id]);
    expect(s).toMatchObject({ requested_by: t.ADMIN, area: "CLINICA_MEDICA", theme: "Dengue", free_text: "PCDT mais recente", origin: "tema", status: "na_fila", web_searches: 0 });
    const [job] = await sql(`select * from public.ch_jobs where id = $1`, [s.job_id]);
    expect(job).toMatchObject({ step: "source_search", document_id: null, scope_key: `search:${id}`, idempotency_key: `source_search:${id}`, max_attempts: 2, status: "queued" });
    const jobs = async () => Number((await sql(`select count(*) as n from public.ch_jobs where step = 'source_search'`))[0].n);
    const before = await jobs();

    // o mesmo pedido (sem caixa e com espaços) não repete
    const again = await asAdmin("app_ch_source_search_start", { p_request: { area: "CLINICA_MEDICA", theme: "  dengue ", free_text: "pcdt MAIS recente" } });
    expect(again.searches).toEqual([{ id, theme: "Dengue", duplicate: true }]);
    expect(await jobs()).toBe(before);
    // outra área, ou outro texto livre, é outra busca
    const other = await asAdmin("app_ch_source_search_start", { p_request: { area: "PEDIATRIA", theme: "Dengue", free_text: "PCDT mais recente" } });
    expect(other.searches[0].duplicate).toBe(false);
    expect(await jobs()).toBe(before + 1);

    // busca que falhou não bloqueia repetir o mesmo pedido
    await t.db.service("ch_worker_source_search_update", { p_search_id: id, p_patch: { status: "falhou", message: "IA fora do ar." } });
    const retry = await asAdmin("app_ch_source_search_start", { p_request: { area: "CLINICA_MEDICA", theme: "Dengue", free_text: "PCDT mais recente" } });
    expect(retry.searches[0].duplicate).toBe(false);
    expect(retry.searches[0].id).not.toBe(id);

    const log = await sql(`select actor_id, details from public.ch_audit where action = 'source_search.request' and target = $1`, [id]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor_id: t.ADMIN, details: { theme: "Dengue", origin: "tema" } });

    const start = (p_request: Record<string, unknown>) => asAdmin("app_ch_source_search_start", { p_request });
    await expect(start({ area: "CLINICA_MEDICA", theme: "Dengue", top_themes: 5 })).rejects.toThrow(/Escolha um tema ou 'temas mais cobrados'/);
    await expect(start({ area: "CLINICA_MEDICA" })).rejects.toThrow(/Escolha um tema ou 'temas mais cobrados'/);
    await expect(start({ area: "CLINICA_MEDICA", theme: "  " })).rejects.toThrow(/Escolha um tema ou 'temas mais cobrados'/);
    await expect(start({ area: "CLINICA_MEDICA", top_themes: 11 })).rejects.toThrow(/de 1 a 10/);
    await expect(start({ area: "CARDIOLOGIA", theme: "Dengue" })).rejects.toThrow(/Área inválida/);
    await expect(start({ area: "CLINICA_MEDICA", theme: "x".repeat(121) })).rejects.toThrow(/120 caracteres/);
    await expect(start({ area: "CLINICA_MEDICA", theme: "Dengue", free_text: "x".repeat(301) })).rejects.toThrow(/300 caracteres/);
    expect(await jobs()).toBe(before + 2);
  });

  it("tarefa morta (pela fila ou no último erro) põe a busca em falhou com o motivo; o mesmo pedido volta a buscar", async () => {
    const request = { area: "CLINICA_MEDICA", theme: "Dengue com sinais de alarme", free_text: "Ministério da Saúde" };
    const start = async () => (await asAdmin("app_ch_source_search_start", { p_request: request })).searches as { id: string; duplicate: boolean }[];
    const search = async (id: string) =>
      (await sql(`select s.*, j.status as job_status from public.ch_source_searches s join public.ch_jobs j on j.id = s.job_id where s.id = $1`, [id]))[0];
    const update = (id: string, p_patch: Record<string, unknown>) => t.db.service("ch_worker_source_search_update", { p_search_id: id, p_patch });
    /** A tarefa da busca na última tentativa, em execução (como o processamento a deixa ao pegar da fila). */
    const lastAttempt = (id: string, lockedAgo = "0 seconds") =>
      sql(
        `update public.ch_jobs set status = 'running', attempts = max_attempts, locked_at = now() - $2::interval
          where id = (select job_id from public.ch_source_searches where id = $1) returning id`,
        [id, lockedAgo]
      ).then((r) => r[0].id as string);
    const results = async (id: string) => sql(`select actor_id, details from public.ch_audit where action = 'source_search.result' and target = $1`, [id]);

    // 1) a tarefa do Cloud Run caiu nas 2 tentativas: quem encerra é a própria fila (ch_worker_claim), só no SQL
    const [first] = await start();
    expect(first.duplicate).toBe(false);
    await update(first.id, { status: "buscando" });
    /** Recuperação da fila: tarefa em execução e parada há 1 hora volta à fila, ou morre se não sobrou tentativa. */
    const recover = async () => {
      const claimed = await t.db.service<any>("ch_worker_claim", { p_stale_seconds: 600 });
      // devolve à fila o trabalho que a chamada pegou (outro teste o criou), sem gastar tentativa
      if (claimed) await sql(`update public.ch_jobs set status = 'queued', attempts = attempts - 1, locked_at = null where id = $1`, [claimed.id]);
    };
    // 1ª queda: ainda sobra tentativa, o trabalho volta à fila e a busca segue andando
    await sql(
      `update public.ch_jobs set status = 'running', attempts = 1, locked_at = now() - interval '1 hour'
        where id = (select job_id from public.ch_source_searches where id = $1)`,
      [first.id]
    );
    await recover();
    let s = await search(first.id);
    expect(s).toMatchObject({ job_status: "queued", status: "buscando", message: null, finished_at: null });
    expect(await results(first.id)).toEqual([]);
    // 2ª queda: acabaram as tentativas e a fila encerra o trabalho. O motivo da fila repete a frase a cada recuperação;
    // a busca mostra a frase uma vez só.
    await lastAttempt(first.id, "1 hour");
    await recover();
    s = await search(first.id);
    expect((await sql(`select error from public.ch_jobs where id = $1`, [s.job_id]))[0].error).toBe(
      "Interrompido sem concluir. Falha anterior: Interrompido sem concluir."
    );
    expect(s).toMatchObject({ job_status: "dead", status: "falhou", message: "Interrompido sem concluir." });
    expect(s.finished_at).toBeTruthy();
    expect(await results(first.id)).toEqual([{ actor_id: t.ADMIN, details: expect.objectContaining({ status: "falhou", message: "Interrompido sem concluir." }) }]);
    // o mesmo pedido não volta a busca morta: cria outra, com trabalho novo
    const [second] = await start();
    expect(second.duplicate).toBe(false);
    expect(second.id).not.toBe(first.id);
    expect((await search(second.id)).job_status).toBe("queued");

    // 2) erro comum na última tentativa (ch_worker_finish → dead): a busca vai a falhou com o erro
    await update(second.id, { status: "conferindo" });
    const job2 = await lastAttempt(second.id);
    expect(await t.db.service("ch_worker_finish", { p_job_id: job2, p_ok: false, p_error: "Falha ao gravar o arquivo.", p_metrics: {} })).toBe("dead");
    s = await search(second.id);
    expect(s).toMatchObject({ job_status: "dead", status: "falhou", message: "Falha ao gravar o arquivo." });
    const [third] = await start();
    expect(third.duplicate).toBe(false);

    // 3) busca que o processamento já pôs em falhou, com o motivo dele, não é reescrita quando a tarefa morre
    await update(third.id, { status: "falhou", message: "IA fora do ar e sem reserva." });
    await t.db.service("ch_worker_fail", { p_job_id: await lastAttempt(third.id), p_error: "Falha definitiva." });
    s = await search(third.id);
    expect(s).toMatchObject({ job_status: "dead", status: "falhou", message: "IA fora do ar e sem reserva." });
    expect(await results(third.id)).toHaveLength(1);

    // 4) uma busca ainda "andando" cuja tarefa já morreu (estado anterior a esta regra) também não bloqueia o pedido
    const [fourth] = await start();
    expect(fourth.duplicate).toBe(false);
    await sql(`update public.ch_jobs set status = 'dead', finished_at = now() where id = (select job_id from public.ch_source_searches where id = $1)`, [fourth.id]);
    await sql(`update public.ch_source_searches set status = 'buscando', finished_at = null where id = $1`, [fourth.id]);
    const [fifth] = await start();
    expect(fifth.duplicate).toBe(false);
    expect(fifth.id).not.toBe(fourth.id);
    // e uma busca andando com a tarefa viva continua não repetindo
    expect(await start()).toEqual([{ id: fifth.id, theme: request.theme, duplicate: true }]);
  });

  it("temas mais cobrados: uma busca por tema, no máximo o que a área tem", async () => {
    const jobs = async () => Number((await sql(`select count(*) as n from public.ch_jobs where step = 'source_search'`))[0].n);
    const inc = await asAdmin("app_incidence", { p_dimension: "topic", p_area: "PEDIATRIA" });
    const keys: string[] = inc.rows.map((r: any) => r.key);
    const n = keys.length;
    expect(n).toBeGreaterThan(0);
    const before = await jobs();
    const r = await asAdmin("app_ch_source_search_start", { p_request: { area: "PEDIATRIA", top_themes: 10 } });
    expect(r.searches).toHaveLength(Math.min(10, n));
    expect(r.searches.map((s: any) => s.theme)).toEqual(keys.slice(0, 10));
    expect(r.searches.every((s: any) => s.duplicate === false)).toBe(true);
    const rows = await sql(`select origin, area from public.ch_source_searches where id = any($1::uuid[])`, [r.searches.map((s: any) => s.id)]);
    expect(rows.every((x) => x.origin === "incidencia" && x.area === "PEDIATRIA")).toBe(true);
    expect(await jobs()).toBe(before + Math.min(10, n));

    const saved = await sql(`select id, status from public.questions where area in ('PEDIATRIA', 'CIRURGIA_GERAL')`);
    const restore = () => sql(`update public.questions q set status = b.status from jsonb_to_recordset($1::jsonb) as b(id text, status text) where q.id = b.id`, [JSON.stringify(saved)]);
    try {
      // a área passa a ter só 2 temas válidos: pedir 10 cria só 2
      await sql(`update public.questions set status = 'annulled' where area = 'PEDIATRIA' and topic <> all($1::text[])`, [keys.slice(0, 2)]);
      const few = await asAdmin("app_ch_source_search_start", { p_request: { area: "PEDIATRIA", top_themes: 10, free_text: "segunda rodada" } });
      expect(few.searches.map((s: any) => [s.theme, s.duplicate])).toEqual(keys.slice(0, 2).map((k) => [k, false]));

      // área sem nenhuma questão válida: mensagem clara e nada na fila
      await sql(`update public.questions set status = 'annulled' where area = 'CIRURGIA_GERAL'`);
      const mid = await jobs();
      await expect(asAdmin("app_ch_source_search_start", { p_request: { area: "CIRURGIA_GERAL", top_themes: 5 } })).rejects.toThrow(
        /Não há questões oficiais catalogadas nesta área para escolher os temas mais cobrados/
      );
      expect(await jobs()).toBe(mid);
      expect(await sql(`select id from public.ch_source_searches where area = 'CIRURGIA_GERAL'`)).toEqual([]);
    } finally {
      await restore();
    }
  });

  it("busca_fontes na Central: só sozinha, sem Ollama nem Gemini, máximo de 1 a 10", async () => {
    const C = { provider: "anthropic", model: "claude-x" };
    const save = (key: string, config: unknown) => t.db.service<any>("ch_worker_ai_save_function", { p_actor: t.ADMIN, p_key: key, p_config: config });
    try {
      await expect(save("busca_fontes", { mode: "linha", primary_ref: C })).rejects.toThrow(/A busca de fontes oficiais só usa o modo sozinha/);
      await expect(save("busca_fontes", { mode: "comite", primary_ref: C })).rejects.toThrow(/só usa o modo sozinha/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: { provider: "ollama", model: "llama-x" } })).rejects.toThrow(/Ollama não busca na internet/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: C, fallback_ref: { provider: "ollama", model: "llama-x" } })).rejects.toThrow(/Ollama não busca/);
      // Gemini: recusado como principal e como reserva, com a mensagem pedida; Claude e OpenAI passam; as outras funções aceitam
      const GEM = { provider: "gemini", model: "gemini-x" };
      const noGemini = /A busca de fontes oficiais não funciona com o Gemini: ele não consegue limitar a pesquisa aos sites oficiais\. Escolha Claude ou OpenAI\./;
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: GEM })).rejects.toThrow(noGemini);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: C, fallback_ref: GEM })).rejects.toThrow(noGemini);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: GEM, fallback_ref: C })).rejects.toThrow(noGemini);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: { provider: "ollama", model: "llama-x" }, fallback_ref: GEM })).rejects.toThrow(/Ollama não busca/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: C, reviewers: [{ provider: "openai", model: "gpt-x" }] })).rejects.toThrow(/conferentes/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: C, max_searches: 11 })).rejects.toThrow(/de 1 a 10/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: C, max_searches: 0 })).rejects.toThrow(/de 1 a 10/);
      await expect(save("busca_fontes", { mode: "sozinha", primary_ref: C, max_searches: 2.5 })).rejects.toThrow(/de 1 a 10/);
      expect((await t.db.service<any>("ch_worker_ai_config")).functions).toEqual([]);

      const v = await save("busca_fontes", { mode: "sozinha", primary_ref: C, fallback_ref: { provider: "openai", model: "gpt-x" }, max_searches: 3 });
      expect(v).toMatchObject({ key: "busca_fontes", mode: "sozinha", max_searches: 3 });
      expect((await t.db.service<any>("ch_worker_ai_config")).functions.find((f: any) => f.key === "busca_fontes").max_searches).toBe(3);
      // sem máximo: nulo (o servidor usa o padrão)
      expect((await save("busca_fontes", { mode: "sozinha", primary_ref: C })).max_searches).toBeNull();
      // nas outras funções o máximo de buscas fica nulo
      expect((await save("criacao", { mode: "sozinha", primary_ref: C, max_searches: 4 })).max_searches).toBeNull();

      const s = await t.db.asUser<any>(t.editorUser, "app_ai_summary");
      expect(s.functions).toHaveLength(9);
      expect(s.functions.map((f: any) => f.key)).toEqual(["criacao", "verificacao", "engenharia_reversa", "assistente_preencher", "assistente_conferir", "assistente_revisar", "busca_fontes"]);
      expect(s.functions.find((f: any) => f.key === "busca_fontes")).toMatchObject({ configured: true, mode: "sozinha" });

      // tirar a configuração só desliga (a linha sai)
      expect(await save("busca_fontes", null)).toBeNull();
      expect((await t.db.service<any>("ch_worker_ai_config")).functions.map((f: any) => f.key)).toEqual(["criacao"]);
      // a regra da tabela aceita as 7 chaves e nenhuma outra
      await expect(sql(`insert into public.ai_functions (key, mode) values ('outra_funcao', 'sozinha')`)).rejects.toThrow(/ai_functions_key_check/);
    } finally {
      await save("busca_fontes", null);
      await save("criacao", null);
    }
  });

  it("ai_calls guarda web_searches; preço por busca preservado quando não vem", async () => {
    const call = { function_key: "busca_fontes", mode: "sozinha", role: "principal", provider: "anthropic", model: "claude-x", cost_usd: 0.05, outcome: "ok", source: "fontes-teste" };
    expect(await t.db.service<number>("ch_worker_ai_log_calls", { p_calls: [{ ...call, item_id: "a", web_searches: 4 }, { ...call, item_id: "b" }] })).toBe(2);
    expect(await sql(`select item_id, web_searches from public.ai_calls where source = 'fontes-teste' order by item_id`)).toEqual([
      { item_id: "a", web_searches: 4 },
      { item_id: "b", web_searches: 0 },
    ]);
    await expect(t.db.service("ch_worker_ai_log_calls", { p_calls: [{ ...call, item_id: "c", web_searches: -1 }] })).rejects.toThrow();

    const price = (p_price: Record<string, unknown>) =>
      t.db.service<any>("ch_worker_ai_save_price", { p_actor: t.ADMIN, p_provider: "anthropic", p_model: "claude-x", p_price });
    expect(Number((await price({ input_per_mtok: 3, output_per_mtok: 15, per_search_usd: 0.01 })).per_search_usd)).toBe(0.01);
    const kept = await price({ input_per_mtok: 4, output_per_mtok: 16 });
    expect(Number(kept.input_per_mtok)).toBe(4);
    expect(Number(kept.per_search_usd)).toBe(0.01);
    const cfg = await t.db.service<any>("ch_worker_ai_config");
    expect(Number(cfg.prices.find((p: any) => p.model === "claude-x").per_search_usd)).toBe(0.01);
    await expect(price({ input_per_mtok: 4, output_per_mtok: 16, per_search_usd: -0.01 })).rejects.toThrow();
    expect((await price({ input_per_mtok: 4, output_per_mtok: 16, per_search_usd: null })).per_search_usd).toBeNull();
    const log = await sql(`select details from public.admin_audit_log where action = 'ai.price' and target = 'anthropic:claude-x' order by id`);
    expect(log.map((l) => (l.details.per_search_usd === null ? null : Number(l.details.per_search_usd)))).toEqual([0.01, 0.01, null]);
    await sql(`delete from public.ai_calls where source = 'fontes-teste'`);
    await sql(`delete from public.ai_model_prices where model = 'claude-x'`);
  });

  it("buscas e candidatos: só administrador lê", async () => {
    const c = await createCandidate();
    expect(c.duplicate).toBe(false);
    // RLS: leitura direta da tabela
    expect(await selectAs(t.EDITOR, "select id from public.ch_source_searches")).toEqual([]);
    expect(await selectAs(t.EDITOR, "select id from public.ch_source_candidates")).toEqual([]);
    expect((await selectAs(t.ADMIN, "select id from public.ch_source_searches")).length).toBeGreaterThan(0);
    expect((await selectAs(t.ADMIN, "select id from public.ch_source_candidates")).length).toBeGreaterThan(0);
    // funções da tela
    for (const [fn, args] of [
      ["app_ch_source_searches", {}],
      ["app_ch_source_candidates", {}],
      ["app_ch_source_candidate", { p_candidate_id: c.id }],
      ["app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: { level: "B" } }],
      ["app_ch_source_search_start", { p_request: { area: "CLINICA_MEDICA", theme: "Sífilis" } }],
    ] as const) {
      await expect(t.db.asUser(t.editorUser, fn, args), fn).rejects.toThrow(RESTRITO);
      await expect(t.db.asUser(t.studentUser, fn, args), fn).rejects.toThrow(RESTRITO);
    }
    const searches = await asAdmin<any[]>("app_ch_source_searches", { p_limit: 5 });
    expect(searches).toHaveLength(5);
    expect(searches[0]).toMatchObject({ status: "na_fila", job_status: "queued", job_error: null });
    expect(new Date(searches[0].created_at).getTime()).toBeGreaterThanOrEqual(new Date(searches[4].created_at).getTime());
  });

  it("ch_url_norm tira #, utm_*, :443 e a caixa do host", async () => {
    expect(await norm("https://WWW.Gov.BR:443/Saude/X.pdf?utm_source=a&id=2#p3")).toBe("https://www.gov.br/Saude/X.pdf?id=2");
    expect(await norm("HTTPS://gov.br/a?utm_medium=x&UTM_Campaign=y")).toBe("https://gov.br/a");
    expect(await norm("https://gov.br/a?")).toBe("https://gov.br/a");
    // pedaços vazios entre "&" saem junto com os utm_*; o resto da consulta fica na ordem e na forma em que veio
    expect(await norm("https://gov.br/a?x=1&&utm_source=a&")).toBe("https://gov.br/a?x=1");
    expect(await norm("https://gov.br/A/B?x=1&Y=%20z")).toBe("https://gov.br/A/B?x=1&Y=%20z");
    expect(await norm("https://gov.br:8443/a")).toBe("https://gov.br:8443/a");
    expect(await norm("  https://who.int/x#")).toBe("https://who.int/x");
  });

  it("repetidos por link e por SHA-256", async () => {
    const L = "https://www.gov.br/saude/pt-br/pcdt-hepatite-c.pdf";
    const S = sha(0xabc);
    const c = await createCandidate({ requested_url: L, final_url: "https://www.gov.br/saude/arquivos/pcdt-hepatite-c-final.pdf", sha256: S, storage_path: `source-candidates/${S}.pdf` });
    expect(c.duplicate).toBe(false);
    const [row] = await sql(`select url_norm, final_url_norm, status from public.ch_source_candidates where id = $1`, [c.id]);
    expect(row).toEqual({ url_norm: L, final_url_norm: "https://www.gov.br/saude/arquivos/pcdt-hepatite-c-final.pdf", status: "aguardando" });

    expect(await known(L + "#x", null)).toBe("Repetido: candidato aguardando sua conferência.");
    expect(await known("https://www.gov.br/saude/arquivos/pcdt-hepatite-c-final.pdf?utm_source=busca", null)).toBe("Repetido: candidato aguardando sua conferência.");
    expect(await known("https://outro.gov.br/x.pdf", S)).toBe("Repetido: candidato aguardando sua conferência.");
    // criar de novo pelo mesmo link ou pelo mesmo arquivo não duplica
    expect(await createCandidate({ requested_url: L, final_url: L })).toEqual({ id: c.id, duplicate: true });
    expect(await createCandidate({ sha256: S })).toEqual({ id: c.id, duplicate: true });

    await sql(`update public.ch_source_candidates set status = 'aprovado' where id = $1`, [c.id]);
    expect(await known(L, null)).toBe("Repetido: já aprovado antes.");
    await sql(`update public.ch_source_candidates set status = 'rejeitado' where id = $1`, [c.id]);
    expect(await known(null, S)).toBe("Repetido: rejeitado antes.");

    // fonte cadastrada pelo link (normalizado) ou pelo SHA-256: vem antes do candidato
    const L2 = "https://bvsms.saude.gov.br/bvs/publicacoes/manual-x.pdf";
    await asAdmin("app_ch_register_source", { p_source: { title: "Manual X", organ: "Ministério da Saúde", url: L2 } });
    expect(await known("https://BVSMS.saude.gov.br/bvs/publicacoes/manual-x.pdf?utm_source=busca", null)).toBe("Repetido: fonte já cadastrada.");
    await asAdmin("app_ch_register_source", { p_source: { title: "Mesmo arquivo", organ: "Ministério da Saúde", sha256: S } });
    expect(await known("https://outro.gov.br/y.pdf", S)).toBe("Repetido: fonte já cadastrada.");

    // endereço vigiado e documento já na Central
    const watched = await asAdmin("app_ch_register_source", { p_source: { title: "Fonte vigiada", organ: "Conitec" } });
    await sql(`insert into public.ch_source_watch (source_id, url) values ($1, 'https://www.gov.br/conitec/pt-br/relatorio.pdf')`, [watched.id]);
    expect(await known("https://www.gov.br/conitec/pt-br/relatorio.pdf#page=2", null)).toBe("Repetido: endereço já vigiado.");
    const S3 = sha(0xdddd);
    await sql(`insert into public.ch_documents (owner_id, name, sha256) values ($1, 'Documento enviado à mão', $2)`, [t.ADMIN, S3]);
    expect(await known("https://www.gov.br/saude/novo.pdf", S3)).toBe("Repetido: documento já está na Central.");

    // link novo e arquivo novo
    expect(await known("https://www.gov.br/saude/pt-br/inedito.pdf", sha(0xeeee))).toBeNull();
    expect(await known(null, null)).toBeNull();
  });

  it("lista de candidatos: governo primeiro, depois os mais recentes; contadores; substituição pela regra única", async () => {
    await sql(`update public.ch_source_candidates set status = 'rejeitado' where status = 'aguardando'`);
    const soc = (await sql(`select id from public.ch_official_domains where address = 'sbp.com.br'`))[0].id;
    const old = await createCandidate({ ai_published: "2019-05-01", file_date: null });
    const socNew = await createCandidate({ domain_id: soc, ai_published: "2026-01-10", ai_institution: "Sociedade Brasileira de Pediatria" });
    const recent = await createCandidate({ ai_published: null, file_date: "2025-12-01" });
    const list = await asAdmin("app_ch_source_candidates");
    expect(list.items.map((i: any) => i.id)).toEqual([recent.id, old.id, socNew.id]);
    expect(list.items[2]).toMatchObject({ site_address: "sbp.com.br", site_kind: "sociedade", site_institution: "Sociedade Brasileira de Pediatria" });
    expect(list.items[0].search).toMatchObject({ area: "CLINICA_MEDICA", provider: null, model: null });
    expect(list.items[0].search.theme).toMatch(/^Tema de teste/);
    const counts = await sql(`select status, count(*)::int as n from public.ch_source_candidates group by status`);
    expect(list.counts).toEqual({ aguardando: 3, aprovado: counts.find((c) => c.status === "aprovado")?.n ?? 0, rejeitado: counts.find((c) => c.status === "rejeitado")?.n ?? 0 });
    expect((await asAdmin("app_ch_source_candidates", { p_status: "rejeitado" })).items.every((i: any) => i.status === "rejeitado")).toBe(true);
    await expect(asAdmin("app_ch_source_candidates", { p_status: "talvez" })).rejects.toThrow(/Situação inválida/);

    // substituição: mesmo título e órgão (sem caixa, editado antes do que a IA disse) E arquivo ou versão diferente
    const src = await asAdmin("app_ch_register_source", { p_source: { title: "PCDT Dengue", organ: "Ministério da Saúde", version: "2024", sha256: sha(0x2024) } });
    let item = await asAdmin("app_ch_source_candidate", { p_candidate_id: recent.id });
    expect(item).toMatchObject({ id: recent.id, status: "aguardando", replaces: null });
    // a IA disse outro título; o administrador corrige (a caixa não conta)
    await asAdmin("app_ch_source_candidate_save", { p_candidate_id: recent.id, p_fields: { title: "pcdt DENGUE", institution: "ministério da saúde", version: "2025" } });
    item = await asAdmin("app_ch_source_candidate", { p_candidate_id: recent.id });
    expect(item.replaces).toEqual({ id: src.id, title: "PCDT Dengue", version: "2024" });
    expect((await asAdmin("app_ch_source_candidates")).items.find((i: any) => i.id === recent.id).replaces).toEqual({ id: src.id, title: "PCDT Dengue", version: "2024" });
    // mesmo arquivo e mesma versão: não substitui
    await sql(`update public.ch_source_candidates set sha256 = $2 where id = $1`, [recent.id, sha(0x2024)]);
    await asAdmin("app_ch_source_candidate_save", { p_candidate_id: recent.id, p_fields: { version: "2024" } });
    item = await asAdmin("app_ch_source_candidate", { p_candidate_id: recent.id });
    expect(item.replaces).toBeNull();
    // a mesma regra vale no cadastro: mesmo arquivo e versão não substitui; versão nova substitui
    const y1 = await asAdmin("app_ch_register_source", { p_source: { title: "Manual Y", organ: "Anvisa", version: "1", sha256: sha(0x3001) } });
    expect((await asAdmin("app_ch_register_source", { p_source: { title: "MANUAL Y", organ: "anvisa", version: "1", sha256: sha(0x3001) } })).superseded).toBeNull();
    expect((await sql(`select status from public.ch_sources where id = $1`, [y1.id]))[0].status).toBe("current");
    const v2 = await asAdmin("app_ch_register_source", { p_source: { title: "PCDT Dengue", organ: "ministério da saúde", version: "2025", sha256: sha(0x2025) } });
    expect(v2.superseded).toBe(src.id);
    expect((await sql(`select status, superseded_by from public.ch_sources where id = $1`, [src.id]))[0]).toEqual({ status: "superseded", superseded_by: v2.id });
    await expect(asAdmin("app_ch_source_candidate", { p_candidate_id: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/Candidato não encontrado/);
  });

  it("editar candidato: mescla só as chaves da conferência, nível E recusado, só enquanto aguarda", async () => {
    const c = await createCandidate();
    const edit = (p_fields: Record<string, unknown>) => asAdmin("app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields });
    const r = await edit({ title: "  PCDT Sífilis  ", level: "b", kind: "society_guideline", nature: "GUIDELINE", area: "GINECOLOGIA_OBSTETRICIA", published_on: "2025-02-28", outra: "x" });
    expect(r.edited).toEqual({ title: "PCDT Sífilis", level: "B", kind: "society_guideline", nature: "GUIDELINE", area: "GINECOLOGIA_OBSTETRICIA", published_on: "2025-02-28" });
    // vazio tira a chave
    expect((await edit({ published_on: "", theme: "Sífilis congênita", valid_until: "2027-12-31" })).edited).toEqual({
      title: "PCDT Sífilis", level: "B", kind: "society_guideline", nature: "GUIDELINE", area: "GINECOLOGIA_OBSTETRICIA", theme: "Sífilis congênita", valid_until: "2027-12-31",
    });
    await expect(edit({ level: "E" })).rejects.toThrow(/Nível E não entra pela busca: escolha de A a D\./);
    await expect(edit({ level: "Z" })).rejects.toThrow(/Escolha o nível de A a D/);
    await expect(edit({ kind: "artigo" })).rejects.toThrow(/Tipo de fonte inválido/);
    await expect(edit({ nature: "Diretriz qualquer" })).rejects.toThrow(/Natureza da fonte inválida/);
    await expect(edit({ area: "CARDIOLOGIA" })).rejects.toThrow(/Área inválida/);
    await expect(edit({ published_on: "2024" })).rejects.toThrow(/AAAA-MM-DD/);
    await expect(edit({ published_on: "2024-02-30" })).rejects.toThrow(/AAAA-MM-DD/);
    await expect(edit({ valid_until: "31/12/2027" })).rejects.toThrow(/AAAA-MM-DD/);
    await expect(edit({ title: "x".repeat(301) })).rejects.toThrow(/300 caracteres/);
    await expect(asAdmin("app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: ["nível B"] })).rejects.toThrow(/Dados inválidos/);
    const log = await sql(`select actor_id from public.ch_audit where action = 'source_candidate.edit' and target = $1`, [c.id]);
    expect(log).toHaveLength(2);
    expect(log[0].actor_id).toBe(t.ADMIN);
    await sql(`update public.ch_source_candidates set status = 'rejeitado' where id = $1`, [c.id]);
    await expect(edit({ level: "A" })).rejects.toThrow(/Este candidato já foi decidido/);
    // nível E também não entra pelo processamento
    await expect(createCandidate({ ai_level: "E" })).rejects.toThrow();
    await expect(createCandidate({ suggested_level: "E" })).rejects.toThrow();
  });

  it("processamento: lê a busca com os sites ativos e grava o resultado com quem pediu", async () => {
    const id = await newSearch(null);
    const got = await t.db.service<any>("ch_worker_source_search_get", { p_search_id: id });
    expect(got).toMatchObject({ id, area: null, status: "na_fila", requested_by: t.ADMIN });
    // o site desativado no teste do endereço não entra
    expect(got.domains.map((d: any) => d.address)).not.toContain("exemplo.gov.br/saude");
    expect(got.domains).toHaveLength(21); // 11 sementes + 10 sites da Vigilância científica (9940)
    expect(got.domains[0]).toEqual({ id: expect.any(String), address: "bvsms.saude.gov.br", institution: "Biblioteca Virtual em Saúde do Ministério da Saúde", kind: "governo" });
    expect(await t.db.service("ch_worker_source_search_get", { p_search_id: "00000000-0000-4000-8000-000000000000" })).toBeNull();

    const update = (p_patch: Record<string, unknown>) => t.db.service("ch_worker_source_search_update", { p_search_id: id, p_patch });
    await update({ status: "buscando" });
    let [s] = await sql(`select * from public.ch_source_searches where id = $1`, [id]);
    expect(s).toMatchObject({ status: "buscando", finished_at: null });
    const runId = "11111111-1111-4111-8111-111111111111";
    await update({
      status: "concluida", provider: "anthropic", model: "claude-x", run_id: runId, web_searches: 3, cost_usd: 0.0475, found_count: 3, verified_count: 1,
      discarded: [{ link: "https://exemplo.com/a.pdf", titulo: "A", motivo: "Site fora da lista de sites oficiais." }, { link: "https://www.gov.br/saude/b.pdf", titulo: "B", motivo: "O trecho citado pela IA não está no arquivo." }],
      message: "1 conferido, 2 descartados.",
    });
    [s] = await sql(`select * from public.ch_source_searches where id = $1`, [id]);
    expect(s).toMatchObject({ status: "concluida", provider: "anthropic", model: "claude-x", run_id: runId, web_searches: 3, found_count: 3, verified_count: 1, discarded_count: 2, message: "1 conferido, 2 descartados." });
    expect(Number(s.cost_usd)).toBe(0.0475);
    expect(s.finished_at).toBeTruthy();
    const audit = await sql(`select actor_id, details from public.ch_audit where action = 'source_search.result' and target = $1`, [id]);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: t.ADMIN, details: { status: "concluida", verified_count: 1, discarded_count: 2 } });
    await expect(update({ status: "talvez" })).rejects.toThrow(/Situação da busca inválida/);
    await expect(update({ discarded: { link: "x" } })).rejects.toThrow();
    await expect(t.db.service("ch_worker_source_search_update", { p_search_id: "00000000-0000-4000-8000-000000000000", p_patch: { status: "buscando" } })).rejects.toThrow(/Busca não encontrada/);
  });

  it("ch_jobs aceita source_search e continua aceitando visual_render (e as etapas dos outros ramos)", async () => {
    try {
      for (const step of ["source_search", "visual_render", "source_index", "station_pages", "station_segment", "station_draft", "question_generate", "question_check", "question_source"]) {
        await sql(`insert into public.ch_jobs (step, scope_key, idempotency_key) values ($1, 'teste', $2)`, [step, `teste-etapa:${step}`]);
      }
      await expect(sql(`insert into public.ch_jobs (step, scope_key, idempotency_key) values ('nada', 'teste', 'teste-etapa:nada')`)).rejects.toThrow(/ch_jobs_step_check/);
    } finally {
      await sql(`delete from public.ch_jobs where idempotency_key like 'teste-etapa:%'`);
    }
  });

  it("tabelas com RLS e funções de serviço fechadas para anon e authenticated", async () => {
    const open = await sql(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and relname in ('ch_official_domains', 'ch_source_searches', 'ch_source_candidates') and not relrowsecurity`
    );
    expect(open).toEqual([]);
    const fns = await sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.proname like 'ch\\_worker\\_source\\_%' or p.proname like 'ch\\_worker\\_ai\\_%' or p.proname in ('ch_url_norm', 'ch_source_replacement', 'ch_source_candidate_item', 'ch_source_search_job_dead'))`
    );
    expect(fns.map((f) => f.proname)).toEqual(expect.arrayContaining(["ch_url_norm", "ch_worker_source_known", "ch_worker_source_candidate_create", "ch_worker_source_search_get", "ch_worker_source_search_update", "ch_source_replacement", "ch_source_candidate_item", "ch_source_search_job_dead"]));
    const leaking = await sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.proname like 'ch\\_worker\\_source\\_%' or p.proname like 'ch\\_worker\\_ai\\_%' or p.proname in ('ch_url_norm', 'ch_source_replacement', 'ch_source_candidate_item', 'ch_source_search_job_dead'))
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`
    );
    expect(leaking).toEqual([]);
    const anon = await sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.proname like 'app\\_ch\\_source\\_%' or p.proname like 'app\\_ch\\_%official\\_domain%')
          and has_function_privilege('anon', p.oid, 'execute')`
    );
    expect(anon).toEqual([]);
  });
});

// ---------------------------------------------------------------- Tarefa 7: aprovar e rejeitar
describe("Aprovar e rejeitar", () => {
  const approve = (id: string, fields: Record<string, unknown> | null = {}) => asAdmin("app_ch_source_candidate_approve", { p_candidate_id: id, p_fields: fields });
  const reject = (id: string, reason: string) => asAdmin("app_ch_source_candidate_reject", { p_candidate_id: id, p_reason: reason });
  const OK = { level: "B", checked: true };
  const counts = async () => (await sql(`select (select count(*)::int from public.ch_sources) as s, (select count(*)::int from public.ch_documents) as d`))[0];
  const status = async (id: string) => (await sql(`select status from public.ch_source_candidates where id = $1`, [id]))[0].status as string;

  it("aprovar cria fonte vigente, aprovação editorial com quem e quando, documento de referência e o vínculo", async () => {
    const c = await createCandidate();
    const r = await approve(c.id, OK);
    expect(r).toMatchObject({ superseded: null, candidate_versions: 0, file_kind: "pdf" });
    const [cand] = await sql(`select * from public.ch_source_candidates where id = $1`, [c.id]);
    expect(r.source_id).toBe(cand.source_id);
    expect(r.document_id).toBe(cand.document_id);
    expect(cand).toMatchObject({ status: "aprovado", decided_by: t.ADMIN });
    expect(cand.decided_at).not.toBeNull();
    expect(cand.edited).toMatchObject({ level: "B" });

    const [src] = await sql(`select * from public.ch_sources where id = $1`, [r.source_id]);
    expect(src).toMatchObject({
      status: "current", authority_level: "B", editorial_approved: true, editorial_approved_by: t.ADMIN, document_id: r.document_id,
      title: cand.ai_title, organ: "Ministério da Saúde", kind: "final", source_type: "PCDT", sha256: cand.sha256, url: cand.final_url,
    });
    expect(src.editorial_approved_at).not.toBeNull();
    // a data que só a IA e o arquivo disseram NÃO vira data da fonte (revisão independente 1): sem comprovação, fica nula
    expect(src.published_on).toBeNull();
    expect(src.specialty).toBeNull();
    expect(src.theme).toBeNull();

    const [doc] = await sql(`select * from public.ch_documents where id = $1`, [r.document_id]);
    expect(doc).toMatchObject({
      owner_id: t.ADMIN, name: cand.ai_title, publisher: "Ministério da Saúde", sha256: cand.sha256, storage_path: cand.storage_path,
      mime: "application/pdf", purpose: "reference_source", rights_status: "reference_only", page_count: 12, status: "received",
    });
    expect(doc.provenance.found).toMatch(/^encontrado pela busca em \d{2}\/\d{2}\/\d{4}$/);
    expect(doc.provenance).toMatchObject({
      requested_url: cand.requested_url, final_url: cand.final_url, site: "www.gov.br/saude", institution: "Ministério da Saúde", sha256: cand.sha256,
      size_bytes: 123456, file_kind: "pdf", search_id: cand.search_id, candidate_id: c.id,
    });

    const audit = await sql(`select actor_id from public.ch_audit where action = 'source_candidate.approve' and target = $1`, [c.id]);
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_id).toBe(t.ADMIN);
    const list = await asAdmin("app_ch_sources");
    const mine = list.find((s: any) => s.id === r.source_id);
    expect(mine).toMatchObject({ found_by_search: true, document_status: "received" });
    // fonte cadastrada à mão não "foi achada pela busca"
    const manual = await asAdmin("app_ch_register_source", { p_source: { title: "Cadastrada à mão T7", organ: "Anvisa" } });
    expect(list.find((s: any) => s.id === manual.id)).toBeUndefined();
    expect((await asAdmin("app_ch_sources")).find((s: any) => s.id === manual.id)).toMatchObject({ found_by_search: false, document_status: null });
    // e o aprovado já não volta como repetido
    expect(await known(cand.final_url, null)).toBe("Repetido: fonte já cadastrada.");
  });

  it("o que o administrador digitou vale mais que o salvo, que vale mais que o da IA; página web vira text/html", async () => {
    const h = sha(0x7a7a7);
    const c = await createCandidate({
      file_kind: "html", sha256: h, storage_path: `source-candidates/${h}.html`, page_count: null, suggested_nature: null,
      ai_published: "2025", file_date: null, ai_institution: "MS", ai_title: "Título da IA",
    });
    await asAdmin("app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: { title: "Título salvo", institution: "Órgão salvo", version: "salva" } });
    const r = await approve(c.id, {
      level: "c", checked: true, title: "Título final", kind: "society_guideline", nature: "GUIDELINE", area: "PEDIATRIA", theme: "Asma",
      published_on: "2024-01-02", valid_until: "2027-01-01",
    });
    expect(r.file_kind).toBe("html");
    const [src] = await sql(`select * from public.ch_sources where id = $1`, [r.source_id]);
    expect(src).toMatchObject({ title: "Título final", organ: "Órgão salvo", version: "salva", kind: "society_guideline", source_type: "GUIDELINE", specialty: "PEDIATRIA", theme: "Asma", authority_level: "C" });
    expect(String(src.published_on.toISOString?.() ?? src.published_on)).toContain("2024-01-02");
    expect(String(src.valid_until.toISOString?.() ?? src.valid_until)).toContain("2027-01-01");
    const [doc] = await sql(`select * from public.ch_documents where id = $1`, [r.document_id]);
    expect(doc).toMatchObject({ mime: "text/html", name: "Título final", publisher: "Órgão salvo", page_count: null });
    expect((await sql(`select edited from public.ch_source_candidates where id = $1`, [c.id]))[0].edited).toMatchObject({ title: "Título final", level: "C", institution: "Órgão salvo" });
  });

  it("sem nome do órgão da IA e só o ano: nada de inventar dia; o ano vira a versão; natureza nunca vem do texto livre da IA", async () => {
    const c = await createCandidate({ ai_published: "2023", file_date: "2023", currency_date: "2023", ai_nature: "Diretriz qualquer", suggested_nature: "MANUAL", ai_institution: null });
    const r = await approve(c.id, OK);
    const [src] = await sql(`select * from public.ch_sources where id = $1`, [r.source_id]);
    expect(src.published_on).toBeNull();
    expect(src).toMatchObject({ version: "2023", source_type: "MANUAL", organ: "Ministério da Saúde" });
  });

  it("nível E, sem nível, sem título ou sem a caixa: recusado, e nada é criado", async () => {
    const semTitulo = await createCandidate({ ai_title: null });
    const normal = await createCandidate();
    const before = await counts();
    await expect(approve(normal.id, { checked: true })).rejects.toThrow(/Escolha o nível de A a D\./);
    await expect(approve(normal.id, { level: "E", checked: true })).rejects.toThrow(/Nível E não entra pela busca: escolha de A a D\./);
    await expect(approve(normal.id, { level: "Z", checked: true })).rejects.toThrow(/Escolha o nível de A a D\./);
    // o nível que a IA sugeriu não vale: quem escolhe é o administrador
    await expect(approve(normal.id, { checked: true, level: "" })).rejects.toThrow(/Escolha o nível de A a D\./);
    await expect(approve(semTitulo.id, OK)).rejects.toThrow(/Informe título e órgão da fonte\./);
    await expect(approve(normal.id, { level: "B" })).rejects.toThrow(/Confirme que conferiu o documento no arquivo guardado\./);
    await expect(approve(normal.id, { level: "B", checked: false })).rejects.toThrow(/Confirme que conferiu/);
    await expect(approve(normal.id, { level: "B", checked: "true" })).rejects.toThrow(/Confirme que conferiu/);
    await expect(approve(normal.id, null)).rejects.toThrow(/Confirme que conferiu/);
    expect(await counts()).toEqual(before);
    expect(await status(normal.id)).toBe("aguardando");
    expect(await status(semTitulo.id)).toBe("aguardando");
    // com título preenchido pelo administrador, passa
    await expect(approve(semTitulo.id, { ...OK, title: "Título que o administrador escreveu" })).resolves.toMatchObject({ file_kind: "pdf" });
    await expect(approve(normal.id, ["x"] as any)).rejects.toThrow(/Dados inválidos/);
    await expect(approve("00000000-0000-4000-8000-000000000000", OK)).rejects.toThrow(/Candidato não encontrado/);
  });

  it("arquivo guardado que sumiu: recusa com o motivo", async () => {
    const c = await createCandidate();
    await sql(`update public.ch_source_candidates set storage_path = null where id = $1`, [c.id]);
    await expect(approve(c.id, OK)).rejects.toThrow(/arquivo guardado não está mais disponível/);
    expect(await status(c.id)).toBe("aguardando");
  });

  it("não aprova duas vezes, nem aprova o rejeitado, nem rejeita o aprovado", async () => {
    const c = await createCandidate();
    await approve(c.id, OK);
    const before = await counts();
    await expect(approve(c.id, OK)).rejects.toThrow(/já foi decidido/);
    await expect(reject(c.id, "Motivo com mais de dez letras")).rejects.toThrow(/já foi decidido/);
    const r = await createCandidate();
    await reject(r.id, "Não é o documento certo para o tema.");
    await expect(approve(r.id, OK)).rejects.toThrow(/já foi decidido/);
    await expect(reject(r.id, "Motivo com mais de dez letras")).rejects.toThrow(/já foi decidido/);
    expect(await counts()).toEqual(before);
  });

  it("substituição pede confirmação; confirmada, a anterior fica substituída", async () => {
    const old = await asAdmin("app_ch_register_source", { p_source: { title: "PCDT Hanseníase T7", organ: "Ministério da Saúde", version: "2022", published_on: "2022-05-01", sha256: sha(0x7001) } });
    const c = await createCandidate({ ai_title: "pcdt hanseníase t7", currency_date: "2025-03-14" });
    const before = await counts();
    await expect(approve(c.id, OK)).rejects.toThrow(/Confirme a substituição: esta aprovação substitui a fonte vigente "PCDT Hanseníase T7" \(versão 2022\)\./);
    await expect(approve(c.id, { ...OK, confirm_replace: "true" })).rejects.toThrow(/Confirme a substituição/);
    expect(await counts()).toEqual(before);
    expect((await sql(`select status from public.ch_sources where id = $1`, [old.id]))[0].status).toBe("current");
    const r = await approve(c.id, { ...OK, confirm_replace: true });
    expect(r.superseded).toBe(old.id);
    expect(r.candidate_versions).toEqual(expect.any(Number));
    expect((await sql(`select status, superseded_by from public.ch_sources where id = $1`, [old.id]))[0]).toEqual({ status: "superseded", superseded_by: r.source_id });
    expect((await sql(`select status from public.ch_sources where id = $1`, [r.source_id]))[0].status).toBe("current");
    // o administrador pode ter corrigido o título para não bater com nenhuma fonte: então não pede confirmação
    const other = await createCandidate({ ai_title: "pcdt hanseníase t7", currency_date: "2025-03-14" });
    await expect(approve(other.id, { ...OK, title: "PCDT Outro Assunto T7" })).resolves.toMatchObject({ superseded: null });
  });

  it("fonte vigente igual (mesmo arquivo ou mesmo endereço) cadastrada à mão sem documento: pede confirmação em vez de duplicar", async () => {
    // mesmo SHA-256 e mesma versão (nenhuma), título e órgão diferentes: a regra de substituição por título não pega
    const a = await createCandidate({ currency_date: "2025-03-14" });
    const manual = await asAdmin("app_ch_register_source", { p_source: { title: "Outro nome do mesmo PDF", organ: "Outro órgão", published_on: "2020-01-01", sha256: (await sql(`select sha256 from public.ch_source_candidates where id = $1`, [a.id]))[0].sha256 } });
    const before = await counts();
    await expect(approve(a.id, OK)).rejects.toThrow(/^Confirme a substituição: já existe a fonte vigente "Outro nome do mesmo PDF" \(versão sem versão\) com o mesmo arquivo ou endereço/);
    await expect(approve(a.id, { ...OK, confirm_replace: "true" })).rejects.toThrow(/Confirme a substituição/);
    expect(await counts()).toEqual(before);
    const r = await approve(a.id, { ...OK, confirm_replace: true });
    expect((await sql(`select status, superseded_by from public.ch_sources where id = $1`, [manual.id]))[0]).toEqual({ status: "superseded", superseded_by: r.source_id });
    expect((await sql(`select count(*)::int as n from public.ch_sources where status = 'current' and sha256 = (select sha256 from public.ch_source_candidates where id = $1)`, [a.id]))[0].n).toBe(1);

    // mesma URL normalizada (sem #, sem utm_, host em minúsculas), arquivo e título diferentes
    const b = await createCandidate({ requested_url: "https://www.gov.br/saude/pt-br/mesmo-endereco.pdf", final_url: "https://www.gov.br/saude/pt-br/mesmo-endereco.pdf", currency_date: "2025-03-14" });
    const byUrl = await asAdmin("app_ch_register_source", { p_source: { title: "Cadastro antigo pelo link", organ: "Outro órgão 2", published_on: "2020-01-01", url: "https://WWW.gov.br/saude/pt-br/mesmo-endereco.pdf?utm_source=x#topo", sha256: sha(0x9fff01) } });
    await expect(approve(b.id, OK)).rejects.toThrow(/Confirme a substituição: já existe a fonte vigente "Cadastro antigo pelo link"/);
    const rb = await approve(b.id, { ...OK, confirm_replace: true });
    expect((await sql(`select status from public.ch_sources where id = $1`, [byUrl.id]))[0].status).toBe("superseded");
    expect((await sql(`select status from public.ch_sources where id = $1`, [rb.source_id]))[0].status).toBe("current");

    // fonte substituída (não vigente) não bloqueia
    const c = await createCandidate();
    await asAdmin("app_ch_register_source", { p_source: { title: "Antiga retirada", organ: "Órgão 3", sha256: (await sql(`select sha256 from public.ch_source_candidates where id = $1`, [c.id]))[0].sha256 } });
    await sql(`update public.ch_sources set status = 'withdrawn' where title = 'Antiga retirada'`);
    await expect(approve(c.id, OK)).resolves.toMatchObject({ superseded: null });
  });

  it("site desativado ou fora da lista depois do achado: aprovação recusada, rejeição continua possível", async () => {
    const sbp = (await sql(`select id from public.ch_official_domains where address = 'sbp.com.br'`))[0].id;
    const link = "https://www.sbp.com.br/documentos/t7-consenso.pdf";
    const c = await createCandidate({ domain_id: sbp, requested_url: link, final_url: link });
    const setActive = (active: boolean) =>
      asAdmin("app_ch_save_official_domain", { p_domain: { id: sbp, address: "sbp.com.br", institution: "Sociedade Brasileira de Pediatria", kind: "sociedade", active } });
    await setActive(false);
    try {
      await expect(approve(c.id, OK)).rejects.toThrow(/O site sbp\.com\.br saiu da lista de sites oficiais ou foi desativado: reative-o ou rejeite este candidato\./);
      expect(await status(c.id)).toBe("aguardando");
      const rejected = await reject(c.id, "Site desativado; não vamos usar este documento.");
      expect(rejected.storage_path).toMatch(/^source-candidates\//);
    } finally {
      await setActive(true);
    }
    // a lista continua valendo com o endereço real do arquivo: link de outro site ou de outro caminho não passa
    const fora = await createCandidate({ requested_url: "https://www.gov.br/saude/pt-br/a.pdf", final_url: "https://exemplo.com.br/a.pdf" });
    await expect(approve(fora.id, OK)).rejects.toThrow(/O site www\.gov\.br\/saude saiu da lista/);
    const caminho = await createCandidate({ requested_url: "https://www.gov.br/saude/pt-br/b.pdf", final_url: "https://www.gov.br/saudemental/b.pdf" });
    await expect(approve(caminho.id, OK)).rejects.toThrow(/saiu da lista/);
    const porta = await createCandidate({ requested_url: "https://www.gov.br/saude/pt-br/c.pdf", final_url: "https://www.gov.br:8443/saude/c.pdf" });
    await expect(approve(porta.id, OK)).rejects.toThrow(/saiu da lista/);
    const http = await createCandidate({ requested_url: "https://www.gov.br/saude/pt-br/d.pdf", final_url: "http://www.gov.br/saude/d.pdf" });
    await expect(approve(http.id, OK)).rejects.toThrow(/saiu da lista/);
    // subdomínio e a própria raiz do caminho passam
    const sub = await createCandidate({ requested_url: "https://www.gov.br/saude/pt-br/e.pdf", final_url: "https://WWW.GOV.BR:443/Saude/e.pdf" });
    await expect(approve(sub.id, OK)).resolves.toMatchObject({ file_kind: "pdf" });
    const bvs = (await sql(`select id from public.ch_official_domains where address = 'bvsms.saude.gov.br'`))[0].id;
    const sub2 = await createCandidate({ domain_id: bvs, requested_url: "https://x.bvsms.saude.gov.br/f.pdf", final_url: "https://x.bvsms.saude.gov.br/f.pdf" });
    await expect(approve(sub2.id, OK)).resolves.toMatchObject({ file_kind: "pdf" });
  });

  it("arquivo já enviado à mão enquanto esperava: recusa com o nome do documento", async () => {
    const S = sha(0x7777);
    const c = await createCandidate({ sha256: S, storage_path: `source-candidates/${S}.pdf` });
    await sql(`insert into public.ch_documents (owner_id, name, sha256) values ($1, 'Protocolo enviado à mão T7', $2)`, [t.EDITOR, S]);
    const before = await counts();
    await expect(approve(c.id, OK)).rejects.toThrow(/Este arquivo já está na Central como documento "Protocolo enviado à mão T7": vincule por lá ou rejeite este candidato\./);
    expect(await counts()).toEqual(before);
    await expect(reject(c.id, "Já existe na Central como documento.")).resolves.toBeDefined();
  });

  it("rejeitar exige 10 caracteres, guarda o motivo e o mesmo link ou arquivo não volta", async () => {
    const S = sha(0x7788);
    const link = "https://www.gov.br/saude/pt-br/t7-rejeitado.pdf";
    const c = await createCandidate({ sha256: S, storage_path: `source-candidates/${S}.pdf`, requested_url: link, final_url: link });
    await expect(reject(c.id, "curto")).rejects.toThrow(/Escreva o motivo \(pelo menos 10 caracteres\)\./);
    await expect(reject(c.id, "   pouco   ")).rejects.toThrow(/Escreva o motivo/);
    await expect(asAdmin("app_ch_source_candidate_reject", { p_candidate_id: c.id, p_reason: null })).rejects.toThrow(/Escreva o motivo/);
    await expect(reject(c.id, "x".repeat(1001))).rejects.toThrow(/1000 caracteres/);
    await expect(reject("00000000-0000-4000-8000-000000000000", "Motivo com mais de dez letras")).rejects.toThrow(/Candidato não encontrado/);
    expect(await status(c.id)).toBe("aguardando");
    const r = await reject(c.id, "  Documento antigo, já substituído pelo Ministério.  ");
    expect(r).toEqual({ storage_path: `source-candidates/${S}.pdf` });
    const [row] = await sql(`select status, decided_by, decided_at, decision_reason, storage_path, source_id, document_id from public.ch_source_candidates where id = $1`, [c.id]);
    expect(row).toMatchObject({ status: "rejeitado", decided_by: t.ADMIN, decision_reason: "Documento antigo, já substituído pelo Ministério.", storage_path: null, source_id: null, document_id: null });
    expect(row.decided_at).not.toBeNull();
    expect(await known(link, null)).toBe("Repetido: rejeitado antes.");
    expect(await known("https://outro.gov.br/y.pdf", S)).toBe("Repetido: rejeitado antes.");
    expect(await createCandidate({ sha256: S })).toEqual({ id: c.id, duplicate: true });
    const audit = await sql(`select actor_id from public.ch_audit where action = 'source_candidate.reject' and target = $1`, [c.id]);
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_id).toBe(t.ADMIN);
  });

  it("só administrador aprova e rejeita: editor, aluno e visitante barrados", async () => {
    const c = await createCandidate();
    const before = await counts();
    for (const user of [t.editorUser, t.studentUser]) {
      await expect(t.db.asUser(user, "app_ch_source_candidate_approve", { p_candidate_id: c.id, p_fields: OK })).rejects.toThrow(RESTRITO);
      await expect(t.db.asUser(user, "app_ch_source_candidate_reject", { p_candidate_id: c.id, p_reason: "Motivo com mais de dez letras" })).rejects.toThrow(RESTRITO);
    }
    expect(await counts()).toEqual(before);
    expect(await status(c.id)).toBe("aguardando");
    // visitante (papel anon) nem chega a executar; o papel público também não
    const open = await sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('app_ch_source_candidate_approve', 'app_ch_source_candidate_reject', 'app_ch_sources', 'ch_source_site_match', 'ch_source_iso_date')
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))`
    );
    expect(open).toEqual([]);
    // todas as funções de administrador desta migração barram editor e aluno (as de leitura e as de gravação)
    const ID = "00000000-0000-4000-8000-000000000000";
    const adminOnly: [string, Record<string, unknown>][] = [
      ["app_ch_save_official_domain", { p_domain: { address: "exemplo.gov.br", institution: "X", kind: "governo", active: true } }],
      ["app_ch_source_search_start", { p_request: { area: "PEDIATRIA", theme: "Asma barrada" } }],
      ["app_ch_source_searches", {}],
      ["app_ch_source_candidates", {}],
      ["app_ch_source_candidate", { p_candidate_id: c.id }],
      ["app_ch_source_candidate_save", { p_candidate_id: c.id, p_fields: { title: "Título barrado" } }],
      ["app_ch_register_source", { p_source: { title: "Fonte barrada", organ: "X" } }],
    ];
    for (const user of [t.editorUser, t.studentUser]) {
      for (const [fn, args] of adminOnly) await expect(t.db.asUser(user, fn, args), `${fn} para ${user.email}`).rejects.toThrow(RESTRITO);
    }
    expect((await sql(`select count(*)::int as n from public.ch_source_searches where theme = 'Asma barrada'`))[0].n).toBe(0);
    expect((await sql(`select ai_title from public.ch_source_candidates where id = $1`, [c.id]))[0].ai_title).not.toBe("Título barrado");
    // a equipe (editor) lê a lista de sites, mas não a de fontes achadas
    await expect(t.db.asUser(t.editorUser, "app_ch_official_domains")).resolves.toBeDefined();
    await expect(t.db.asUser(t.studentUser, "app_ch_official_domains")).rejects.toThrow(/Acesso restrito à equipe/);
    // visitante: nenhuma função da tela executa
    const anonOpen = await sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('app_ch_official_domains', 'app_ch_save_official_domain', 'app_ch_source_search_start', 'app_ch_source_searches', 'app_ch_source_candidates', 'app_ch_source_candidate', 'app_ch_source_candidate_save', 'app_ch_register_source', 'app_ch_sources')
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))`
    );
    expect(anonOpen).toEqual([]);
    // as de apoio também ficam fechadas para quem entrou
    const helpers = await sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('ch_source_site_match', 'ch_source_iso_date') and has_function_privilege('authenticated', p.oid, 'execute')`
    );
    expect(helpers).toEqual([]);
  });
});

// ---------------------------------------------------------------- a migração: número, ordem e colar duas vezes
describe("Migração 9610", () => {
  const ROOT = path.resolve(__dirname, "../..");
  const MIG_DIR = path.join(ROOT, "supabase/migrations");
  const NAME = "20261003009610_fontes_oficiais_ia.sql";
  const src = () => fs.readFileSync(path.join(MIG_DIR, NAME), "utf8");
  const code = (s: string) => s.replace(/--.*$/gm, "");

  it("preço por busca do catálogo: preenche só o que está vazio, nunca sobrescreve o que o dono digitou e pode rodar de novo", async () => {
    const text = src();
    const update = text.slice(text.indexOf("update public.ai_model_prices p"), text.indexOf("-- ---------------------------------------------------------------- permissões")).trim();
    const put = (provider: string, model: string, perSearch: number | null) =>
      sql(`insert into public.ai_model_prices (provider, model, input_per_mtok, output_per_mtok, per_search_usd) values ($1, $2, 3, 4, $3)
           on conflict (provider, model) do update set per_search_usd = excluded.per_search_usd, input_per_mtok = 3, output_per_mtok = 4`, [provider, model, perSearch]);
    const get = async (model: string) => (await sql(`select per_search_usd::float8 as v, input_per_mtok::float8 as i from public.ai_model_prices where model = $1`, [model]))[0];
    try {
      await put("anthropic", "claude-sonnet-5-5", null);
      await put("openai", "gpt-5.5", 0.5); // o dono digitou 0,50
      await put("gemini", "gemini-3.5-flash", null);
      await put("gemini", "gemini-2.5-flash", 0); // 0 também é um valor do dono
      await put("anthropic", "modelo-fora-do-catalogo", null);
      for (let i = 0; i < 2; i++) await t.dev.db.exec(update);
      expect(await get("claude-sonnet-5-5")).toEqual({ v: 0.01, i: 3 });
      expect(await get("gpt-5.5")).toEqual({ v: 0.5, i: 3 });
      expect(await get("gemini-3.5-flash")).toEqual({ v: 0.014, i: 3 });
      expect(await get("gemini-2.5-flash")).toEqual({ v: 0, i: 3 });
      expect((await get("modelo-fora-do-catalogo")).v).toBeNull();
    } finally {
      await sql(`delete from public.ai_model_prices where model in ('claude-sonnet-5-5', 'gpt-5.5', 'gemini-3.5-flash', 'gemini-2.5-flash', 'modelo-fora-do-catalogo')`);
    }
  });

  it("tem o número 9610 (faixa 9610 a 9619), vem depois da 9540 e o nome antigo não existe mais", () => {
    const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(files).toContain(NAME);
    expect(files.filter((f) => /fontes_oficiais_ia/.test(f))).toEqual([NAME]);
    expect(files.indexOf(NAME)).toBeGreaterThan(files.indexOf("20261003009540_reconferir_insuficientes.sql"));
  });

  it("as funções que ela redefine não são redefinidas por nenhuma migração depois da 9540 (parte da versão mais nova)", () => {
    const mine = [...code(src()).matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
    expect(mine.length).toBeGreaterThan(15);
    const others = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql") && f !== NAME);
    const redefined = ["ch_worker_ai_save_function", "app_ai_summary", "ch_worker_ai_log_calls", "ch_worker_ai_save_price", "app_ch_register_source", "app_ch_sources"];
    for (const fn of redefined) {
      expect(mine).toContain(fn);
      const where = others.filter((f) => new RegExp(`function public\\.${fn}\\(`).test(fs.readFileSync(path.join(MIG_DIR, f), "utf8"))).sort();
      // todas as outras definições vêm antes desta (a 9540 e as de depois dela não as recriam)
      for (const f of where) expect(f < NAME).toBe(true);
    }
    // nada do que a 9540 trouxe (fila com dono, pedido guardado) é redefinido aqui
    for (const fn of ["ch_worker_finish", "ch_worker_block", "ch_worker_fail", "ch_worker_checkpoint", "ch_worker_next", "ch_worker_next_marked", "ch_jobs_worker_exit", "ch_jobs_worker_enter"]) {
      expect(mine).not.toContain(fn);
    }
    expect(code(src())).not.toMatch(/drop trigger if exists ch_jobs_worker_(exit|enter)/);
  });

  it("colada duas vezes não dá erro, não apaga o que já existe e deixa tudo fechado para visitante", async () => {
    const domain = (await sql(`select id from public.ch_official_domains where address = 'who.int'`))[0];
    await asAdmin("app_ch_save_official_domain", { p_domain: { id: domain.id, address: "who.int", institution: "Organização Mundial da Saúde", kind: "internacional", active: false } });
    const cand = await createCandidate();
    const defOf = async () => (await sql(`select pg_get_functiondef('public.ch_worker_ai_save_function(uuid,text,jsonb)'::regprocedure) as d`))[0].d as string;
    const defBefore = await defOf();
    const before = (await sql(`select (select count(*)::int from public.ch_official_domains) as domains, (select count(*)::int from public.ch_source_candidates) as cands, (select count(*)::int from public.ch_source_searches) as searches`))[0];
    try {
      await t.dev.db.exec(src());
      await t.dev.db.exec(src());
      const after = (await sql(`select (select count(*)::int from public.ch_official_domains) as domains, (select count(*)::int from public.ch_source_candidates) as cands, (select count(*)::int from public.ch_source_searches) as searches`))[0];
      expect(after).toEqual(before);
      // a regra do Gemini é a mesma depois de colar de novo (a função do banco não muda)
      expect(await defOf()).toBe(defBefore);
      expect(defBefore).toContain("não funciona com o Gemini");
      await expect(
        t.db.service("ch_worker_ai_save_function", { p_actor: t.ADMIN, p_key: "busca_fontes", p_config: { mode: "sozinha", primary_ref: { provider: "gemini", model: "gemini-x" } } })
      ).rejects.toThrow(/não funciona com o Gemini/);
      // o site que o dono desativou continua desativado; o candidato continua lá
      expect((await sql(`select active from public.ch_official_domains where id = $1`, [domain.id]))[0].active).toBe(false);
      expect((await asAdmin("app_ch_source_candidate", { p_candidate_id: cand.id })).id).toBe(cand.id);
      // aprovar depois de colar de novo ainda funciona, e só uma vez
      await expect(asAdmin("app_ch_source_candidate_approve", { p_candidate_id: cand.id, p_fields: { level: "A", checked: true } })).resolves.toMatchObject({ file_kind: "pdf" });
      await expect(asAdmin("app_ch_source_candidate_approve", { p_candidate_id: cand.id, p_fields: { level: "A", checked: true } })).rejects.toThrow(/já foi decidido/);
      // regras e gatilho continuam em um exemplar só
      expect((await sql(`select count(*)::int as n from pg_trigger where tgname = 'ch_jobs_source_search_dead' and not tgisinternal`))[0].n).toBe(1);
      expect((await sql(`select count(*)::int as n from pg_policies where tablename in ('ch_official_domains','ch_source_searches','ch_source_candidates')`))[0].n).toBe(3);
      await sql(`insert into public.ch_jobs (step, scope_key, idempotency_key) values ('source_search', 'teste', 'teste-9610:ok')`);
      // permissões: depois de colar de novo, visitante e papel público continuam sem executar
      const open = await sql(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and (p.proname like 'ch\\_worker\\_source\\_%' or p.proname in ('ch_url_norm', 'ch_worker_ai_save_function', 'ch_worker_ai_log_calls', 'ch_worker_ai_save_price', 'ch_source_replacement', 'ch_source_candidate_item', 'ch_source_search_job_dead', 'ch_source_site_match', 'ch_source_iso_date'))
            and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))`
      );
      expect(open).toEqual([]);
      const openApp = await sql(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and (p.proname like 'app\\_ch\\_source\\_%' or p.proname in ('app_ch_official_domains', 'app_ch_save_official_domain', 'app_ai_summary', 'app_ch_sources'))
            and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))`
      );
      expect(openApp).toEqual([]);
    } finally {
      await sql(`delete from public.ch_jobs where idempotency_key = 'teste-9610:ok'`);
      await asAdmin("app_ch_save_official_domain", { p_domain: { id: domain.id, address: "who.int", institution: "Organização Mundial da Saúde", kind: "internacional", active: true } });
    }
  });

  it("as sete chaves da Central e as etapas da fila continuam aceitas depois de colar de novo", async () => {
    const keys = ["criacao", "verificacao", "engenharia_reversa", "assistente_preencher", "assistente_conferir", "assistente_revisar", "busca_fontes"];
    const cons = (await sql(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'ai_functions_key_check'`))[0].d as string;
    for (const k of keys) expect(cons).toContain(`'${k}'`);
    const summary = await t.db.asUser<any>(t.editorUser, "app_ai_summary");
    expect(summary.functions.map((f: any) => f.key)).toEqual(keys);
  });
});
