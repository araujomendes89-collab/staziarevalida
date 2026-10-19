// @vitest-environment node
/**
 * Publicação da 2ª fase SÓ PARA A EQUIPE, com UMA estação de teste (ramo publicar-fase2-v2, 18/10/2026).
 * Num Postgres em memória (PGlite) com TODAS as migrações em ordem (main + 2ª fase + junção 013980), a chave do Treino em Dupla
 * como nasce (desligada) e a carga de uma estação da Montagem (scripts/dupla/cargaEstacaoInep.ts):
 *   - aluno (teste grátis, PRO pago, PRO vencido): acesso fechado, nenhuma função da 2ª fase abre, a estação não aparece nem
 *     pela leitura direta das tabelas;
 *   - equipe (administrador e editor): vê a estação carregada (pendente, "conteúdo pronto") e os outros cartões do catálogo
 *     como "Aguardando conteúdo";
 *   - a carga roda duas vezes sem mudar nada e recusa trocar o conteúdo de estação já aprovada;
 *   - a junção 013980 deixa a exportação com o remendo do Termo 3.0 e o conteúdo da sala com o fechamento da 013406.
 * A estação real (Revalida 2025/1, estação 7) só é conferida se a pasta da Montagem existir neste computador (ela não vai ao
 * repositório). Nenhuma IA, rede ou chave.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { MIGRATIONS_DIR, STATION, U, openDuplaDb, setPlan, type DuplaDb } from "./helpers/duplaDb";
import { buildCargaEstacao } from "../../scripts/dupla/cargaEstacaoInep";

const PASTA_E07 = "/Volumes/StaziaMed/.tmp-aulas/estacoes-inep/2025-1/07";
const temE07 = fs.existsSync(path.join(PASTA_E07, "estacao-app.json")) && fs.existsSync(path.join(PASTA_E07, "aprovacao-dono.md"));
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
const APROVADA = "# Aprovação do dono\n\naprovado pelo dono\n";

/** Estação de exemplo no formato da Montagem (conteúdo de TESTE, não é estação real): id do padrão inep, PEP soma 10. */
function exemplo(nome = "Exemplo de teste da carga") {
  return JSON.stringify({
    ...STATION,
    id: "inep2025-1-e07",
    name: nome,
    topic: nome,
    institution: "INEP",
    year: "2025/1",
    pressings: (STATION as any).pressings.map((p: any) => ({ ...p, image_url: "impressos/impresso-1.png" })),
    _montagem: { pep_situacao: "DEFINITIVO", notas_avaliador: ["só equipe"] },
    difficulty: "medio",
  });
}

