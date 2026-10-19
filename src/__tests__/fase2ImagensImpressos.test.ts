// @vitest-environment node
/**
 * Imagens dos impressos e da folha do candidato na sala da 2ª fase (ramo fase2-imagens, 18/10/2026; migração 014200).
 * Num Postgres em memória (PGlite) com TODAS as migrações, a chave do Treino em Dupla como nasce (desligada, como em produção) e a
 * carga de uma estação no formato da Montagem (conteúdo de TESTE):
 *   - station_assets: só a equipe lê; ninguém do navegador grava; o caminho tem de ser opaco (dupla/impressos/<sha256>.png);
 *   - ligar (ch_worker_dupla_impresso_ligar e o SQL do pacote): só o servidor; duas vezes não muda nada; nunca troca imagem
 *     já ligada; recusa impresso que não existe; a folha só com o conteúdo igual ao que foi desenhado;
 *   - sala: o candidato (mesmo da equipe) não baixa impresso não liberado, nem pelo id verdadeiro; depois de liberado recebe
 *     só o caminho opaco; nada do que ele recebe diz o nome, o tema ou o id da estação; aluno comum não entra em nada;
 *   - a carga da estação de novo não apaga as imagens ligadas.
 * Com a pasta do pacote real (publicar-imagens) neste computador, o SQL de verdade também é conferido. Nenhuma IA, rede ou chave.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { U, STATION, makeRoom, openDuplaDb, setPlan, type DuplaDb } from "./helpers/duplaDb";
import { buildCargaEstacao } from "../../scripts/dupla/cargaEstacaoInep";
import {
  enviarPacote,
  imagemDoArquivo,
  lerPacote,
  pngInfo,
  sha256,
  sqlLigarImagens,
  type DepositoSoNovo,
  type PacoteImagens,
} from "../../scripts/dupla/imagensEstacaoInep";

const ID = "inep2025-1-e07";
const APROVADA = "# Aprovação do dono\n\naprovado pelo dono\n";
const OPACO = /^dupla\/(impressos|folhas)\/[0-9a-f]{64}\.png$/;
const MARCAS = ["ZZNOME", "ZZTEMA", ID, "Ureter", "ureter"];

/** PNG mínimo (só o cabeçalho, que é o que o pacote confere), com uma marca para mudar o sha256. */
function png(w: number, h: number, marca: string): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "latin1");
  ihdr.writeUInt32BE(w, 8);
  ihdr.writeUInt32BE(h, 12);
  return Buffer.concat([sig, ihdr, Buffer.from(marca)]);
}

/** Estação de TESTE no formato da Montagem (id do padrão inep), com 1 relato na folha e 2 impressos liberáveis. */
function exemplo() {
  return JSON.stringify({
    ...STATION,
    id: ID,
    name: "ZZNOME estação de teste",
    topic: "ZZTEMA de teste",
    area: "Cirurgia Geral",
    institution: "INEP",
    year: "2025/1",
    pressings: [
      { id: `${ID}-p1`, name: "Exame físico", content: "Exame físico de teste.\nLiberação: caso solicite exame físico", image_url: "impressos/impresso-1.png", source_number: 1, display_number: 1, initially_visible: false },
      { id: `${ID}-p2`, name: "Exames laboratoriais", content: "Laboratório de teste.", image_url: "impressos/impresso-2.png", source_number: 2, display_number: 2, initially_visible: false },
    ],
    _montagem: { pep_situacao: "DEFINITIVO" },
  });
}

