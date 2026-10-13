#!/usr/bin/env node
/**
 * Gera o SQL (idempotente, para o dono colar no Supabase) com os PERFIS das questões escritos pelos agentes da revisão local
 * (sem chave do sistema e SEM revisão médica). Motor de similaridade: migração 20261003009910 (tabela question_profiles).
 *
 * Lê <pasta>/<prova>/prof-NN.json (lista de objetos do Professor; regras em comentarios-agentes/regras-agentes.md). De cada
 * questão usa `id`, `tema`, `subtema`, `confianca` (0 a 100) e o objeto `perfil` (competencia, cenario, problema_central,
 * conceitos, achados_discriminatorios, raciocinio_cobrado, tipo, complexidade). Questão sem `perfil` é pulada (e contada).
 * Os vetores NÃO são gerados aqui: o processamento do sistema faz isso quando o dono ligar a função "Questões parecidas".
 *
 *   node scripts/similaridade/gerar-sql-perfis.mjs [--pasta <revisao-questoes>] [--saida <arquivo.sql>] [--taxonomia <mapa.json>]
 *
 *   --taxonomia (opcional): { "<id da questão>": "<id do nó>" } ou { "<id da questão>": { "no": "<id>", "pai": "<id>" } }, da
 *   Taxonomia Médica Oficial quando ela for aprovada. Sem ele o nó fica nulo (e um nó já gravado não é apagado).
 *
 * Regras do SQL: só entra questão que existe no banco; o perfil gravado por pessoa da equipe ("revisor") ou pela IA não é
 * sobrescrito; colar de novo atualiza só os perfis da revisão local. A última linha mostra "OK: ..." com a contagem.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PASTA_PADRAO = "/private/tmp/claude-501/-Volumes-StaziaMed/5d3dd43b-7aaf-486f-81c4-583d693b3d8e/scratchpad/revisao-questoes";
export const COMPETENCIAS = ["diagnostico", "conduta_inicial", "tratamento", "exame_complementar", "prevencao_rastreamento", "prognostico_complicacoes",
  "fisiopatologia_conceito", "saude_coletiva_epidemiologia", "etica_legislacao", "organizacao_sus"];
export const CENARIOS = ["atencao_primaria", "urgencia_emergencia", "enfermaria_hospital", "ambulatorio_especializado", "centro_obstetrico", "comunidade_territorio", "nao_se_aplica"];
export const TIPOS = ["caso_clinico", "conceitual", "imagem", "dados_epidemiologicos"];
const ID = /^[a-z0-9_]+$/;
const NO = /^[a-z0-9][a-z0-9._-]*$/;

const texto = (v, max) => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};
const lista = (v, maxItens, max) => (Array.isArray(v) ? v.map((x) => texto(x, max)).filter(Boolean).slice(0, maxItens) : []);
const vocab = (v, ok, avisos, campo, id) => {
  if (v == null || v === "") return null;
  if (ok.includes(v)) return v;
  avisos.push(`${id}: ${campo} fora da lista ("${String(v).slice(0, 40)}"), gravado vazio`);
  return null;
};

/** Lê os arquivos prof-*.json da pasta (cada prova numa subpasta). Devolve os perfis (o último arquivo vence) e o relato. */
export function lerPerfis(pasta, mapaTaxonomia = {}) {
  const avisos = [];
  const porId = new Map();
  let arquivos = 0;
  let semPerfil = 0;
  let total = 0;
  const provas = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((d) => fs.statSync(path.join(pasta, d)).isDirectory()).sort() : [];
  for (const prova of provas) {
    const dir = path.join(pasta, prova);
    for (const f of fs.readdirSync(dir).filter((x) => /^prof-\d+\.json$/.test(x)).sort()) {
      arquivos++;
      let lote;
      try {
        lote = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch (e) {
        avisos.push(`${prova}/${f}: arquivo ilegível (${e.message.slice(0, 80)}), pulado`);
        continue;
      }
      if (!Array.isArray(lote)) {
        avisos.push(`${prova}/${f}: não é uma lista, pulado`);
        continue;
      }
      for (const q of lote) {
        total++;
        if (!q || typeof q.id !== "string" || !ID.test(q.id)) {
          avisos.push(`${prova}/${f}: item sem id válido, pulado`);
          continue;
        }
        const p = q.perfil;
        if (!p || typeof p !== "object" || Array.isArray(p)) {
          semPerfil++;
          continue;
        }
        const comp = Number(p.complexidade);
        const conf = Number(q.confianca);
        const tax = mapaTaxonomia[q.id];
        const no = typeof tax === "string" ? tax : tax?.no ?? null;
        const pai = typeof tax === "object" && tax ? tax.pai ?? null : null;
        porId.set(q.id, {
          id: q.id,
          origem_arquivo: `${prova}/${f}`,
          tema: texto(q.tema, 200),
          subtema: texto(q.subtema, 300),
          taxonomy_node_id: no && NO.test(no) ? no.slice(0, 200) : null,
          taxonomy_parent_id: pai && NO.test(pai) ? pai.slice(0, 200) : null,
          competencia: vocab(p.competencia, COMPETENCIAS, avisos, "competencia", q.id),
          cenario: vocab(p.cenario, CENARIOS, avisos, "cenario", q.id),
          problema_central: texto(p.problema_central, 300),
          conceitos: lista(p.conceitos, 12, 200),
          achados_discriminatorios: lista(p.achados_discriminatorios, 10, 300),
          raciocinio_cobrado: texto(p.raciocinio_cobrado, 600),
          tipo: vocab(p.tipo, TIPOS, avisos, "tipo", q.id),
          complexidade: Number.isInteger(comp) && comp >= 1 && comp <= 3 ? comp : null,
          confianca: Number.isFinite(conf) && conf >= 0 && conf <= 100 ? Math.round(conf) / 100 : null,
        });
      }
    }
  }
  const perfis = [...porId.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { perfis, relato: { provas: provas.length, arquivos, itens: total, com_perfil: perfis.length, sem_perfil: semPerfil, avisos } };
}

const lit = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const arr = (xs) => (xs.length ? `array[${xs.map(lit).join(", ")}]::text[]` : "'{}'::text[]");

/** O SQL idempotente (lotes de 100 questões). */
export function sqlPerfis(perfis, relato = null) {
  const out = [
    "-- =============================================================================",
    "-- Perfis das questões da REVISÃO LOCAL (agentes, sem chave do sistema e SEM revisão médica) para o motor de questões parecidas.",
    `-- Gerado por scripts/similaridade/gerar-sql-perfis.mjs em ${new Date().toISOString()}.`,
    relato ? `-- ${relato.com_perfil} questões com perfil (${relato.sem_perfil} ainda sem perfil) em ${relato.arquivos} arquivos de ${relato.provas} provas.` : "--",
    "-- Depende da migração 20261003009910 (1-Similaridade.sql). Pode ser colado de novo: atualiza só os perfis da revisão local;",
    "-- perfil gravado pela equipe (revisor) ou pela IA não é sobrescrito; nó da taxonomia já gravado não é apagado.",
    "-- =============================================================================",
    "",
  ];
  const cols = "id, tema, subtema, taxonomy_node_id, taxonomy_parent_id, competencia, cenario, problema_central, conceitos, achados_discriminatorios, raciocinio_cobrado, tipo, complexidade, confianca";
  for (let i = 0; i < perfis.length; i += 100) {
    const rows = perfis.slice(i, i + 100).map((p) =>
      `  (${[lit(p.id), lit(p.tema), lit(p.subtema), lit(p.taxonomy_node_id), lit(p.taxonomy_parent_id), lit(p.competencia), lit(p.cenario), lit(p.problema_central),
        arr(p.conceitos), arr(p.achados_discriminatorios), lit(p.raciocinio_cobrado), lit(p.tipo), p.complexidade ?? "null", p.confianca ?? "null"].join(", ")})`
    );
    out.push(
      `insert into public.question_profiles as p (question_id, area, tema, subtema, taxonomy_node_id, taxonomy_parent_id, competencia, cenario, problema_central,
  conceitos, achados_discriminatorios, raciocinio_cobrado, tipo, complexidade, confianca, origem, basis_hash, updated_at)
select q.id, q.area::text, v.tema, v.subtema, v.taxonomy_node_id, v.taxonomy_parent_id, v.competencia, v.cenario, v.problema_central,
       v.conceitos, v.achados_discriminatorios, v.raciocinio_cobrado, v.tipo, v.complexidade::smallint, v.confianca::real, 'revisao_local',
       public.similarity_text_hash(q.statement, q.options), now()
from (values
${rows.join(",\n")}
) as v (${cols})
join public.questions q on q.id = v.id
on conflict (question_id) do update
   set area = excluded.area, tema = excluded.tema, subtema = excluded.subtema,
       taxonomy_node_id = coalesce(excluded.taxonomy_node_id, p.taxonomy_node_id),
       taxonomy_parent_id = coalesce(excluded.taxonomy_parent_id, p.taxonomy_parent_id),
       competencia = excluded.competencia, cenario = excluded.cenario, problema_central = excluded.problema_central,
       conceitos = excluded.conceitos, achados_discriminatorios = excluded.achados_discriminatorios, raciocinio_cobrado = excluded.raciocinio_cobrado,
       tipo = excluded.tipo, complexidade = excluded.complexidade, confianca = excluded.confianca, basis_hash = excluded.basis_hash, updated_at = now()
 where p.origem in ('revisao_local', 'dna');
`
    );
  }
  out.push(
    `select case when count(*) > 0 then 'OK: ' || count(*) || ' perfis da revisão local no banco (${perfis.length} neste arquivo; questão que não existe no banco é pulada).'
            else 'FALTA: nenhum perfil da revisão local no banco.' end as resultado
from public.question_profiles where origem = 'revisao_local';`
  );
  return out.join("\n") + "\n";
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) o[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
  return o;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  const pasta = a.pasta || PASTA_PADRAO;
  const mapa = a.taxonomia ? JSON.parse(fs.readFileSync(a.taxonomia, "utf8")) : {};
  const { perfis, relato } = lerPerfis(pasta, mapa);
  const sql = sqlPerfis(perfis, relato);
  if (a.saida) fs.writeFileSync(a.saida, sql);
  else process.stdout.write(sql);
  console.error(`[perfis] ${relato.com_perfil} questões com perfil, ${relato.sem_perfil} sem perfil, ${relato.arquivos} arquivos, ${relato.provas} provas${a.saida ? ` → ${a.saida}` : ""}.`);
  for (const x of relato.avisos.slice(0, 30)) console.error(`[perfis] aviso: ${x}`);
  if (relato.avisos.length > 30) console.error(`[perfis] … e mais ${relato.avisos.length - 30} aviso(s).`);
}
