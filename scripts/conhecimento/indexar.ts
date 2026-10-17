// CÉREBRO DO TUTOR — roda o indexador do conhecimento aprovado (server/tutor/conhecimento/indexador.ts) num banco LOCAL (PGlite).
// NUNCA na produção: este script só abre pasta de PGlite. Em produção, o indexador entra no processamento (Cloud Run) a cada 10 minutos
// e só depois da ordem do dono (passo 13 do desenho), com a migração 20261003013620 aplicada pelo ramo de publicação.
//
//   node_modules/.bin/tsx scripts/conhecimento/indexar.ts --pglite <pasta>          (sem vetores: só palavras)
//   ... --vetores        gera os vetores que faltam pelo Google (CONTENT_HUB_EMBEDDINGS_* do .env; gasto estimado no fim)
//   ... --max-vetores N  teto de vetores nesta rodada (padrão 20000)
//   ... --estimar        só conta caracteres e estima o custo dos vetores (nada é gravado)
//
// Custo (desenho §5.2): US$ 0,20 por milhão de tokens, ~3,5 caracteres por token. Fontes reaproveitam o vetor da Central (custo 0).
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createEmbedder, embeddingsConfig } from "../../server/contentHub/embeddings";
import { custoEstimado, sincronizar } from "../../server/tutor/conhecimento/indexador";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const tem = (k: string) => process.argv.includes(k);
const dir = arg("--pglite");
if (!dir) {
  console.error("Uso: tsx scripts/conhecimento/indexar.ts --pglite <pasta do banco local> [--vetores] [--max-vetores N] [--estimar]");
  process.exit(2);
}
const pg = new PGlite(path.resolve(dir));
const db = {
  mode: "dev" as const,
  async service<T>(fn: string, args: Record<string, unknown> = {}) {
    if (!/^(ch_worker_[a-z_]+)$/.test(fn)) throw new Error(`Função não permitida: ${fn}`);
    const keys = Object.keys(args);
    const r = await pg.query<{ result: T }>(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, keys.map((k) => args[k]));
    return r.rows[0]?.result as T;
  },
};

if (tem("--estimar")) {
  const r = (await pg.query<{ tipo: string; chars: number; n: number }>(`
    select 'aula' as tipo, coalesce(sum(char_length(v.content::text)), 0)::bigint as chars, count(*)::int as n from public.lessons l join public.ch_unit_versions v on v.id = l.ch_version_id where public.tutor_kb_versao_atual('aula', l.id::text) is not null
    union all select 'atualizacao', coalesce(sum(char_length(concat_ws(' ', g.current_conduct, g.before_text, g.clinical_impact, g.exam_impact, g.trap, g.timeline::text))), 0), count(*) from public.guideline_updates g where public.tutor_kb_versao_atual('atualizacao', g.id::text) is not null
    union all select 'questao', coalesce(sum(300 + char_length(coalesce(q.expected_conduct, '')) + 2000 / 4), 0), count(*) from public.questions q where public.tutor_kb_versao_atual('questao', q.id) is not null
    union all select 'flashcard', coalesce(sum(char_length(f.front) + char_length(f.back)), 0), count(*) from public.flashcards f where public.tutor_kb_versao_atual('flashcard', f.id::text) is not null
    union all select 'rotulos', coalesce(sum(char_length(q.statement)), 0), count(*) from public.questions q where q.retired_at is null`)).rows;
  let total = 0;
  for (const x of r) { total += Number(x.chars); console.log(`${x.tipo.padEnd(12)} ${String(x.n).padStart(6)} origens  ${String(x.chars).padStart(10)} caracteres  ≈ US$ ${custoEstimado(Number(x.chars)).toFixed(4)}`); }
  console.log(`TOTAL ≈ US$ ${custoEstimado(total).toFixed(4)} (fontes: 0, vetores da Central reaproveitados)`);
  await pg.close();
  process.exit(0);
}

const embedder = tem("--vetores") ? createEmbedder(embeddingsConfig()) : null;
if (tem("--vetores") && !embedder) {
  console.error(`Vetores pedidos, mas o acesso ao Google não está pronto: ${embeddingsConfig().pending}`);
  process.exit(2);
}
const rel = await sincronizar(db, { embedder, maxVetores: Number(arg("--max-vetores")) || 20_000, log: (m) => console.log(m), pausaMs: embedder ? 300 : 0 });
console.log(JSON.stringify(rel, null, 2));
console.log(JSON.stringify(await db.service("ch_worker_tutor_kb_situacao", {}), null, 2));
await pg.close();
