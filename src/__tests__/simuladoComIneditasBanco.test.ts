// @vitest-environment node
/**
 * Testes no banco de desenvolvimento (Vitest + PGlite) para a volta das Questões Inéditas
 * aos simulados clássicos (migração 20261003012000_simulado_volta_ineditas.sql).
 *
 * Garante que:
 * 1. Simulados sem escolher prova (ou com filtros por área/tema/prova oficial, ou abertos pela Trilha) sorteiam apenas questões oficiais.
 * 2. O aluno Pro pode escolher a prova "Questões Inéditas" no simulado e recebe apenas inéditas publicadas (o treino segue como antes).
 * 3. Aluno em teste grátis respeita os limites de questões liberadas no simulado.
 * 4. Contas sem acesso (teste vencido, plano vencido, sem assinatura) são barradas pelo simulado_gate sem criar sessão.
 * 5. O Simulado TRI continua exclusivamente com questões oficiais e recusa a prova inédita.
 * 6. A matriz de calibração do TRI inclui apenas questões oficiais, ignorando simulados de inéditas.
 * 7. O aluno não vê gabarito, explicações, conduta nem códigos GR antes de responder; após finalizar, fontes de inéditas são vazias.
 * 8. Resoluções de questões inéditas em simulado contam na cota respondida do plano.
 * 9. Limitação conhecida (documentada): se o limite do plano baixar com um simulado de inéditas aberto, o Finalizar é recusado até o limite voltar.
 * 10. A migração é idempotente e o script de desfazer restaura o bloqueio com segurança.
 *
 * Primeira versão escrita pelo Gemini CLI (Vertex); conferida, ajustada e completada por Claude.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { insertStaziaQuestion, openStaziaEnv, USERS, type StaziaEnv } from "./helpers/staziamed";

vi.setConfig({ testTimeout: 180_000 });

const AREAS = [
  "CLINICA_MEDICA",
  "CIRURGIA_GERAL",
  "GINECOLOGIA_OBSTETRICIA",
  "PEDIATRIA",
  "MEDICINA_FAMILIA_COMUNIDADE",
] as const;

let env: StaziaEnv;
const idsIneditas: string[] = [];
let idRetirada: string;

beforeAll(async () => {
  env = await openStaziaEnv();

  // 30 questões inéditas ativas com áreas rotativas
  for (let i = 0; i < 30; i++) {
    const area = AREAS[i % AREAS.length];
    const qid = await insertStaziaQuestion(env, { area, correct: "A" });
    idsIneditas.push(qid);
  }

  // 1 questão inédita recolhida (fora do sorteio)
  idRetirada = await insertStaziaQuestion(env, { area: "PEDIATRIA", correct: "B", retired: true });
}, 600_000);

afterAll(async () => {
  await env?.close();
}, 60_000);

describe("Simulado com Questões Inéditas no Banco de Dados", () => {
  it("simulado sem escolher prova, por área, por tema ou por prova oficial sorteia apenas questões oficiais", async () => {
    // Busca o tema oficial mais comum no banco
    const [{ topic: topicoOficial, count: totalTopico }] = await env.sql<{ topic: string; count: number }>(
      `select topic, count(*)::int as count
       from public.questions
       where origin = 'official' and topic is not null
       group by topic
       order by count(*) desc
       limit 1`
    );
    const pedidoTema = Math.min(totalTopico, 10);

    // Busca uma prova oficial qualquer do banco
    const [{ exam_id: examIdOficial, count: totalProva }] = await env.sql<{ exam_id: string; count: number }>(
      `select exam_id, count(*)::int as count
       from public.questions
       where origin = 'official' and exam_id is not null
       group by exam_id
       order by count(*) desc
       limit 1`
    );
    const pedidoProva = Math.min(totalProva, 30);

    for (const uid of [USERS.PRO, USERS.TESTE]) {
      // 1. Simulado Rápido de 30 (sem escolher prova)
      const rapido = await env.rpc<{ session_id: string; count: number }>(uid, "app_start_session", {
        p_kind: "simulado",
        p_filters: { area: "", exam_id: "", search: "", status: "all" },
        p_count: 30,
      });
      expect(rapido.count).toBe(30);
      const [{ question_ids: idsRapido }] = await env.sql<{ question_ids: string[] }>(
        `select question_ids from public.practice_sessions where id = $1`,
        [rapido.session_id]
      );
      expect(idsRapido.length).toBe(30);
      const qsRapido = await env.sql<{ id: string; origin: string }>(
        `select id, origin from public.questions where id = any($1)`,
        [idsRapido]
      );
      expect(qsRapido.length).toBe(30);
      expect(qsRapido.every((q) => q.origin === "official")).toBe(true);

      // 2. Simulado Geral de 100 (sem escolher prova)
      const geral = await env.rpc<{ session_id: string; count: number }>(uid, "app_start_session", {
        p_kind: "simulado",
        p_filters: { area: "", exam_id: "", search: "", status: "all" },
        p_count: 100,
      });
      expect(geral.count).toBe(100);
      const [{ question_ids: idsGeral }] = await env.sql<{ question_ids: string[] }>(
        `select question_ids from public.practice_sessions where id = $1`,
        [geral.session_id]
      );
      expect(idsGeral.length).toBe(100);
      const qsGeral = await env.sql<{ id: string; origin: string }>(
        `select id, origin from public.questions where id = any($1)`,
        [idsGeral]
      );
      expect(qsGeral.length).toBe(100);
      expect(qsGeral.every((q) => q.origin === "official")).toBe(true);

      // 3. Simulado por área (PEDIATRIA, 50 questões)
      const porArea = await env.rpc<{ session_id: string; count: number }>(uid, "app_start_session", {
        p_kind: "simulado",
        p_filters: { area: "PEDIATRIA", exam_id: "", search: "", status: "all" },
        p_count: 50,
      });
      expect(porArea.count).toBe(50);
      const [{ question_ids: idsArea }] = await env.sql<{ question_ids: string[] }>(
        `select question_ids from public.practice_sessions where id = $1`,
        [porArea.session_id]
      );
      expect(idsArea.length).toBe(50);
      const qsArea = await env.sql<{ id: string; origin: string; area: string }>(
        `select id, origin, area from public.questions where id = any($1)`,
        [idsArea]
      );
      expect(qsArea.length).toBe(50);
      expect(qsArea.every((q) => q.origin === "official" && q.area === "PEDIATRIA")).toBe(true);

      // 4. Simulado por tema (o mais comum das oficiais)
      const porTema = await env.rpc<{ session_id: string; count: number }>(uid, "app_start_session", {
        p_kind: "simulado",
        p_filters: { area: "", exam_id: "", topic: topicoOficial, search: "", status: "all" },
        p_count: pedidoTema,
      });
      expect(porTema.count).toBe(pedidoTema);
      const [{ question_ids: idsTema }] = await env.sql<{ question_ids: string[] }>(
        `select question_ids from public.practice_sessions where id = $1`,
        [porTema.session_id]
      );
      expect(idsTema.length).toBe(pedidoTema);
      const qsTema = await env.sql<{ id: string; origin: string; topic: string }>(
        `select id, origin, topic from public.questions where id = any($1)`,
        [idsTema]
      );
      expect(qsTema.length).toBe(pedidoTema);
      expect(qsTema.every((q) => q.origin === "official" && q.topic === topicoOficial)).toBe(true);

      // 5. Simulado de prova oficial
      const porProva = await env.rpc<{ session_id: string; count: number }>(uid, "app_start_session", {
        p_kind: "simulado",
        p_filters: { area: "", exam_id: examIdOficial, search: "", status: "all" },
        p_count: pedidoProva,
      });
      expect(porProva.count).toBe(pedidoProva);
      const [{ question_ids: idsProva }] = await env.sql<{ question_ids: string[] }>(
        `select question_ids from public.practice_sessions where id = $1`,
        [porProva.session_id]
      );
      expect(idsProva.length).toBe(pedidoProva);
      const qsProva = await env.sql<{ id: string; origin: string; exam_id: string }>(
        `select id, origin, exam_id from public.questions where id = any($1)`,
        [idsProva]
      );
      expect(qsProva.length).toBe(pedidoProva);
      expect(qsProva.every((q) => q.origin === "official" && q.exam_id === examIdOficial)).toBe(true);
    }
  });

  it("simulado de área aberto pela Trilha (app_start_trail_node sem tema) segue só com oficiais, mesmo com inéditas no banco", async () => {
    const res = await env.rpc<{ session_id: string; count: number }>(USERS.PRO, "app_start_trail_node", { p_area: "PEDIATRIA", p_topic: null });
    expect(res.count).toBe(30);
    const [{ question_ids }] = await env.sql<{ question_ids: string[] }>(`select question_ids from public.practice_sessions where id = $1`, [res.session_id]);
    const qs = await env.sql<{ origin: string; area: string }>(`select origin, area from public.questions where id = any($1)`, [question_ids]);
    expect(qs.length).toBe(30);
    expect(qs.every((q) => q.origin === "official" && q.area === "PEDIATRIA")).toBe(true);
  });

  it("o treino (Banco de questões) continua com a prova 'Questões Inéditas', como antes", async () => {
    const res = await env.rpc<{ session_id: string; count: number }>(USERS.PRO, "app_start_session", {
      p_kind: "questoes",
      p_filters: { area: "", exam_id: "staziamed", search: "", status: "unanswered" },
      p_count: 5,
    });
    expect(res.count).toBe(5);
    const [{ question_ids, kind }] = await env.sql<{ question_ids: string[]; kind: string }>(`select question_ids, kind from public.practice_sessions where id = $1`, [res.session_id]);
    expect(kind).toBe("questoes");
    const qs = await env.sql<{ origin: string }>(`select origin from public.questions where id = any($1)`, [question_ids]);
    expect(qs.every((q) => q.origin === "staziamed")).toBe(true);
  });

  it("aluno Pro escolhe a prova 'Questões Inéditas' no simulado: recebe apenas inéditas publicadas", async () => {
    // Pedindo 20 inéditas com tempo limite de 3600 segundos
    const res20 = await env.rpc<{ session_id: string; count: number }>(USERS.PRO, "app_start_session", {
      p_kind: "simulado",
      p_filters: { area: "", exam_id: "staziamed", search: "", status: "all" },
      p_count: 20,
      p_time_limit_seconds: 3600,
    });
    expect(res20.count).toBe(20);

    const [sess20] = await env.sql<{
      kind: string;
      time_limit_seconds: number;
      config: { filters?: { exam_id?: string } };
      question_ids: string[];
    }>(
      `select kind, time_limit_seconds, config, question_ids from public.practice_sessions where id = $1`,
      [res20.session_id]
    );
    expect(sess20.kind).toBe("simulado");
    expect(sess20.time_limit_seconds).toBe(3600);
    expect(sess20.config?.filters?.exam_id).toBe("staziamed");
    expect(sess20.question_ids.length).toBe(20);

    const qs20 = await env.sql<{ id: string; origin: string; retired_at: string | null }>(
      `select id, origin, retired_at from public.questions where id = any($1)`,
      [sess20.question_ids]
    );
    expect(qs20.length).toBe(20);
    expect(qs20.every((q) => q.origin === "staziamed" && q.retired_at === null)).toBe(true);
    expect(sess20.question_ids).not.toContain(idRetirada);

    // Pedindo 100 inéditas: devolve só as 30 existentes (publicadas), nunca a recolhida
    const res100 = await env.rpc<{ session_id: string; count: number }>(USERS.PRO, "app_start_session", {
      p_kind: "simulado",
      p_filters: { area: "", exam_id: "staziamed", search: "", status: "all" },
      p_count: 100,
      p_time_limit_seconds: 3600,
    });
    expect(res100.count).toBe(30);

    const [sess100] = await env.sql<{ question_ids: string[] }>(
      `select question_ids from public.practice_sessions where id = $1`,
      [res100.session_id]
    );
    expect(sess100.question_ids.length).toBe(30);

    const qs100 = await env.sql<{ id: string; origin: string; retired_at: string | null }>(
      `select id, origin, retired_at from public.questions where id = any($1)`,
      [sess100.question_ids]
    );
    expect(qs100.length).toBe(30);
    expect(qs100.every((q) => q.origin === "staziamed" && q.retired_at === null)).toBe(true);
    expect(sess100.question_ids).not.toContain(idRetirada);

    // Por área + prova inédita (como na tela): só as inéditas daquela área; das 30 publicadas, 6 são de PEDIATRIA (a recolhida não conta)
    const porArea = await env.rpc<{ session_id: string; count: number }>(USERS.PRO, "app_start_session", {
      p_kind: "simulado",
      p_filters: { area: "PEDIATRIA", exam_id: "staziamed", search: "", status: "all" },
      p_count: 50,
    });
    expect(porArea.count).toBe(6);
    const [{ question_ids: idsPorArea }] = await env.sql<{ question_ids: string[] }>(
      `select question_ids from public.practice_sessions where id = $1`,
      [porArea.session_id]
    );
    const qsPorArea = await env.sql<{ origin: string; area: string }>(`select origin, area from public.questions where id = any($1)`, [idsPorArea]);
    expect(qsPorArea.length).toBe(6);
    expect(qsPorArea.every((q) => q.origin === "staziamed" && q.area === "PEDIATRIA")).toBe(true);
  });

  it("limite do plano no simulado: aluno em teste grátis recebe apenas as inéditas liberadas e respeita mudanças de limite", async () => {
    const liberadasInicial = (
      await env.sqlAs<{ id: string }>(USERS.TESTE, `select public.ineditas_released_ids() as id`)
    ).map((r) => r.id);
    expect(liberadasInicial.length).toBe(20);

    // Pedindo 100 inéditas, recebe exatamente as 20 liberadas; repetir 3 vezes dá o mesmo conjunto
    for (let i = 0; i < 3; i++) {
      const s = await env.rpc<{ session_id: string; count: number }>(USERS.TESTE, "app_start_session", {
        p_kind: "simulado",
        p_filters: { area: "", exam_id: "staziamed", search: "", status: "all" },
        p_count: 100,
      });
      expect(s.count).toBe(20);

      const [{ question_ids }] = await env.sql<{ question_ids: string[] }>(
        `select question_ids from public.practice_sessions where id = $1`,
        [s.session_id]
      );
      expect(question_ids.length).toBe(20);
      expect([...question_ids].sort()).toEqual([...liberadasInicial].sort());
    }

    try {
      // Administrador reduz o limite do teste grátis para 5
      await env.rpc(USERS.ADMIN, "app_admin_save_ineditas_limits", { p_limits: { trial: 5 } });

      const liberadas5 = (
        await env.sqlAs<{ id: string }>(USERS.TESTE, `select public.ineditas_released_ids() as id`)
      ).map((r) => r.id);
      expect(liberadas5.length).toBe(5);

      const s5 = await env.rpc<{ session_id: string; count: number }>(USERS.TESTE, "app_start_session", {
        p_kind: "simulado",
        p_filters: { area: "", exam_id: "staziamed", search: "", status: "all" },
        p_count: 100,
      });
      expect(s5.count).toBe(5);

      const [{ question_ids: qids5 }] = await env.sql<{ question_ids: string[] }>(
        `select question_ids from public.practice_sessions where id = $1`,
        [s5.session_id]
      );
      expect(qids5.length).toBe(5);
      expect(qids5.every((q) => liberadas5.includes(q))).toBe(true);

      // Reduzindo para 0: o simulado é recusado com erro "Nenhuma questão encontrada com esses filtros."
      await env.rpc(USERS.ADMIN, "app_admin_save_ineditas_limits", { p_limits: { trial: 0 } });

      await expect(
        env.rpc(USERS.TESTE, "app_start_session", {
          p_kind: "simulado",
          p_filters: { area: "", exam_id: "staziamed", search: "", status: "all" },
          p_count: 100,
        })
      ).rejects.toThrow(/Nenhuma questão encontrada/);
    } finally {
      // Restaura o limite padrão do teste grátis (20)
      await env.rpc(USERS.ADMIN, "app_admin_save_ineditas_limits", { p_limits: { trial: 20 } });
    }
  });

  it("teste vencido, plano vencido e sem assinatura: simulado de inéditas e comum são recusados pelo simulado_gate sem criar sessão", async () => {
    const usuariosBloqueados = [USERS.TESTE_VENCIDO, USERS.PRO_VENCIDO, USERS.SEM_PLANO];
    const filtros = [
      { area: "", exam_id: "staziamed", search: "", status: "all" },
      { area: "", exam_id: "", search: "", status: "all" },
    ];

    for (const uid of usuariosBloqueados) {
      for (const p_filters of filtros) {
        const [{ count: antes }] = await env.sql<{ count: number }>(
          `select count(*)::int as count from public.practice_sessions where user_id = $1`,
          [uid]
        );

        // a recusa vem da trava do simulado (teste vencido / plano vencido / sem assinatura), nunca da frase antiga da 010800
        const erro: any = await env.rpc(uid, "app_start_session", { p_kind: "simulado", p_filters, p_count: 20 }).then(
          () => null,
          (e) => e
        );
        expect(erro, `${uid} ${JSON.stringify(p_filters)}`).not.toBeNull();
        expect(erro.message).toMatch(/Os simulados completos/);
        expect(erro.message).not.toMatch(/Simulados usam apenas questões oficiais do Inep/);

        const [{ count: depois }] = await env.sql<{ count: number }>(
          `select count(*)::int as count from public.practice_sessions where user_id = $1`,
          [uid]
        );
        expect(depois).toBe(antes);
      }
    }
  });

  it("simulado TRI continua apenas com questões oficiais e recusa a prova inédita em qualquer grafia", async () => {
    // Simulado TRI comum para USERS.PRO com 30 questões oficiais
    const triOficial = await env.rpc<{ session_id: string; count: number; scoring: string }>(
      USERS.PRO,
      "app_start_simulado_tri",
      {
        p_filters: { area: "", exam_id: "", search: "", status: "all" },
        p_count: 30,
      }
    );
    expect(triOficial.count).toBe(30);
    expect(triOficial.scoring).toBe("irt");

    const [sessTri] = await env.sql<{
      question_ids: string[];
      config: { scoring?: string };
    }>(
      `select question_ids, config from public.practice_sessions where id = $1`,
      [triOficial.session_id]
    );
    expect(sessTri.config?.scoring).toBe("irt");
    expect(sessTri.question_ids.length).toBe(30);

    const qsTri = await env.sql<{ id: string; origin: string }>(
      `select id, origin from public.questions where id = any($1)`,
      [sessTri.question_ids]
    );
    expect(qsTri.length).toBe(30);
    expect(qsTri.every((q) => q.origin === "official")).toBe(true);

    // Variações de grafia da prova inédita no TRI: recusa com aviso específico e sem criar sessão
    const variacoes = ["staziamed", " STAZIAMED ", "StaziaMed"];
    for (const examId of variacoes) {
      const [{ count: antes }] = await env.sql<{ count: number }>(
        `select count(*)::int as count from public.practice_sessions where user_id = $1`,
        [USERS.PRO]
      );

      const erro: any = await env
        .rpc(USERS.PRO, "app_start_simulado_tri", { p_filters: { area: "", exam_id: examId, search: "", status: "all" }, p_count: 30 })
        .then(
          () => null,
          (e) => e
        );
      expect(erro, `prova "${examId}"`).not.toBeNull();
      expect(erro.message).toMatch(/O simulado TRI usa apenas questões oficiais do Inep/);
      expect(erro.message).toMatch(/escolha a correção Clássica/);
      // a frase antiga dizia que as inéditas são "exclusivas do treino", o que deixou de ser verdade
      expect(erro.message).not.toMatch(/exclusivas do banco de questões de treino/);

      const [{ count: depois }] = await env.sql<{ count: number }>(
        `select count(*)::int as count from public.practice_sessions where user_id = $1`,
        [USERS.PRO]
      );
      expect(depois).toBe(antes);
    }
  });

  it("matriz de calibração do TRI só inclui questões oficiais, mesmo após simulado clássico de inéditas finalizado", async () => {
    // 1. Simulado clássico de 20 inéditas com USERS.PRO: responde todas e finaliza
    const sIned = await env.rpc<{ session_id: string; count: number }>(USERS.PRO, "app_start_session", {
      p_kind: "simulado",
      p_filters: { area: "", exam_id: "staziamed", search: "", status: "all" },
      p_count: 20,
    });
    const [{ question_ids: idsIned }] = await env.sql<{ question_ids: string[] }>(
      `select question_ids from public.practice_sessions where id = $1`,
      [sIned.session_id]
    );
    for (const qid of idsIned) {
      await env.rpc(USERS.PRO, "app_answer_question", {
        p_session_id: sIned.session_id,
        p_question_id: qid,
        p_option: "A",
        p_active_ms: 1000,
      });
    }
    await env.rpc(USERS.PRO, "app_finish_session", { p_session_id: sIned.session_id });

    // 2. Simulado clássico de 30 oficiais com USERS.PRO: responde 100% (>= 80%) e finaliza
    const sOfic = await env.rpc<{ session_id: string; count: number }>(USERS.PRO, "app_start_session", {
      p_kind: "simulado",
      p_filters: {},
      p_count: 30,
    });
    const [{ question_ids: idsOfic }] = await env.sql<{ question_ids: string[] }>(
      `select question_ids from public.practice_sessions where id = $1`,
      [sOfic.session_id]
    );
    for (const qid of idsOfic) {
      await env.rpc(USERS.PRO, "app_answer_question", {
        p_session_id: sOfic.session_id,
        p_question_id: qid,
        p_option: "A",
        p_active_ms: 1000,
      });
    }
    await env.rpc(USERS.PRO, "app_finish_session", { p_session_id: sOfic.session_id });

    // 3. Matriz de calibração: 0 questões inéditas e > 0 questões oficiais
    const [{ count: naoOficiais }] = await env.sql<{ count: number }>(
      `select count(*)::int as count
       from public.irt_calibration_matrix() m
       join public.questions q on q.id = m.question_id
       where q.origin <> 'official'`
    );
    expect(naoOficiais).toBe(0);

    const [{ count: oficiais }] = await env.sql<{ count: number }>(
      `select count(*)::int as count
       from public.irt_calibration_matrix() m
       join public.questions q on q.id = m.question_id
       where q.origin = 'official'`
    );
    expect(oficiais).toBeGreaterThan(0);
  });

  it("aluno não vê gabarito, explicação, fontes nem códigos GR antes de responder; após finalizar, fontes de inéditas são vazias", async () => {
    // Abre simulado de 5 inéditas
    const s7 = await env.rpc<{ session_id: string; count: number }>(USERS.PRO, "app_start_session", {
      p_kind: "simulado",
      p_filters: { area: "", exam_id: "staziamed", search: "", status: "all" },
      p_count: 5,
    });
    expect(s7.count).toBe(5);

    const sessAberto = await env.rpc<any>(USERS.PRO, "app_get_session", {
      p_session_id: s7.session_id,
    });

    expect(sessAberto.questions.length).toBe(5);
    for (const q of sessAberto.questions) {
      expect(q.correction).toBeNull();
      expect(q.origin).toBe("staziamed");
      for (const opt of q.options) {
        expect(Object.keys(opt).sort()).toEqual(["id", "text"]);
      }
    }

    const jsonAberto = JSON.stringify(sessAberto);
    expect(jsonAberto).not.toContain("explanation");
    expect(jsonAberto).not.toContain("correct_option");
    expect(jsonAberto).not.toContain("official_sources");
    expect(jsonAberto).not.toContain("expected_conduct");
    expect(jsonAberto).not.toContain("source_quotes");
    expect(/GR-\d/.test(jsonAberto)).toBe(false);

    // Responde as 5 questões com a opção "A"
    for (const q of sessAberto.questions) {
      await env.rpc(USERS.PRO, "app_answer_question", {
        p_session_id: s7.session_id,
        p_question_id: q.id,
        p_option: "A",
        p_active_ms: 1000,
      });
    }

    // Finaliza a sessão
    await env.rpc(USERS.PRO, "app_finish_session", { p_session_id: s7.session_id });

    const sessFinalizada = await env.rpc<any>(USERS.PRO, "app_get_session", {
      p_session_id: s7.session_id,
    });

    expect(sessFinalizada.questions.length).toBe(5);
    for (const q of sessFinalizada.questions) {
      expect(q.correction).not.toBeNull();
      expect(q.correction.sources).toEqual([]);
      expect(q.correction.official_sources).toBeNull();
    }
  });

  it("responder questão inédita no simulado conta dentro do limite do plano de teste grátis", async () => {
    const statusAntes = await env.rpc<any>(USERS.TESTE, "app_my_ineditas");
    expect(statusAntes).toMatchObject({ released: 20, answered: 0 });

    const liberadasAntes = (
      await env.sqlAs<{ id: string }>(USERS.TESTE, `select public.ineditas_released_ids() as id`)
    ).map((r) => r.id);
    expect(liberadasAntes.length).toBe(20);

    // Abre simulado de 10 inéditas
    const s8 = await env.rpc<{ session_id: string; count: number }>(USERS.TESTE, "app_start_session", {
      p_kind: "simulado",
      p_filters: { area: "", exam_id: "staziamed", search: "", status: "all" },
      p_count: 10,
    });
    expect(s8.count).toBe(10);

    const [{ question_ids: idsSimulado }] = await env.sql<{ question_ids: string[] }>(
      `select question_ids from public.practice_sessions where id = $1`,
      [s8.session_id]
    );
    expect(idsSimulado.length).toBe(10);

    // Responde as 10 questões e finaliza
    for (const qid of idsSimulado) {
      await env.rpc(USERS.TESTE, "app_answer_question", {
        p_session_id: s8.session_id,
        p_question_id: qid,
        p_option: "A",
        p_active_ms: 1000,
      });
    }
    await env.rpc(USERS.TESTE, "app_finish_session", { p_session_id: s8.session_id });

    // app_my_ineditas mostra released: 20 e answered: 10
    const statusDepois = await env.rpc<any>(USERS.TESTE, "app_my_ineditas");
    expect(statusDepois).toMatchObject({ released: 20, answered: 10 });

    // Novo simulado continua dentro das mesmas 20 liberadas
    const liberadasDepois = (
      await env.sqlAs<{ id: string }>(USERS.TESTE, `select public.ineditas_released_ids() as id`)
    ).map((r) => r.id);
    expect(liberadasDepois.length).toBe(20);
    expect([...liberadasDepois].sort()).toEqual([...liberadasAntes].sort());

    const s8Novo = await env.rpc<{ session_id: string; count: number }>(USERS.TESTE, "app_start_session", {
      p_kind: "simulado",
      p_filters: { area: "", exam_id: "staziamed", search: "", status: "all" },
      p_count: 20,
    });
    expect(s8Novo.count).toBe(20);

    const [{ question_ids: idsNovo }] = await env.sql<{ question_ids: string[] }>(
      `select question_ids from public.practice_sessions where id = $1`,
      [s8Novo.session_id]
    );
    expect(idsNovo.every((id) => liberadasAntes.includes(id))).toBe(true);
  });

  it("limitação conhecida: se o limite baixar com um simulado de inéditas aberto, o Finalizar é recusado até o limite voltar (as respostas ficam guardadas na sessão)", async () => {
    // O simulado guarda as respostas na própria sessão e só grava as tentativas ao finalizar; é nesse momento que o gatilho de resposta
    // confere o plano. Hoje isso vale também para a carga de questões novas (troca as ainda não respondidas) e para o fim do teste grátis.
    // Se um dia isto for tratado (ex.: a sessão aberta manter o acesso às questões que já sorteou), troque as expectativas abaixo.
    // "unanswered": sorteia só entre as liberadas que ele ainda não respondeu (as 10 respondidas no teste anterior continuariam liberadas
    // com o limite em 0 e o resultado dependeria do sorteio)
    const aberto = await env.rpc<{ session_id: string; count: number }>(USERS.TESTE, "app_start_session", {
      p_kind: "simulado",
      p_filters: { area: "", exam_id: "staziamed", search: "", status: "unanswered" },
      p_count: 5,
      p_time_limit_seconds: 3600,
    });
    expect(aberto.count).toBe(5);
    const [{ question_ids }] = await env.sql<{ question_ids: string[] }>(`select question_ids from public.practice_sessions where id = $1`, [aberto.session_id]);
    for (const q of question_ids) {
      await env.rpc(USERS.TESTE, "app_answer_question", { p_session_id: aberto.session_id, p_question_id: q, p_option: "A", p_active_ms: 1000 });
    }
    try {
      await env.rpc(USERS.ADMIN, "app_admin_save_ineditas_limits", { p_limits: { trial: 0 } });
      await expect(env.rpc(USERS.TESTE, "app_finish_session", { p_session_id: aberto.session_id })).rejects.toThrow(/não está liberada no seu plano/);
      const [sessao] = await env.sql<{ finished_at: string | null; answers: Record<string, unknown> }>(`select finished_at, answers from public.practice_sessions where id = $1`, [aberto.session_id]);
      expect(sessao.finished_at).toBeNull();
      expect(Object.keys(sessao.answers).sort()).toEqual([...question_ids].sort());
    } finally {
      await env.rpc(USERS.ADMIN, "app_admin_save_ineditas_limits", { p_limits: { trial: 20 } });
    }
    const fim = await env.rpc<any>(USERS.TESTE, "app_finish_session", { p_session_id: aberto.session_id });
    expect(fim.finished_at).toBeTruthy();
    expect(fim.result).toMatchObject({ total: 5, answered: 5, correct: 5 });
  });

  it("reaplicar a migração é idempotente e o roteiro de desfazer restaura o bloqueio com segurança", async () => {
    const caminhoMigracao = path.resolve(__dirname, "../../supabase/migrations/20261003012000_simulado_volta_ineditas.sql");
    const caminhoDesfazer = path.resolve(__dirname, "../../supabase/desfazer/20261003012000_simulado_volta_ineditas.desfazer.sql");
    const caminhoConferir = path.resolve(__dirname, "../../supabase/conferir/simulado-ineditas.sql");

    const sqlMigracao = fs.readFileSync(caminhoMigracao, "utf8");
    const sqlDesfazer = fs.readFileSync(caminhoDesfazer, "utf8");
    const sqlConferir = fs.readFileSync(caminhoConferir, "utf8");

    try {
      // 1. Aplica a migração duas vezes consecutivas sem erro
      await env.dev.db.exec(sqlMigracao);
      await env.dev.db.exec(sqlMigracao);

      // Confere que o roteiro retorna OK:
      const [conferirOk1] = await env.sql<{ resultado: string }>(sqlConferir);
      expect(conferirOk1.resultado).toMatch(/^OK:/);

      // 2. Aplica o script de desfazer
      await env.dev.db.exec(sqlDesfazer);

      // O simulado de inéditas volta a ser recusado com a mensagem antiga
      await expect(
        env.rpc(USERS.PRO, "app_start_session", {
          p_kind: "simulado",
          p_filters: { area: "", exam_id: "staziamed", search: "", status: "all" },
          p_count: 5,
        })
      ).rejects.toThrow(/Simulados usam apenas questões oficiais do Inep/);

      // O roteiro de conferência acusa a falta e cita "ainda recusa"
      const [conferirFalta] = await env.sql<{ resultado: string }>(sqlConferir);
      expect(conferirFalta.resultado).toMatch(/^FALTA:/);
      expect(conferirFalta.resultado).toContain("ainda recusa");

      // 3. Aplica a migração novamente
      await env.dev.db.exec(sqlMigracao);

      // O simulado de inéditas volta a funcionar
      const sRestaurado = await env.rpc<{ session_id: string; count: number }>(USERS.PRO, "app_start_session", {
        p_kind: "simulado",
        p_filters: { area: "", exam_id: "staziamed", search: "", status: "all" },
        p_count: 5,
      });
      expect(sRestaurado.count).toBe(5);

      // O roteiro volta a responder OK:
      const [conferirOk2] = await env.sql<{ resultado: string }>(sqlConferir);
      expect(conferirOk2.resultado).toMatch(/^OK:/);
    } finally {
      // Garante que o estado final do banco mantenha a migração aplicada
      await env.dev.db.exec(sqlMigracao);
    }
  });
});
