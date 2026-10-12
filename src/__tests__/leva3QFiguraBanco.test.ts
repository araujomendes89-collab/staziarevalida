// @vitest-environment node
/**
 * Leva 3, aba Questões, Q07 (decisão do dono, 11/10/2026): a equipe toda envia a figura da questão (uma por questão, texto
 * alternativo obrigatório). Vincular a figura libera a questão que citava imagem sem imagem; desmarcar "Cita figura" não pode
 * liberar a questão sem a imagem. Num Postgres real em memória com todas as migrações (supabase/migrations/…97NN_*.sql).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { ADMIN, ANA, EDITOR, idOf, MIGRATIONS, question, REV_PED, startDb, type Db } from "./helpers/questoesLeva3";

let t: Db;
let counter = 0;
/** Caminho sorteado como o servidor faz: "questoes/" + 32 letras/dígitos + .png ou .jpg (um arquivo novo a cada chamada). */
const fresh = (ext: "png" | "jpg" = "png") => `questoes/${(++counter).toString(16).padStart(32, "a")}.${ext}`;
const figure = (p = fresh(), extra: Record<string, unknown> = {}) => ({ path: p, alt: "Eletrocardiograma com supradesnivelamento de ST em parede anterior", content_type: "image/png", size_bytes: 120_000, ...extra });
const row = async (n: number) => (await t.sql<any>(`select * from public.questions where id = $1`, [idOf(n)]))[0];
const save = (extra: Record<string, unknown>, uid = EDITOR) => t.rpc(uid, "app_admin_save_question", { p_question: extra });
const inPool = async (uid: string, n: number) =>
  (await t.asUser<any>(uid, `select count(*)::int as c from public.practice_pool('{}'::jsonb) where question_id = $1`, [idOf(n)]))[0].c === 1;
/** O servidor confere o arquivo no depósito e só então o confirma ao banco (ch_worker_question_figure_confirm, só do serviço). */
const confirmFile = (p: string, type = "image/png", size = 120_000) => t.sql(`select public.ch_worker_question_figure_confirm($1, $2, $3)`, [p, type, size]);
const setFigure = async (uid: string | null, n: number, image: Record<string, unknown> = figure(), confirm = true) => {
  if (confirm) await confirmFile(String(image.path), String(image.content_type ?? "image/png"), Number(image.size_bytes ?? 120_000));
  return t.rpc(uid, "app_admin_set_question_image", { p_question_id: idOf(n), p_image: image });
};
const removeFigure = (uid: string | null, n: number) => t.rpc(uid, "app_admin_remove_question_image", { p_question_id: idOf(n) });
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
  return null;
};

beforeAll(async () => {
  t = await startDb();
}, 120_000);

