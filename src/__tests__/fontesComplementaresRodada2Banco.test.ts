// @vitest-environment node
/**
 * Fontes complementares, rodada de correções (banco). Num Postgres real em memória com TODAS as migrações.
 *  (A) mudar o nível/classe de uma fonte (por app_ch_set_source_authority, por UPDATE direto, ou apagar a fonte) atualiza as marcas
 *      guardadas dos anexos (aula, material, atualização), nos dois sentidos.
 *  (D) o banco normaliza entidades HTML como o servidor (ver também fontesComplementaresRodada2Servidor.test.ts).
 *  (E) o gatilho de salvar só monta a expressão da biblioteca uma vez por instrução.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { normalizeKey } from "../../server/contentHub/complementarGuard";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const ADMIN = "00000000-0000-4000-8000-0000000c00ad";
const ALUNA = "00000000-0000-4000-8000-0000000c000a";

const SHA = "a".repeat(64);
const FONTE_TITULO = "Manual de Referência Beta de Pediatria 2026";
const FONTE_URL = "https://editora-beta.invalid/pediatria-2026.pdf";

let db: PGlite;
const sql = async <T = any>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows;
const arg = (v: unknown) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => arg(args[k])));
    return r.rows[0].result;
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  for (const [id, email, name] of [[ADMIN, "adm@c.dev", "Adm"], [ALUNA, "aluna@c.dev", "Aluna"]]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { name }]);
  }
  await sql(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
}, 120_000);

describe("(A) marcas guardadas dos anexos acompanham o nível e a classe da fonte", () => {
  let fonteId: string;
  let aulaId: string;
  let materialId: string;
  let materialSemSha: string;
  let atualizacaoId: string;
  let podcastId: string;
  let podSrcId: string;

  const marcas = async () => ({
    material: (await sql(`select hidden_from_student h from public.lesson_materials where id = $1`, [materialId]))[0].h,
    aula: (await sql(`select guideline_hidden h from public.lessons where id = $1`, [aulaId]))[0].h,
    atualizacao: (await sql(`select source_hidden h from public.guideline_updates where id = $1`, [atualizacaoId]))[0].h,
  });
  const alunaVeMaterial = async () => (await rpc(ALUNA, "app_lesson_material", { p_id: materialId })) !== null;
  const podcastEscondido = async () => (await sql(`select public.podcast_admin_view($1) v`, [podcastId]))[0].v.sources.find((s: any) => s.id === podSrcId).student_hidden;

  beforeAll(async () => {
    // fonte OFICIAL nível A com o mesmo arquivo (SHA-256) que foi anexado a uma aula
    fonteId = (await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level, sha256) values ($1, 'Editora Beta de Pediatria (teste)', 'final', $2, '2026', 'A', $3) returning id`, [FONTE_TITULO, FONTE_URL, SHA]))[0].id;
    aulaId = (await sql(`insert into public.lessons (area, topic, title, guideline_title, published) values ('PEDIATRIA', 'Bronquiolite', 'Bronquiolite na prática', $1, true) returning id`, [FONTE_TITULO]))[0].id;
    materialId = (await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path, sha256) values ($1, 'other', 'Material de apoio', $2, $3) returning id`, [aulaId, `lessons/${aulaId}/neutro.pdf`, SHA]))[0].id;
    materialSemSha = (await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'other', 'Outro material', $2) returning id`, [aulaId, `lessons/${aulaId}/outro.pdf`]))[0].id;
    atualizacaoId = (await sql(
      `insert into public.guideline_updates (slug, area, topic, institution, document_title, source_url, published, review_status, source_checked_at, reviewed_by, reviewed_at)
       values ('diretriz-beta', 'PEDIATRIA', 'Bronquiolite leve', 'Editora Beta de Pediatria (teste)', $1, 'https://exemplo.invalid/diretriz-beta', true, 'approved', now(), $2, now()) returning id`, [FONTE_TITULO, ADMIN]))[0].id;
    podcastId = (await sql(`insert into public.podcasts (title, topic, area, status, script, approved_at, audio_path, published_at) values ('Bronquiolite em 8 minutos', 'Bronquiolite', 'PEDIATRIA', 'published', '{"lines":[]}'::jsonb, now(), 'podcasts/x.mp3', now()) returning id`))[0].id;
    podSrcId = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, sha256, position) values ($1, 'pdf', 'Resumo.pdf', 'podcasts/a.pdf', $2, 1) returning id`, [podcastId, SHA]))[0].id;
  });

  it("começa tudo à mostra (fonte oficial)", async () => {
    expect(await marcas()).toEqual({ material: false, aula: false, atualizacao: false });
    expect(await alunaVeMaterial()).toBe(true);
    expect(await podcastEscondido()).toBe(false);
  });

  it("subir o nível para E pela função do administrador esconde os anexos e o aluno deixa de receber o arquivo", async () => {
    await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: fonteId, p_level: "E" });
    expect((await sql(`select audience from public.ch_sources where id = $1`, [fonteId]))[0].audience).toBe("complementar");
    expect(await marcas()).toEqual({ material: true, aula: true, atualizacao: true });
    expect(await alunaVeMaterial()).toBe(false);
    expect(await podcastEscondido()).toBe(true);
    expect((await sql(`select hidden_from_student h from public.lesson_materials where id = $1`, [materialSemSha]))[0].h).toBe(false);
  });

  it("voltar a classe para oficial (pela função) devolve a marca", async () => {
    await rpc(ADMIN, "app_ch_set_source_audience", { p_source_id: fonteId, p_audience: "oficial" });
    expect(await marcas()).toEqual({ material: false, aula: false, atualizacao: false });
    expect(await alunaVeMaterial()).toBe(true);
  });

  it("UPDATE direto só do nível (A para E) também esconde", async () => {
    await sql(`update public.ch_sources set authority_level = 'A' where id = $1`, [fonteId]);
    expect(await marcas()).toEqual({ material: false, aula: false, atualizacao: false });
    await sql(`update public.ch_sources set authority_level = 'E' where id = $1`, [fonteId]);
    expect(await marcas()).toEqual({ material: true, aula: true, atualizacao: true });
  });

  it("UPDATE direto só da classe (complementar para oficial) devolve a marca, e de volta esconde", async () => {
    await sql(`update public.ch_sources set audience = 'oficial' where id = $1`, [fonteId]);
    expect(await marcas()).toEqual({ material: false, aula: false, atualizacao: false });
    await sql(`update public.ch_sources set audience = 'complementar' where id = $1`, [fonteId]);
    expect(await marcas()).toEqual({ material: true, aula: true, atualizacao: true });
  });

  it("apagar a fonte complementar devolve a marca; fonte nova de nível E esconde de uma vez", async () => {
    await sql(`delete from public.ch_sources where id = $1`, [fonteId]);
    expect(await marcas()).toEqual({ material: false, aula: false, atualizacao: false });
    await sql(`insert into public.ch_sources (title, organ, kind, url, version, authority_level, sha256) values ($1, 'Editora Beta de Pediatria (teste)', 'final', $2, '2026', 'E', $3)`, [FONTE_TITULO, FONTE_URL, SHA]);
    expect(await marcas()).toEqual({ material: true, aula: true, atualizacao: true });
  });
});

describe("(D) o banco e o servidor dão a MESMA chave de comparação para os mesmos textos", () => {
  const CASOS: Array<[string, string]> = [
    ["texto simples", "Sangue nos Olhos — Pediatria"],
    ["acentos", "Manual de Pediatria: Coração, Pulmão e Ação"],
    ["etiquetas HTML", "<b>Sangue</b> nos <i>Olhos</i> — Pediatria"],
    ["entidade numérica decimal", "S&#97;ngue nos Olhos — Pediatria"],
    ["entidade numérica hexadecimal minúscula", "S&#x61;ngue nos Olhos"],
    ["entidade numérica hexadecimal maiúscula", "S&#X41;NGUE nos Olhos"],
    ["entidade com zeros à esquerda", "S&#x0000061;ngue &#0000097;qui"],
    ["entidade nomeada &amp;", "Saúde &amp; Sangue nos Olhos"],
    ["entidade nomeada &nbsp;", "Sangue&nbsp;nos&nbsp;Olhos"],
    ["entidades &quot; &lt; &gt; &apos;", "&quot;Sangue&quot; &lt;nos&gt; &apos;Olhos&apos;"],
    ["entidade &shy; some", "San&shy;gue nos Olhos"],
    ["entidade nomeada em maiúsculas", "Sangue&NBSP;nos&AMP;Olhos"],
    ["entidade desconhecida", "Sangue&foo;nos Olhos &bar;"],
    ["entidade que decodifica para largura zero", "San&#x200B;gue nos Olhos"],
    ["entidade que decodifica para acento solto", "Sangue nos Ol&#x0301;hos"],
    ["entidade de código impossível", "Sangue&#99999999999;nos&#x110000;Olhos&#0;fim&#xD800;x"],
    ["entidade dupla não se decodifica duas vezes", "S&amp;#97;ngue nos Olhos"],
    ["e comercial solta e ponto e vírgula", "Tom & Jerry; e S&ngue"],
    ["%20 e %xx", "Sangue%20nos%20Olhos%2Fpdf"],
    ["largura zero", "San\u200bgue\u200c nos\u200d Ol\u2060hos\ufeff"],
    ["hífen suave", "San\u00adgue nos Olhos"],
    ["acento solto (combinante)", "Sangue nos Olhos Ped\u0069\u0301atria"],
    ["decomposto (NFD)", "Pediatria Ação".normalize("NFD")],
    ["largura total (NFKC)", "Ｓａｎｇｕｅ ｎｏｓ Ｏｌｈｏｓ"],
    ["ligadura e fração (NFKC)", "ﬁlho ½ dose"],
    ["homóglifos do cirílico", "Sаngue nоs Оlhоs — Рediatriа"],
    ["homóglifos do grego", "Sangυe nοs Οlhοs"],
    ["cirílico em maiúsculas", "СANGUE NОS ОLHОS"],
    ["pontuação e números", "Manual 2026/2027 (v.3) - Cap. 12"],
    ["vazio e espaços", "   "],
  ];
  for (const [nome, texto] of CASOS) {
    it(nome, async () => {
      const banco = (await sql<{ k: string }>(`select public.ch_text_key($1) k`, [texto]))[0].k;
      expect(banco).toBe(normalizeKey(texto));
    });
  }
  it("a entidade numérica não escapa do filtro do banco: 'S&#97;ngue nos Olhos' é igual ao título cadastrado", async () => {
    await sql(`insert into public.ch_sources (title, organ, kind, authority_level) values ('Sangue nos Olhos — Pediatria', 'Curso Gama de Pediatria (teste)', 'final', 'E')`);
    expect((await sql(`select public.ch_complementar_hit($1) h`, ["S&#97;ngue nos Olhos — Pediatria"]))[0].h).toBe(true);
    expect((await sql(`select public.ch_complementar_hit($1) h`, ["S&#x61;ngue nos Olhos — Pediatria"]))[0].h).toBe(true);
    expect((await sql(`select public.ch_complementar_hit($1) h`, ["Sangue nos Olhos — Cardiologia"]))[0].h).toBe(false);
  });
});

describe("(E) o gatilho de salvar monta a expressão da biblioteca uma vez por instrução", () => {
  const MENSAGEM = "Este texto cita uma fonte complementar cadastrada (o aluno não pode ver). Reescreva sem citar o nome desse material.";
  const T_COMPLEMENTAR = "Livro Delta de Clínica Médica 2026";
  let gatilhosOk = false;

  const contar = async () => Number((await sql<{ n: string }>(`select last_value::text n from public.teste_regex_chamadas`))[0].n);
  /** Salva 500 linhas numa instrução só, COMO USUÁRIO (o gatilho barra citação só de quem está logado). */
  async function salvar(titulos: (i: number) => string): Promise<{ construcoes: number; erro?: { message: string; code?: string }; linhas: number }> {
    await sql(`delete from public.lessons where instructor = 'LOTE'`);
    const antes = await contar();
    await sql(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: ADMIN })]);
    let erro: { message: string; code?: string } | undefined;
    try {
      await db.query(
        `insert into public.lessons (area, topic, title, instructor, specialty, summary, key_points)
         select 'PEDIATRIA', 'Tema ' || g, ($1::text[])[g], 'LOTE', 'Pediatria', 'Resumo ' || g, array['ponto um', 'ponto dois'] from generate_series(1, 500) g`,
        [Array.from({ length: 500 }, (_, i) => titulos(i))]);
    } catch (e: any) {
      erro = { message: e.message, code: e.code };
    } finally {
      await sql(`select set_config('request.jwt.claims', '{}', false)`);
    }
    const linhas = (await sql<{ n: number }>(`select count(*)::int n from public.lessons where instructor = 'LOTE'`))[0].n;
    return { construcoes: (await contar()) - antes, erro, linhas };
  }

  beforeAll(async () => {
    await sql(`delete from public.ch_sources where audience = 'complementar'`);
    // instrumento de teste: cada construção da expressão incrementa uma sequência
    await sql(`create sequence public.teste_regex_chamadas`);
    await sql(`select setval('public.teste_regex_chamadas', 1, false)`);
    await sql(`alter function public.ch_complementar_regex() rename to ch_complementar_regex_original`);
    await sql(`create function public.ch_complementar_regex() returns text language plpgsql volatile security definer set search_path = ''
               as $$ begin perform nextval('public.teste_regex_chamadas'); return public.ch_complementar_regex_original(); end $$`);
    gatilhosOk = true;
  });

  it("biblioteca VAZIA (sem termos): 500 linhas montam a expressão no máximo uma vez e salvam tudo", async () => {
    expect(gatilhosOk).toBe(true);
    expect((await sql(`select count(*)::int n from public.ch_sources where audience = 'complementar'`))[0].n).toBe(0);
    const r = await salvar((i) => `Aula ${i} de bronquiolite`);
    expect(r.erro).toBeUndefined();
    expect(r.linhas).toBe(500);
    expect(r.construcoes).toBeLessThanOrEqual(1);
  });

  it("biblioteca COM termos: 500 linhas montam a expressão no máximo uma vez; nada citado, tudo salva", async () => {
    await sql(`insert into public.ch_sources (title, organ, kind, authority_level) values ($1, 'Editora Delta de Medicina (teste)', 'final', 'E')`, [T_COMPLEMENTAR]);
    const r = await salvar((i) => `Aula ${i} de bronquiolite`);
    expect(r.erro).toBeUndefined();
    expect(r.linhas).toBe(500);
    expect(r.construcoes).toBeLessThanOrEqual(1);
  });

  it("biblioteca COM termos: uma linha do lote cita o título cadastrado e o lote inteiro é barrado, com a mesma mensagem de antes", async () => {
    const r = await salvar((i) => (i === 321 ? `Resumo do ${T_COMPLEMENTAR}` : `Aula ${i} de bronquiolite`));
    expect(r.erro).toMatchObject({ message: MENSAGEM, code: "22023" });
    expect(r.linhas).toBe(0);
    expect(r.construcoes).toBeLessThanOrEqual(1);
  });

  it("uma instrução nova enxerga a biblioteca como ela está (a expressão não fica velha entre instruções)", async () => {
    await sql(`update public.ch_sources set title = 'Livro Epsilon de Cirurgia Geral 2026' where title = $1`, [T_COMPLEMENTAR]);
    expect((await salvar((i) => (i === 7 ? `Resumo do ${T_COMPLEMENTAR}` : `Aula ${i}`))).erro).toBeUndefined();
    expect((await salvar((i) => (i === 7 ? "Resumo do Livro Epsilon de Cirurgia Geral 2026" : `Aula ${i}`))).erro?.message).toBe(MENSAGEM);
    await sql(`delete from public.lessons where instructor = 'LOTE'`);
  });

  it("toda tabela conferida pelo gatilho de salvar também tem o gatilho de instrução que zera a expressão guardada", async () => {
    const guarda = (await sql<{ t: string }>(`select distinct c.relname t from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_proc p on p.oid = g.tgfoid where p.proname = 'ch_guard_complementar_save' and not g.tgisinternal`)).map((r) => r.t).sort();
    const zera = (await sql<{ t: string }>(`select distinct c.relname t from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_proc p on p.oid = g.tgfoid where p.proname = 'ch_guard_complementar_reset' and not g.tgisinternal`)).map((r) => r.t).sort();
    expect(guarda.length).toBeGreaterThanOrEqual(6);
    expect(zera).toEqual(guarda);
  });
});

