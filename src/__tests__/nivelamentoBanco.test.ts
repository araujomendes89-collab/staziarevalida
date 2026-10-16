// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { openStaziaEnv, type StaziaEnv, USERS } from "./helpers/staziamed";
import { calcularPorContagem, AREAS } from "../novo/app/nivelamento/calculo.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

vi.setConfig({ testTimeout: 120_000 });

describe("Nivelamento - Banco", () => {
  let env: StaziaEnv;

  beforeAll(async () => {
    env = await openStaziaEnv();
  }, 600_000);

  afterAll(async () => {
    if (env) await env.close();
  });

  it("1. nivelamento_calcular = calcularPorContagem no exemplo da especificacao e contagens aleatorias", async () => {
    // Exemplo da spec: Clínica 5 de 6, Cirurgia 2 de 6, Pediatria 4 de 6, GO 3 de 6, MFC 4 de 6
    const spec = [
      { area: "CLINICA_MEDICA", acertos: 5, total: 6 },
      { area: "CIRURGIA_GERAL", acertos: 2, total: 6 },
      { area: "PEDIATRIA", acertos: 4, total: 6 },
      { area: "GINECOLOGIA_OBSTETRICIA", acertos: 3, total: 6 },
      { area: "MEDICINA_FAMILIA_COMUNIDADE", acertos: 4, total: 6 },
    ];
    
    const [resDb] = await env.sql(`select public.nivelamento_calcular($1::jsonb) as res`, [JSON.stringify(spec)]);
    const resJs = calcularPorContagem(spec);
    expect(resDb.res.score).toBe(resJs.score); // 57.5
    expect(resDb.res.nivel_nome).toBe("Intermediário");
    expect(resDb.res.acertos).toBe(18);
    expect(resDb.res.total).toBe(30);
    expect(resDb.res.percentual_bruto).toBe(60.0);
    expect(resDb.res.prioridades[0]).toBe("CIRURGIA_GERAL");
    expect(resDb.res.prioridades[1]).toBe("GINECOLOGIA_OBSTETRICIA");

    // Aleatórias com semente fixa
    const r = Array(300).fill(0).map((_, i) => {
      const hash = crypto.createHash('md5').update(`seed-${i}`).digest('hex');
      const gen = (max: number, offset: number) => parseInt(hash.substring(offset, offset + 2), 16) % (max + 1);
      
      const counts = AREAS.map((a, j) => {
        // Some cases with total < 3 to test DADOS_INSUFICIENTES
        const t = (i < 20 && j === 0) ? gen(2, j * 2) : gen(10, j * 2) + 3;
        const ac = gen(t, j * 2 + 10);
        return { area: a.id, acertos: ac, total: t };
      });
      return counts;
    });

    for (const counts of r) {
      const [db] = await env.sql(`select public.nivelamento_calcular($1::jsonb) as res`, [JSON.stringify(counts)]);
      const js = calcularPorContagem(counts);
      
      expect(db.res.score).toBe(js.score);
      expect(db.res.nivel).toBe(js.nivel);
      expect(db.res.status).toBe(js.status);
      expect(db.res.acertos).toBe(js.acertos);
      expect(db.res.total).toBe(js.total);
      expect(db.res.percentual_bruto).toBe(js.percentual_bruto);
      expect(db.res.faixa_indicativa).toEqual(js.faixa_indicativa);
      expect(db.res.prioridades).toEqual(js.prioridades);
      expect(db.res.nivel_nome).toBe(js.nivel_nome);
      
      // variancia needs toBeCloseTo
      if (js.perfil) {
        js.perfil.forEach((p, idx) => {
          const dbP = db.res.perfil[idx];
          expect(dbP.area).toBe(p.area);
          expect(dbP.proficiencia).toBe(p.proficiencia);
          expect(dbP.prioridade).toBe(p.prioridade);
          expect(dbP.variancia).toBeCloseTo(p.variancia, 6);
        });
      }
    }
  });

  it("2. Estado: aluno sem respostas, ADMIN e REVISOR_PED, aluno com 1 resposta", async () => {
    const stNovo = await env.rpc(USERS.PRO, "app_nivelamento_estado");
    expect(stNovo.aplicavel).toBe(true);
    expect(stNovo.primeira_tela).toBe(true);
    expect(stNovo.situacao).toBe("novo");

    const stAdmin = await env.rpc(USERS.ADMIN, "app_nivelamento_estado");
    expect(stAdmin.aplicavel).toBe(false);
    expect(stAdmin.primeira_tela).toBe(false);

    const stRev = await env.rpc(USERS.REVISOR_PED, "app_nivelamento_estado");
    expect(stRev.aplicavel).toBe(false);

    // Give TESTE one attempt to simulate "aluno com uma resposta"
    const [{ id: qId, correct_option: gab }] = await env.sql(`select id, correct_option from public.questions where status = 'valid' and origin = 'official' limit 1`);
    await env.sql(`insert into public.question_attempts (user_id, question_id, selected_option, is_correct) values ($1, $2, $3, true)`, [USERS.TESTE, qId, gab]);
    
    const stTeste = await env.rpc(USERS.TESTE, "app_nivelamento_estado");
    expect(stTeste.primeira_tela).toBe(false);
    expect(stTeste.convite).toBe(true);
  });

  it("3. iniciar -> 15 itens", async () => {
    const sessao = await env.rpc(USERS.PRO, "app_nivelamento_iniciar");
    expect(sessao.situacao).toBe("bloco1");
    expect(sessao.itens.length).toBe(15);
    
    const areas = sessao.itens.map((i: any) => i.questao.area);
    const counts = areas.reduce((acc: any, a: string) => { acc[a] = (acc[a] || 0) + 1; return acc; }, {});
    expect(counts["CLINICA_MEDICA"]).toBe(3);
    expect(counts["CIRURGIA_GERAL"]).toBe(3);
    expect(counts["PEDIATRIA"]).toBe(3);
    expect(counts["GINECOLOGIA_OBSTETRICIA"]).toBe(3);
    expect(counts["MEDICINA_FAMILIA_COMUNIDADE"]).toBe(3);

    // nenhuma CHAVE que entregue gabarito, acerto, explicação, tema, dificuldade ou fonte (o texto da questão pode ter "correta")
    const chaves = new Set<string>();
    const juntar = (o: any) => { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (!Array.isArray(o)) chaves.add(k); juntar(v); } };
    juntar(sessao);
    for (const proibida of ["correct_option", "explanation", "gabarito", "correta", "faixa", "faixa_planejada", "fonte_dificuldade", "topic", "sources", "source_quotes", "comentario"])
      expect(chaves.has(proibida)).toBe(false);

    // 1 fácil, 1 média e 1 difícil PLANEJADAS por área; nada repetido, nada anulado
    const plano = await env.sql(`select ni.area, ni.faixa_planejada, count(*)::int as n from public.nivelamento_itens ni
      join public.nivelamento_diagnosticos d on d.id = ni.diagnostico_id where d.user_id = $1 group by 1, 2`, [USERS.PRO]);
    expect(plano.length).toBe(15);
    expect(plano.every((r: any) => r.n === 1)).toBe(true);
    const ids = sessao.itens.map((i: any) => i.questao.id);
    expect(new Set(ids).size).toBe(15);
    const [{ ruins }] = await env.sql(`select count(*)::int as ruins from public.questions where id = any($1) and (status <> 'valid' or correct_option is null)`, [ids]);
    expect(ruins).toBe(0);

    const posicoes = sessao.itens.map((i: any) => i.posicao);
    expect(posicoes).toEqual(Array.from({length: 15}, (_, i) => i + 1));
  });

  it("4. RLS: não lê diagnosticos nem itens direto", async () => {
    const diags = await env.sqlAs(USERS.PRO, `select * from public.nivelamento_diagnosticos`);
    expect(diags).toEqual([]);
    const itens = await env.sqlAs(USERS.PRO, `select * from public.nivelamento_itens`);
    expect(itens).toEqual([]);

    await expect(env.sqlAs(USERS.PRO, `update public.nivelamento_diagnosticos set situacao = 'concluido'`)).rejects.toThrow();

    // The user should read their own proficiencia, but there's none yet
    const profs = await env.sqlAs(USERS.PRO, `select * from public.nivelamento_proficiencia`);
    expect(profs).toEqual([]);
  });

  it("5. responder: erro letra inválida, ordem fora, troca", async () => {
    await expect(env.rpc(USERS.PRO, "app_nivelamento_responder", { p_ordem: 1, p_resposta: "X" })).rejects.toThrow("inválida");
    await expect(env.rpc(USERS.PRO, "app_nivelamento_responder", { p_ordem: 16, p_resposta: "A" })).rejects.toThrow("não faz parte");

    let res = await env.rpc(USERS.PRO, "app_nivelamento_responder", { p_ordem: 1, p_resposta: "A" });
    expect(res.resposta).toBe("A");
    expect(res.respondidas).toBe(1);

    res = await env.rpc(USERS.PRO, "app_nivelamento_responder", { p_ordem: 1, p_resposta: "B" });
    expect(res.resposta).toBe("B");
    expect(res.respondidas).toBe(1); // ainda 1
  });

  it("6. finalizar com falha e depois sucesso (respondendo de propósito)", async () => {
    await expect(env.rpc(USERS.PRO, "app_nivelamento_finalizar")).rejects.toThrow("faltam 14");
    
    // Antes de finalizar, correcao vem vazio
    const corrVazia = await env.rpc(USERS.PRO, "app_nivelamento_correcao");
    expect(corrVazia.itens.length).toBe(0);

    // Vamos responder as 15 para dar 2,1,2,2,3 (PG 60)
    // CM: 2 de 3
    // CG: 1 de 3
    // PED: 2 de 3
    // GO: 2 de 3
    // MFC: 3 de 3
    
    const sess = await env.rpc(USERS.PRO, "app_nivelamento_sessao");
    const counts = { CLINICA_MEDICA: 0, CIRURGIA_GERAL: 0, PEDIATRIA: 0, GINECOLOGIA_OBSTETRICIA: 0, MEDICINA_FAMILIA_COMUNIDADE: 0 };
    const target = { CLINICA_MEDICA: 2, CIRURGIA_GERAL: 1, PEDIATRIA: 2, GINECOLOGIA_OBSTETRICIA: 2, MEDICINA_FAMILIA_COMUNIDADE: 3 };

    for (const item of sess.itens) {
      const area = item.questao.area as keyof typeof counts;
      const [gab] = await env.sql(`select correct_option from public.questions where id = $1`, [item.questao.id]);
      
      let resposta = "A";
      if (counts[area] < target[area]) {
        resposta = gab.correct_option;
        counts[area]++;
      } else {
        resposta = gab.correct_option === "A" ? "B" : "A";
      }
      await env.rpc(USERS.PRO, "app_nivelamento_responder", { p_ordem: item.ordem, p_resposta: resposta });
    }

    const estado = await env.rpc(USERS.PRO, "app_nivelamento_finalizar");
    expect(estado.situacao).toBe("parcial");
    expect(estado.resultado).toBeDefined();
    expect(estado.resultado.faixa_indicativa).toBeUndefined();
    expect(estado.resultado.percentual_bruto).toBe(66.7); // 10 de 15 = 66.7
    // PG é proficiencia. O score não será 60, mas (2/3, 1/3, 2/3, 2/3, 3/3 = 10/15 -> bruto. Bayesiano = (acertos+1)/(total+2).
    // CM: 3/5 = 60
    // CG: 2/5 = 40
    // PED: 3/5 = 60
    // GO: 3/5 = 60
    // MFC: 4/5 = 80
    // Soma: 300 / 5 = 60! PG = 60.
    expect(estado.resultado.score).toBe(60.0);
  });

  it("7. continuar -> 15 novas (nenhuma do bloco 1) e finalizar com score alvo", async () => {
    const bloco2 = await env.rpc(USERS.PRO, "app_nivelamento_continuar");
    expect(bloco2.situacao).toBe("bloco2");
    expect(bloco2.itens.length).toBe(15);
    
    // Assegurar que os question_ids não estão no bloco 1
    const [q1] = await env.sql(`select array_agg(question_id) as ids from public.nivelamento_itens where bloco = 1 and diagnostico_id = (select id from public.nivelamento_diagnosticos where user_id = $1)`, [USERS.PRO]);
    const b1ids = q1.ids;
    for (const i of bloco2.itens) {
      expect(b1ids).not.toContain(i.questao.id);
    }

    // Fechar para 5,2,4,3,4 de 6
    // Já temos 2,1,2,2,3
    // Precisamos de mais 3,1,2,1,1 acertos no bloco 2
    const target2 = { CLINICA_MEDICA: 3, CIRURGIA_GERAL: 1, PEDIATRIA: 2, GINECOLOGIA_OBSTETRICIA: 1, MEDICINA_FAMILIA_COMUNIDADE: 1 };
    const counts2 = { CLINICA_MEDICA: 0, CIRURGIA_GERAL: 0, PEDIATRIA: 0, GINECOLOGIA_OBSTETRICIA: 0, MEDICINA_FAMILIA_COMUNIDADE: 0 };
    
    for (const item of bloco2.itens) {
      const area = item.questao.area as keyof typeof target2;
      const [gab] = await env.sql(`select correct_option from public.questions where id = $1`, [item.questao.id]);
      
      let resposta = "A";
      if (counts2[area] < target2[area]) {
        resposta = gab.correct_option;
        counts2[area]++;
      } else {
        resposta = gab.correct_option === "A" ? "B" : "A";
      }
      await env.rpc(USERS.PRO, "app_nivelamento_responder", { p_ordem: item.ordem, p_resposta: resposta });
    }

    const estado = await env.rpc(USERS.PRO, "app_nivelamento_finalizar");
    expect(estado.situacao).toBe("concluido");
    expect(estado.resultado.score).toBe(57.5);
    expect(estado.resultado.nivel_nome).toBe("Intermediário");
    expect(estado.resultado.acertos).toBe(18);
    expect(estado.resultado.total).toBe(30);
    expect(estado.resultado.percentual_bruto).toBe(60.0);
    expect(estado.resultado.prioridades[0]).toBe("CIRURGIA_GERAL");
    expect(estado.resultado.prioridades[1]).toBe("GINECOLOGIA_OBSTETRICIA");

    const profs = await env.sqlAs(USERS.PRO, `select * from public.nivelamento_proficiencia`);
    expect(profs.length).toBe(5);

    // resultado_parcial preservado (só verificar se existe no BD)
    const [diag] = await env.sql(`select resultado_parcial from public.nivelamento_diagnosticos where user_id = $1`, [USERS.PRO]);
    expect(diag.resultado_parcial).toBeDefined();
    expect(diag.resultado_parcial.score).toBe(60.0);
  });

  it("8. Nenhuma linha nova em question_attempts / tabelas de XP", async () => {
    // Apenas a 1 answer for TESTE inserted in it2
    const [att] = await env.sql(`select count(*)::int as c from public.question_attempts where user_id = $1`, [USERS.PRO]);
    expect(att.c).toBe(0);

    const [coins] = await env.sql(`select count(*)::int as c from public.coin_transactions where user_id = $1`, [USERS.PRO]);
    expect(coins.c).toBe(0);
    
    const [events] = await env.sql(`select count(*)::int as c from public.gamification_events where user_id = $1`, [USERS.PRO]);
    expect(events.c).toBe(0);
  });

  it("9. adiar: situacao adiado, convite", async () => {
    let ad = await env.rpc(USERS.SEM_PLANO, "app_nivelamento_adiar");
    expect(ad.situacao).toBe("adiado");
    expect(ad.primeira_tela).toBe(false);
    expect(ad.convite).toBe(true);

    const init = await env.rpc(USERS.SEM_PLANO, "app_nivelamento_iniciar");
    expect(init.situacao).toBe("bloco1");
  });

  it("10. Plano de Hoje cria a tarefa praticar na área de maior prioridade", async () => {
    const hoje = await env.rpc(USERS.PRO, "app_today", { p_rebuild: true });
    
    const task = hoje.tasks.find((t: any) => t.kind === "praticar");
    expect(task.ref.reason).toBe("nivelamento");
    expect(task.ref.area).toBe("CIRURGIA_GERAL"); // a de maior prioridade
    expect(task.title).toContain("Cirurgia");

    const semResultado = await env.rpc(USERS.SEM_PLANO, "app_today", { p_rebuild: true });
    const taskSem = semResultado.tasks.find((t: any) => t.kind === "praticar");
    expect(taskSem.ref.reason).toBe("diagnostic");
  });

  it("11. app_admin_nivelamento_cobertura: equipe lê; aluno erro", async () => {
    await expect(env.rpc(USERS.PRO, "app_admin_nivelamento_cobertura")).rejects.toThrow();
    
    const cob = await env.rpc(USERS.ADMIN, "app_admin_nivelamento_cobertura");
    expect(Array.isArray(cob)).toBe(true);
  });

  it("12. Ensaio de desfazer: executa desfazer, reaplica", async () => {
    const desfazer = fs.readFileSync(path.join(__dirname, "../../supabase/desfazer/20261003012300_nivelamento_diagnostico.desfazer.sql"), "utf8");
    await env.dev.db.exec(desfazer);
    expect((await env.sql(`select 1 from pg_proc where proname like 'app_nivelamento%'`)).length).toBe(0);
    // o Plano de Hoje antigo continua funcionando depois de desfazer
    const hojeAntigo = await env.rpc(USERS.PRO, "app_today", { p_rebuild: true });
    expect(hojeAntigo.tasks.find((t: any) => t.kind === "praticar").ref.reason).not.toBe("nivelamento");

    // table data should still be there
    const [d] = await env.sql(`select count(*)::int as c from public.nivelamento_diagnosticos`);
    expect(d.c).toBeGreaterThan(0);

    // reaplicar
    const mig = fs.readFileSync(path.join(__dirname, "../../supabase/migrations/20261003012300_nivelamento_diagnostico.sql"), "utf8");
    await env.dev.db.exec(mig);
    await env.dev.db.exec(mig); // pode ser colada duas vezes

    // must work again
    const estado = await env.rpc(USERS.PRO, "app_nivelamento_estado");
    expect(estado.situacao).toBe("concluido");
  });
});