describe("2ª fase só para a equipe, com uma estação carregada", () => {
  let d: DuplaDb;
  let carga: string;
  const editor = U.eva;
  const revisor = U.fabio;
  const alunos = { teste: U.ana, pro: U.bruno, vencido: U.carla } as const;

  beforeAll(async () => {
    d = await openDuplaDb();
    await setPlan(d.db, U.ana, "trial", "trialing", daqui(7));
    await setPlan(d.db, U.bruno, "pro", "active");
    await setPlan(d.db, U.carla, "pro", "expired");
    await d.sql(`update public.subscriptions set current_period_end = now() - interval '10 days' where user_id = $1`, [U.carla]);
    await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [editor]);
    await d.sql(`insert into public.ch_reviewer_areas (user_id, area_code) values ($1, 'cirurgia')`, [revisor]);
    carga = buildCargaEstacao(exemplo(), APROVADA).sql;
    await d.db.exec(carga);
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("a chave do Treino em Dupla nasce DESLIGADA", async () => {
    const [{ value }] = await d.sql(`select value from public.app_settings where key = 'treino_dupla'`);
    expect(value.aberto).toBe(false);
  });

  for (const [tipo, uid] of Object.entries(alunos)) {
    it(`aluno (${tipo}): acesso fechado e a 2ª fase inteira recusa`, async () => {
      const acesso = await d.rpc(uid, "app_dupla_access");
      expect(acesso).toMatchObject({ aberto: false, permitido: false, equipe: false });
      for (const fn of ["app_dupla_stations", "app_dupla_deck", "app_dupla_chats", "app_fase2_stations", "app_fase2_overview"]) {
        await expect(d.rpc(uid, fn), fn).rejects.toThrow();
      }
      await expect(d.rpc(uid, "app_admin_station_cards")).rejects.toThrow();
      // leitura direta (REST): nem o cartão nem o conteúdo da estação carregada, nem cartão do catálogo
      expect(await d.asUser(uid, `select id from public.checklist_stations where id = 'inep2025-1-e07' or catalog_edition is not null`)).toHaveLength(0);
      expect(await d.asUser(uid, `select station_id from public.checklist_station_contents`)).toHaveLength(0);
    });
  }

  it("visitante (sem login) não lê nada", async () => {
    for (const fn of ["app_dupla_stations", "app_dupla_access", "app_fase2_stations"]) await expect(d.rpc(null, fn), fn).rejects.toThrow();
  });

  it("equipe (administrador e editor): vê a estação carregada, pendente e com conteúdo; os outros cartões 'Aguardando conteúdo'", async () => {
    for (const uid of [U.admin, editor]) {
      expect(await d.rpc(uid, "app_dupla_access")).toMatchObject({ aberto: false, permitido: true, equipe: true });
      expect(Array.isArray(await d.rpc(uid, "app_fase2_stations"))).toBe(true);
      const lista: any[] = await d.rpc(uid, "app_dupla_stations");
      const e07 = lista.find((s) => s.id === "inep2025-1-e07");
      expect(e07).toMatchObject({ content_status: "content_ready", origin_label: "Revalida 2025/1 · INEP", criteria_count: 3 });
      const catalogo = lista.filter((s) => s.origin_label && s.id !== "inep2025-1-e07");
      expect(catalogo).toHaveLength(178);
      expect(catalogo.every((s) => s.content_status === "awaiting_content")).toBe(true);
    }
    const [r] = await d.sql(`select medical_review, content_status from public.checklist_stations where id = 'inep2025-1-e07'`);
    expect(r).toEqual({ medical_review: "pending", content_status: "content_ready" });
  });

  it("revisor médico: o código libera o módulo (regra de 17/10), mas estação pendente não aparece para ele", async () => {
    expect((await d.rpc(revisor, "app_dupla_access")).permitido).toBe(true);
    const lista: any[] = await d.rpc(revisor, "app_dupla_stations");
    expect(lista.find((s) => s.id === "inep2025-1-e07")).toBeUndefined();
  });

  it("o conteúdo gravado é o do arquivo, sem o bloco interno, sem a dificuldade e sem o caminho local das imagens", async () => {
    const [{ content }] = await d.sql(`select content from public.checklist_station_contents where station_id = 'inep2025-1-e07'`);
    expect(content._montagem).toBeUndefined();
    expect(content.difficulty).toBeUndefined();
    expect(content.pressings.every((p: any) => p.image_url === null)).toBe(true);
    expect(content.version).toMatch(/^inep2025-1-e07@[0-9a-f]{12}$/);
    expect(content.pressing_assets).toBeUndefined();
    const dif = await d.sql(`select 1 from public.checklist_station_difficulty where station_id = 'inep2025-1-e07'`);
    expect(dif).toHaveLength(0);
  });

  it("carga duas vezes: nada muda (mesma versão, mesmas contagens)", async () => {
    const antes = await d.sql(`select s.*, c.content from public.checklist_stations s join public.checklist_station_contents c on c.station_id = s.id where s.id = 'inep2025-1-e07'`);
    const [{ n: aguardando }] = await d.sql(`select count(*)::int n from public.checklist_stations where content_status = 'awaiting_content'`);
    await d.db.exec(carga);
    await d.db.exec(carga);
    const depois = await d.sql(`select s.*, c.content from public.checklist_stations s join public.checklist_station_contents c on c.station_id = s.id where s.id = 'inep2025-1-e07'`);
    expect(depois).toEqual(antes);
    const [{ n }] = await d.sql(`select count(*)::int n from public.checklist_stations where content_status = 'awaiting_content'`);
    expect(n).toBe(aguardando);
  });

  it("carga de novo não apaga as imagens já ligadas (folha gerada pelo app em pressing_assets)", async () => {
    await d.sql(`update public.checklist_station_contents set content = jsonb_set(content, '{pressing_assets}', '{"candidate_sheet": {"folha": "abc"}}') where station_id = 'inep2025-1-e07'`);
    await d.db.exec(carga);
    const [{ a }] = await d.sql(`select content -> 'pressing_assets' a from public.checklist_station_contents where station_id = 'inep2025-1-e07'`);
    expect(a).toEqual({ candidate_sheet: { folha: "abc" } });
  });

  it("estação já aprovada: a mesma carga não faz nada; conteúdo diferente é recusado", async () => {
    await d.sql(`update public.checklist_stations set medical_review = 'approved' where id = 'inep2025-1-e07'`);
    await d.db.exec(carga);
    const outra = buildCargaEstacao(exemplo("Outro nome de teste"), APROVADA).sql;
    await expect(d.db.exec(outra)).rejects.toThrow(/já está aprovada/);
    await d.sql(`update public.checklist_stations set medical_review = 'pending' where id = 'inep2025-1-e07'`);
  });

  it("a carga recusa estação sem a aprovação do dono, id de teste e PEP preliminar", () => {
    expect(() => buildCargaEstacao(exemplo(), "aguardando")).toThrow(/aprovação do dono/);
    expect(() => buildCargaEstacao(JSON.stringify({ ...JSON.parse(exemplo()), id: "teste-dupla-e01" }), APROVADA)).toThrow(/padrão/);
    expect(() => buildCargaEstacao(JSON.stringify({ ...JSON.parse(exemplo()), _montagem: { pep_situacao: "PRELIMINAR" } }), APROVADA)).toThrow(/preliminar/);
  });

  it("junção 013980: exportação com o remendo do Termo 3.0 e as partes da 2ª fase; conteúdo da sala com o fechamento da 013406", async () => {
    const [{ def }] = await d.sql(`select pg_get_functiondef('public.app_export_my_data()'::regprocedure) def`);
    expect(def).toContain("'text_sha256', t.text_sha256");
    expect(def).toContain("'companions', t.companions");
    expect(def).toContain("study_matches");
    expect(def).toContain("export_station_attempts");
    const [{ sala, vol }] = await d.sql(
      `select pg_get_functiondef('public.app_dupla_room_content(uuid)'::regprocedure) sala, provolatile vol from pg_proc where oid = 'public.app_dupla_room_content(uuid)'::regprocedure`,
    );
    expect(vol).toBe("v");
    expect(sala).toContain("perform public.dupla_sweep(p_room_id)");
    expect(sala).toContain("Esta estação ficou indisponível");
    expect(sala).toContain("in_sheet"); // da 013560
    // colar a junção de novo não muda nada
    await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "20261003013980_treino_dupla_juncao_main.sql"), "utf8"));
    const [{ def: def2 }] = await d.sql(`select pg_get_functiondef('public.app_export_my_data()'::regprocedure) def`);
    expect(def2).toBe(def);
  });
});