describe("Q07 — enviar a figura da questão", () => {
  it("o editor vincula a figura: a questão que citava imagem sem imagem passa a valer nos treinos do aluno", async () => {
    await save(question(701, { needs_image: true }));
    expect(await inPool(ANA, 701)).toBe(false); // cita figura não vinculada: fora dos treinos
    const a = fresh();
    const saved = await setFigure(EDITOR, 701, figure(a));
    expect(saved.images).toEqual([{ path: a, alt: figure().alt }]);
    expect(saved.needs_image).toBe(true);
    expect(await inPool(ANA, 701)).toBe(true);
    // o aluno recebe a figura com o texto alternativo, sem nome de arquivo nem quem enviou
    const view = await t.rpc<any>(ANA, "practice_question_view", { p_question_id: idOf(701) });
    expect(view.images).toEqual([{ path: a, alt: figure().alt }]);
    expect(JSON.stringify(view)).not.toMatch(/size_bytes|content_type|uploaded|upload|master|editor/i);
  });

  it("o aluno logado recebe a figura (caminho e texto alternativo) para o servidor assinar; visitante não; índice fora da lista não dá nada", async () => {
    await save(question(717, { needs_image: true }));
    const p = fresh();
    await setFigure(EDITOR, 717, figure(p));
    expect(await t.rpc(ANA, "app_question_figure", { p_question_id: idOf(717), p_index: 0 })).toEqual({ path: p, alt: figure().alt });
    expect(await t.rpc(ANA, "app_question_figure", { p_question_id: idOf(717), p_index: 1 })).toBeNull();
    expect(await t.rpc(ANA, "app_question_figure", { p_question_id: "nao_existe", p_index: 0 })).toBeNull();
    expect(await failure(t.rpc(null, "app_question_figure", { p_question_id: idOf(717), p_index: 0 }))).toMatch(/permission denied|permissão/i);
  });

  it("o administrador também envia; trocar a figura substitui a anterior (uma figura por questão)", async () => {
    await save(question(702, { needs_image: true }));
    await setFigure(ADMIN, 702, figure());
    const b = fresh("jpg");
    const again = await setFigure(EDITOR, 702, figure(b, { content_type: "image/jpeg", alt: "Radiografia de tórax em PA com derrame pleural à direita" }));
    expect(again.images).toEqual([{ path: b, alt: "Radiografia de tórax em PA com derrame pleural à direita" }]);
    expect((await row(702)).images).toHaveLength(1);
  });

  it("o texto alternativo é obrigatório (pelo menos 10 letras) e o arquivo precisa ser PNG ou JPG de até 5 MB", async () => {
    await save(question(703, { needs_image: true }));
    expect(await failure(setFigure(EDITOR, 703, figure(undefined, { alt: "" })))).toMatch(/texto alternativo/i);
    expect(await failure(setFigure(EDITOR, 703, figure(undefined, { alt: "   curto  " })))).toMatch(/texto alternativo/i);
    expect(await failure(setFigure(EDITOR, 703, figure(undefined, { alt: "x".repeat(301) })))).toMatch(/texto alternativo/i);
    expect(await failure(setFigure(EDITOR, 703, figure(undefined, { content_type: "image/gif" })))).toMatch(/PNG ou JPG/);
    expect(await failure(setFigure(EDITOR, 703, figure(undefined, { content_type: "application/pdf" })))).toMatch(/PNG ou JPG/);
    expect(await failure(setFigure(EDITOR, 703, figure(undefined, { size_bytes: 5 * 1024 * 1024 + 1 })))).toMatch(/5 MB/);
    expect(await failure(setFigure(EDITOR, 703, figure(undefined, { size_bytes: 0 })))).toMatch(/vazio|5 MB/);
    expect(await failure(setFigure(EDITOR, 703, figure("questoes/../outra.png")))).toMatch(/caminho/i);
    expect(await failure(setFigure(EDITOR, 703, figure("https://exemplo.com/x.png")))).toMatch(/caminho/i);
    expect(await failure(setFigure(EDITOR, 703, figure("questoes/ECG-do-paciente-Joao.png")))).toMatch(/caminho/i); // nome neutro: só o nome sorteado
    expect((await row(703)).images).toEqual([]);
    // PNG e JPG de 5 MB certos valem
    await setFigure(EDITOR, 703, figure(undefined, { size_bytes: 5 * 1024 * 1024 }));
    expect((await row(703)).images).toHaveLength(1);
  });

  it("o mesmo arquivo não vira figura de duas questões; questão inexistente é recusada", async () => {
    await save(question(704, { needs_image: true }));
    await save(question(705, { needs_image: true }));
    const shared = fresh("jpg");
    await setFigure(EDITOR, 704, figure(shared, { content_type: "image/jpeg" }));
    expect(await failure(setFigure(EDITOR, 705, figure(shared, { content_type: "image/jpeg" })))).toMatch(/já é a figura de outra questão/);
    expect(await failure(t.rpc(EDITOR, "app_admin_set_question_image", { p_question_id: "nao_existe", p_image: figure() }))).toMatch(/não encontrada/);
  });

  it("questão que já tem várias figuras (do caderno) não é trocada pelo envio", async () => {
    await save(question(706, { needs_image: true }));
    await t.sql(`update public.questions set images = '[{"url":"/question-assets/a.png","alt":"A"},{"url":"/question-assets/b.png","alt":"B"}]'::jsonb where id = $1`, [idOf(706)]);
    expect(await failure(setFigure(EDITOR, 706))).toMatch(/mais de uma figura/);
    expect(await failure(removeFigure(EDITOR, 706))).toMatch(/mais de uma figura/);
    expect((await row(706)).images).toHaveLength(2);
  });

  it("tirar a figura: a questão que citava a figura volta para fora dos treinos; a que não citava continua valendo", async () => {
    await save(question(707, { needs_image: true }));
    await save(question(708, { needs_image: false }));
    await setFigure(EDITOR, 707);
    await setFigure(EDITOR, 708, figure(fresh("jpg"), { content_type: "image/jpeg" }));
    expect(await inPool(ANA, 707)).toBe(true);
    const removed = await removeFigure(EDITOR, 707);
    expect(removed.images).toEqual([]);
    expect(removed.needs_image).toBe(true);
    expect(await inPool(ANA, 707)).toBe(false);
    await removeFigure(ADMIN, 708);
    expect(await inPool(ANA, 708)).toBe(true);
    // sem figura, tirar de novo não dá erro nem registro novo
    const before = (await t.sql<any>(`select count(*)::int c from public.admin_audit_log where action = 'question.figure_removed' and target = $1`, [idOf(708)]))[0].c;
    await removeFigure(EDITOR, 708);
    expect((await t.sql<any>(`select count(*)::int c from public.admin_audit_log where action = 'question.figure_removed' and target = $1`, [idOf(708)]))[0].c).toBe(before);
  });

  it("desmarcar 'Cita figura' sem a imagem NÃO libera a questão: pelo editor, pelo SQL direto e pela importação", async () => {
    await save(question(709, { needs_image: true }));
    const msg = await failure(save({ ...question(709, { needs_image: false }), id: idOf(709) }));
    expect(msg).toMatch(/cita uma figura que ainda não foi enviada/);
    expect((await row(709)).needs_image).toBe(true);
    expect(await failure(t.sql(`update public.questions set needs_image = false where id = $1`, [idOf(709)]))).toMatch(/cita uma figura que ainda não foi enviada/);
    // importação com "atualizar": o arquivo diz imagem = não; a questão continua marcada e a importação não falha
    const result = await t.rpc<any>(EDITOR, "app_admin_import_questions", { p_questions: [{ ...question(709, { needs_image: false }), needs_image_declared: "true" }], p_update_existing: true });
    expect(result.ok).toBe(true);
    expect((await row(709)).needs_image).toBe(true);
    expect(await inPool(ANA, 709)).toBe(false);
  });

  it("com a figura vinculada, desmarcar vale (a figura continua); marcar sem figura vale", async () => {
    await save(question(710, { needs_image: true }));
    await setFigure(EDITOR, 710);
    const saved = await save({ ...question(710, { needs_image: false }), id: idOf(710) });
    expect(saved.needs_image).toBe(false);
    expect(saved.images).toHaveLength(1);
    expect(await inPool(ANA, 710)).toBe(true);
    // marcar 'cita figura' numa questão sem figura é permitido (e tira a questão dos treinos)
    await save(question(711));
    const marked = await save({ ...question(711, { needs_image: true }), id: idOf(711) });
    expect(marked.needs_image).toBe(true);
    expect(await inPool(ANA, 711)).toBe(false);
  });

  it("quem pode: equipe (editor e administrador); visitante, aluno e revisor médico sem papel de equipe são barrados", async () => {
    await save(question(712, { needs_image: true }));
    expect(await failure(setFigure(null, 712))).toMatch(/permission denied|permissão/i);
    expect(await failure(removeFigure(null, 712))).toMatch(/permission denied|permissão/i);
    for (const uid of [ANA, REV_PED]) {
      expect(await failure(setFigure(uid, 712)), uid).toMatch(/restrito à equipe/);
      expect(await failure(removeFigure(uid, 712)), uid).toMatch(/restrito à equipe/);
    }
    expect((await row(712)).images).toEqual([]);
    // a gravação direta da figura pelo aluno também não passa (com erro ou sem linha alterada, a figura não muda)
    await failure(t.asUser(ANA, `update public.questions set images = '[{"path":"x","alt":"y"}]'::jsonb where id = $1`, [idOf(712)]));
    expect((await row(712)).images).toEqual([]);
  });

  it("cada envio e cada retirada ficam no Registro de ações (com a questão, sem texto longo do arquivo)", async () => {
    await save(question(713, { needs_image: true }));
    await setFigure(EDITOR, 713);
    await setFigure(ADMIN, 713, figure(fresh("jpg"), { content_type: "image/jpeg" }));
    await removeFigure(ADMIN, 713);
    const log = await t.sql<any>(`select action, actor_id, details from public.admin_audit_log where target = $1 and action like 'question.figure%' order by id`, [idOf(713)]);
    expect(log.map((l) => l.action)).toEqual(["question.figure_set", "question.figure_set", "question.figure_removed"]);
    expect(log[0].actor_id).toBe(EDITOR);
    expect(log[0].details).toMatchObject({ replaced: false });
    expect(log[1].details).toMatchObject({ replaced: true });
    expect(log[2].actor_id).toBe(ADMIN);
  });

  it("a lista da equipe mostra a questão com figura vinculada fora do filtro 'sem figura'", async () => {
    await save(question(714, { needs_image: true }));
    await save(question(715, { needs_image: true }));
    await setFigure(EDITOR, 715);
    const list = await t.rpc<any>(EDITOR, "app_admin_questions", { p_filters: { needs_image: true }, p_limit: 200 });
    const ids = list.items.map((i: any) => i.id);
    expect(ids).toContain(idOf(714));
    expect(ids).not.toContain(idOf(715));
  });

  it("a migração pode ser colada duas vezes e não muda o que já está gravado", async () => {
    const file = fs.readdirSync(MIGRATIONS).find((f) => /^20261003009700_/.test(f))!;
    const text = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
    await save(question(716, { needs_image: true }));
    const kept = fresh();
    await setFigure(EDITOR, 716, figure(kept));
    await t.db.exec(text);
    await t.db.exec(text);
    expect((await row(716)).images).toEqual([{ path: kept, alt: figure().alt }]);
    expect(await failure(save({ ...question(716, { needs_image: false }), id: idOf(716) }))).toBeNull();
  });
});


