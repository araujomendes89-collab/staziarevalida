// @vitest-environment node
/**
 * Editor profissional, módulo M11b (figuras no texto e no PDF) — migração 013100 ensaiada no PGlite.
 * Prova:
 *   - Lado a lado banco × tela: ch_conteudo_hash dá o MESMO resultado que soFormatacao.
 *   - ch_worker_doc_imagem_versao:
 *     - Retorna {caminho, tipo} para imagem presente no content da mesma unidade.
 *     - Erro P0002 para imagem fora do content.
 *     - Erro para imagem de outra unidade, mesmo que presente no content.
 *     - Permissão negada para ALUNO e EDITOR via rpc (função exclusiva de service_role).
 *     - Idempotência da migração (executar mais de uma vez).
 *     - Desfazer remove a função (conferir retorna FALTA).
 *     - Reaplicação retorna OK no conferir.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  abrirBanco,
  ADMIN,
  ALUNO,
  EDITOR,
  REVISOR,
  type Rpc,
  type Sql,
} from "./helpers/publicacaoCentral";
import { envelope, soFormatacao } from "../shared/docRico";
import type { PGlite as PG } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", n), "utf8"));
const PACOTE = fx("aula-pronta-GR-001-v3.json");
const FONTES = fx("aula-pronta-GR-001-v3-fontes.json").fontes;

const migracaoSql = fs.readFileSync(
  path.join(ROOT, "supabase/migrations/20261003013100_editor_pro_figuras_pdf.sql"),
  "utf8"
);
const desfazerSql = fs.readFileSync(
  path.join(ROOT, "supabase/desfazer/20261003013100_editor_pro_figuras_pdf.desfazer.sql"),
  "utf8"
);
const conferirSql = fs.readFileSync(
  path.join(ROOT, "supabase/conferir/editor-pro-figuras-pdf.sql"),
  "utf8"
);

let db: PG;
let sql: Sql;
let rpc: Rpc;
let versao: string;
let unitId: string;

beforeAll(async () => {
  ({ db, sql, rpc } = await abrirBanco());
  await sql(
    `insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'CLINICA_MEDICA') on conflict do nothing`,
    [REVISOR]
  );
  await sql(
    `update public.ch_flags set value = case key when 'publish_enabled' then true when 'shadow_mode' then false else value end`
  );

  for (const f of FONTES) {
    const r = await rpc(ADMIN, "app_ch_register_source", {
      p_source: { title: f.title, organ: f.organ, kind: f.kind, url: f.url, version: f.version },
    });
    await rpc(ADMIN, "app_ch_set_source_authority", { p_source_id: r.id, p_level: f.level });
  }

  const r = await rpc(EDITOR, "app_ch_import_lesson_package", { p_package: PACOTE });
  versao = r.version_id;
  const v = await sql(`select unit_id from public.ch_unit_versions where id = $1`, [versao]);
  unitId = v[0].unit_id;
}, 300_000);

describe("1. Lado a lado: Banco (ch_conteudo_hash) × Tela (soFormatacao)", () => {
  const mesmoNoBanco = async (a: unknown, b: unknown) =>
    (
      await sql(
        `select public.ch_conteudo_hash($1::jsonb) = public.ch_conteudo_hash($2::jsonb) r`,
        [JSON.stringify(a), JSON.stringify(b)]
      )
    )[0].r as boolean;

  const UUID_1 = "11111111-1111-4111-8111-111111111111";
  const UUID_2 = "22222222-2222-4222-8222-222222222222";
  const P = (rico: any) => ({ text: "Texto", clinical: true, claim_ids: ["c1"], rico });
  const C = (p: any) => ({ sections: [{ heading: "S", paragraphs: [p] }] });
  const fig = (attrs: any) =>
    envelope({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Texto" }] },
        { type: "figura", attrs: { asset: UUID_1, alt: "Alt", legenda: "Legenda", largura: 50, ...attrs } },
      ],
    });

  const casos: [string, any, any, boolean][] = [
    ["mesmo conteúdo", C(P(fig({}))), C(P(fig({}))), true],
    ["mudança de largura (só formatação)", C(P(fig({}))), C(P(fig({ largura: 80 }))), true],
    [
      "mudança de alinhamento, disposição, borda, cantos e sombra (só formatação)",
      C(P(fig({}))),
      C(
        P(
          fig({
            alinhamento: "direita",
            disposicao: "quadrado-direita",
            borda: "grossa",
            cantos: "suaves",
            sombra: true,
          })
        )
      ),
      true,
    ],
    ["troca de asset (conteúdo)", C(P(fig({}))), C(P(fig({ asset: UUID_2 }))), false],
    ["troca de alt (conteúdo)", C(P(fig({}))), C(P(fig({ alt: "Novo alt" }))), false],
    ["troca de legenda (conteúdo)", C(P(fig({}))), C(P(fig({ legenda: "Nova legenda" }))), false],
    [
      "inserção de figura (conteúdo)",
      C(P(envelope({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Texto" }] }] }))),
      C(P(fig({}))),
      false,
    ],
  ];

  for (const [nome, a, b, esperado] of casos) {
    it(`regra: ${nome}`, async () => {
      const tela = soFormatacao(a, b);
      const banco = await mesmoNoBanco(a, b);
      expect(tela).toBe(esperado);
      expect(banco).toBe(esperado);
      expect(tela).toBe(banco);
    });
  }
});

describe("2. Função ch_worker_doc_imagem_versao e permissões", () => {
  let imgMesmaUnidadeId: string;
  let imgOutraUnidadeId: string;
  const path1 = "11/1111111111111111111111111111111111111111111111111111111111111111.png";
  const path2 = "22/2222222222222222222222222222222222222222222222222222222222222222.png";

  beforeAll(async () => {
    // 1. Cadastrar asset da mesma unidade
    const asset1 = {
      storage_path: path1,
      sha256: "1111111111111111111111111111111111111111111111111111111111111111",
      mime: "image/png",
      width: 800,
      height: 600,
      bytes: 10240,
      alt_text: "Imagem 1",
      unit_id: unitId,
      lesson_id: null,
    };
    const r1 = await sql(
      `select public.ch_worker_doc_imagem_registrar($1, $2::jsonb) r`,
      [EDITOR, JSON.stringify(asset1)]
    );
    imgMesmaUnidadeId = r1[0].r.id;

    // 2. Cadastrar asset e desvincular da unidade (unit_id = null)
    const asset2 = {
      storage_path: path2,
      sha256: "2222222222222222222222222222222222222222222222222222222222222222",
      mime: "image/png",
      width: 800,
      height: 600,
      bytes: 20480,
      alt_text: "Imagem 2",
      unit_id: unitId,
      lesson_id: null,
    };
    const r2 = await sql(
      `select public.ch_worker_doc_imagem_registrar($1, $2::jsonb) r`,
      [EDITOR, JSON.stringify(asset2)]
    );
    imgOutraUnidadeId = r2[0].r.id;
    // a 2ª imagem passa a ser de OUTRA unidade (criada aqui, mesmo tema)
    const [outra] = await sql(
      `insert into public.ch_units (theme_node_id, title) select theme_node_id, 'Outra unidade (teste M11b)' from public.ch_units where id = $1 returning id`,
      [unitId]
    );
    await sql(`update public.ch_doc_assets set unit_id = $2 where id = $1`, [imgOutraUnidadeId, outra.id]);

    // 3. Colocar o id da 1ª imagem no content da versão
    const [row] = await sql(`select content from public.ch_unit_versions where id = $1`, [versao]);
    const content = row.content;
    content.sections[0].paragraphs.push({
      text: "Parágrafo com figura vinculada",
      clinical: false,
      claim_ids: [],
      rico: envelope({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Parágrafo com figura vinculada" }] },
          { type: "figura", attrs: { asset: imgMesmaUnidadeId, alt: "Figura 1" } },
        ],
      }),
    });
    await sql(`update public.ch_unit_versions set content = $1::jsonb where id = $2`, [
      JSON.stringify(content),
      versao,
    ]);
  });

  it("id no content e mesma unidade retorna {caminho, tipo}", async () => {
    const res = await sql(
      `select public.ch_worker_doc_imagem_versao($1, $2) r`,
      [versao, imgMesmaUnidadeId]
    );
    expect(res[0].r).toEqual({
      caminho: path1,
      tipo: "image/png",
    });
  });

  it("id fora do content lança erro P0002", async () => {
    const idInexistente = "00000000-0000-4000-8000-000000000000";
    await expect(
      sql(`select public.ch_worker_doc_imagem_versao($1, $2)`, [versao, idInexistente])
    ).rejects.toThrow(/Imagem não encontrada/);
    // imagem que existe, é da MESMA unidade, mas não está no texto da versão
    const asset3 = {
      storage_path: "33/3333333333333333333333333333333333333333333333333333333333333333.png",
      sha256: "3333333333333333333333333333333333333333333333333333333333333333",
      mime: "image/png", width: 10, height: 10, bytes: 100, alt_text: "", unit_id: unitId, lesson_id: null,
    };
    const r3 = await sql(`select public.ch_worker_doc_imagem_registrar($1, $2::jsonb) r`, [EDITOR, JSON.stringify(asset3)]);
    await expect(
      sql(`select public.ch_worker_doc_imagem_versao($1, $2)`, [versao, r3[0].r.id])
    ).rejects.toThrow(/Imagem não encontrada/);
  });

  it("asset de outra unidade (mesmo presente no content) lança erro P0002", async () => {
    // Insere a 2ª imagem no content da versão
    const [row] = await sql(`select content from public.ch_unit_versions where id = $1`, [versao]);
    const content = row.content;
    content.sections[0].paragraphs.push({
      text: "Parágrafo com figura de outra unidade",
      clinical: false,
      claim_ids: [],
      rico: envelope({
        type: "doc",
        content: [{ type: "figura", attrs: { asset: imgOutraUnidadeId, alt: "Figura 2" } }],
      }),
    });
    await sql(`update public.ch_unit_versions set content = $1::jsonb where id = $2`, [
      JSON.stringify(content),
      versao,
    ]);

    await expect(
      sql(`select public.ch_worker_doc_imagem_versao($1, $2)`, [versao, imgOutraUnidadeId])
    ).rejects.toThrow(/Imagem não encontrada/);
    // e imagem sem unidade (unit_id nulo) também é recusada
    await sql(`update public.ch_doc_assets set unit_id = null where id = $1`, [imgOutraUnidadeId]);
    await expect(
      sql(`select public.ch_worker_doc_imagem_versao($1, $2)`, [versao, imgOutraUnidadeId])
    ).rejects.toThrow(/Imagem não encontrada/);
  });

  it("ALUNO e EDITOR via rpc recebem permission denied", async () => {
    await expect(
      rpc(ALUNO, "ch_worker_doc_imagem_versao", { p_version_id: versao, p_id: imgMesmaUnidadeId })
    ).rejects.toThrow(/permission denied/i);

    await expect(
      rpc(EDITOR, "ch_worker_doc_imagem_versao", { p_version_id: versao, p_id: imgMesmaUnidadeId })
    ).rejects.toThrow(/permission denied/i);
  });

  it("migração idempotente: colar de novo não falha", async () => {
    await db.exec(migracaoSql);
    await db.exec(migracaoSql);
    const conf = await sql(conferirSql);
    expect(conf[0].resultado).toMatch(/^OK:/);
  });

  it("desfazer remove a função e conferir retorna FALTA; reaplicar retorna OK", async () => {
    await db.exec(desfazerSql);
    const confFalta = await sql(conferirSql);
    expect(confFalta[0].resultado).toMatch(/^FALTA:/);

    await db.exec(migracaoSql);
    const confOk = await sql(conferirSql);
    expect(confOk[0].resultado).toMatch(/^OK:/);
  });
});
