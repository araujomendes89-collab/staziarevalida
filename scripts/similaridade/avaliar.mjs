#!/usr/bin/env node
/**
 * Mede o motor de questões parecidas contra pares revisados por MÉDICO: precision@5 e recall@20 por questão (média entre as
 * questões que têm pelo menos um par relevante), acerto do tipo de relação nos pares julgados, e registra tempo e custo.
 *
 *   node scripts/similaridade/avaliar.mjs --relacoes <export.json> [--pares scripts/similaridade/pares-revisados.json]
 *        [--registro scripts/similaridade/avaliacoes.jsonl] [--relevantes duplicada_exata,duplicada_semantica,...]
 *
 * --relacoes: o que o motor gravou, exportado do banco com o SQL abaixo (cole no Supabase e salve o resultado como JSON):
 *   select jsonb_build_object(
 *     'relacoes', (select jsonb_agg(jsonb_build_object('question_a', question_a, 'question_b', question_b, 'relation', relation,
 *                    'score', score, 'confidence', confidence, 'status', status)) from public.question_relations),
 *     'execucao', (select to_jsonb(r) from public.similarity_runs r order by started_at desc limit 1));
 *   (também aceita só a lista de relações)
 * --pares: formato em scripts/similaridade/pares-revisados.json (staziamed.similaridade.pares-revisados.v1). Começa VAZIO: os
 *   pares virão da revisão médica. Sem pares, o script avisa e sai sem métrica (nada é inventado).
 * --registro: cada avaliação vira uma linha JSON (data, métricas, número de pares, tempo da avaliação e, quando a exportação
 *   traz, tempo e custo da execução do motor).
 *
 * Contas: a lista de cada questão segue a ordem do aluno (mesmo raciocínio, complementar, mesmo subtema, mesmo tema; depois a
 * pontuação), com as duplicadas antes e sem as rejeitadas e "não relacionada". Relevante = tipo na lista --relevantes (padrão:
 * duplicada_exata, duplicada_semantica, mesmo_raciocinio, complementar, mesmo_subtema). precision@5 conta o que não foi julgado
 * como não relevante (conta pessimista); "precision@5 só julgados" ignora o não julgado.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TIPOS = ["duplicada_exata", "duplicada_semantica", "mesmo_raciocinio", "complementar", "mesmo_subtema", "mesmo_tema", "nao_relacionada"];
export const RELEVANTES_PADRAO = ["duplicada_exata", "duplicada_semantica", "mesmo_raciocinio", "complementar", "mesmo_subtema"];
const PRIO = { duplicada_exata: 0, duplicada_semantica: 0, mesmo_raciocinio: 1, complementar: 2, mesmo_subtema: 3, mesmo_tema: 4 };
const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Confere e normaliza os pares revisados. Pares com tipo fora da lista ou sem a e b são recusados (com o motivo). */
export function lerPares(doc) {
  const erros = [];
  const pares = new Map();
  for (const [i, p] of (Array.isArray(doc?.pares) ? doc.pares : []).entries()) {
    if (!p || typeof p.a !== "string" || typeof p.b !== "string" || p.a === p.b) { erros.push(`par ${i + 1}: a e b precisam ser ids diferentes`); continue; }
    if (!TIPOS.includes(p.relacao)) { erros.push(`par ${i + 1}: relacao fora da lista`); continue; }
    if (!p.revisado_por) { erros.push(`par ${i + 1}: falta revisado_por`); continue; }
    pares.set(key(p.a, p.b), { a: p.a, b: p.b, relacao: p.relacao });
  }
  return { pares: [...pares.values()], erros };
}

