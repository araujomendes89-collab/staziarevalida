// @vitest-environment node
/**
 * Banco de estações · cartões de todas as edições (migração 013420, supabase/migrations/…013420_estacoes_cartoes_catalogo.sql).
 * Conferidos num Postgres em memória (PGlite) com as regras reais: o aluno não vê cartão em montagem, colar a migração duas
 * vezes não duplica e as 10 estações da 2025/1 batem com as pastas montadas.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, U, openDuplaDb, setDupla, setPlan, type DuplaDb } from "./helpers/duplaDb";

const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003013420_estacoes_cartoes_catalogo.sql"), "utf8");
const PASTA = "/Volumes/StaziaMed/.tmp-aulas/estacoes-inep";
const CATALOGO = path.join(PASTA, "catalogo/catalogo.json");
const temPastas = fs.existsSync(CATALOGO) && fs.existsSync(path.join(PASTA, "2025-1/10/estacao-app.json"));
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

describe("Migração 013420 — cartões do catálogo (sem conteúdo)", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    for (const uid of Object.values(U)) await setPlan(d.db, uid, "trial", "trialing", daqui(7));
    await setDupla(d.db, { aberto: true, planos: ["trial", "pro", "elite"] });
  }, 180_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("insere 179 cartões, todos pendentes, nas 5 áreas, com chave única edição + número", async () => {
    const [{ n, areas, pend }] = await d.sql(
      `select count(*)::int n, count(distinct area)::int areas, count(*) filter (where medical_review = 'pending')::int pend
         from public.checklist_stations where catalog_edition is not null`,
    );
    expect({ n, areas, pend }).toEqual({ n: 179, areas: 5, pend: 179 });
    const sem: any[] = await d.sql(`select 1 from public.checklist_station_contents c join public.checklist_stations s on s.id = c.station_id where s.catalog_edition is not null`);
    expect(sem).toHaveLength(0);
    const [{ ate }] = await d.sql(`select count(*)::int ate from public.checklist_stations where official_source = false and catalog_edition is not null and institution is null and origin_label !~ 'INEP'`);
    expect(ate).toBe(71);
    await expect(d.db.query(`insert into public.checklist_stations (id, name, topic, area, catalog_edition, catalog_number) values ('x-dup', 'x', 'x', 'Pediatria', '2020', 1)`)).rejects.toThrow(/checklist_stations_catalog_uq|duplicate/i);
  });

  it("aluno não vê cartão em montagem (lista e leitura direta); equipe vê pela função dos cartões", async () => {
    const lista: any[] = await d.rpc(U.ana, "app_dupla_stations");
    expect(lista.filter((s) => /^(inep20|rev20)/.test(s.id))).toHaveLength(0);
    const direto = await d.asUser(U.ana, `select id from public.checklist_stations where catalog_edition is not null`);
    expect(direto).toHaveLength(0);
    await expect(d.rpc(U.ana, "app_admin_station_cards")).rejects.toThrow(/Acesso restrito/);
    await expect(d.rpc(null, "app_admin_station_cards")).rejects.toThrow();
    const cards: any[] = await d.rpc(U.admin, "app_admin_station_cards");
    expect(cards).toHaveLength(179);
    expect(cards[0].area_code).toBe("CM");
    expect(cards.find((c) => c.id === "inep2022-2-e01").origin_label).toBe("Revalida 2022/2 · INEP (também reaplicação da 2022/1)");
  });

  it("cartão sem conteúdo não pode ser aprovado; ao gravar o conteúdo vira 'conteúdo pronto' e segue pendente", async () => {
    await expect(d.sql(`update public.checklist_stations set medical_review = 'approved' where id = 'inep2020-e01'`)).rejects.toThrow(/awaiting_is_pending/);
    await d.sql(`insert into public.checklist_station_contents (station_id, content) values ('inep2020-e01', '{}'::jsonb)`);
    const [r] = await d.sql(`select content_status, medical_review from public.checklist_stations where id = 'inep2020-e01'`);
    expect(r).toEqual({ content_status: "content_ready", medical_review: "pending" });
    await d.sql(`delete from public.checklist_station_contents where station_id = 'inep2020-e01'`);
    await d.sql(`update public.checklist_stations set content_status = 'awaiting_content' where id = 'inep2020-e01'`);
  });

  it("colar a migração duas vezes não duplica nem apaga o que a revisão ou o conteúdo já mudaram", async () => {
    await d.sql(`update public.checklist_stations set name = 'Nome revisado' where id = 'inep2020-e02'`);
    await d.db.exec(SQL);
    await d.db.exec(SQL);
    const [{ n }] = await d.sql(`select count(*)::int n from public.checklist_stations where catalog_edition is not null`);
    expect(n).toBe(179);
    const [{ nome }] = await d.sql(`select name nome from public.checklist_stations where id = 'inep2020-e02'`);
    expect(nome).toBe("Nome revisado");
  });

  it.runIf(temPastas)("as 10 da 2025/1 batem com as pastas montadas (id, nome e área) e estão como 'conteúdo pronto'", async () => {
    const cat: any[] = JSON.parse(fs.readFileSync(CATALOGO, "utf8")).filter((c: any) => c.edicao === "2025-1");
    expect(cat).toHaveLength(10);
    const banco = await d.sql(`select id, name, area, catalog_number n, content_status from public.checklist_stations where catalog_edition = '2025-1' order by catalog_number`);
    expect(banco).toHaveLength(10);
    for (let i = 1; i <= 10; i++) {
      const pasta = JSON.parse(fs.readFileSync(path.join(PASTA, `2025-1/${String(i).padStart(2, "0")}/estacao-app.json`), "utf8"));
      const c = cat.find((x) => x.numero === i);
      expect(c).toMatchObject({ id: pasta.id, tema: pasta.name, area: pasta.area, situacao: "conteúdo pronto" });
      expect(banco[i - 1]).toMatchObject({ id: pasta.id, name: pasta.name, area: pasta.area, n: i, content_status: "content_ready" });
    }
  });

  it("catálogo: sem repetição de id, edição + número, e os contadores por edição", () => {
    if (!fs.existsSync(CATALOGO)) return;
    const cat: any[] = JSON.parse(fs.readFileSync(CATALOGO, "utf8"));
    expect(cat).toHaveLength(179);
    expect(new Set(cat.map((c) => c.id)).size).toBe(179);
    expect(new Set(cat.map((c) => `${c.edicao}#${c.numero}`)).size).toBe(179);
    expect(cat.filter((c) => c.situacao === "conteúdo pronto")).toHaveLength(10);
    expect(cat.filter((c) => !c.fonte_oficial)).toHaveLength(71);
  });
});