describe("Imagens dos impressos (014200): banco, pacote e sala", () => {
  let d: DuplaDb;
  let carga: string;
  let pacote: PacoteImagens;
  const dados = new Map<string, Buffer>();
  const editor = U.eva;
  const caminho = (uid: string, room: string, p: string) => d.rpc<string | null>(uid, "app_dupla_print_path", { p_room_id: room, p_pressing_id: p });
  const conteudo = async () => (await d.sql(`select content from public.checklist_station_contents where station_id = $1`, [ID]))[0].content;

  beforeAll(async () => {
    d = await openDuplaDb();
    await setPlan(d.db, U.ana, "pro", "active");
    await setPlan(d.db, U.bruno, "elite", "active");
    await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [editor]);
    carga = buildCargaEstacao(exemplo(), APROVADA).sql;
    await d.db.exec(carga);

    const imagens = [
      imagemDoArquivo(png(2224, 1572, "p1"), { tipo: "impresso", impresso_id: `${ID}-p1`, nome: "Exame físico", origem: "impressos/impresso-1.png" }),
      imagemDoArquivo(png(2210, 2262, "p2"), { tipo: "impresso", impresso_id: `${ID}-p2`, nome: "Exames laboratoriais", origem: "impressos/impresso-2.png" }),
      imagemDoArquivo(png(1604, 1762, "folha"), { tipo: "folha", impresso_id: null, nome: "Folha do candidato", origem: "gerada pelo app" }),
    ];
    for (const [i, m] of [["p1"], ["p2"], ["folha"]].entries()) dados.set(imagens[i].sha256, png(imagens[i].width, imagens[i].height, m[0]));
    const [{ v }] = await d.sql(`select public.ch_worker_dupla_folha_fonte($1) as v`, [ID]);
    pacote = { station_id: ID, versao_conteudo: null, preparado_em: "2026-10-18T00:00:00.000Z", folha: { modelo: "folha-1.2", fonte_hash: v.hash, fonte: v.fonte }, imagens };
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });

  // ------------------------------------------------------------------ tabela
  it("station_assets: RLS ligada; só a equipe lê; ninguém do navegador grava; caminho com o nome da estação é recusado pelo banco", async () => {
    const [{ rls }] = await d.sql(`select relrowsecurity as rls from pg_class where oid = 'public.station_assets'::regclass`);
    expect(rls).toBe(true);
    const sha = "a".repeat(64);
    await d.sql(`insert into public.station_assets (station_id, impresso_id, storage_path, sha256) values ($1, 'x', $2, $3)`, [ID, `dupla/impressos/${sha}.png`, sha]);
    expect(await d.asUser(U.admin, `select id from public.station_assets`)).toHaveLength(1);
    expect(await d.asUser(editor, `select id from public.station_assets`)).toHaveLength(1);
    expect(await d.asUser(U.ana, `select id from public.station_assets`)).toHaveLength(0);
    await expect(d.asUser(U.ana, `insert into public.station_assets (storage_path, sha256) values ('dupla/impressos/${"b".repeat(64)}.png', '${"b".repeat(64)}')`)).rejects.toThrow(/permission denied/);
    await expect(d.asUser(U.admin, `update public.station_assets set storage_path = storage_path`)).rejects.toThrow(/permission denied/);
    await expect(d.asUser(U.admin, `delete from public.station_assets`)).rejects.toThrow(/permission denied/);
    // caminho que diz a estação (o da spec da Montagem) ou com o sha errado: o banco recusa
    await expect(d.sql(`insert into public.station_assets (storage_path, sha256) values ($1, $2)`, [`stations/assets/${ID}/${sha}.png`, sha])).rejects.toThrow(/station_assets_caminho_opaco/);
    await expect(d.sql(`insert into public.station_assets (storage_path, sha256) values ($1, $2)`, [`dupla/impressos/${"c".repeat(64)}.png`, sha])).rejects.toThrow(/station_assets_caminho_opaco/);
    await d.sql(`delete from public.station_assets`);
  });

  it("ch_worker_dupla_impresso_ligar: fechada para o navegador (aluno, equipe e visitante)", async () => {
    const args = { p_station_id: ID, p_impresso_id: `${ID}-p1`, p_path: pacote.imagens[0].storage_path, p_sha256: pacote.imagens[0].sha256, p_width: 1, p_height: 1, p_bytes: 1, p_conferir_arquivo: false };
    for (const uid of [U.ana, U.admin, editor, null]) {
      await expect(d.rpc(uid, "ch_worker_dupla_impresso_ligar", args)).rejects.toThrow(/permission denied/);
    }
  });

  it("ligar: caminho fora do padrão, impresso inexistente ou estação sem conteúdo são recusados; nada muda", async () => {
    const antes = await conteudo();
    const im = pacote.imagens[0];
    const ligar = (o: Record<string, unknown>) =>
      d.sql(`select public.ch_worker_dupla_impresso_ligar($1, $2, $3, $4, 1, 1, 1, false) as r`, [o.st ?? ID, o.imp ?? im.impresso_id, o.path ?? im.storage_path, o.sha ?? im.sha256]);
    await expect(ligar({ path: `dupla/impressos/${ID}.png` })).rejects.toThrow(/caminho tem de ser/);
    await expect(ligar({ path: `dupla/impressos/${"f".repeat(64)}.png` })).rejects.toThrow(/caminho tem de ser/);
    await expect(ligar({ imp: `${ID}-p9` })).rejects.toThrow(/não existe no conteúdo/);
    await expect(ligar({ st: "teste-sem-estacao" })).rejects.toThrow(/Estação não encontrada/);
    expect(await conteudo()).toEqual(antes);
    expect(await d.sql(`select id from public.station_assets`)).toHaveLength(0);
  });

  it("SQL do pacote: liga os impressos e a folha; rodar de novo não muda nada", async () => {
    const sql = sqlLigarImagens(pacote);
    await d.db.exec(sql);
    const c1 = await conteudo();
    const assets = await d.sql(`select id::text, impresso_id, storage_path from public.station_assets order by impresso_id`);
    expect(assets.map((a: any) => a.impresso_id)).toEqual([`${ID}-p1`, `${ID}-p2`]);
    expect(c1.pressing_assets).toEqual({
      [`${ID}-p1`]: assets[0].id,
      [`${ID}-p2`]: assets[1].id,
      candidate_sheet: { folha: pacote.imagens[2].sha256 },
    });
    for (const a of assets) expect(a.storage_path).toMatch(OPACO);
    const [{ s }] = await d.sql(`select public.dupla_folha_situacao($1) as s`, [ID]);
    expect(s).toMatchObject({ estado: "pronta", imagem_valendo: true, modelo: "folha-1.2" });
    const [{ g1 }] = await d.sql(`select generated_at::text as g1 from public.dupla_station_sheets where station_id = $1`, [ID]);
    await d.db.exec(sql);
    expect(await conteudo()).toEqual(c1);
    expect(await d.sql(`select id::text, impresso_id, storage_path from public.station_assets order by impresso_id`)).toEqual(assets);
    const [{ g2 }] = await d.sql(`select generated_at::text as g2 from public.dupla_station_sheets where station_id = $1`, [ID]);
    expect(g2).toBe(g1);
  });

  it("nunca troca imagem já ligada: impresso com outra imagem e folha diferente são recusados, nada muda", async () => {
    const antes = await conteudo();
    const outra = imagemDoArquivo(png(10, 10, "outra"), { tipo: "impresso", impresso_id: `${ID}-p1`, nome: "x", origem: "x" });
    await expect(d.sql(`select public.ch_worker_dupla_impresso_ligar($1, $2, $3, $4, 1, 1, 1, false)`, [ID, `${ID}-p1`, outra.storage_path, outra.sha256])).rejects.toThrow(/já tem outra imagem/);
    const folha2 = imagemDoArquivo(png(10, 10, "folha2"), { tipo: "folha", impresso_id: null, nome: "x", origem: "x" });
    const p2: PacoteImagens = { ...pacote, imagens: [folha2] };
    await expect(d.db.exec(sqlLigarImagens(p2))).rejects.toThrow(/OUTRA folha ligada/);
    expect(await conteudo()).toEqual(antes);
  });

  it("folha: conteúdo da estação diferente do desenhado → recusa (gere o pacote de novo)", async () => {
    const p3: PacoteImagens = { ...pacote, folha: { ...pacote.folha!, fonte_hash: "0".repeat(32) } };
    await expect(d.db.exec(sqlLigarImagens(p3))).rejects.toThrow(/mudou desde que a imagem foi desenhada/);
  });

  it("a carga da estação de novo não apaga as imagens ligadas", async () => {
    const antes = await conteudo();
    await d.db.exec(carga);
    expect((await conteudo()).pressing_assets).toEqual(antes.pressing_assets);
  });

  // ------------------------------------------------------------------ sala
  it("sala (estação pendente, equipe): o candidato não baixa impresso não liberado, nem pelo id verdadeiro; liberado → só o caminho opaco", async () => {
    // candidato da equipe (administrador) e avaliador editor: a estação pendente só abre com os dois da equipe
    const sala = await makeRoom(d.db, { members: [U.admin, editor], phase: "running", candidate: U.admin, evaluator: editor, station: ID,
      extra: { started_at: new Date().toISOString(), ends_at: new Date(Date.now() + 600_000).toISOString() } });
    const respostas: unknown[] = [];
    // folha: desde o início
    const folha = await caminho(U.admin, sala, "candidate_sheet");
    expect(folha).toBe(pacote.imagens[2].storage_path);
    respostas.push(folha);
    // impressos não liberados: recusados pela chave de tela e pelo id verdadeiro
    for (const p of ["d1", "d2", `${ID}-p1`, `${ID}-p2`, "p1", "i1"]) {
      await expect(caminho(U.admin, sala, p), p).rejects.toThrow("Impresso não liberado.");
    }
    // o candidato vê que existe imagem só depois de liberado, e nunca o id da imagem nem o caminho
    let cand = await d.rpc<any>(U.admin, "app_dupla_room_content", { p_room_id: sala });
    respostas.push(cand);
    expect(cand.pressings.filter((p: any) => !p.in_sheet)).toEqual([]);
    expect(cand.station.candidate_sheet).toEqual({ has_image: true });
    // o avaliador abre pelo id verdadeiro e libera o 2
    expect(await caminho(editor, sala, `${ID}-p2`)).toBe(pacote.imagens[1].storage_path);
    await d.rpc(editor, "app_dupla_release", { p_room_id: sala, p_pressing_id: `${ID}-p2`, p_released: true });
    const d2 = await caminho(U.admin, sala, "d2");
    expect(d2).toBe(pacote.imagens[1].storage_path);
    respostas.push(d2);
    await expect(caminho(U.admin, sala, "d1")).rejects.toThrow("Impresso não liberado.");
    await expect(caminho(U.admin, sala, `${ID}-p2`)).rejects.toThrow("Impresso não liberado.");
    cand = await d.rpc<any>(U.admin, "app_dupla_room_content", { p_room_id: sala });
    respostas.push(cand);
    expect(cand.pressings.map((p: any) => [p.id, p.has_image])).toEqual([["d2", true]]);
    // retirar a liberação fecha de novo
    await d.rpc(editor, "app_dupla_release", { p_room_id: sala, p_pressing_id: `${ID}-p2`, p_released: false });
    await expect(caminho(U.admin, sala, "d2")).rejects.toThrow("Impresso não liberado.");
    // nada do que o candidato recebeu diz o nome, o tema, o id da estação, o id do impresso ou o id da imagem
    const ids = (await d.sql(`select id::text from public.station_assets`)).map((r: any) => r.id);
    const texto = JSON.stringify(respostas);
    expect(MARCAS.filter((m) => texto.includes(m))).toEqual([]);
    expect(ids.filter((i: string) => texto.includes(i))).toEqual([]);
    for (const r of [folha, d2]) expect(r).toMatch(OPACO);
  });

  it("sala fora de andamento: o candidato não baixa nada (nem a folha)", async () => {
    for (const fase of ["setup", "review", "result"] as const) {
      const sala = await makeRoom(d.db, { members: [U.admin, editor], phase: fase, candidate: U.admin, evaluator: editor, station: ID });
      await expect(caminho(U.admin, sala, "candidate_sheet"), fase).rejects.toThrow("Esta ação não vale nesta fase da sala.");
    }
  });

  it("aluno comum (PRO e ELITE pagos), com a chave desligada como em produção: nenhuma imagem, nem como membro da sala", async () => {
    const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "running", candidate: U.ana, evaluator: U.bruno, station: ID });
    for (const uid of [U.ana, U.bruno]) {
      for (const p of ["candidate_sheet", "d1", `${ID}-p1`]) {
        await expect(caminho(uid, sala, p)).rejects.toThrow(/Sem acesso/);
      }
      expect(await d.asUser(uid, `select content from public.checklist_station_contents`)).toHaveLength(0);
      expect(await d.asUser(uid, `select id from public.station_assets`)).toHaveLength(0);
    }
    // quem não é da sala (mesmo da equipe) não recebe nada
    const daEquipe = await makeRoom(d.db, { members: [U.admin, editor], phase: "running", candidate: U.admin, evaluator: editor, station: ID });
    await setPlan(d.db, U.carla, "pro", "active");
    await expect(caminho(U.carla, daEquipe, "candidate_sheet")).rejects.toThrow(/Sem acesso|Sala não encontrada/);
    await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [U.gil]);
    await expect(caminho(U.gil, daEquipe, "candidate_sheet")).rejects.toThrow("Sala não encontrada.");
    // visitante
    await expect(d.rpc(null, "app_dupla_print_path", { p_room_id: daEquipe, p_pressing_id: "candidate_sheet" })).rejects.toThrow(/permission denied/);
  });
});