/** As métricas (funções puras). */
export function avaliar(relacoes, pares, relevantes = RELEVANTES_PADRAO) {
  const rel = new Set(relevantes);
  const julgado = new Map(pares.map((p) => [key(p.a, p.b), p.relacao]));
  const listas = new Map();
  const add = (q, other, r) => {
    if (!listas.has(q)) listas.set(q, []);
    listas.get(q).push({ other, prio: PRIO[r.relation] ?? 9, score: Number(r.score) || 0, relation: r.relation });
  };
  const predito = new Map();
  for (const r of relacoes) {
    if (r.status === "rejeitada" || r.relation === "nao_relacionada" || !(r.relation in PRIO)) continue;
    add(r.question_a, r.question_b, r);
    add(r.question_b, r.question_a, r);
    predito.set(key(r.question_a, r.question_b), r.relation);
  }
  for (const l of listas.values()) l.sort((x, y) => x.prio - y.prio || y.score - x.score || x.other.localeCompare(y.other));
  const positivos = new Map();
  for (const p of pares) {
    if (!rel.has(p.relacao)) continue;
    for (const [q, o] of [[p.a, p.b], [p.b, p.a]]) {
      if (!positivos.has(q)) positivos.set(q, new Set());
      positivos.get(q).add(o);
    }
  }
  const p5 = [];
  const p5j = [];
  const r20 = [];
  for (const [q, pos] of positivos) {
    const lista = listas.get(q) ?? [];
    const top5 = lista.slice(0, 5);
    const top20 = lista.slice(0, 20);
    if (top5.length) p5.push(top5.filter((x) => pos.has(x.other)).length / top5.length);
    const julgados = top5.filter((x) => julgado.has(key(q, x.other)));
    if (julgados.length) p5j.push(julgados.filter((x) => pos.has(x.other)).length / julgados.length);
    r20.push(top20.filter((x) => pos.has(x.other)).length / pos.size);
  }
  const media = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 1000) / 1000 : null);
  // acerto do tipo nos pares julgados que o motor também gravou
  const confusao = {};
  let acertos = 0;
  let comparados = 0;
  for (const p of pares) {
    const m = predito.get(key(p.a, p.b)) ?? "nao_gravado";
    confusao[p.relacao] ??= {};
    confusao[p.relacao][m] = (confusao[p.relacao][m] ?? 0) + 1;
    if (m !== "nao_gravado") { comparados++; if (m === p.relacao) acertos++; }
  }
  return {
    questoes_avaliadas: positivos.size,
    precision_at_5: media(p5),
    precision_at_5_so_julgados: media(p5j),
    recall_at_20: media(r20),
    tipo_certo: comparados ? Math.round((acertos / comparados) * 1000) / 1000 : null,
    pares_julgados: pares.length,
    pares_julgados_gravados: comparados,
    confusao,
  };
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) o[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
  return o;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const a = args(process.argv.slice(2));
  const paresDoc = JSON.parse(fs.readFileSync(a.pares || path.join(dir, "pares-revisados.json"), "utf8"));
  const { pares, erros } = lerPares(paresDoc);
  for (const e of erros) console.error(`[avaliar] par recusado: ${e}`);
  const registro = a.registro || path.join(dir, "avaliacoes.jsonl");
  if (!pares.length) {
    console.log("Sem pares revisados por médico ainda: as métricas (precision@5 e recall@20) saem quando a revisão médica mandar os pares. Nada foi calculado.");
    process.exit(0);
  }
  if (!a.relacoes) {
    console.error("Falta --relacoes (exportação do banco; o SQL está no começo deste arquivo).");
    process.exit(2);
  }
  const exp = JSON.parse(fs.readFileSync(a.relacoes, "utf8"));
  const relacoes = Array.isArray(exp) ? exp : exp.relacoes ?? [];
  const execucao = Array.isArray(exp) ? null : exp.execucao ?? null;
  const relevantes = typeof a.relevantes === "string" ? a.relevantes.split(",").map((x) => x.trim()).filter((x) => TIPOS.includes(x)) : RELEVANTES_PADRAO;
  const m = avaliar(relacoes, pares, relevantes);
  const linha = {
    em: new Date().toISOString(), metricas: m, relevantes, relacoes_no_banco: relacoes.length, tempo_avaliacao_ms: Date.now() - t0,
    execucao_do_motor: execucao ? { id: execucao.id, engine_version: execucao.engine_version, model: execucao.model, duration_ms: execucao.duration_ms,
      cost_usd: execucao.cost_usd, tokens: execucao.tokens, questions: execucao.questions } : null,
  };
  fs.appendFileSync(registro, JSON.stringify(linha) + "\n");
  console.log(`Questões avaliadas: ${m.questoes_avaliadas} · precision@5: ${m.precision_at_5 ?? "—"} (só julgados: ${m.precision_at_5_so_julgados ?? "—"}) · recall@20: ${m.recall_at_20 ?? "—"} · tipo certo: ${m.tipo_certo ?? "—"} (${m.pares_julgados_gravados} de ${m.pares_julgados} pares julgados foram gravados pelo motor)`);
  if (execucao) console.log(`Execução do motor: ${execucao.duration_ms ?? "?"} ms, US$ ${execucao.cost_usd ?? 0}, ${execucao.questions ?? "?"} questões.`);
  console.log(`Registro: ${registro}`);
}