describe("etapa 2 (radar, convite, @, Stazia Match, créditos, treino sozinho com IA): continua só para a equipe", () => {
  // Mesmo banco de produção em memória, com as migrações da etapa 2 (013990 a 014120) e as chaves como nascem.
  let d: DuplaDb;
  const editor = U.eva;
  const alunos = { teste: U.ana, pro: U.bruno, vencido: U.carla } as const;
  const QUALQUER = "00000000-0000-4000-8000-0000000000ff";
  // Funções novas da etapa 2 que o aluno chamaria pela API, com argumentos válidos.
  const CHAMADAS: [string, Record<string, unknown>][] = [
    ["app_dupla_radar", {}],
    ["app_dupla_radar", { p_aba: "perto" }],
    ["app_dupla_invite", { p_to: U.admin, p_station_id: "inep2025-1-e07" }],
    ["app_dupla_handle_check", { p_handle: "colega.teste" }],
    ["app_dupla_set_handle", { p_handle: "colega.teste" }],
    ["app_dupla_link_lookup", { p_handle: "colega.teste" }],
    ["app_dupla_link_request", { p_handle: "colega.teste" }],
    ["app_dupla_requests", {}],
    ["app_dupla_answer_request", { p_request_id: QUALQUER, p_accept: true }],
    ["app_dupla_swipe", { p_to: U.admin, p_direction: "right" }],
    ["app_dupla_invites", {}],
    ["app_dupla_deck", {}],
    ["app_dupla_heartbeat", { p_status: "livre" }],
    ["app_fase2_start", { p_station_id: "inep2025-1-e07" }],
    ["app_fase2_save_answers", { p_attempt_id: QUALQUER, p_answers: [] }],
    ["app_fase2_deliver", { p_attempt_id: QUALQUER }],
    ["app_fase2_report_ia", { p_attempt_id: QUALQUER }],
    ["app_admin_dupla_handle_log", {}],
    ["app_admin_credit_config", {}],
    ["app_admin_dupla_ia", {}],
  ];
  const TABELAS = ["study_handle_log", "study_train_requests", "credit_ledger", "credit_wallets", "credit_daily", "study_room_charges", "study_room_claims"];

  beforeAll(async () => {
    d = await openDuplaDb();
    await setPlan(d.db, U.ana, "trial", "trialing", daqui(7));
    await setPlan(d.db, U.bruno, "pro", "active");
    await setPlan(d.db, U.carla, "pro", "expired");
    await d.sql(`update public.subscriptions set current_period_end = now() - interval '10 days' where user_id = $1`, [U.carla]);
    await d.sql(`update public.user_roles set role = 'editor' where user_id = $1`, [editor]);
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });

  it("as migrações da etapa 2 estão na cadeia, depois da 013980 (mesma ordem da produção)", () => {
    const etapa2 = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql") && f > "20261003013980");
    expect(etapa2.length).toBeGreaterThanOrEqual(14);
    expect(etapa2.every((f) => f.includes("treino_dupla"))).toBe(true);
  });

  for (const [tipo, uid] of Object.entries(alunos)) {
    it(`aluno (${tipo}): radar, convite, @, link, pedido, match, créditos da Administração e treino sozinho recusam`, async () => {
      expect(await d.rpc(uid, "app_dupla_access")).toMatchObject({ aberto: false, permitido: false });
      for (const [fn, args] of CHAMADAS) await expect(d.rpc(uid, fn, args), fn).rejects.toThrow();
      for (const t of TABELAS) {
        const linhas = await d.asUser(uid, `select * from public.${t}`).catch(() => [] as any[]);
        expect(linhas, t).toHaveLength(0);
      }
      // nem o @ de ninguém pela leitura direta do perfil de estudo
      const perfis = await d.asUser(uid, `select handle from public.study_profiles`).catch(() => [] as any[]);
      expect(perfis).toHaveLength(0);
      // créditos: com a cota desligada o saldo nem existe (a tela do Início também não lê com a 2ª fase fechada)
      expect(await d.rpc(uid, "app_credit_state", { p_pool: "match" })).toMatchObject({ ativa: false });
      expect(await d.rpc(uid, "app_credit_state", { p_pool: "ia" })).toMatchObject({ ativa: false });
    });
  }

  it("visitante (sem login): tudo da etapa 2 recusa", async () => {
    for (const [fn, args] of CHAMADAS) await expect(d.rpc(null, fn, args), fn).rejects.toThrow();
    await expect(d.rpc(null, "app_credit_state", { p_pool: "match" })).rejects.toThrow();
  });

  it("a cota de créditos nasce DESLIGADA e sem números por plano; 'Treinar outra estação' cobra quando ligar", async () => {
    const [{ value }] = await d.sql(`select value from public.app_settings where key = 'creditos'`);
    expect(value.ativa).toBe(false);
    expect(value.match?.cobra_rodada_extra).not.toBe(false);
    expect(await d.sql(`select 1 from public.credit_ledger`)).toHaveLength(0);
  });

  it("a avaliação por IA do treino sozinho nasce DESLIGADA: função sem configuração, chave fechada, ninguém consegue usar", async () => {
    expect(await d.sql(`select 1 from public.ai_functions where key = 'treino_avaliacao'`)).toHaveLength(0);
    const [{ r }] = await d.sql(`select public.solo_ia_function_ready() r`);
    expect(r).toMatchObject({ ready: false });
    const [{ value }] = await d.sql(`select value from public.app_settings where key = 'treino_dupla'`);
    expect(value.aberto).toBe(false);
    expect(value?.sozinho?.ia?.aberto ?? false).toBe(false);
    for (const uid of [U.admin, editor, U.ana, U.bruno]) {
      const [{ st }] = await d.sql(`select public.solo_ia_status($1) st`, [uid]);
      expect(st.disponivel, uid).toBe(false);
    }
  });

  it("equipe (administrador e editor): entra no radar, tem @ e vê os quadros da Administração que lhe cabem", async () => {
    for (const uid of [U.admin, editor]) {
      await d.rpc(uid, "app_dupla_save_profile", { p_profile: { public_name: uid === U.admin ? "Equipe Um" : "Equipe Dois", role_pref: "any", radar_visible: true } });
      const radar: any = await d.rpc(uid, "app_dupla_radar", {});
      expect(Array.isArray(radar.people)).toBe(true);
      const [{ handle }] = await d.sql(`select handle from public.study_profiles where user_id = $1`, [uid]);
      expect(handle).toMatch(/^[a-z0-9._]{3,20}$/);
      expect((await d.rpc(uid, "app_dupla_handle_check", { p_handle: handle })).ok).toBe(true);
    }
    expect(await d.rpc(U.admin, "app_admin_credit_config")).toBeTruthy();
    await expect(d.rpc(editor, "app_admin_credit_config")).rejects.toThrow();
  });
});