// ------------------------------------------------------------------ envio ao depósito (simulado)
describe("Envio do pacote ao depósito (simulado, sem rede)", () => {
  const im = imagemDoArquivo(png(20, 10, "envio"), { tipo: "impresso", impresso_id: `${ID}-p1`, nome: "x", origem: "x" });
  const data = png(20, 10, "envio");
  const pac: PacoteImagens = { station_id: ID, versao_conteudo: null, preparado_em: "x", folha: null, imagens: [im] };
  const deposito = (inicial: Record<string, Buffer> = {}) => {
    const mapa = new Map(Object.entries(inicial));
    const puts: string[] = [];
    const dep: DepositoSoNovo = {
      async exists(k) { return mapa.has(k); },
      async get(k) { const v = mapa.get(k); if (!v) throw new Error("não há"); return v; },
      async putNovo(k, v) { if (mapa.has(k)) throw new Error("já existe"); mapa.set(k, v); puts.push(k); },
    };
    return { dep, mapa, puts };
  };

  it("sobe só o que falta, confere depois de subir e roda duas vezes sem mudar nada", async () => {
    const { dep, puts } = deposito();
    const r1 = await enviarPacote(dep, pac, new Map([[im.sha256, data]]));
    expect(r1).toEqual({ enviados: [im.storage_path], iguais: [] });
    const r2 = await enviarPacote(dep, pac, new Map([[im.sha256, data]]));
    expect(r2).toEqual({ enviados: [], iguais: [im.storage_path] });
    expect(puts).toEqual([im.storage_path]);
  });

  it("arquivo com o mesmo nome e conteúdo diferente no depósito: para tudo, nada é trocado", async () => {
    const { dep, mapa } = deposito({ [im.storage_path]: Buffer.from("outro") });
    await expect(enviarPacote(dep, pac, new Map([[im.sha256, data]]))).rejects.toThrow(/OUTRO conteúdo/);
    expect(mapa.get(im.storage_path)!.toString()).toBe("outro");
  });

  it("o nome no depósito é só o sha256 (nada da estação) e só aceita PNG", () => {
    expect(im.storage_path).toBe(`dupla/impressos/${sha256(data)}.png`);
    expect(im.storage_path).not.toContain(ID);
    expect(() => pngInfo(Buffer.from("não é png"))).toThrow(/PNG/);
  });
});

