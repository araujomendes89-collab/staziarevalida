// @vitest-environment node
/**
 * Podcasts, P07 (supabase/migrations/…9720_podcasts_aprovacao_revisor.sql), num Postgres real em memória (PGlite) com todas as
 * migrações: o roteiro só é aprovado pelo ADMINISTRADOR ou pelo REVISOR MÉDICO da área do episódio (a mesma regra do áudio das
 * Aulas, 9580). Editor comum não aprova, nem revisor de OUTRA área, nem aluno, nem visitante. A recusa é do banco (a tela só
 * explica). A recusa de roteiro que cita fonte complementar (9620) continua. Colar a migração duas vezes não muda o resultado.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const MIGRATION = "20261003009720_podcasts_aprovacao_revisor.sql";
const U = (n: string) => `00000000-0000-4000-8000-0000000000${n}`;
const ADMIN = U("ad"), EDITOR = U("e1"), REVISORA = U("e2"), OUTRA = U("e3"), PURO = U("e4"), ALUNO = U("b1");
const NOTA = "Conferi as doses e os critérios nas páginas citadas.";
let db: PGlite;
let sql: string;

async function as<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])));
    return r.rows[0].result;
  });
}
const recusa = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return e as { message: string; code?: string };
  }
  throw new Error("a chamada deveria ter sido recusada");
};
const q = async (text: string, p: unknown[] = []) => (await db.query<any>(text, p)).rows;

/** Episódio com roteiro para revisar, criado e editado por um editor (do jeito que a equipe faz). */
async function novoEpisodio(area: string | null) {
  const ep = await as(EDITOR, "app_admin_save_podcast", { p_podcast: { title: `Episódio ${area ?? "sem área"} ${Math.random().toString(36).slice(2, 7)}`, topic: "Tema", area: area ?? "", target_minutes: 5 } });
  await as(EDITOR, "app_admin_podcast_save_script", { p_id: ep.id, p_script: { lines: [{ speaker: "ANA", text: "Hoje falamos de pré-eclâmpsia.", sources: [] }, { speaker: "BRUNO", text: "Boa, vamos lá.", sources: [] }], missing: [] } });
  return ep.id as string;
}
const reabre = (id: string) => q(`update public.podcasts set status = 'script_ready', approved_by = null, approved_at = null, approval_note = null where id = $1`, [id]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  sql = fs.readFileSync(path.join(MIGRATIONS, MIGRATION), "utf8");
  for (const [id, mail] of [[ADMIN, "adm"], [EDITOR, "ed"], [REVISORA, "rev"], [OUTRA, "outra"], [PURO, "puro"], [ALUNO, "al"]]) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${mail}@t.dev`]);
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = any ($1)`, [[EDITOR, REVISORA, OUTRA]]);
  // revisora: editora que também é revisora médica de Ginecologia e Obstetrícia; "outra": revisora de Pediatria; "puro": revisor sem ser equipe
  await db.query(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'GINECOLOGIA_OBSTETRICIA'), ($2, 'PEDIATRIA'), ($3, 'GINECOLOGIA_OBSTETRICIA')`, [REVISORA, OUTRA, PURO]);
}, 300_000);

describe("P07: quem aprova o roteiro do podcast (o banco decide)", () => {
  it("administrador aprova; revisora da área aprova; editor comum, revisora de outra área, revisor sem ser equipe, aluno e visitante não", async () => {
    const id = await novoEpisodio("GINECOLOGIA_OBSTETRICIA");
    const tentativa = (uid: string | null) => as(uid, "app_admin_podcast_approve", { p_id: id, p_note: NOTA });

    const editor = await recusa(tentativa(EDITOR));
    expect(editor.code).toBe("42501");
    expect(editor.message).toBe("Só o administrador ou o revisor médico da área Gineco & Obstetrícia aprova o roteiro. Peça a um deles para conferir e aprovar.");
    expect((await recusa(tentativa(OUTRA))).code).toBe("42501"); // revisora de outra área
    expect((await recusa(tentativa(PURO))).message).toMatch(/Acesso restrito à equipe/); // revisor que não é administrador nem editor: nem entra na aba
    expect((await recusa(tentativa(ALUNO))).message).toMatch(/Acesso restrito/);
    expect((await recusa(tentativa(null))).message).toMatch(/Acesso restrito|permission denied/);
    expect((await q(`select status, approved_at from public.podcasts where id = $1`, [id]))[0]).toMatchObject({ status: "script_ready", approved_at: null });
    expect(await q(`select 1 from public.admin_audit_log where action = 'podcast.approve' and target = $1`, [id])).toHaveLength(0); // as tentativas barradas não deixam aprovação no Registro

    const rev = await tentativa(REVISORA);
    expect(rev).toMatchObject({ status: "approved", approved_by: REVISORA, approval_note: NOTA, approved_by_name: "rev@t.dev" });
    const log = await q(`select actor_id, details from public.admin_audit_log where action = 'podcast.approve' and target = $1`, [id]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor_id: REVISORA });

    await reabre(id);
    expect(await tentativa(ADMIN)).toMatchObject({ status: "approved", approved_by: ADMIN });
  });

  it("um editor comum não troca a aprovação que o revisor já deu (aprovar de novo segue a mesma regra)", async () => {
    const id = await novoEpisodio("GINECOLOGIA_OBSTETRICIA");
    await as(REVISORA, "app_admin_podcast_approve", { p_id: id, p_note: NOTA });
    expect((await recusa(as(EDITOR, "app_admin_podcast_approve", { p_id: id, p_note: "Outra conferência qualquer." }))).code).toBe("42501");
    expect((await q(`select approved_by from public.podcasts where id = $1`, [id]))[0].approved_by).toBe(REVISORA);
  });

  it("episódio sem grande área: só o administrador aprova, e a recusa explica o que fazer", async () => {
    const id = await novoEpisodio(null);
    const r = await recusa(as(REVISORA, "app_admin_podcast_approve", { p_id: id, p_note: NOTA }));
    expect(r.code).toBe("42501");
    expect(r.message).toMatch(/não tem grande área/);
    expect(r.message).toMatch(/administrador/);
    expect(await as(ADMIN, "app_admin_podcast_approve", { p_id: id, p_note: NOTA })).toMatchObject({ status: "approved", approved_by: ADMIN });
  });

  it("a recusa de roteiro que cita fonte complementar (9620) continua valendo, também para o revisor e o administrador", async () => {
    await q(`insert into public.ch_sources (title, organ, authority_level) values ('Manual Zeta Exclusivo de Medicina 2026', 'Editora Zeta Exclusiva Brasil', 'E')`);
    const id = await novoEpisodio("GINECOLOGIA_OBSTETRICIA");
    await q(`update public.podcasts set script = jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('speaker','ANA','text','Segundo o Manual Zeta Exclusivo de Medicina 2026, a conduta é essa.','sources','[]'::jsonb), jsonb_build_object('speaker','BRUNO','text','Entendi.','sources','[]'::jsonb))) where id = $1`, [id]);
    for (const uid of [REVISORA, ADMIN]) {
      expect((await recusa(as(uid, "app_admin_podcast_approve", { p_id: id, p_note: NOTA }))).message).toMatch(/cita uma fonte complementar/);
    }
    expect((await q(`select status from public.podcasts where id = $1`, [id]))[0].status).toBe("script_ready");
  });

  it("nota curta continua barrada para quem pode aprovar; a ordem é: equipe, permissão, estado, nota", async () => {
    const id = await novoEpisodio("GINECOLOGIA_OBSTETRICIA");
    expect((await recusa(as(REVISORA, "app_admin_podcast_approve", { p_id: id, p_note: "ok" }))).message).toMatch(/pelo menos 10/);
    expect((await recusa(as(EDITOR, "app_admin_podcast_approve", { p_id: id, p_note: "ok" }))).code).toBe("42501"); // permissão antes da nota
    expect((await recusa(as(ADMIN, "app_admin_podcast_approve", { p_id: "00000000-0000-4000-8000-00000000ffff", p_note: NOTA }))).code).toBe("P0002");
  });

  it("publicar continua só do administrador (revisora aprova, mas não publica)", async () => {
    const id = await novoEpisodio("GINECOLOGIA_OBSTETRICIA");
    await as(REVISORA, "app_admin_podcast_approve", { p_id: id, p_note: NOTA });
    await q(`update public.podcasts set status = 'audio_ready', audio_path = 'podcasts/x/audio-a.mp3' where id = $1`, [id]);
    expect((await recusa(as(REVISORA, "app_admin_podcast_publish", { p_id: id, p_published: true }))).message).toMatch(/administrador/);
    expect(await as(ADMIN, "app_admin_podcast_publish", { p_id: id, p_published: true })).toMatchObject({ status: "published" });
  });
});

describe("P07: a tela pergunta ao banco se pode aprovar (app_admin_podcast_approval)", () => {
  it("diz sim para o administrador e a revisora da área; não, com a explicação, para os outros; visitante e aluno não consultam", async () => {
    const id = await novoEpisodio("GINECOLOGIA_OBSTETRICIA");
    expect(await as(ADMIN, "app_admin_podcast_approval", { p_id: id })).toEqual({ can_approve: true, reason: null });
    expect(await as(REVISORA, "app_admin_podcast_approval", { p_id: id })).toEqual({ can_approve: true, reason: null });
    const motivo = "Só o administrador ou o revisor médico da área Gineco & Obstetrícia aprova o roteiro. Peça a um deles para conferir e aprovar.";
    expect(await as(EDITOR, "app_admin_podcast_approval", { p_id: id })).toEqual({ can_approve: false, reason: motivo });
    expect(await as(OUTRA, "app_admin_podcast_approval", { p_id: id })).toEqual({ can_approve: false, reason: motivo });
    const semArea = await novoEpisodio(null);
    expect((await as(REVISORA, "app_admin_podcast_approval", { p_id: semArea })).can_approve).toBe(false);
    expect((await as(ADMIN, "app_admin_podcast_approval", { p_id: semArea })).can_approve).toBe(true);
    expect((await recusa(as(ALUNO, "app_admin_podcast_approval", { p_id: id }))).message).toMatch(/Acesso restrito/);
    expect((await recusa(as(PURO, "app_admin_podcast_approval", { p_id: id }))).message).toMatch(/Acesso restrito/);
    expect((await recusa(as(null, "app_admin_podcast_approval", { p_id: id }))).message).toMatch(/permission denied|Acesso restrito/);
    expect((await recusa(as(ADMIN, "app_admin_podcast_approval", { p_id: "00000000-0000-4000-8000-00000000ffff" }))).code).toBe("P0002");
  });

  it("as funções internas não são chamáveis por login nenhum", async () => {
    const id = await novoEpisodio("GINECOLOGIA_OBSTETRICIA");
    for (const [fn, args] of [["podcast_can_approve", { p_area: "PEDIATRIA" }], ["podcast_approve_block_text", { p_area: "PEDIATRIA" }], ["ch_raw_app_admin_podcast_approve", { p_id: id, p_note: NOTA }]] as const) {
      for (const uid of [ADMIN, REVISORA, null]) expect((await recusa(as(uid, fn, args as any))).message, `${fn} ${uid}`).toMatch(/permission denied/);
    }
  });
});

describe("2ª rodada, achado 2: a permissão por área é conferida COM A LINHA JÁ TRAVADA", () => {
  it("quando a permissão é conferida, a linha do episódio já está travada pela própria transação (e a área usada é a da linha travada)", async () => {
    const id = await novoEpisodio("GINECOLOGIA_OBSTETRICIA");
    await q(`create table if not exists public.zz_espiao (txid text, trava text, area text)`);
    // troca a regra por um espião que só olha: a linha está travada por esta transação (xmax = o número dela) quando a permissão é decidida?
    await q(`create or replace function public.podcast_can_approve(p_area public.med_area) returns boolean language plpgsql security definer set search_path = '' as $f$
      begin
        insert into public.zz_espiao select (txid_current() % 4294967296)::text, p.xmax::text, p.area::text from public.podcasts p where p.id = current_setting('zz.pid')::uuid;
        return true;
      end $f$`);
    await q(`select set_config('zz.pid', $1, false)`, [id]);
    try {
      await as(ADMIN, "app_admin_podcast_approve", { p_id: id, p_note: NOTA });
      const [vista] = await q(`select txid, trava, area from public.zz_espiao order by txid desc limit 1`);
      expect(vista.trava).toBe(vista.txid); // antes da correção: xmax = 0 (a permissão era decidida antes da trava)
      expect(vista.area).toBe("GINECOLOGIA_OBSTETRICIA");
    } finally {
      await q(`drop table public.zz_espiao`);
      await db.exec(sql); // devolve a regra verdadeira
    }
  });

  it("a área que vale é a da linha: mudou a área do episódio, a regra da área nova é a aplicada (revisora de Ginecologia perde, a de Pediatria ganha)", async () => {
    const id = await novoEpisodio("GINECOLOGIA_OBSTETRICIA");
    await q(`update public.podcasts set area = 'PEDIATRIA' where id = $1`, [id]);
    expect((await recusa(as(REVISORA, "app_admin_podcast_approve", { p_id: id, p_note: NOTA }))).code).toBe("42501");
    expect(await as(OUTRA, "app_admin_podcast_approve", { p_id: id, p_note: NOTA })).toMatchObject({ status: "approved", approved_by: OUTRA });
  });

  it("episódio inexistente continua dando 'não encontrado'; visitante e aluno continuam barrados antes de qualquer leitura", async () => {
    expect((await recusa(as(REVISORA, "app_admin_podcast_approve", { p_id: "00000000-0000-4000-8000-00000000ffff", p_note: NOTA }))).code).toBe("P0002");
    expect((await recusa(as(ALUNO, "app_admin_podcast_approve", { p_id: "00000000-0000-4000-8000-00000000ffff", p_note: NOTA }))).message).toMatch(/Acesso restrito/);
  });
});

describe("P07: colar a migração de novo", () => {
  it("duas vezes seguidas não dá erro e a regra continua igual; colar a 9620 de novo depois dela não desfaz a regra", async () => {
    await db.exec(sql);
    await db.exec(sql);
    const id = await novoEpisodio("GINECOLOGIA_OBSTETRICIA");
    expect((await recusa(as(EDITOR, "app_admin_podcast_approve", { p_id: id, p_note: NOTA }))).code).toBe("42501");
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, "20261003009620_fontes_complementares.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, "20261003009621_fontes_complementares_equipe.sql"), "utf8"));
    expect((await recusa(as(EDITOR, "app_admin_podcast_approve", { p_id: id, p_note: NOTA }))).code).toBe("42501");
    expect(await as(REVISORA, "app_admin_podcast_approve", { p_id: id, p_note: NOTA })).toMatchObject({ status: "approved" });
  });
});