describe.runIf(temE07)("Revalida 2025/1, estação 7 (pasta da Montagem neste computador)", () => {
  it("o conteúdo é o do estacao-app.json aprovado, com só as diferenças previstas; PEP soma 10", () => {
    const original = JSON.parse(fs.readFileSync(path.join(PASTA_E07, "estacao-app.json"), "utf8"));
    const { station, sql } = buildCargaEstacao(
      fs.readFileSync(path.join(PASTA_E07, "estacao-app.json"), "utf8"),
      fs.readFileSync(path.join(PASTA_E07, "aprovacao-dono.md"), "utf8"),
    );
    expect(station.id).toBe("inep2025-1-e07");
    expect(station.checklist_items).toHaveLength(10);
    expect(station.pressings).toHaveLength(4);
    expect(station.checklist_items.reduce((s, i) => s + i.grades.correct, 0)).toBeCloseTo(10, 6);
    const { _montagem, difficulty, difficulty_label, difficulty_rubric, difficulty_note, ...resto } = original;
    const esperado = { ...resto, pressings: resto.pressings.map((p: any) => ({ ...p, image_url: null })) };
    const { version, ...gravado } = station as any;
    expect(gravado).toEqual(esperado);
    expect(sql).toContain("'pending'");
    expect(sql).not.toMatch(/medical_review\s*=\s*'approved'/);
  });
});
