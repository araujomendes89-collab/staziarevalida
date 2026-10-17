// @vitest-environment node
/**
 * Testes do banco da 2ª fase (Postgres real em memória via PGlite).
 * Cobre a migração 20261003013330_fase2_telas_reais.sql e seu desfazer:
 *  1. Acesso (estudante e visitante recusados em app_fase2_* e station_attempts trancada; equipe entra)
 *  2. Catálogo (apenas aprovadas, sem conteúdo secreto, contadores zerados)
 *  3. Estado vazio honesto (overview, peps e performance vazios/nulos sem dados inventados)
 *  4. Gabarito na hora certa (leitura sem impressos/checklist; atendimento com impressos; scoring com checklist; sem roteiro do ator)
 *  5. Ordem das etapas (finish antes de begin falha; submit antes de finish falha; begin repetido não reinicia; pendente falha)
 *  6. Nota calculada pelo servidor (correct=10, incorrect=0, nota parcial exata, validação de marcações, proteção contra alteração)
 *  7. Isolamento entre usuários (não abre nem lista tentativas de outrem)
 *  8. Retomar e trocar (mesma estação retoma; outra estação abandona anterior; abandon explícito)
 *  9. Painéis com dados reais (2 solo + 1 dupla: overview, peps, performance por área/fase/perdas e catálogo atualizado)
 * 10. Desfazer da migração (remove funções e tabela station_attempts com sucesso)
 */

import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const DESFAZER = path.join(ROOT, "supabase/desfazer/20261003013330_fase2_telas_reais.desfazer.sql");

const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const EDITOR = "00000000-0000-4000-8000-0000000000e1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const OUTRO = "00000000-0000-4000-8000-0000000000b2";

let db: PGlite;

