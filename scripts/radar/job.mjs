#!/usr/bin/env node
// Radar de Evidências: JOB do Cloud Run (a cada 3 dias, pelo Cloud Scheduler). Lê Conitec, DOU (canais permitidos), vacinação e Febrasgo,
// compara com a linha de base no Supabase, registra os eventos (radar_registrar_evento) e, só quando há mudança e orçamento, pede a
// explicação ao Gemini (teto de US$ 5 por mês, contado no banco). NÃO altera questão, aula, gabarito nem atualização: só avisa.
//
// Ambiente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (obrigatórias), VERTEX_API_KEY (opcional: sem ela não há análise de IA),
//           RADAR_MODELO (padrão gemini-3.8-flash), RADAR_TETO_USD (só pode DIMINUIR o teto de 5), RADAR_ADAPTADORES (lista separada
//           por vírgula), RADAR_PAUSA_MS (padrão 1500), RADAR_ENSAIO=1 (lê tudo, NÃO grava nada no banco).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { criarCliente } from "./adaptadores/http.mjs";
import { ATIVOS, ORDEM } from "./adaptadores/index.mjs";
import { ContadorCusto, StoreCustoSupabase, tetoEfetivo } from "./custo.mjs";
import { EstadoSupabase } from "./estado.mjs";
import { MODELO_PADRAO } from "./ia.mjs";
import { vigiarAdaptadores } from "./nucleo.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const env = process.env;
const lerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."); process.exit(2); }
const ENSAIO = env.RADAR_ENSAIO === "1";
// Uma tarefa do Cloud Run por adaptador ATIVO (--tasks=3): CLOUD_RUN_TASK_INDEX 0..2 = conitec, vacinacao, febrasgo (DOU desligado). Uma lenta ou com falha não derruba as outras.
const idx = env.CLOUD_RUN_TASK_INDEX !== undefined ? Number(env.CLOUD_RUN_TASK_INDEX) : null;
const quaisEnv = (env.RADAR_ADAPTADORES ?? "").split(",").map((s) => s.trim()).filter((s) => ORDEM.includes(s));
const quais = idx !== null && ATIVOS[idx] ? [ATIVOS[idx]] : quaisEnv;
const NOME = quais.length === 1 ? quais[0] : "todos";
const estado = new EstadoSupabase({ url: env.SUPABASE_URL, chave: env.SUPABASE_SERVICE_ROLE_KEY });
const contador = new ContadorCusto({ store: new StoreCustoSupabase({ url: env.SUPABASE_URL, chave: env.SUPABASE_SERVICE_ROLE_KEY }), tetoUsd: tetoEfetivo(env.RADAR_TETO_USD) });
const cliente = criarCliente({ pausaMs: Number(env.RADAR_PAUSA_MS ?? 1500) });

const REST = env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };
// A cada 3 DIAS: o Cloud Scheduler dispara todo dia; se a última rodada terminou há menos de 70 h, esta sai sem fazer nada (RADAR_FORCAR=1 ignora).
const JANELA_H = Number(env.RADAR_INTERVALO_HORAS ?? 70);
if (env.RADAR_FORCAR !== "1") {
  const u = await fetch(`${REST}/radar_rodadas?select=terminou_em&terminou_em=not.is.null&ensaio=eq.false&resumo-%3E%3Eadaptador=eq.${NOME}&order=terminou_em.desc&limit=1`, { headers: H });
  const ultima = u.ok ? (await u.json())[0]?.terminou_em : null;
  if (ultima && Date.now() - Date.parse(ultima) < JANELA_H * 3600e3) {
    console.log(JSON.stringify({ radar: "vigia", pulada: true, motivo: `a última rodada terminou em ${ultima} (menos de ${JANELA_H} h)` }));
    process.exit(0);
  }
}
const t0 = Date.now();
const inicio = ENSAIO ? null : await fetch(`${REST}/radar_rodadas`, { method: "POST", headers: { ...H, prefer: "return=representation" }, body: JSON.stringify({ ensaio: false, resumo: { adaptador: NOME, tarefa: idx } }) }).then((x) => (x.ok ? x.json() : null)).then((j) => j?.[0]?.id ?? null).catch(() => null);
const r = await vigiarAdaptadores({
  cliente, estado, quais: quais.length ? quais : ATIVOS, contador, chaveIA: env.VERTEX_API_KEY || null, modelo: env.RADAR_MODELO || MODELO_PADRAO,
  dossies: lerJson(path.join(RAIZ, "scripts/portao-atualidade/dossies-100.json")), ligacao: lerJson(path.join(RAIZ, "scripts/grandes-temas/ligacao-questoes.json")),
  gravarBase: false,
});

let registrados = 0;
const falhas = [];
if (!ENSAIO) {
  for (const ev of r.eventos) {
    const doc_id = ev.doc_id;
    const payload = { origem: ev.origem, gravidade: ev.gravidade, motivo_gravidade: ev.motivo_gravidade, sha256_antigo: ev.sha256_antigo, sha256_novo: ev.sha256_novo, resumo: ev.resumo, itens: ev.itens, fonte: ev.fonte, afetados: ev.afetados, analise_ia: ev.analise_ia ?? null, ia_modelo: ev.ia_modelo ?? null, ia_custo_usd: ev.ia_custo_usd ?? null };
    const resp = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/radar_registrar_evento`, { method: "POST", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ p_doc_id: doc_id, p_evento: payload }) });
    if (resp.ok) registrados++; else falhas.push(`${doc_id}: HTTP ${resp.status}`);
  }
  // a linha de base só avança se TODOS os eventos foram registrados (senão a próxima rodada tenta de novo)
  if (!falhas.length) for (const b of r.baseParaSalvar) await estado.salvar(b.adaptador, b.itens);
}
const custo = await contador.estado();
const resumoFinal = {
  radar: "vigia", ensaio: ENSAIO, duracao_s: Math.round((Date.now() - t0) / 1000), adaptadores: r.porAdaptador.map(({ adaptador, ms, base_incompleta, inundacao, lidos, novos, alterados, eventos, primeira_leitura, leitura_suspeita, bloqueado, erros }) => ({ adaptador, ms, base_incompleta, inundacao, lidos, novos, alterados, eventos, primeira_leitura, leitura_suspeita, bloqueado, erros })),
  eventos: r.eventos.length, graves: r.eventos.filter((e) => e.gravidade === "grave").length, registrados, falhas_registro: falhas, chamadas_ia: r.chamadasIA, custo_mes_usd: custo.usd, teto_usd: custo.teto_usd, atingiu_teto: custo.atingiu_teto,
};
// a rodada só conta como feita (e a próxima só daqui a 3 dias) se tudo foi registrado
// (leitura que falhou por inteiro não conta: tenta de novo no dia seguinte; a duração de cada adaptador fica em resumo.adaptadores[].ms e resumo.duracao_s)
const leituraOk = r.porAdaptador.every((a) => a.lidos > 0 || !a.erros.length);
if (inicio && !falhas.length && leituraOk) await fetch(`${REST}/radar_rodadas?id=eq.${inicio}`, { method: "PATCH", headers: H, body: JSON.stringify({ terminou_em: new Date().toISOString(), resumo: { ...resumoFinal, adaptador: NOME, tarefa: idx } }) }).catch(() => {});
console.log(JSON.stringify(resumoFinal));
process.exit(falhas.length ? 1 : 0);
