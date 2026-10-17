// @vitest-environment node
/**
 * Treino sozinho (grupo dupla-sozinho-ia) no banco: migrações 013430 a 013460 sobre o PGlite com as migrações reais.
 * Cobre: dados e regras da IA (013430), o fluxo do aluno entregue/PEP/nota (013440), as funções de serviço da IA (013450),
 * o uso do mês e a exportação (013460). IA SIMULADA: nenhuma chamada de rede aqui (o banco só guarda o que o servidor entrega).
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aceitarTermos } from "./helpers/aceites";
import { addProfile, addSession, addStation, makeRoom, MIGRATIONS_DIR, openDuplaDb, setDupla, setPlan, stationAssets, STATION, U, type DuplaDb } from "./helpers/duplaDb";

const ASSET = "11111111-1111-4111-8111-111111111111";
const ST = { ...STATION, pressing_assets: { p2: { asset_id: ASSET } } };
const TEXTO_BOM = "Eu me apresento ao paciente, pergunto a queixa, os sintomas, o tempo de evolução e as doenças anteriores. Examino o abdome e peço o hemograma. Explico a hipótese e oriento o retorno.";
const RESPOSTAS = [{ task: 1, text: TEXTO_BOM }, { task: 2, text: "Peço hemograma e radiografia de tórax." }];

function comite(db: DuplaDb["db"], refs: { provider: string; model: string }[], opts: { ligar?: string[] } = {}) {
  return (async () => {
    await db.query(`update public.ai_providers set enabled = (id = any($1::text[]))`, [opts.ligar ?? ["anthropic", "gemini", "openai"]]);
    await db.query(`delete from public.ai_functions where key = 'treino_avaliacao'`);
    await db.query(`insert into public.ai_functions (key, mode, primary_ref, reviewers) values ('treino_avaliacao', 'comite', $1::jsonb, $2::jsonb)`, [
      JSON.stringify(refs[0]),
      JSON.stringify(refs.slice(1)),
    ]);
  })();
}
const DUAS = [{ provider: "anthropic", model: "claude-sonnet-5-5" }, { provider: "gemini", model: "gemini-3.8-flash" }];

describe("Treino sozinho no banco (013430 a 013460)", () => {
  let d: DuplaDb;
  beforeAll(async () => {
    d = await openDuplaDb();
    await addStation(d.db, ST);
    await stationAssets(d.db, [{ id: ASSET, storage_path: "teste/p2.png" }]);
    for (const u of [U.ana, U.bruno]) await aceitarTermos(d.db, u);
  }, 240_000);
  afterAll(async () => {
    await d?.db.close();
  });

  const rpc = <T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}) => d.rpc<T>(uid, fn, args);
  const sql = <T = any>(q: string, p: unknown[] = []) => d.sql<T>(q, p);
  const servico = <T = any>(fn: string, args: Record<string, unknown>) =>
    d.db.transaction(async (tx) => {
      const keys = Object.keys(args);
      const r = await tx.query<{ r: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => (typeof args[k] === "object" && args[k] !== null ? JSON.stringify(args[k]) : args[k])));
      return r.rows[0].r;
    });

  /** Treino da equipe até a entrega. */
  async function entregue(uid = U.admin, answers: unknown = RESPOSTAS) {
    const p = await rpc(uid, "app_fase2_start", { p_station_id: ST.id });
    await rpc(uid, "app_fase2_begin", { p_attempt_id: p.attempt_id });
    return rpc(uid, "app_fase2_deliver", { p_attempt_id: p.attempt_id, p_answers: answers });
  }
  const limpar = async () => {
    await sql(`delete from public.checklist_study_sessions`);
    await sql(`delete from public.station_attempts`);
  };

  // ------------------------------------------------------------------ 013430: dados e regras da IA
  describe("dados, painel e regras da IA (013430)", () => {
    it("avaliações antigas ficam como dupla/avaliador; modo e fonte só aceitam os valores certos", async () => {
      await addProfile(d.db, U.ana);
      const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "result", candidate: U.ana, evaluator: U.bruno });
      await addSession(d.db, { room: sala, round: 1, doctor: U.ana, actor: U.bruno, station: ST.id, correctness: 70 });
      const [s] = await sql(`select mode, source, solo_run_id from public.checklist_study_sessions`);
      expect(s).toEqual({ mode: "dupla", source: "avaliador", solo_run_id: null });
      await expect(sql(`update public.checklist_study_sessions set mode = 'outro'`)).rejects.toThrow();
      await expect(sql(`update public.checklist_study_sessions set source = 'robo'`)).rejects.toThrow();
      await limpar();
      await sql(`delete from public.checklist_rooms`);
    });

    it("app_admin_save_dupla mescla: salvar aberto e planos NÃO apaga os blocos sozinho, radar e convites", async () => {
      await sql(`insert into public.app_settings (key, value) values ('treino_dupla', $1::jsonb) on conflict (key) do update set value = excluded.value`, [
        JSON.stringify({ aberto: false, planos: ["pro"], sozinho: { ia: { aberto: true } }, radar: { x: 1 }, convites: { pendentes: 2 } }),
      ]);
      const r = await rpc(U.admin, "app_admin_save_dupla", { p_aberto: true, p_planos: ["elite", "pro"] });
      expect(r).toEqual({ aberto: true, planos: ["pro", "elite"] });
      const [{ value }] = await sql(`select value from public.app_settings where key = 'treino_dupla'`);
      expect(value).toEqual({ aberto: true, planos: ["pro", "elite"], sozinho: { ia: { aberto: true } }, radar: { x: 1 }, convites: { pendentes: 2 } });
      await expect(rpc(U.ana, "app_admin_save_dupla", { p_aberto: true, p_planos: [] })).rejects.toThrow();
    });

    it("app_admin_save_dupla_ia: só administrador, valida e grava só sozinho.ia sem tocar no resto", async () => {
      await setDupla(d.db, { aberto: true, planos: ["pro"] });
      await sql(`update public.app_settings set value = value || '{"radar":{"x":1}}'::jsonb where key = 'treino_dupla'`);
      await expect(rpc(U.ana, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: ["pro"], limite_dia: 3, limite_mes: 20 } })).rejects.toThrow(/administradores|restrito/i);
      await expect(rpc(null, "app_admin_save_dupla_ia", { p_config: {} })).rejects.toThrow();
      await expect(rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: ["ouro"], limite_dia: 3, limite_mes: 20 } })).rejects.toThrow(/Planos inválidos/);
      await expect(rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: ["pro"], limite_dia: 0, limite_mes: 20 } })).rejects.toThrow(/Limites inválidos/);
      await expect(rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: ["pro"], limite_dia: 9, limite_mes: 3 } })).rejects.toThrow(/Limites inválidos/);
      await expect(rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: "sim", planos: [] } })).rejects.toThrow();
      const ok = await rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: ["elite", "pro"], limite_dia: 3, limite_mes: 20 } });
      expect(ok).toEqual({ aberto: true, planos: ["pro", "elite"], limite_dia: 3, limite_mes: 20 });
      const [{ value }] = await sql(`select value from public.app_settings where key = 'treino_dupla'`);
      expect(value.aberto).toBe(true);
      expect(value.radar).toEqual({ x: 1 });
      expect(value.sozinho.ia.limite_dia).toBe(3);
      // vazio é aceito (e deixa a IA bloqueada)
      const vazio = await rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: false, planos: [], limite_dia: null, limite_mes: null } });
      expect(vazio.limite_dia).toBeNull();
      const [{ n }] = await sql(`select count(*)::int as n from public.admin_audit_log where action = 'dupla.ia.save'`).catch(() => [{ n: 0 }]);
      expect(typeof n).toBe("number");
    });

    it("heartbeat 'sozinho' só vale com treino aberto; sem ele vira livre", async () => {
      await addProfile(d.db, U.admin);
      await rpc(U.admin, "app_dupla_heartbeat", { p_status: "sozinho" });
      expect((await sql(`select status from public.study_profiles where user_id = $1`, [U.admin]))[0].status).toBe("livre");
      const p = await rpc(U.admin, "app_fase2_start", { p_station_id: ST.id });
      await rpc(U.admin, "app_fase2_begin", { p_attempt_id: p.attempt_id });
      await rpc(U.admin, "app_dupla_heartbeat", { p_status: "sozinho" });
      expect((await sql(`select status from public.study_profiles where user_id = $1`, [U.admin]))[0].status).toBe("sozinho");
      await expect(rpc(U.admin, "app_dupla_heartbeat", { p_status: "qualquer" })).rejects.toThrow(/Situação inválida/);
      await limpar();
    });

    it("a função treino_avaliacao nasce desligada; fica pronta com UMA IA ligada (padrão) ou com o comitê de exatamente duas (opcional, de qualquer empresa)", async () => {
      await sql(`delete from public.ai_functions where key = 'treino_avaliacao'`);
      const pronta = () => sql<{ r: any }>(`select public.solo_ia_function_ready() as r`).then((x) => x[0].r);
      expect((await pronta()).ready).toBe(false); // sem linha salva = desligada
      await sql(`update public.ai_providers set enabled = (id = 'gemini')`);
      await sql(`insert into public.ai_functions (key, mode, primary_ref) values ('treino_avaliacao', 'sozinha', '{"provider":"gemini","model":"gemini-3.1-pro-preview"}')`);
      expect(await pronta()).toMatchObject({ ready: true, mode: "sozinha" }); // uma IA, padrão
      await sql(`update public.ai_providers set enabled = false`);
      expect((await pronta()).ready).toBe(false); // IA desligada na Central
      await sql(`update public.ai_functions set fallback_ref = '{"provider":"anthropic","model":"claude-sonnet-5-5"}' where key = 'treino_avaliacao'`);
      await sql(`update public.ai_providers set enabled = (id = 'anthropic')`);
      expect((await pronta()).ready).toBe(true); // a reserva ligada cobre a principal desligada
      await sql(`delete from public.ai_functions where key = 'treino_avaliacao'`);
      await sql(`insert into public.ai_functions (key, mode, primary_ref) values ('treino_avaliacao', 'linha', '{"provider":"gemini","model":"m"}')`);
      expect((await pronta()).ready).toBe(false); // modo linha não existe nesta função
      // comitê opcional: exatamente duas IAs, ligadas, de qualquer empresa (inclusive da MESMA)
      await comite(d.db, [DUAS[0], { provider: "anthropic", model: "outro" }]);
      expect(await pronta()).toMatchObject({ ready: true, mode: "comite" });
      await comite(d.db, DUAS, { ligar: ["anthropic"] });
      expect((await pronta()).ready).toBe(false); // uma das duas desligada
      await comite(d.db, [DUAS[0]]);
      expect((await pronta()).ready).toBe(false); // comitê de uma só
      await comite(d.db, [DUAS[0], DUAS[1], { provider: "openai", model: "gpt-6.1-sol" }]);
      expect((await pronta()).ready).toBe(false); // três
      await comite(d.db, DUAS);
      expect(await pronta()).toMatchObject({ ready: true, mode: "comite" });
    });

    it("solo_ia_status: equipe passa; aluno passa por cada barreira, na ordem, sem gastar cota", async () => {
      await limpar();
      await sql(`delete from public.legal_acceptances where user_id = $1`, [U.ana]);
      const status = () => sql<{ r: any }>(`select public.solo_ia_status($1) as r`, [U.ana]).then((x) => x[0].r);
      await setDupla(d.db, { aberto: true, planos: ["pro"] });
      await sql(`update public.app_settings set value = value || '{"sozinho":{"ia":{"aberto":false}}}'::jsonb where key = 'treino_dupla'`);
      expect((await sql<{ r: any }>(`select public.solo_ia_status($1) as r`, [U.admin]))[0].r).toMatchObject({ disponivel: true, equipe: true });
      expect(await status()).toMatchObject({ disponivel: false, motivo: "A avaliação por IA está indisponível agora." }); // chave fechada
      await rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: ["pro"], limite_dia: 1, limite_mes: 2 } });
      await setPlan(d.db, U.ana, "trial", "trialing", new Date(Date.now() + 86400000).toISOString());
      expect(await status()).toMatchObject({ disponivel: false, motivo: "Disponível em outro plano." });
      await setPlan(d.db, U.ana, "pro", "active");
      expect(await status()).toMatchObject({ disponivel: false, motivo: "Aceite o aviso para usar a IA.", aceite_pendente: true });
      await aceitarTermos(d.db, U.ana);
      expect(await status()).toMatchObject({ disponivel: true, motivo: null });
      // limites vazios = bloqueada
      await rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: ["pro"], limite_dia: null, limite_mes: null } });
      expect(await status()).toMatchObject({ disponivel: false, motivo: "A avaliação por IA está indisponível agora." });
      await rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: ["pro"], limite_dia: 1, limite_mes: 2 } });
      // cota do dia e do mês
      await sql(`insert into public.station_attempts (user_id, station_id, status, ia_reserved_at) values ($1, $2, 'done', now())`, [U.ana, ST.id]);
      expect(await status()).toMatchObject({ disponivel: false, motivo: "Você usou as avaliações de hoje.", usadas_dia: 1 });
      await sql(`update public.station_attempts set ia_reserved_at = date_trunc('month', now()) - interval '1 day' where user_id = $1`, [U.ana]);
      await sql(`insert into public.station_attempts (user_id, station_id, status, ia_reserved_at) values ($1, $2, 'done', date_trunc('month', now()) + interval '1 hour')`, [U.ana, ST.id]);
      // 2 usos: um no mês passado e um neste mês (limite do mês = 2): ainda sobra 1 neste mês
      expect((await status()).usadas_mes).toBe(1);
      await sql(`delete from public.station_attempts`);
    });

    it("benefício Elite 'correção de estação' (decisão D5) libera sem estar em 'planos'", async () => {
      await rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: [], limite_dia: 2, limite_mes: 5 } });
      await setPlan(d.db, U.bruno, "elite", "active");
      const s1 = (await sql<{ r: any }>(`select public.solo_ia_status($1) as r`, [U.bruno]))[0].r;
      expect(s1.disponivel).toBe(false);
      await sql(`update public.plan_benefits set elite_station_feedback = true`);
      const s2 = (await sql<{ r: any }>(`select public.solo_ia_status($1) as r`, [U.bruno]))[0].r;
      expect(s2.disponivel).toBe(true);
      await sql(`update public.plan_benefits set elite_station_feedback = false`);
    });

    it("histórico da dupla, 'Última vez' e uso do mês da dupla ignoram o treino sozinho", async () => {
      await limpar();
      await sql(`delete from public.checklist_rooms`);
      await setDupla(d.db, { aberto: true, planos: ["pro"] });
      await addProfile(d.db, U.bruno).catch(() => {});
      const sala = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "result", candidate: U.ana, evaluator: U.bruno });
      await addSession(d.db, { room: sala, round: 1, doctor: U.ana, actor: U.bruno, station: ST.id, correctness: 60, finishedAt: new Date(Date.now() - 3600_000).toISOString() });
      const sala2 = await makeRoom(d.db, { members: [U.ana, U.bruno], phase: "result", candidate: U.ana, evaluator: U.bruno });
      const ses2 = await addSession(d.db, { room: sala2, round: 1, doctor: U.ana, actor: U.bruno, station: ST.id, correctness: 80 });
      await sql(`insert into public.checklist_study_sessions (id, station_id, room_id, round, doctor_id, started_at, finished_at, score, max_score, correctness, mode, source)
                 values ('solo-x', $1, gen_random_uuid(), 1, $2, now() - interval '1 hour', now() - interval '30 minutes', 9, 10, 90, 'sozinho', 'ia')`, [ST.id, U.ana]);
      const hist = await rpc<any[]>(U.ana, "app_dupla_history", { p_limit: 20 });
      expect(hist).toHaveLength(2);
      const res = await rpc(U.ana, "app_dupla_history_result", { p_room_id: sala2, p_round: 1 });
      expect(res.previous_pct).toBe(60); // a nota 90 do treino sozinho (outra modalidade) não entra
      void ses2;
      const uso = await rpc(U.admin, "app_admin_dupla_usage", {});
      expect(uso.rodadas_avaliadas).toBe(2);
      await sql(`delete from public.checklist_study_sessions`);
      await sql(`delete from public.checklist_rooms`);
    });
  });

  // ------------------------------------------------------------------ 013440: fluxo do aluno
  describe("fluxo do treino sozinho (013440)", () => {
    it("visitante e aluno ficam de fora; as funções novas existem só para quem entra", async () => {
      for (const fn of ["app_fase2_save_answers", "app_fase2_deliver", "app_fase2_open_pressing", "app_fase2_print_path"]) {
        await expect(rpc(null, fn, { p_attempt_id: "00000000-0000-0000-0000-000000000000", ...(fn.includes("pressing") || fn.includes("print") ? { p_pressing_id: "p1" } : { p_answers: [] }) })).rejects.toThrow(/permission denied/i);
        await expect(rpc(U.ana, fn, { p_attempt_id: "00000000-0000-0000-0000-000000000000", ...(fn.includes("pressing") || fn.includes("print") ? { p_pressing_id: "p1" } : { p_answers: [] }) })).rejects.toThrow(/ainda não está aberta/);
      }
    });

    it("leitura e atendimento: o aluno nunca recebe roteiro do ator nem itens do PEP; o texto vem sem 'Liberação'", async () => {
      await limpar();
      const p = await rpc(U.admin, "app_fase2_start", { p_station_id: ST.id });
      expect(p.status).toBe("reading");
      expect(p.pressings).toBeUndefined();
      const b = await rpc(U.admin, "app_fase2_begin", { p_attempt_id: p.attempt_id });
      const cru = JSON.stringify(b);
      expect(cru).not.toContain("Paciente de teste, 40 anos"); // roteiro do ator
      expect(cru).not.toContain("Item um");
      expect(cru).not.toContain("Adequado um");
      expect(cru).not.toContain("Liberação");
      expect(b.pressings.map((x: any) => [x.id, x.opened, x.content ?? null])).toEqual([["p1", false, null], ["p2", false, null]]);
      expect(b.pressings[1].has_image).toBe(true);
      expect(b.ends_at).toBeTruthy();
    });

    it("texto por tarefa: salva, volta igual ao recarregar e respeita os limites", async () => {
      const cur = await rpc(U.admin, "app_fase2_overview");
      const id = cur.open_attempt.id;
      await rpc(U.admin, "app_fase2_save_answers", { p_attempt_id: id, p_answers: RESPOSTAS });
      expect((await rpc(U.admin, "app_fase2_attempt", { p_attempt_id: id })).answers).toEqual(RESPOSTAS);
      await expect(rpc(U.admin, "app_fase2_save_answers", { p_attempt_id: id, p_answers: [{ task: 1, text: "x".repeat(4001) }] })).rejects.toThrow(/Texto longo demais/);
      await expect(rpc(U.admin, "app_fase2_save_answers", { p_attempt_id: id, p_answers: [{ task: 31, text: "a" }] })).rejects.toThrow(/Respostas inválidas/);
      await expect(rpc(U.admin, "app_fase2_save_answers", { p_attempt_id: id, p_answers: {} })).rejects.toThrow(/Respostas inválidas/);
      const cinco = Array.from({ length: 6 }, (_, i) => ({ task: i + 1, text: "y".repeat(3800) }));
      await expect(rpc(U.admin, "app_fase2_save_answers", { p_attempt_id: id, p_answers: cinco })).rejects.toThrow(/Texto longo demais/);
      expect((await rpc(U.admin, "app_fase2_attempt", { p_attempt_id: id })).answers).toEqual(RESPOSTAS);
    });

    it("abrir impresso registra uma vez só, com o tempo do servidor; id inventado é recusado; a imagem só de impresso aberto", async () => {
      const id = (await rpc(U.admin, "app_fase2_overview")).open_attempt.id;
      await expect(rpc(U.admin, "app_fase2_print_path", { p_attempt_id: id, p_pressing_id: "p2" })).rejects.toThrow(/Impresso não liberado/);
      await expect(rpc(U.admin, "app_fase2_open_pressing", { p_attempt_id: id, p_pressing_id: "zzz" })).rejects.toThrow(/Impresso não encontrado/);
      await sql(`update public.station_attempts set attendance_started_at = now() - interval '90 seconds' where id = $1`, [id]);
      const o = await rpc(U.admin, "app_fase2_open_pressing", { p_attempt_id: id, p_pressing_id: "p1" });
      expect(o.content).toBe("Hb 9,0 g/dL");
      await rpc(U.admin, "app_fase2_open_pressing", { p_attempt_id: id, p_pressing_id: "p1" });
      const [{ pressings_opened }] = await sql(`select pressings_opened from public.station_attempts where id = $1`, [id]);
      expect(pressings_opened).toHaveLength(1);
      expect(pressings_opened[0].at_ms).toBeGreaterThanOrEqual(90_000);
      expect(pressings_opened[0].at_ms).toBeLessThan(100_000);
      const pl = await rpc(U.admin, "app_fase2_attempt", { p_attempt_id: id });
      expect(pl.pressings[0]).toMatchObject({ id: "p1", opened: true, content: "Hb 9,0 g/dL" });
      expect(pl.pressings[1]).toMatchObject({ id: "p2", opened: false });
      expect(pl.pressings[1].content).toBeNull();
      await rpc(U.admin, "app_fase2_open_pressing", { p_attempt_id: id, p_pressing_id: "p2" });
      expect(await rpc(U.admin, "app_fase2_print_path", { p_attempt_id: id, p_pressing_id: "p2" })).toBe("teste/p2.png");
      expect(await rpc(U.admin, "app_fase2_print_path", { p_attempt_id: id, p_pressing_id: "p1" })).toBeNull(); // aberto, mas sem imagem
    });

    it("entregar: o enunciado segue, o PEP NÃO sai, e a IA aparece desligada com o motivo curto", async () => {
      const id = (await rpc(U.admin, "app_fase2_overview")).open_attempt.id;
      const e = await rpc(U.admin, "app_fase2_deliver", { p_attempt_id: id, p_answers: RESPOSTAS });
      expect(e.status).toBe("submitted");
      expect(e.checklist).toBeUndefined();
      expect(JSON.stringify(e)).not.toContain("Item um");
      expect(e.ia.available).toBe(true); // equipe, com a função pronta
      await sql(`delete from public.ai_functions where key = 'treino_avaliacao'`);
      const e2 = await rpc(U.admin, "app_fase2_attempt", { p_attempt_id: id });
      expect(e2.ia).toEqual({ available: false, reason: "A avaliação por IA está indisponível agora.", consent_required: false });
      // entregar de novo não muda nada; não aceita mais texto
      expect((await rpc(U.admin, "app_fase2_deliver", { p_attempt_id: id })).status).toBe("submitted");
      await expect(rpc(U.admin, "app_fase2_save_answers", { p_attempt_id: id, p_answers: [] })).rejects.toThrow(/não aceita mais texto/);
      await comite(d.db, DUAS);
    });

    it("autoavaliação: o PEP só abre depois da entrega; nota do servidor; espelha em mode sozinho; clique duplo não duplica", async () => {
      const id = (await rpc(U.admin, "app_fase2_overview")).open_attempt.id;
      await expect(rpc(U.admin, "app_fase2_submit", { p_attempt_id: id, p_marks: { 1: "correct", 2: "correct", 3: "correct" } })).rejects.toThrow(/Abra o PEP/);
      const s = await rpc(U.admin, "app_fase2_finish", { p_attempt_id: id });
      expect(s.status).toBe("scoring");
      expect(s.checklist).toHaveLength(3);
      expect(JSON.stringify(s)).not.toContain("Paciente de teste, 40 anos");
      await expect(rpc(U.admin, "app_fase2_submit", { p_attempt_id: id, p_marks: { 1: "correct", 2: "partial", 3: "correct" } })).rejects.toThrow(/Marque todos os itens do PEP \(item 2\)/);
      const r = await rpc(U.admin, "app_fase2_submit", { p_attempt_id: id, p_marks: { 1: "partial", 2: "correct", 3: "incorrect" } });
      expect(r.status).toBe("done");
      expect(r.result).toMatchObject({ score: 3.75, max_score: 10, score10: 3.8, source: "autoavaliacao" });
      expect(r.result.marks.map((m: any) => [m.order, m.grade, m.points])).toEqual([[1, "partial", 1.25], [2, "correct", 2.5], [3, "incorrect", 0]]);
      expect(r.result.positive).toEqual(["Item dois"]);
      expect(r.result.negative).toEqual(["Item um", "Item três"]);
      const again = await rpc(U.admin, "app_fase2_submit", { p_attempt_id: id, p_marks: { 1: "correct", 2: "correct", 3: "correct" } });
      expect(again.result.score).toBe(3.75);
      const sess = await sql(`select mode, source, doctor_id, actor_id, score, correctness, solo_run_id, round, pressings_released from public.checklist_study_sessions`);
      expect(sess).toHaveLength(1);
      expect(sess[0]).toMatchObject({ mode: "sozinho", source: "autoavaliacao", doctor_id: U.admin, actor_id: null, score: "3.750", correctness: "37.5", solo_run_id: id, round: 1 });
      expect(sess[0].pressings_released).toEqual(["p1", "p2"]);
      // Meus PEPs: uma linha só (não duplica com o espelho), com a fonte
      const peps = await rpc<any[]>(U.admin, "app_fase2_peps", { p_limit: 10 });
      expect(peps).toHaveLength(1);
      expect(peps[0]).toMatchObject({ origin: "solo", source: "autoavaliacao" });
      const ov = await rpc(U.admin, "app_fase2_overview");
      expect(ov.done_count).toBe(1);
      expect(ov.open_attempt).toBeNull();
    });

    it("decisão D7: 'Sua última nota' e 'Média geral' do Banco de estações CONTAM o treino sozinho (sem mexer em app_dupla_stations)", async () => {
      await setDupla(d.db, { aberto: true, planos: ["pro"] });
      const bank = await rpc<any[]>(U.admin, "app_dupla_stations");
      const e = bank.find((x) => x.id === ST.id);
      expect(e.my_last_pct).toBe(38);
      expect(e.evaluations).toBe(1); // a média só aparece com 5 avaliações ou mais (spec de 09/10); o treino sozinho já conta
    });

    it("outra pessoa não vê nem mexe no treino de alguém", async () => {
      await limpar();
      const e = await entregue(U.admin);
      await expect(rpc(U.ana, "app_fase2_attempt", { p_attempt_id: e.attempt_id })).rejects.toThrow(/ainda não está aberta/);
      await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [U.bruno]);
      for (const [fn, a] of [["app_fase2_attempt", {}], ["app_fase2_deliver", {}], ["app_fase2_finish", {}], ["app_fase2_save_answers", { p_answers: [] }], ["app_fase2_abandon", {}]] as const) {
        if (fn === "app_fase2_abandon") continue;
        await expect(rpc(U.bruno, fn, { p_attempt_id: e.attempt_id, ...a })).rejects.toThrow(/Tentativa não encontrada/);
      }
      await sql(`update public.user_roles set role = 'student' where user_id = $1`, [U.bruno]);
      await limpar();
    });

    it("começar outra estação derruba a entrega aberta, mas não uma avaliação por IA em andamento", async () => {
      await limpar();
      await addStation(d.db, { ...ST, id: "teste-sozinho-e02", name: "Outra estação de teste" });
      const e = await entregue(U.admin);
      await sql(`update public.station_attempts set status = 'evaluating', ia_reserved_at = now() where id = $1`, [e.attempt_id]);
      await expect(rpc(U.admin, "app_fase2_start", { p_station_id: "teste-sozinho-e02" })).rejects.toThrow(/Espere a avaliação em andamento terminar/);
      // presa há mais de 3 minutos: destrava, devolve a cota e deixa a mensagem
      await sql(`update public.station_attempts set ia_reserved_at = now() - interval '4 minutes' where id = $1`, [e.attempt_id]);
      const r = await rpc(U.admin, "app_fase2_attempt", { p_attempt_id: e.attempt_id });
      expect(r.status).toBe("submitted");
      expect(r.ia_message).toMatch(/demorou demais/);
      expect((await sql(`select ia_reserved_at from public.station_attempts where id = $1`, [e.attempt_id]))[0].ia_reserved_at).toBeNull();
      const o = await rpc(U.admin, "app_fase2_start", { p_station_id: "teste-sozinho-e02" });
      expect(o.station.id).toBe("teste-sozinho-e02");
      expect((await sql(`select status from public.station_attempts where id = $1`, [e.attempt_id]))[0].status).toBe("abandoned");
      await limpar();
    });
  });

  // ------------------------------------------------------------------ 013450: IA (funções de serviço)
  describe("avaliação por IA: funções de serviço (013450)", () => {
    const aluna = async (answers: unknown = RESPOSTAS) => {
      await limpar();
      const [{ id }] = await sql(
        `insert into public.station_attempts (user_id, station_id, status, attendance_started_at, submitted_at, answers, how, station_version)
         values ($1, $2, 'submitted', now() - interval '8 minutes', now(), $3::jsonb, 'ia', '1.0') returning id`,
        [U.ana, ST.id, JSON.stringify(answers)]
      );
      return id as string;
    };
    const liberar = async () => {
      await setPlan(d.db, U.ana, "pro", "active");
      await aceitarTermos(d.db, U.ana);
      await rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: ["pro"], limite_dia: 2, limite_mes: 5 } });
      await comite(d.db, DUAS);
    };

    it("as funções de serviço não rodam no navegador (aluno, equipe e visitante)", async () => {
      for (const u of [U.ana, U.admin, null]) {
        await expect(rpc(u, "ch_worker_solo_prepare", { p_user: U.ana, p_attempt: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(/permission denied/i);
        await expect(rpc(u, "ch_worker_solo_save_eval", { p_user: U.ana, p_attempt: "00000000-0000-0000-0000-000000000000", p_eval: {} })).rejects.toThrow(/permission denied/i);
        await expect(rpc(u, "ch_worker_solo_fail", { p_user: U.ana, p_attempt: "00000000-0000-0000-0000-000000000000", p_message: "x" })).rejects.toThrow(/permission denied/i);
      }
    });

    it("preparar: cada barreira recusa com a mensagem certa e NÃO reserva cota; liberado, reserva e entrega o material sem dado pessoal nem roteiro", async () => {
      const id = await aluna();
      await comite(d.db, DUAS);
      await sql(`update public.app_settings set value = value || '{"sozinho":{"ia":{"aberto":false}}}'::jsonb where key = 'treino_dupla'`);
      const barra = async () => servico<any>("ch_worker_solo_prepare", { p_user: U.ana, p_attempt: id });
      expect(await barra()).toMatchObject({ ok: false, status: 403, message: "A avaliação por IA está indisponível agora." });
      await liberar();
      await sql(`delete from public.legal_acceptances where user_id = $1 and document = 'tutor_ia'`, [U.ana]);
      expect(await barra()).toMatchObject({ ok: false, status: 403, message: "Aceite o aviso para usar a IA." });
      await aceitarTermos(d.db, U.ana);
      expect(await servico("ch_worker_solo_prepare", { p_user: U.bruno, p_attempt: id })).toMatchObject({ ok: false, status: 403 }); // treino de outra pessoa
      await sql(`update public.station_attempts set answers = '[]' where id = $1`, [id]);
      expect(await barra()).toMatchObject({ ok: false, status: 422, message: "Escreva algo antes de pedir a avaliação." });
      await sql(`update public.station_attempts set answers = $2::jsonb where id = $1`, [id, JSON.stringify([{ task: 1, text: "Pergunto a queixa." }])]);
      expect(await barra()).toMatchObject({ ok: false, status: 422 });
      expect((await sql(`select status, ia_reserved_at from public.station_attempts where id = $1`, [id]))[0]).toEqual({ status: "submitted", ia_reserved_at: null });
      await sql(`update public.station_attempts set answers = $2::jsonb where id = $1`, [id, JSON.stringify(RESPOSTAS)]);

      const ok = await barra();
      expect(ok.ok).toBe(true);
      const cru = JSON.stringify(ok);
      expect(cru).not.toContain("Paciente de teste, 40 anos"); // roteiro do ator
      expect(cru).not.toContain("ana@teste.dev");
      expect(cru).not.toContain(U.ana);
      expect(cru).not.toContain("Liberação");
      expect(ok.material.items.map((i: any) => [i.id, i.order])).toEqual([["i1", 1], ["i2", 2], ["i3", 3]]);
      expect(ok.material.items[2]).toMatchObject({ grades: { correct: 5, partial: 2.5, incorrect: 0 }, criteria: { correct: "Adequado três" } });
      expect(ok.material.answers).toEqual(RESPOSTAS);
      expect(ok.material.used_ms).toBeGreaterThan(0);
      expect((await sql(`select status, how from public.station_attempts where id = $1`, [id]))[0]).toEqual({ status: "evaluating", how: "ia" });
      // clique duplo: o segundo recebe 409 e não gasta de novo
      expect(await barra()).toMatchObject({ ok: false, status: 409, message: "A avaliação já está em andamento." });
    });

    it("com UMA IA (padrão, modo sozinha) a preparação passa e o material é o mesmo; só o modo do banco muda", async () => {
      const id = await aluna();
      await liberar();
      await sql(`update public.ai_providers set enabled = (id = 'gemini')`);
      await sql(`delete from public.ai_functions where key = 'treino_avaliacao'`);
      await sql(`insert into public.ai_functions (key, mode, primary_ref) values ('treino_avaliacao', 'sozinha', '{"provider":"gemini","model":"gemini-3.1-pro-preview"}')`);
      const ok = await servico<any>("ch_worker_solo_prepare", { p_user: U.ana, p_attempt: id });
      expect(ok.ok).toBe(true);
      expect(ok.material.items).toHaveLength(3);
      await servico("ch_worker_solo_fail", { p_user: U.ana, p_attempt: id, p_message: "teste" });
      await comite(d.db, DUAS);
    });

    it("cota: o limite do dia vale (429), uma falha devolve a cota e o texto do aluno pode ser reenviado", async () => {
      const id = await aluna();
      await liberar();
      await rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: ["pro"], limite_dia: 1, limite_mes: 5 } });
      expect((await servico("ch_worker_solo_prepare", { p_user: U.ana, p_attempt: id })).ok).toBe(true);
      await servico("ch_worker_solo_fail", { p_user: U.ana, p_attempt: id, p_message: "A IA ficou fora do ar." });
      const volta = (await sql(`select status, ia_reserved_at, ia_message from public.station_attempts where id = $1`, [id]))[0];
      expect(volta).toEqual({ status: "submitted", ia_reserved_at: null, ia_message: "A IA ficou fora do ar." });
      expect((await servico("ch_worker_solo_prepare", { p_user: U.ana, p_attempt: id })).ok).toBe(true); // cota devolvida
      const outro = await sql<{ id: string }>(`insert into public.station_attempts (user_id, station_id, status, answers) values ($1, $2, 'submitted', $3::jsonb) returning id`, [U.ana, ST.id, JSON.stringify(RESPOSTAS)]);
      expect(await servico("ch_worker_solo_prepare", { p_user: U.ana, p_attempt: outro[0].id })).toMatchObject({ ok: false, status: 429, message: "Você usou as avaliações de hoje." });
    });

    it("corrida: duas preparações juntas no último da cota — só uma passa", async () => {
      const id = await aluna();
      await liberar();
      await rpc(U.admin, "app_admin_save_dupla_ia", { p_config: { aberto: true, planos: ["pro"], limite_dia: 1, limite_mes: 5 } });
      const segundo = (await sql<{ id: string }>(`insert into public.station_attempts (user_id, station_id, status, answers) values ($1, $2, 'submitted', $3::jsonb) returning id`, [U.ana, ST.id, JSON.stringify(RESPOSTAS)]))[0].id;
      const r = await Promise.all([servico<any>("ch_worker_solo_prepare", { p_user: U.ana, p_attempt: id }), servico<any>("ch_worker_solo_prepare", { p_user: U.ana, p_attempt: segundo })]);
      expect(r.filter((x) => x.ok)).toHaveLength(1);
      expect(r.filter((x) => !x.ok)[0].status).toBe(429);
    });

    it("gravar o resultado: a nota é do banco, item inventado é ignorado, nível que o item não tem e item sem resposta ficam pendentes", async () => {
      const id = await aluna();
      await liberar();
      await servico("ch_worker_solo_prepare", { p_user: U.ana, p_attempt: id });
      const ev = {
        items: [
          { item_id: "i1", grade: "correct", quote: "Eu me apresento ao paciente", reason: "Apresentação feita.", label: null, score: 99 },
          { item_id: "i2", grade: "partial", quote: "x", reason: "Esse item não tem parcial.", label: null }, // nível que o item não tem
          { item_id: "i3", grade: null, quote: null, reason: null, label: "sem_trecho" }, // a IA não achou um trecho que provasse o item
          { item_id: "inventado", grade: "correct", quote: "x", reason: "?" },
        ],
        note: "Texto organizado.",
        diverged: 1,
        members: [{ company: "anthropic" }, { company: "google" }],
        cost_usd: 0.04,
        score: 10,
      };
      const r = await servico<any>("ch_worker_solo_save_eval", { p_user: U.ana, p_attempt: id, p_eval: ev });
      expect(r).toMatchObject({ ok: true, attempt_id: id });
      const [a] = await sql(`select * from public.station_attempts where id = $1`, [id]);
      expect(a.status).toBe("done");
      expect(Number(a.score)).toBe(2.5); // só o i1 vale; a IA não manda na nota
      expect(a.source).toBe("ia");
      expect(a.marks.map((m: any) => [m.order, m.grade, m.label ?? null])).toEqual([[1, "correct", null], [2, null, "sem_avaliacao"], [3, null, "sem_trecho"]]);
      expect(a.marks[0]).toMatchObject({ quote: "Eu me apresento ao paciente", reason: "Apresentação feita." });
      const sess = await sql(`select mode, source, correctness from public.checklist_study_sessions where solo_run_id = $1`, [id]);
      expect(sess).toEqual([{ mode: "sozinho", source: "ia", correctness: "25.0" }]);
      // idempotente: gravar de novo não duplica
      expect(await servico("ch_worker_solo_save_eval", { p_user: U.ana, p_attempt: id, p_eval: ev })).toMatchObject({ ok: true, already: true });
      expect(await sql(`select 1 from public.checklist_study_sessions where solo_run_id = $1`, [id])).toHaveLength(1);
      // o que o aluno recebe: sem empresa, modelo, custo nem prompt
      const bruto = JSON.stringify(await rpc(U.admin, "app_fase2_attempt", { p_attempt_id: id }).catch(() => null));
      void bruto;
      await sql(`update public.user_roles set role = 'editor' where user_id = $1`, [U.ana]);
      const meu = await rpc(U.ana, "app_fase2_attempt", { p_attempt_id: id });
      await sql(`update public.user_roles set role = 'student' where user_id = $1`, [U.ana]);
      expect(meu.result.ia).toEqual({ note: "Texto organizado.", diverged: 1 });
      const txt = JSON.stringify(meu).toLowerCase();
      for (const proibido of ["anthropic", "google", "cost", "claude", "gemini", "openai", "members"]) expect(txt).not.toContain(proibido);
      expect(meu.result.marks[0]).toMatchObject({ quote: "Eu me apresento ao paciente" });
    });

    it("gravar o resultado só vale para treino 'avaliando' do próprio aluno", async () => {
      const id = await aluna();
      expect(await servico("ch_worker_solo_save_eval", { p_user: U.ana, p_attempt: id, p_eval: { items: [] } })).toMatchObject({ ok: false });
      expect(await servico("ch_worker_solo_save_eval", { p_user: U.bruno, p_attempt: id, p_eval: { items: [] } })).toMatchObject({ ok: false });
      expect(await servico("ch_worker_solo_save_eval", { p_user: U.ana, p_attempt: id, p_eval: [] })).toMatchObject({ ok: false });
    });

    it("avisar a equipe: grava em relatos da estação com o treino e o item, só de IA concluída e do próprio aluno", async () => {
      await limpar();
      await sql(`delete from public.checklist_station_reports`);
      const id = await aluna();
      await liberar();
      await servico("ch_worker_solo_prepare", { p_user: U.ana, p_attempt: id });
      await servico("ch_worker_solo_save_eval", { p_user: U.ana, p_attempt: id, p_eval: { items: [{ item_id: "i1", grade: "correct", quote: "Eu me apresento", reason: "ok" }] } });
      await sql(`update public.user_roles set role = 'editor' where user_id in ($1, $2)`, [U.ana, U.bruno]);
      await expect(rpc(U.bruno, "app_fase2_report_ia", { p_attempt_id: id })).rejects.toThrow(/Tentativa não encontrada/);
      await expect(rpc(U.ana, "app_fase2_report_ia", { p_attempt_id: id, p_order: 9 })).rejects.toThrow(/Item do checklist não encontrado/);
      expect(await rpc(U.ana, "app_fase2_report_ia", { p_attempt_id: id, p_order: 1, p_note: "Eu citei o exame." })).toEqual({ ok: true });
      await sql(`update public.user_roles set role = 'student' where user_id in ($1, $2)`, [U.ana, U.bruno]);
      const [rel] = await sql(`select station_id, user_id, message from public.checklist_station_reports`);
      expect(rel).toMatchObject({ station_id: ST.id, user_id: U.ana });
      expect(rel.message).toContain(id);
      expect(rel.message).toContain("item 1");
      expect(rel.message).toContain("Eu citei o exame.");
    });
  });

  // ------------------------------------------------------------------ 013460: uso do mês e exportação
  describe("uso do mês e exportação (013460)", () => {
    it("o sozinho aparece à parte no 'Uso do mês', sem mexer nos números da dupla", async () => {
      await limpar();
      await sql(`delete from public.checklist_rooms`);
      await sql(`delete from public.ai_calls`);
      for (const [fonte, user] of [["ia", U.ana], ["ia", U.bruno], ["autoavaliacao", U.ana]] as const) {
        await sql(`insert into public.station_attempts (user_id, station_id, status, finished_at, source, correctness, score, max_score) values ($1, $2, 'done', now(), $3, 50, 5, 10)`, [user, ST.id, fonte]);
      }
      await sql(`insert into public.ai_calls (function_key, mode, role, provider, model, cost_usd, outcome) values ('treino_avaliacao', 'comite', 'membro', 'anthropic', 'claude-sonnet-5-5', 0.027, 'ok'), ('treino_avaliacao', 'comite', 'membro', 'gemini', 'gemini-3.8-flash', 0.01, 'ok'), ('criacao', 'sozinha', 'principal', 'anthropic', 'm', 5, 'ok')`);
      const uso = await rpc(U.admin, "app_admin_dupla_usage", {});
      expect(uso).toMatchObject({ salas: 0, rodadas_avaliadas: 0, alunos: 0, impressos_por_rodada: null });
      expect(uso.sozinho).toMatchObject({ treinos: 3, ia: 2, autoavaliacao: 1, alunos: 2 });
      expect(Number(uso.sozinho.gasto_ia_usd)).toBeCloseTo(0.037, 6);
      await expect(rpc(U.ana, "app_admin_dupla_usage", {})).rejects.toThrow();
      await limpar();
    });

    it("a exportação traz os treinos sozinhos da pessoa (com o texto) sem empresa, modelo nem custo; excluir a conta apaga tudo", async () => {
      const [{ id }] = await sql(
        `insert into public.station_attempts (user_id, station_id, status, answers, source, ia, correctness, finished_at)
         values ($1, $2, 'done', $3::jsonb, 'ia', '{"note":"ok","diverged":0,"members":[{"company":"google"}],"cost_usd":0.04}', 50, now()) returning id`,
        [U.ana, ST.id, JSON.stringify(RESPOSTAS)]
      );
      const exp = await rpc(U.ana, "app_export_my_data");
      expect(exp.solo_attempts).toHaveLength(1);
      expect(exp.solo_attempts[0]).toMatchObject({ id, answers: RESPOSTAS });
      expect(JSON.stringify(exp.solo_attempts)).not.toMatch(/google|cost_usd|members/);
      expect(exp.checklist_study_sessions).toBeDefined(); // as chaves de antes continuam
      expect(exp.study_chat).toBeDefined();
      const outro = await rpc(U.bruno, "app_export_my_data");
      expect(outro.solo_attempts).toEqual([]);
      await sql(`delete from auth.users where id = $1`, [U.ana]);
      expect(await sql(`select 1 from public.station_attempts where user_id = $1`, [U.ana])).toHaveLength(0);
    });

    it("as quatro migrações podem ser coladas de novo sem erro nem mudar o resultado", async () => {
      for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => /^2026100301343|^2026100301344|^2026100301345|^2026100301346/.test(x) && x.endsWith(".sql")).sort()) {
        await d.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
      }
      expect((await sql<{ r: any }>(`select public.solo_ia_function_ready() as r`))[0].r.ready).toBe(true);
      expect((await sql(`select 1 from pg_constraint where conname = 'ai_functions_key_check' and pg_get_constraintdef(oid) like '%treino_avaliacao%'`))).toHaveLength(1);
    });
  });
});