async function rpc<T = any>(uid: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await tx.query<{ result: T }>(
      `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`,
      keys.map((k) => args[k])
    );
    return r.rows[0].result;
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }

  // Usuários do teste
  await db.query(
    `insert into auth.users (id, email) values ($1, 'adm@t.dev'), ($2, 'ed@t.dev'), ($3, 'st@t.dev'), ($4, 'ou@t.dev')`,
    [ADMIN, EDITOR, STUDENT, OUTRO]
  );
  await db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [ADMIN]);
  await db.query(`update public.user_roles set role = 'editor' where user_id = $1`, [EDITOR]);

  // Estações de teste: duas aprovadas ('st-cm' e 'st-ped') e uma pendente ('st-pend')
  await db.exec(`
    insert into public.checklist_stations (id, name, topic, area, setting, medical_review, duration_ms) values
      ('st-cm', 'Cetoacidose diabética', 'DM1 descompensado', 'Clínica Médica', 'Pronto-socorro', 'approved', 600000),
      ('st-ped', 'Bronquiolite viral aguda', 'BVA no lactente', 'Pediatria', 'Ambulatório', 'approved', 600000),
      ('st-pend', 'Apendicite aguda', 'Abdome agudo', 'Cirurgia Geral', 'Pronto-socorro', 'pending', 600000);
  `);

  // Conteúdo da estação st-cm (6 itens de checklist somando 10,0 pontos; com parciais numéricos e nulos)
  const contentCm = {
    id: "st-cm",
    doctor_scene: "Pronto-socorro adulto. Paciente de 24 anos com náuseas, vômitos e dor abdominal.",
    doctor_tasks: "Realizar anamnese dirigida, exame físico direcionado, solicitar exames e definir conduta.",
    actor_script: "Você é o paciente. SEGREDO-DO-ATOR: mostre sonolência e responda apenas o perguntado.",
    pressings: [
      { id: "p1", name: "Gasometria venosa", content: "pH 7.15 | HCO3 8 mEq/L | pCO2 22 mmHg" },
      { id: "p2", name: "Glicemia capilar", content: "Glicemia 480 mg/dL | Cetonemia 3+" }
    ],
    checklist_items: [
      {
        order: 1,
        phase: "Apresentação",
        content: "GABARITO-ITEM-UM: Apresenta-se cordialmente e solicita consentimento do paciente.",
        tip: "",
        grades: { correct: 1.0, partial: null, incorrect: 0 },
        criteria: { correct: "Apresenta-se adequadamente.", incorrect: "Não se apresenta." },
        subitems: []
      },
      {
        order: 2,
        phase: "Anamnese",
        content: "Investiga sintomas de poliúria, polidipsia e tempo de evolução dos sintomas.",
        tip: "",
        grades: { correct: 2.0, partial: 1.0, incorrect: 0 },
        criteria: { correct: "Investiga ambos.", partial: "Investiga apenas um.", incorrect: "Não investiga." },
        subitems: [{ id: "2.1", text: "Poliúria" }, { id: "2.2", text: "Polidipsia" }]
      },
      {
        order: 3,
        phase: "Exame físico",
        content: "Avalia hidratação, sinais vitais e padrão respiratório compatível com acidose.",
        tip: "",
        grades: { correct: 2.0, partial: 1.0, incorrect: 0 },
        criteria: { correct: "Avalia todos.", partial: "Avalia parcialmente.", incorrect: "Não avalia." },
        subitems: []
      },
      {
        order: 4,
        phase: "Exames complementares",
        content: "Solicita gasometria venosa e bioquímica com eletrólitos e função renal.",
        tip: "",
        grades: { correct: 1.5, partial: 0.75, incorrect: 0 },
        criteria: { correct: "Solicita ambos.", partial: "Solicita apenas um.", incorrect: "Não solicita." },
        subitems: []
      },
      {
        order: 5,
        phase: "Diagnóstico",
        content: "Verbaliza hipótese diagnóstica de Cetoacidose Diabética descompensada.",
        tip: "",
        grades: { correct: 1.5, partial: null, incorrect: 0 },
        criteria: { correct: "Cita CAD.", incorrect: "Não cita CAD." },
        subitems: []
      },
      {
        order: 6,
        phase: "Conduta",
        content: "Prescreve hidratação venosa vigorosa com SF 0,9% e inicia insulinoterapia regular.",
        tip: "",
        grades: { correct: 2.0, partial: 1.0, incorrect: 0 },
        criteria: { correct: "Prescreve soro e insulina.", partial: "Prescreve só um.", incorrect: "Não prescreve." },
        subitems: []
      }
    ]
  };

  // Conteúdo da estação st-ped (6 itens somando 10,0 pontos)
  const contentPed = {
    id: "st-ped",
    doctor_scene: "Ambulatório de Pediatria. Lactente de 6 meses acompanhado da mãe com tosse e coriza há 3 dias.",
    doctor_tasks: "Realizar anamnese, exame físico e orientações pertinentes ao caso.",
    actor_script: "Você é a mãe da criança. SEGREDO-DO-ATOR-PED: mencione febre baixa há 2 dias.",
    pressings: [
      { id: "p1", name: "Oximetria de pulso", content: "SatO2 96% em ar ambiente" }
    ],
    checklist_items: [
      {
        order: 1,
        phase: "Acolhimento",
        content: "Acolhe a mãe, higieniza as mãos e identifica o paciente.",
        tip: "",
        grades: { correct: 1.0, partial: null, incorrect: 0 },
        criteria: {},
        subitems: []
      },
      {
        order: 2,
        phase: "Anamnese",
        content: "Indaga sobre aceitação alimentar, febre e padrão do esforço respiratório.",
        tip: "",
        grades: { correct: 2.0, partial: 1.0, incorrect: 0 },
        criteria: {},
        subitems: []
      },
      {
        order: 3,
        phase: "Exame físico",
        content: "Realiza ausculta respiratória e avalia tiragens subcostais e intercostais.",
        tip: "",
        grades: { correct: 2.0, partial: 1.0, incorrect: 0 },
        criteria: {},
        subitems: []
      },
      {
        order: 4,
        phase: "Diagnóstico",
        content: "Informa diagnóstico provável de Bronquiolite Viral Aguda.",
        tip: "",
        grades: { correct: 2.0, partial: null, incorrect: 0 },
        criteria: {},
        subitems: []
      },
      {
        order: 5,
        phase: "Conduta",
        content: "Orienta lavagem nasal frequente com soro fisiológico e fracionamento das mamadas.",
        tip: "",
        grades: { correct: 2.0, partial: 1.0, incorrect: 0 },
        criteria: {},
        subitems: []
      },
      {
        order: 6,
        phase: "Orientações",
        content: "Explica sinais de alerta para retorno imediato (tiragem, cianose, recusa hídrica).",
        tip: "",
        grades: { correct: 1.0, partial: 0.5, incorrect: 0 },
        criteria: {},
        subitems: []
      }
    ]
  };

  const contentPend = {
    id: "st-pend",
    doctor_scene: "Pronto-socorro cirúrgico.",
    doctor_tasks: "Examine o abdome.",
    actor_script: "SEGREDO-DO-ATOR-PEND",
    pressings: [],
    checklist_items: [
      {
        order: 1,
        phase: "Conduta",
        content: "Indica apendicectomia de urgência.",
        grades: { correct: 10.0, partial: null, incorrect: 0 }
      }
    ]
  };

  await db.query(
    `insert into public.checklist_station_contents (station_id, content) values ($1, $2), ($3, $4), ($5, $6)`,
    [
      "st-cm", JSON.stringify(contentCm),
      "st-ped", JSON.stringify(contentPed),
      "st-pend", JSON.stringify(contentPend)
    ]
  );
}, 300_000);