describe("Q07 — rodada de correções da revisão: o banco só aceita o arquivo que o servidor confirmou (achados 1 e 2)", () => {
  it("achado 1: caminho sem arquivo confirmado pelo servidor NÃO vira figura nem libera a questão", async () => {
    await save(question(720, { needs_image: true }));
    const never = fresh();
    expect(await failure(setFigure(EDITOR, 720, figure(never, { size_bytes: 100 }), false))).toMatch(/servidor ainda não conferiu/);
    expect(await failure(setFigure(ADMIN, 720, figure(never), false))).toMatch(/servidor ainda não conferiu/);
    expect((await row(720)).images).toEqual([]);
    expect(await inPool(ANA, 720)).toBe(false);
  });

  it("achado 1: só o serviço confirma arquivo; editor, administrador, aluno e visitante não chamam a função de confirmação", async () => {
    const p = fresh();
    for (const uid of [EDITOR, ADMIN, ANA, REV_PED, null]) {
      expect(await failure(t.rpc(uid, "ch_worker_question_figure_confirm", { p_path: p, p_content_type: "image/png", p_size_bytes: 100 })), String(uid)).toMatch(/permission denied|permissão/i);
      expect(await failure(t.rpc(uid, "ch_worker_question_figure_drop", { p_path: p })), String(uid)).toMatch(/permission denied|permissão/i);
    }
    expect(await t.sql(`select 1 from public.question_figure_files where path = $1`, [p])).toHaveLength(0);
    // a tabela de arquivos conferidos é fechada ao app
    expect(await failure(t.asUser(EDITOR, `select * from public.question_figure_files`))).toMatch(/permission denied|permissão/i);
    expect(await failure(t.asUser(EDITOR, `insert into public.question_figure_files (path, content_type, size_bytes) values ($1, 'image/png', 10)`, [p]))).toMatch(/permission denied|permissão/i);
  });

  it("achado 1: o banco usa o tipo e o tamanho que o servidor conferiu, não os que o editor declara", async () => {
    await save(question(721, { needs_image: true }));
    const p = fresh("png");
    await confirmFile(p, "image/png", 90_000);
    // o editor diz 'jpeg' e pede um caminho .png: não confere com o arquivo conferido
    expect(await failure(t.rpc(EDITOR, "app_admin_set_question_image", { p_question_id: idOf(721), p_image: figure(p, { content_type: "image/jpeg" }) }))).toBeNull(); // o tipo declarado é ignorado
    expect((await row(721)).images).toEqual([{ path: p, alt: figure().alt }]);
    // confirmar o mesmo caminho de novo com outro tipo ou tamanho é recusado
    expect(await failure(confirmFile(p, "image/jpeg", 90_000))).toMatch(/PNG ou JPG|caminho/i);
    expect(await failure(confirmFile(p, "image/png", 91_000))).toMatch(/já foi conferido/i);
    await confirmFile(p, "image/png", 90_000); // o mesmo de antes é inofensivo (idempotente)
  });

  it("achado 2: um arquivo conferido é de UMA questão só (o vínculo é uma coluna do arquivo) e vale mesmo por SQL direto", async () => {
    await save(question(722, { needs_image: true }));
    await save(question(723, { needs_image: true }));
    const p = fresh();
    await setFigure(EDITOR, 722, figure(p));
    expect(await failure(setFigure(EDITOR, 723, figure(p)))).toMatch(/já é a figura de outra questão/);
    // gravação direta de um caminho que é de outra questão, ou nunca conferido, é barrada por um gatilho
    expect(await failure(t.sql(`update public.questions set images = $2::jsonb where id = $1`, [idOf(723), JSON.stringify([{ path: p, alt: "x".repeat(20) }])]))).toMatch(/não foi conferida|outra questão/);
    expect(await failure(t.sql(`update public.questions set images = $2::jsonb where id = $1`, [idOf(723), JSON.stringify([{ path: fresh(), alt: "x".repeat(20) }])]))).toMatch(/não foi conferida|outra questão/);
    expect((await row(723)).images).toEqual([]);
    // as figuras do caderno (com url) seguem como sempre
    await t.sql(`update public.questions set images = '[{"url":"/question-assets/a.png","alt":"A"}]'::jsonb where id = $1`, [idOf(723)]);
  });

  it("achado 2: trocar ou tirar devolve o caminho solto; o arquivo solto não pode ser vinculado de novo e só então o servidor pode apagá-lo", async () => {
    await save(question(724, { needs_image: true }));
    await save(question(725, { needs_image: true }));
    const a = fresh();
    const b = fresh("jpg");
    await setFigure(EDITOR, 724, figure(a));
    // enquanto a figura está vinculada, o servidor NÃO pode apagar o arquivo
    expect((await t.sql<any>(`select public.ch_worker_question_figure_drop($1) as ok`, [a]))[0].ok).toBe(false);
    const swapped = await setFigure(EDITOR, 724, figure(b, { content_type: "image/jpeg" }));
    expect(swapped.released_path).toBe(a);
    expect((await t.sql<any>(`select state, question_id from public.question_figure_files where path = $1`, [a]))[0]).toEqual({ state: "releasing", question_id: null });
    // o arquivo 'apagando' não vira figura de ninguém, nem da mesma questão (a corrida entre 'conferir' e 'apagar' fecha aqui)
    expect(await failure(setFigure(EDITOR, 725, figure(a), false))).toMatch(/servidor ainda não conferiu/);
    expect(await failure(setFigure(EDITOR, 724, figure(a), false))).toMatch(/servidor ainda não conferiu/);
    expect((await row(725)).images).toEqual([]);
    expect((await t.sql<any>(`select public.ch_worker_question_figure_drop($1) as ok`, [a]))[0].ok).toBe(true);
    // a linha fica como lápide ('releasing'): o mesmo caminho nunca mais é conferido nem vinculado
    expect((await t.sql<any>(`select state from public.question_figure_files where path = $1`, [a]))[0].state).toBe("releasing");
    expect(await failure(confirmFile(a))).toMatch(/liberado para ser apagado/);
    expect(await failure(setFigure(EDITOR, 725, figure(a), false))).toMatch(/servidor ainda não conferiu/);
    // tirar a figura também solta o caminho
    const removed = await removeFigure(EDITOR, 724);
    expect(removed.released_path).toBe(b);
    expect((await t.sql<any>(`select public.ch_worker_question_figure_drop($1) as ok`, [b]))[0].ok).toBe(true);
    // sem figura, tirar de novo não solta nada
    expect((await removeFigure(EDITOR, 724)).released_path ?? null).toBeNull();
    // arquivo que nunca foi conferido: pode sair do depósito (nenhuma questão o usa) e vira lápide também
    const never = fresh();
    expect((await t.sql<any>(`select public.ch_worker_question_figure_drop($1) as ok`, [never]))[0].ok).toBe(true);
    expect(await failure(confirmFile(never))).toMatch(/liberado para ser apagado/);
    // caminho fora do padrão não vira lápide
    expect(await failure(t.sql(`select public.ch_worker_question_figure_drop('questoes/../x.png')`))).toMatch(/inválido/);
  });

  it("achado 2: arquivo conferido e ainda sem questão pode ser apagado, mas depois disso não vira figura (o servidor que o apagou não deixa referência)", async () => {
    await save(question(726, { needs_image: true }));
    const p = fresh();
    await confirmFile(p);
    expect((await t.sql<any>(`select public.ch_worker_question_figure_drop($1) as ok`, [p]))[0].ok).toBe(true);
    expect(await failure(setFigure(EDITOR, 726, figure(p), false))).toMatch(/servidor ainda não conferiu/);
    expect((await row(726)).images).toEqual([]);
  });

  it("apagar a questão não deixa o arquivo preso a ela (a ligação é desfeita)", async () => {
    await save(question(727, { needs_image: true }));
    const p = fresh();
    await setFigure(EDITOR, 727, figure(p));
    await t.sql(`delete from public.questions where id = $1`, [idOf(727)]);
    expect((await t.sql<any>(`select question_id from public.question_figure_files where path = $1`, [p]))[0].question_id).toBeNull();
  });
});
