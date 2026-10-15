/**
 * Simulado TRI — calibração própria das dificuldades (Rasch, JMLE) com as respostas dos alunos do StaziaMed.
 *
 *   npx tsx scripts/tri/calibrar.ts --arquivo MATRIZ.json          → SIMULA (padrão): calibra uma matriz salva em arquivo
 *                                                                    ([{ person, question_id, score }]) e mostra o resumo; não usa a rede
 *   npx tsx scripts/tri/calibrar.ts --banco [--env-file CAMINHO/.env]
 *                                                                  → lê a matriz do banco (public.irt_calibration_matrix, servidor) e
 *                                                                    mostra o resumo, SEM gravar
 *   npx tsx scripts/tri/calibrar.ts --banco --gravar [--env-file ...]
 *                                                                  → grava pelo banco (public.irt_save_calibration). Só com autorização
 *                                                                    do dono. Usa SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY; nunca imprime
 *                                                                    as chaves. Não usa chave de IA nenhuma.
 *
 * Por que aqui e não no banco: a calibração é iterativa (Newton alternado sobre a matriz inteira, com retirada de questões ruins e
 * nova calibração a cada rodada); no Node ela é simples de testar. O banco só confere e grava (estado provisória/calibrada/rejeitado).
 * A dificuldade provisória pelo percentual de acerto continua no banco (public.irt_refresh_provisional).
 *
 * Regras (adaptadas da NT 42/2025 do Inep; ver tri/02-engenharia-simulado-tri.md §2.2):
 *   - questão com menos de 30 respostas válidas não sai daqui (fica com a provisória);
 *   - fora (rejeitada), uma regra por rodada e recalibrando: correlação item × proficiência ≤ 0; |b| > 6,5; infit > 2; outfit > 2;
 *   - 30–99 respostas → provisória; ≥ 100 → calibrada (o banco decide pelo n_resp).
 */
import fs from "node:fs";
import { MINIMO_RASCH, calibrarJmle } from "./rasch";

export interface CelulaMatriz {
  person: string;
  question_id: string;
  score: number;
}

export interface ItemCalibrado {
  question_id: string;
  b: number;
  se_b: number | null;
  n_resp: number;
  n_correct: number;
  infit: number | null;
  outfit: number | null;
  reject_reason?: string;
}

/** Linhas (pessoa, questão, nota) → matriz pessoas × questões com null onde a pessoa não respondeu. */
export function montarMatriz(rows: CelulaMatriz[]) {
  const pessoas = [...new Set(rows.map((r) => r.person))];
  const itens = [...new Set(rows.map((r) => r.question_id))];
  const ip = new Map(pessoas.map((p, i) => [p, i]));
  const ii = new Map(itens.map((q, j) => [q, j]));
  const X: (number | null)[][] = pessoas.map(() => itens.map(() => null));
  for (const r of rows) X[ip.get(r.person)!][ii.get(r.question_id)!] = r.score ? 1 : 0;
  return { X, pessoas, itens };
}

function correlacao(a: number[], b: number[]): number {
  if (a.length < 3) return NaN;
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  a.forEach((x, i) => {
    num += (x - ma) * (b[i] - mb);
    da += (x - ma) ** 2;
    db += (b[i] - mb) ** 2;
  });
  return da && db ? num / Math.sqrt(da * db) : NaN;
}

/**
 * Calibra a matriz e devolve o que vai para irt_save_calibration: as questões com ≥ 30 respostas (as rejeitadas com o motivo) e
 * o resumo. Cada rodada tira UMA regra de exclusão (na ordem da NT 42) e recalibra sem as questões que já saíram.
 */