describe("(B) arquivo sem SHA-256 conferido fica escondido do aluno (retenção por caminho)", () => {
  let aulaId: string;
  let podcastId: string;
  const CAMINHO = "lessons/x/slides-0123456789abcdef.pdf";
  const SHA_B = "b".repeat(64);
  const hold = (p: string) => sql(`select public.ch_worker_file_hold($1) r`, [p]);
  const sha = async (p: string, h: string) => (await sql(`select public.ch_worker_file_sha($1, $2) r`, [p, h]))[0].r as number;
  const material = async (path: string) => (await sql(`select id, hidden_from_student h, sha256 from public.lesson_materials where storage_path = $1`, [path]))[0];

  beforeAll(async () => {
    await sql(`delete from public.ch_sources where audience = 'complementar'`);
    aulaId = (await sql(`insert into public.lessons (area, topic, title, published) values ('PEDIATRIA', 'Bronquiolite', 'Aula com retenção', true) returning id`))[0].id;
    podcastId = (await sql(`insert into public.podcasts (title, topic, area, status, script, approved_at, audio_path, published_at) values ('Episódio B', 'Bronquiolite', 'PEDIATRIA', 'published', '{"lines":[]}'::jsonb, now(), 'podcasts/b.mp3', now()) returning id`))[0].id;
  });

  it("sem retenção e sem SHA: o material antigo (já em produção) continua à vista", async () => {
    await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'other', 'Antigo', $2)`, [aulaId, "lessons/x/antigo.pdf"]);
    expect((await material("lessons/x/antigo.pdf")).h).toBe(false);
  });

  it("com retenção: o material nasce escondido do aluno e o servidor não entrega o arquivo", async () => {
    await hold(CAMINHO);
    await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'slides', 'Slides', $2)`, [aulaId, CAMINHO]);
    const m = await material(CAMINHO);
    expect(m.h).toBe(true);
    expect(await rpc(ALUNA, "app_lesson_material", { p_id: m.id })).toBeNull();
    expect((await rpc(ALUNA, "lesson_materials_json", { p_lesson: aulaId })).find((x: any) => x.id === m.id)).toBeUndefined();
    expect((await rpc(ADMIN, "lesson_materials_json", { p_lesson: aulaId })).find((x: any) => x.id === m.id)).toMatchObject({ sha_pendente: true }); // a equipe vê o motivo
  });

  it("gravar o SHA-256 solta a retenção e o aluno passa a receber o arquivo", async () => {
    expect(await sha(CAMINHO, SHA_B)).toBe(1);
    const m = await material(CAMINHO);
    expect((await rpc(ADMIN, "lesson_materials_json", { p_lesson: aulaId })).find((x: any) => x.id === m.id)).toMatchObject({ sha_pendente: false });
    expect(m).toMatchObject({ h: false, sha256: SHA_B });
    expect(await rpc(ALUNA, "app_lesson_material", { p_id: m.id })).not.toBeNull();
    expect((await sql(`select count(*)::int n from public.ch_file_holds where storage_path = $1`, [CAMINHO]))[0].n).toBe(0);
  });

  it("o SHA-256 de uma apostila cadastrada solta a retenção mas continua escondido pela classe", async () => {
    const outro = "lessons/x/apostila-neutra.pdf";
    await sql(`insert into public.ch_sources (title, organ, kind, authority_level, sha256) values ('Livro Zeta de Pediatria Geral 2026', 'Editora Zeta de Medicina (teste)', 'final', 'E', $1)`, ["c".repeat(64)]);
    await hold(outro);
    await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'other', 'Arquivo', $2)`, [aulaId, outro]);
    expect(await sha(outro, "c".repeat(64))).toBe(1);
    expect((await material(outro)).h).toBe(true);
    await sql(`delete from public.ch_sources where audience = 'complementar'`);
  });

  it("gravar SHA de um caminho sem material devolve 0 e mantém a retenção", async () => {
    await hold("lessons/x/ainda-nao-registrado.pdf");
    expect(await sha("lessons/x/ainda-nao-registrado.pdf", SHA_B)).toBe(0);
    expect((await sql(`select count(*)::int n from public.ch_file_holds where storage_path = 'lessons/x/ainda-nao-registrado.pdf'`))[0].n).toBe(1);
  });

  it("fonte de podcast: com retenção fica escondida do aluno (e a equipe vê a marca), sem retenção aparece", async () => {
    const view = async (srcId: string) => (await sql(`select public.podcast_admin_view($1) v`, [podcastId]))[0].v.sources.find((s: any) => s.id === srcId);
    await hold("podcasts/x/src-aaaaaaaaaaaaaaaa.pdf");
    const id = (await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'Resumo neutro', 'podcasts/x/src-aaaaaaaaaaaaaaaa.pdf', 1) returning id`, [podcastId]))[0].id;
    expect(await view(id)).toMatchObject({ student_hidden: true, sha_pendente: true });
    expect((await rpc(ALUNA, "app_podcast", { p_id: podcastId })).sources ?? []).toEqual([]);
    expect(await sha("podcasts/x/src-aaaaaaaaaaaaaaaa.pdf", SHA_B)).toBe(1);
    expect(await view(id)).toMatchObject({ student_hidden: false, sha_pendente: false });
    expect((await rpc(ALUNA, "app_podcast", { p_id: podcastId })).sources).toHaveLength(1);
  });

  it("liberar a retenção: sem material registrado ela cai; com material registrado NUNCA cai; repetir não dá erro", async () => {
    const livre = "lessons/x/recusado.pdf";
    await hold(livre);
    expect((await sql(`select public.ch_worker_file_release($1) r`, [livre]))[0].r).toBe(true);
    expect((await sql(`select count(*)::int n from public.ch_file_holds where storage_path = $1`, [livre]))[0].n).toBe(0);
    expect((await sql(`select public.ch_worker_file_release($1) r`, [livre]))[0].r).toBe(false); // já não havia
    // material de aula registrado sem SHA: a retenção continua
    const preso = "lessons/x/registrado-sem-sha.pdf";
    await hold(preso);
    await sql(`insert into public.lesson_materials (lesson_id, kind, title, storage_path) values ($1, 'other', 'Sem SHA', $2)`, [aulaId, preso]);
    expect((await sql(`select public.ch_worker_file_release($1) r`, [preso]))[0].r).toBe(false);
    expect((await sql(`select count(*)::int n from public.ch_file_holds where storage_path = $1`, [preso]))[0].n).toBe(1);
    expect((await material(preso)).h).toBe(true);
    // fonte de podcast registrada sem SHA: idem
    const presoP = "podcasts/x/src-bbbbbbbbbbbbbbbb.pdf";
    await hold(presoP);
    await sql(`insert into public.podcast_sources (podcast_id, kind, title, storage_path, position) values ($1, 'pdf', 'Sem SHA', $2, 9)`, [podcastId, presoP]);
    expect((await sql(`select public.ch_worker_file_release($1) r`, [presoP]))[0].r).toBe(false);
    expect((await sql(`select count(*)::int n from public.ch_file_holds where storage_path = $1`, [presoP]))[0].n).toBe(1);
  });

  it("gravar SHA de caminho sem material não mexe na retenção (nem apaga nem recria)", async () => {
    const c = "lessons/x/sem-material.pdf";
    await hold(c);
    expect(await sha(c, SHA_B)).toBe(0);
    expect((await sql(`select count(*)::int n from public.ch_file_holds where storage_path = $1`, [c]))[0].n).toBe(1);
    await sql(`select public.ch_worker_file_release($1)`, [c]);
  });

  it("só o servidor chama as funções de retenção", async () => {
    await expect(rpc(ADMIN, "ch_worker_file_release", { p_path: "x" })).rejects.toThrow(/permission denied/i);
    await expect(rpc(ALUNA, "ch_worker_file_hold", { p_path: "x" })).rejects.toThrow(/permission denied/i);
    await expect(rpc(ADMIN, "ch_worker_file_sha", { p_path: "x", p_sha: SHA_B })).rejects.toThrow(/permission denied/i);
    await expect(rpc(ALUNA, "ch_complementar_file", { p_sha: SHA_B })).rejects.toThrow(/permission denied/i);
  });
});