// ------------------------------------------------------------------ pacote real (se estiver neste computador)
const PACOTE = "/Volumes/StaziaMed/.tmp-aulas/fase2/publicar-imagens/pacote-2025-1-07";
const PASTA_E07 = "/Volumes/StaziaMed/.tmp-aulas/estacoes-inep/2025-1/07";
const temPacote = fs.existsSync(path.join(PACOTE, "manifest.json")) && fs.existsSync(path.join(PASTA_E07, "estacao-app.json"));

describe.runIf(temPacote)("Pacote real da Revalida 2025/1, estação 7", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("arquivos conferem pelo sha256; 4 impressos e a folha; o SQL do arquivo é o que o pacote gera", () => {
    const { pacote } = lerPacote(PACOTE);
    expect(pacote.station_id).toBe(ID);
    expect(pacote.imagens.map((i) => i.impresso_id)).toEqual([`${ID}-p1`, `${ID}-p2`, `${ID}-p3`, `${ID}-p4`, null]);
    for (const i of pacote.imagens) expect(i.storage_path).toMatch(OPACO);
    const sqlArquivo = fs.readFileSync(path.join(PACOTE, `ligar-imagens-${ID}.sql`), "utf8");
    expect(sqlArquivo).toBe(sqlLigarImagens(pacote));
  });

  it("carga real + SQL real (duas vezes): impressos e folha ligados; a marca do conteúdo bate com a da carga", async () => {
    const { pacote } = lerPacote(PACOTE);
    const { sql } = buildCargaEstacao(fs.readFileSync(path.join(PASTA_E07, "estacao-app.json"), "utf8"), fs.readFileSync(path.join(PASTA_E07, "aprovacao-dono.md"), "utf8"));
    await d.db.exec(sql);
    const ligar = fs.readFileSync(path.join(PACOTE, `ligar-imagens-${ID}.sql`), "utf8");
    await d.db.exec(ligar);
    await d.db.exec(ligar);
    const [{ c }] = await d.sql(`select content as c from public.checklist_station_contents where station_id = $1`, [ID]);
    expect(Object.keys(c.pressing_assets).sort()).toEqual([`${ID}-p1`, `${ID}-p2`, `${ID}-p3`, `${ID}-p4`, "candidate_sheet"].sort());
    const [{ s }] = await d.sql(`select public.dupla_folha_situacao($1) as s`, [ID]);
    expect(s).toMatchObject({ estado: "pronta", imagem_valendo: true });
    expect(await d.sql(`select count(*)::int as n from public.station_assets`)).toEqual([{ n: 4 }]);
  });
});