export function calibrarDaMatriz(rows: CelulaMatriz[], opts: { maxRodadas?: number } = {}) {
  const { X, pessoas, itens } = montarMatriz(rows);
  const rejeitadas = new Map<string, string>();
  const maxRodadas = opts.maxRodadas ?? 10;
  let rodadas = 0;
  let cal = calibrarJmle(X);
  const regras: [string, (j: number) => boolean][] = [
    ["correlação item × proficiência ≤ 0", (j) => {
      const xs: number[] = [];
      const ts: number[] = [];
      X.forEach((linha, i) => {
        const v = linha[j];
        const t = cal.theta[i];
        if (v !== null && t !== null) {
          xs.push(v);
          ts.push(t);
        }
      });
      const r = correlacao(xs, ts);
      return Number.isFinite(r) && r <= 0;
    }],
    ["|b| > 6,5", (j) => cal.b[j] !== null && Math.abs(cal.b[j]!) > 6.5],
    ["infit > 2", (j) => (cal.infit[j] ?? 0) > 2],
    ["outfit > 2", (j) => (cal.outfit[j] ?? 0) > 2],
  ];
  for (; rodadas < maxRodadas; rodadas++) {
    let saiu = false;
    for (const [motivo, regra] of regras) {
      const fora = itens.map((_, j) => j).filter((j) => cal.b[j] !== null && cal.nResp[j] >= MINIMO_RASCH && regra(j));
      if (fora.length) {
        fora.forEach((j) => rejeitadas.set(itens[j], motivo));
        saiu = true;
        break;
      }
    }
    if (!saiu) break;
    // recalibra sem as rejeitadas (viram ausentes na matriz)
    const Xr = X.map((linha) => linha.map((v, j) => (rejeitadas.has(itens[j]) ? null : v)));
    const nova = calibrarJmle(Xr);
    // as rejeitadas guardam a estimativa da rodada em que saíram
    itens.forEach((q, j) => {
      if (rejeitadas.has(q)) {
        nova.b[j] = cal.b[j];
        nova.se[j] = cal.se[j];
        nova.nResp[j] = cal.nResp[j];
        nova.nAcertos[j] = cal.nAcertos[j];
        nova.infit[j] = cal.infit[j];
        nova.outfit[j] = cal.outfit[j];
      }
    });
    cal = nova;
  }

  const items: ItemCalibrado[] = [];
  itens.forEach((q, j) => {
    const b = cal.b[j];
    if (b === null || cal.nResp[j] < MINIMO_RASCH) return;
    items.push({
      question_id: q,
      b: Math.max(-10, Math.min(10, b)),
      se_b: cal.se[j],
      n_resp: cal.nResp[j],
      n_correct: cal.nAcertos[j],
      infit: cal.infit[j],
      outfit: cal.outfit[j],
      ...(rejeitadas.has(q) ? { reject_reason: rejeitadas.get(q) } : {}),
    });
  });
  const resumo = {
    pessoas: pessoas.length,
    questoes: itens.length,
    respostas: rows.length,
    enviadas: items.length,
    calibradas: items.filter((i) => !i.reject_reason && i.n_resp >= 100).length,
    provisorias: items.filter((i) => !i.reject_reason && i.n_resp < 100).length,
    rejeitadas: items.filter((i) => i.reject_reason).length,
    poucas_respostas: itens.length - items.length,
    rodadas,
  };
  return { items, resumo, notes: { n_persons: pessoas.length, n_responses: rows.length, rodadas, metodo: "JMLE (L-1)/L" } };
}

// ---------------------------------------------------------------- linha de comando
async function main(argv: string[]) {
  const arg = (nome: string) => {
    const i = argv.indexOf(nome);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  let rows: CelulaMatriz[];
  let client: any = null;
  if (argv.includes("--banco")) {
    const envFile = arg("--env-file");
    if (envFile) (await import("dotenv")).config({ path: envFile });
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (use --env-file).");
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(url, key, { auth: { persistSession: false } });
    rows = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await client.rpc("irt_calibration_matrix").range(de, de + 999);
      if (error) throw new Error(`Matriz: ${error.message}`);
      rows.push(...(data as CelulaMatriz[]));
      if ((data as unknown[]).length < 1000) break;
    }
  } else {
    const arquivo = arg("--arquivo");
    if (!arquivo) throw new Error("Use --arquivo MATRIZ.json (simulação) ou --banco.");
    rows = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  }
  const { items, resumo, notes } = calibrarDaMatriz(rows);
  console.log(JSON.stringify(resumo, null, 2));
  if (argv.includes("--gravar")) {
    if (!client) throw new Error("--gravar só junto com --banco.");
    const { data, error } = await client.rpc("irt_save_calibration", { p_method: "jmle", p_items: items, p_notes: notes });
    if (error) throw new Error(`Gravar: ${error.message}`);
    console.log("Gravado:", JSON.stringify(data));
  } else {
    console.log("Simulação: nada foi gravado (para gravar: --banco --gravar, com autorização do dono).");
  }
}

if (process.argv[1] && /calibrar\.ts$/.test(process.argv[1])) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