describe("Banco da 2ª Fase (PGlite) - Migração 20261003013330_fase2_telas_reais", () => {
  it("1. Acesso: aluno e visitante são recusados em todas as funções app_fase2_*; station_attempts e internas são trancadas; equipe entra", async () => {
    // Aluno autenticado é recusado com erro específico em todas as funções
    await expect(rpc(STUDENT, "app_fase2_overview")).rejects.toThrow(/ainda não está aberta/);
    await expect(rpc(STUDENT, "app_fase2_stations")).rejects.toThrow(/ainda não está aberta/);
    await expect(rpc(STUDENT, "app_fase2_attempt", { p_attempt_id: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(/ainda não está aberta/);
    await expect(rpc(STUDENT, "app_fase2_start", { p_station_id: "st-cm" })).rejects.toThrow(/ainda não está aberta/);
    await expect(rpc(STUDENT, "app_fase2_begin", { p_attempt_id: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(/ainda não está aberta/);
    await expect(rpc(STUDENT, "app_fase2_finish", { p_attempt_id: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(/ainda não está aberta/);
    await expect(rpc(STUDENT, "app_fase2_submit", { p_attempt_id: "00000000-0000-0000-0000-000000000000", p_marks: {} })).rejects.toThrow(/ainda não está aberta/);
    await expect(rpc(STUDENT, "app_fase2_abandon", { p_attempt_id: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(/ainda não está aberta/);
    await expect(rpc(STUDENT, "app_fase2_peps", { p_limit: 10 })).rejects.toThrow(/ainda não está aberta/);
    await expect(rpc(STUDENT, "app_fase2_performance")).rejects.toThrow(/ainda não está aberta/);

    // Visitante anônimo é recusado por falta de permissão de execução
    await expect(rpc(null, "app_fase2_overview")).rejects.toThrow(/permission denied/i);
    await expect(rpc(null, "app_fase2_stations")).rejects.toThrow(/permission denied/i);
    await expect(rpc(null, "app_fase2_start", { p_station_id: "st-cm" })).rejects.toThrow(/permission denied/i);

    // Equipe entra normalmente
    const overviewEd = await rpc(EDITOR, "app_fase2_overview");
    expect(overviewEd).toBeDefined();
    const overviewAdm = await rpc(ADMIN, "app_fase2_overview");
    expect(overviewAdm).toBeDefined();

    // station_attempts: aluno autenticado não faz select direto (tabela fechada para authenticated)
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: STUDENT })]);
        return tx.query("select * from public.station_attempts");
      })
    ).rejects.toThrow(/permission denied/i);

    // Funções internas: aluno autenticado não consegue chamar diretamente
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: STUDENT })]);
        return tx.query("select public.fase2_assert()");
      })
    ).rejects.toThrow(/permission denied/i);

    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: STUDENT })]);
        return tx.query("select public.fase2_allowed()");
      })
    ).rejects.toThrow(/permission denied/i);

    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: STUDENT })]);
        return tx.query("select * from public.fase2_evaluations($1)", [STUDENT]);
      })
    ).rejects.toThrow(/permission denied/i);
  });

  it("2. Catálogo: app_fase2_stations devolve só as aprovadas, sem chaves de conteúdo; contadores zerados", async () => {
    const stations = await rpc<any[]>(EDITOR, "app_fase2_stations");

    // Apenas aprovadas ('st-cm' e 'st-ped'), sem 'st-pend'
    expect(stations.map((s) => s.id).sort()).toEqual(["st-cm", "st-ped"]);

    // Nenhuma chave de conteúdo secreto deve estar presente
    for (const s of stations) {
      expect(s.doctor_scene).toBeUndefined();
      expect(s.doctor_tasks).toBeUndefined();
      expect(s.actor_script).toBeUndefined();
      expect(s.checklist_items).toBeUndefined();
      expect(s.pressings).toBeUndefined();

      // Sem tentativas prévias
      expect(s.my_best).toBeNull();
      expect(s.my_count).toBe(0);
    }
  });

  it("3. Estado vazio honesto: sem tentativa nenhuma, overview, peps e performance devolvem contadores zerados e listas vazias", async () => {
    const overview = await rpc(EDITOR, "app_fase2_overview");
    expect(overview.done_count).toBe(0);
    expect(overview.avg_score10).toBeNull();
    expect(overview.last).toBeNull();
    expect(overview.open_attempt).toBeNull();
    expect(overview.stations_total).toBe(2);

    const peps = await rpc(EDITOR, "app_fase2_peps");
    expect(peps).toEqual([]);

    const perf = await rpc(EDITOR, "app_fase2_performance");
    expect(perf.count).toBe(0);
    expect(perf.avg_score10).toBeNull();
    expect(perf.best_score10).toBeNull();
    expect(perf.by_area).toEqual([]);
    expect(perf.evolution).toEqual([]);
    expect(perf.by_phase).toEqual([]);
    expect(perf.lost_items).toEqual([]);
  });

  it("4. Gabarito na hora certa: start entrega leitura; begin entrega impressos; finish entrega checklist; roteiro do ator nunca aparece", async () => {
    // 1. Início: leitura
    const payloadStart = await rpc(ADMIN, "app_fase2_start", { p_station_id: "st-cm" });
    expect(payloadStart.status).toBe("reading");
    expect(payloadStart.scene).toContain("Pronto-socorro adulto");
    expect(payloadStart.tasks).toContain("Realizar anamnese dirigida");
    expect(payloadStart.pressings).toBeUndefined();
    expect(payloadStart.checklist).toBeUndefined();

    const startStr = JSON.stringify(payloadStart);
    expect(startStr).not.toContain("SEGREDO-DO-ATOR");
    expect(startStr).not.toContain("GABARITO-ITEM-UM");

    // 2. Transição: atendimento
    const payloadBegin = await rpc(ADMIN, "app_fase2_begin", { p_attempt_id: payloadStart.attempt_id });
    expect(payloadBegin.status).toBe("attending");
    expect(Array.isArray(payloadBegin.pressings)).toBe(true);
    expect(payloadBegin.pressings.length).toBe(2);
    expect(payloadBegin.pressings[0].name).toBe("Gasometria venosa");
    expect(payloadBegin.checklist).toBeUndefined();

    const beginStr = JSON.stringify(payloadBegin);
    expect(beginStr).not.toContain("SEGREDO-DO-ATOR");
    expect(beginStr).not.toContain("GABARITO-ITEM-UM");

    // 3. Transição: scoring (PEP)
    const payloadFinish = await rpc(ADMIN, "app_fase2_finish", { p_attempt_id: payloadStart.attempt_id });
    expect(payloadFinish.status).toBe("scoring");
    expect(Array.isArray(payloadFinish.checklist)).toBe(true);
    expect(payloadFinish.checklist.length).toBe(6);

    const finishStr = JSON.stringify(payloadFinish);
    expect(finishStr).toContain("GABARITO-ITEM-UM");
    expect(finishStr).not.toContain("SEGREDO-DO-ATOR");
  });

  it("5. Ordem das etapas: finish antes de begin falha; submit antes de finish falha; begin repetido não reinicia relógio; estação pendente falha", async () => {
    // Nova tentativa em st-ped
    const att = await rpc(EDITOR, "app_fase2_start", { p_station_id: "st-ped" });
    expect(att.status).toBe("reading");

    // finish antes de begin falha
    await expect(rpc(EDITOR, "app_fase2_finish", { p_attempt_id: att.attempt_id })).rejects.toThrow(
      /Inicie o atendimento antes de abrir o PEP/
    );

    // submit antes de finish falha
    await expect(
      rpc(EDITOR, "app_fase2_submit", { p_attempt_id: att.attempt_id, p_marks: { "1": "correct" } })
    ).rejects.toThrow(/Abra o PEP antes de marcar os itens/);

    // begin inicia atendimento e grava attendance_started_at
    const began = await rpc(EDITOR, "app_fase2_begin", { p_attempt_id: att.attempt_id });
    expect(began.status).toBe("attending");
    const t1 = began.attendance_started_at;
    expect(t1).toBeTruthy();

    // begin repetido na mesma tentativa não reinicia o relógio
    const beganRepeat = await rpc(EDITOR, "app_fase2_begin", { p_attempt_id: att.attempt_id });
    expect(beganRepeat.attendance_started_at).toBe(t1);

    // start de estação sem aprovação médica falha
    await expect(rpc(EDITOR, "app_fase2_start", { p_station_id: "st-pend" })).rejects.toThrow(
      /sem aprovação médica/
    );
  });

  it("6. Nota calculada pelo servidor: todos correct dão 10; incorrect dão 0; mistura com partial bate cálculo exato; validações estritas de marcação", async () => {
    // 6.1 Todos 'correct' (usando a tentativa de st-cm do caso 4 que já está em status 'scoring')
    const openAttemptCm = (await rpc(ADMIN, "app_fase2_overview")).open_attempt;
    expect(openAttemptCm).toBeDefined();

    const allCorrectMarks = {
      "1": "correct",
      "2": "correct",
      "3": "correct",
      "4": "correct",
      "5": "correct",
      "6": "correct"
    };

    const doneAllCorrect = await rpc(ADMIN, "app_fase2_submit", {
      p_attempt_id: openAttemptCm.id,
      p_marks: allCorrectMarks
    });
    expect(doneAllCorrect.status).toBe("done");
    expect(Number(doneAllCorrect.result.score)).toBe(10);
    expect(Number(doneAllCorrect.result.max_score)).toBe(10);
    expect(Number(doneAllCorrect.result.score10)).toBe(10);

    // Submit repetido numa tentativa 'done' devolve o mesmo resultado sem alterar nota
    const doneRepeat = await rpc(ADMIN, "app_fase2_submit", {
      p_attempt_id: openAttemptCm.id,
      p_marks: allCorrectMarks
    });
    expect(Number(doneRepeat.result.score10)).toBe(10);

    // 6.2 Todos 'incorrect' (completando a tentativa de st-ped do caso 5 com EDITOR)
    const openAttemptPed = (await rpc(EDITOR, "app_fase2_overview")).open_attempt;
    await rpc(EDITOR, "app_fase2_finish", { p_attempt_id: openAttemptPed.id });

    const allIncorrectMarks = {
      "1": "incorrect",
      "2": "incorrect",
      "3": "incorrect",
      "4": "incorrect",
      "5": "incorrect",
      "6": "incorrect"
    };
    const doneAllIncorrect = await rpc(EDITOR, "app_fase2_submit", {
      p_attempt_id: openAttemptPed.id,
      p_marks: allIncorrectMarks
    });
    expect(Number(doneAllIncorrect.result.score)).toBe(0);
    expect(Number(doneAllIncorrect.result.score10)).toBe(0);

    // 6.3 Falhas de validação em tentativa scoring
    // Cria nova tentativa de st-cm para testar falhas de validação e mistura
    const attMix = await rpc(ADMIN, "app_fase2_start", { p_station_id: "st-cm" });
    await rpc(ADMIN, "app_fase2_begin", { p_attempt_id: attMix.attempt_id });
    await rpc(ADMIN, "app_fase2_finish", { p_attempt_id: attMix.attempt_id });

    // Item sem marca
    await expect(
      rpc(ADMIN, "app_fase2_submit", {
        p_attempt_id: attMix.attempt_id,
        p_marks: { "1": "correct", "2": "correct" }
      })
    ).rejects.toThrow(/Marque todos os itens do PEP/);

    // Valor inválido
    await expect(
      rpc(ADMIN, "app_fase2_submit", {
        p_attempt_id: attMix.attempt_id,
        p_marks: { "1": "xyz", "2": "correct", "3": "correct", "4": "correct", "5": "correct", "6": "correct" }
      })
    ).rejects.toThrow(/Marque todos os itens do PEP/);

    // 'partial' num item que não admite partial (item 1 tem partial: null)
    await expect(
      rpc(ADMIN, "app_fase2_submit", {
        p_attempt_id: attMix.attempt_id,
        p_marks: { "1": "partial", "2": "correct", "3": "correct", "4": "correct", "5": "correct", "6": "correct" }
      })
    ).rejects.toThrow(/Marque todos os itens do PEP/);

    // p_marks que não é objeto
    await expect(
      rpc(ADMIN, "app_fase2_submit", { p_attempt_id: attMix.attempt_id, p_marks: null as any })
    ).rejects.toThrow(/Marcação inválida/);
    await expect(
      rpc(ADMIN, "app_fase2_submit", { p_attempt_id: attMix.attempt_id, p_marks: JSON.stringify(["array"]) as any })
    ).rejects.toThrow(/Marcação inválida/);

    // 6.4 Mistura com 'partial'
    // Itens de st-cm:
    // 1 (max 1.0, sem partial): correct -> 1.0
    // 2 (max 2.0, partial 1.0): partial -> 1.0
    // 3 (max 2.0, partial 1.0): correct -> 2.0
    // 4 (max 1.5, partial 0.75): partial -> 0.75
    // 5 (max 1.5, sem partial): incorrect -> 0
    // 6 (max 2.0, partial 1.0): correct -> 2.0
    // Total esperado: 1.0 + 1.0 + 2.0 + 0.75 + 0 + 2.0 = 6.75 pontos
    // Correctness: round(6.75 / 10 * 100, 1) = 67.5%
    // score10: round(67.5 / 10, 1) = 6.8
    const mixtureMarks = {
      "1": "correct",
      "2": "partial",
      "3": "correct",
      "4": "partial",
      "5": "incorrect",
      "6": "correct"
    };
    const doneMix = await rpc(ADMIN, "app_fase2_submit", {
      p_attempt_id: attMix.attempt_id,
      p_marks: mixtureMarks
    });
    expect(Number(doneMix.result.score)).toBe(6.75);
    expect(Number(doneMix.result.max_score)).toBe(10);
    expect(Number(doneMix.result.score10)).toBe(6.8);
  });

  it("7. Isolamento: outro usuário não abre a tentativa de alguém e peps não lista a do outro", async () => {
    // ADMIN tem tentativas concluídas
    const adminPeps = await rpc<any[]>(ADMIN, "app_fase2_peps");
    expect(adminPeps.length).toBeGreaterThan(0);
    const adminAttemptId = adminPeps[0].id;

    // EDITOR tenta abrir tentativa do ADMIN
    await expect(
      rpc(EDITOR, "app_fase2_attempt", { p_attempt_id: adminAttemptId })
    ).rejects.toThrow(/Tentativa não encontrada/);

    // Meus PEPs do EDITOR não lista tentativa do ADMIN
    const editorPeps = await rpc<any[]>(EDITOR, "app_fase2_peps");
    expect(editorPeps.find((p) => p.id === adminAttemptId)).toBeUndefined();
  });

  it("8. Retomar e trocar: start da mesma estação retoma; start de outra estação abandona anterior; app_fase2_abandon encerra", async () => {
    // EDITOR inicia st-cm
    const start1 = await rpc(EDITOR, "app_fase2_start", { p_station_id: "st-cm" });
    const id1 = start1.attempt_id;

    // start da mesma estação com tentativa aberta devolve a MESMA tentativa
    const startSame = await rpc(EDITOR, "app_fase2_start", { p_station_id: "st-cm" });
    expect(startSame.attempt_id).toBe(id1);

    // start de outra estação marca a anterior como abandoned e abre nova
    const startOther = await rpc(EDITOR, "app_fase2_start", { p_station_id: "st-ped" });
    const id2 = startOther.attempt_id;
    expect(id2).not.toBe(id1);

    // Conferência direta no banco de que a tentativa anterior (id1) foi marcada como 'abandoned'
    const status1 = (
      await db.query<{ status: string }>(`select status from public.station_attempts where id = $1`, [id1])
    ).rows[0].status;
    expect(status1).toBe("abandoned");

    // app_fase2_abandon encerra a tentativa atual (id2)
    const abandonRes = await rpc(EDITOR, "app_fase2_abandon", { p_attempt_id: id2 });
    expect(abandonRes).toEqual({ ok: true });

    const status2 = (
      await db.query<{ status: string }>(`select status from public.station_attempts where id = $1`, [id2])
    ).rows[0].status;
    expect(status2).toBe("abandoned");
  });

  it("9. Painéis com dado: 2 tentativas concluídas mais 1 sessão em dupla: overview, peps, performance e catálogo consistentes", async () => {
    // Limpa tentativas de treino solo anteriores do ADMIN para garantir números exatos
    await db.query(`delete from public.station_attempts where user_id = $1`, [ADMIN]);

    // Tentativa Solo 1: st-cm (Clínica Médica), concluída com todas certas (nota 10,0)
    const t1Start = await rpc(ADMIN, "app_fase2_start", { p_station_id: "st-cm" });
    await rpc(ADMIN, "app_fase2_begin", { p_attempt_id: t1Start.attempt_id });
    await rpc(ADMIN, "app_fase2_finish", { p_attempt_id: t1Start.attempt_id });
    const t1Done = await rpc(ADMIN, "app_fase2_submit", {
      p_attempt_id: t1Start.attempt_id,
      p_marks: { "1": "correct", "2": "correct", "3": "correct", "4": "correct", "5": "correct", "6": "correct" }
    });
    expect(Number(t1Done.result.score10)).toBe(10);
    // Ajusta finished_at para 2 horas atrás
    await db.query(`update public.station_attempts set finished_at = now() - interval '2 hours' where id = $1`, [t1Start.attempt_id]);

    // Tentativa Solo 2: st-ped (Pediatria), concluída com notas parciais somando 6,0
    // st-ped checklist:
    // 1: correct (1.0)
    // 2: partial (1.0 / 2.0)
    // 3: correct (2.0)
    // 4: incorrect (0 / 2.0)
    // 5: partial (1.0 / 2.0)
    // 6: correct (1.0)
    // Soma = 6.0 pontos -> 60% -> score10 = 6.0
    const t2Start = await rpc(ADMIN, "app_fase2_start", { p_station_id: "st-ped" });
    await rpc(ADMIN, "app_fase2_begin", { p_attempt_id: t2Start.attempt_id });
    await rpc(ADMIN, "app_fase2_finish", { p_attempt_id: t2Start.attempt_id });
    const t2Done = await rpc(ADMIN, "app_fase2_submit", {
      p_attempt_id: t2Start.attempt_id,
      p_marks: { "1": "correct", "2": "partial", "3": "correct", "4": "incorrect", "5": "partial", "6": "correct" }
    });
    expect(Number(t2Done.result.score10)).toBe(6.0);
    // Ajusta finished_at para 1 hora atrás
    await db.query(`update public.station_attempts set finished_at = now() - interval '1 hour' where id = $1`, [t2Start.attempt_id]);

    // Sessão em dupla inserida diretamente em checklist_study_sessions
    // doctor_id = ADMIN, actor_id = EDITOR, estação 'st-cm', correctness = 80.0 (nota 8,0)
    // finished_at = 30 minutos atrás (a mais recente das três)
    const sessionId = "sess-dupla-test-01";
    await db.query(
      `insert into public.checklist_study_sessions (
        id, station_id, room_id, actor_id, doctor_id, started_at, finished_at,
        score, max_score, correctness
      ) values (
        $1, 'st-cm', gen_random_uuid(), $2, $3,
        now() - interval '40 minutes', now() - interval '30 minutes',
        8.0, 10.0, 80.0
      )`,
      [sessionId, EDITOR, ADMIN]
    );

    // 1. Overview
    // 3 avaliações: notas 10.0, 6.0 e 8.0 -> Média = (10 + 6 + 8)/3 = 24 / 3 = 8.0
    const overview = await rpc(ADMIN, "app_fase2_overview");
    expect(overview.done_count).toBe(3);
    expect(Number(overview.avg_score10)).toBe(8.0);
    expect(overview.last).toMatchObject({
      id: sessionId,
      origin: "dupla",
      station_id: "st-cm",
      name: "Cetoacidose diabética",
      score10: 8
    });

    // 2. Meus PEPs (ordem do mais recente ao mais antigo)
    const peps = await rpc<any[]>(ADMIN, "app_fase2_peps");
    expect(peps.length).toBe(3);
    expect(peps[0]).toMatchObject({ id: sessionId, origin: "dupla", station_id: "st-cm", score10: 8 });
    expect(peps[1]).toMatchObject({ id: t2Start.attempt_id, origin: "solo", station_id: "st-ped", score10: 6 });
    expect(peps[2]).toMatchObject({ id: t1Start.attempt_id, origin: "solo", station_id: "st-cm", score10: 10 });

    // 3. Performance
    const perf = await rpc(ADMIN, "app_fase2_performance");
    expect(perf.count).toBe(3);
    expect(Number(perf.avg_score10)).toBe(8.0);
    expect(Number(perf.best_score10)).toBe(10.0);

    // by_area: Clínica Médica tem 2 (10 e 8 -> média 9.0); Pediatria tem 1 (6 -> média 6.0)
    expect(perf.by_area).toEqual([
      { area: "Clínica Médica", count: 2, avg_score10: 9 },
      { area: "Pediatria", count: 1, avg_score10: 6 }
    ]);

    // evolution: 3 pontos ordenados por timestamp
    expect(perf.evolution.length).toBe(3);
    expect(perf.evolution.map((e: any) => Number(e.score10))).toEqual([10, 6, 8]);

    // by_phase: só dos treinos solo (st-cm e st-ped)
    expect(Array.isArray(perf.by_phase)).toBe(true);
    expect(perf.by_phase.length).toBeGreaterThan(0);

    // lost_items: apenas itens com pontos perdidos nos treinos solo (ex: Anamnese, Diagnóstico ou Conduta em st-ped)
    expect(Array.isArray(perf.lost_items)).toBe(true);
    expect(perf.lost_items.length).toBeGreaterThan(0);
    // Cada item em lost_items perdeu mais que 0
    for (const lost of perf.lost_items) {
      expect(Number(lost.lost)).toBeGreaterThan(0);
    }

    // 4. Catálogo reflete contadores reais do usuário
    const catalog = await rpc<any[]>(ADMIN, "app_fase2_stations");
    const stCm = catalog.find((s) => s.id === "st-cm");
    const stPed = catalog.find((s) => s.id === "st-ped");
    expect(stCm.my_count).toBe(2); // 1 solo + 1 dupla
    expect(Number(stCm.my_best)).toBe(10);
    expect(stPed.my_count).toBe(1); // 1 solo
    expect(Number(stPed.my_best)).toBe(6);
  });

  it("10. Desfazer: aplicar o script desfazer.sql remove as funções app_fase2_* e a tabela station_attempts", async () => {
    // Executa os scripts de desfazer: primeiro os do treino sozinho (013460 a 013430, em ordem inversa), depois o da própria 013330
    for (const nome of ["013460_treino_dupla_sozinho_uso_exportacao", "013450_treino_dupla_sozinho_ia", "013440_treino_dupla_sozinho_funcoes", "013430_treino_dupla_sozinho_dados"]) {
      await db.exec(fs.readFileSync(path.join(ROOT, `supabase/desfazer/20261003${nome}.desfazer.sql`), "utf8"));
    }
    const undoSql = fs.readFileSync(DESFAZER, "utf8");
    await db.exec(undoSql);

    // Tabela station_attempts não deve mais existir
    const tblCheck = (
      await db.query<{ reg: string | null }>(`select to_regclass('public.station_attempts') as reg`)
    ).rows[0].reg;
    expect(tblCheck).toBeNull();

    // Nenhuma função app_fase2_* ou fase2_* deve existir
    const procs = (
      await db.query<{ proname: string }>(
        `select proname from pg_proc where proname like 'app_fase2_%' or proname like 'fase2_%'`
      )
    ).rows;
    expect(procs).toEqual([]);
  });
});
