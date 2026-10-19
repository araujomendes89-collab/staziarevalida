/**
 * Imagens de UMA estação da Montagem do INEP para a sala da 2ª fase (ver imagensEstacaoInep.ts). Nunca grava no banco.
 *
 *   PREPARAR (não conecta em nada; precisa do Chromium do Playwright para a folha):
 *     npx tsx scripts/dupla/imagens-estacao-inep.ts preparar <pasta-da-estacao> <pasta-do-pacote>
 *     → <pacote>/arquivos/<sha256>.png, manifest.json e ligar-imagens-<estação>.sql
 *     A folha é desenhada pelo gerador do app com a fonte que o banco calcula (dupla_folha_fonte) para o conteúdo da carga
 *     (banco em memória com todas as migrações + a carga da mesma pasta).
 *
 *   ENVIAR (só com ordem do dono):
 *     npx tsx scripts/dupla/imagens-estacao-inep.ts enviar <pasta-do-pacote>             só mostra o que subiria
 *     npx tsx scripts/dupla/imagens-estacao-inep.ts enviar <pasta-do-pacote> --local     sobe para .data/content-hub
 *     npx tsx scripts/dupla/imagens-estacao-inep.ts enviar <pasta-do-pacote> --producao  sobe ao depósito content-hub do
 *       Supabase (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente; as chaves nunca são impressas). Nunca troca nem apaga.
 *
 *   LIGAR: o SQL ligar-imagens-<estação>.sql, pelo método de sempre (ensaio com ROLLBACK, depois gravação com ordem do dono).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildCargaEstacao } from "./cargaEstacaoInep";
import {
  enviarPacote,
  gravarPacote,
  imagemDoArquivo,
  impressosDaPasta,
  lerPacote,
  sqlLigarImagens,
  type DepositoSoNovo,
  type PacoteImagens,
} from "./imagensEstacaoInep";

const BUCKET = "content-hub";

async function fonteDaFolha(pasta: string, stationId: string): Promise<{ fonte: any; hash: string; versao: string }> {
  const { PGlite } = await import("@electric-sql/pglite");
  const carga = buildCargaEstacao(
    fs.readFileSync(path.join(pasta, "estacao-app.json"), "utf8"),
    fs.readFileSync(path.join(pasta, "aprovacao-dono.md"), "utf8")
  );
  if (carga.station.id !== stationId) throw new Error("A carga e as imagens são de estações diferentes.");
  // banco em memória com o ambiente mínimo do Supabase (o mesmo dos testes) e todas as migrações do repositório
  const raiz = process.cwd();
  const migracoes = path.join(raiz, "supabase/migrations");
  if (!fs.existsSync(migracoes)) throw new Error("Rode da raiz do repositório (falta supabase/migrations).");
  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync(path.join(raiz, "supabase/tests/bootstrap.sql"), "utf8"));
    for (const f of fs.readdirSync(migracoes).filter((x) => x.endsWith(".sql")).sort()) {
      await db.exec(fs.readFileSync(path.join(migracoes, f), "utf8"));
    }
    await db.exec(carga.sql);
    const r = await db.query<{ v: { fonte: any; hash: string } }>(`select public.ch_worker_dupla_folha_fonte($1) as v`, [stationId]);
    const v = r.rows[0].v;
    if (v.fonte.bloqueio) throw new Error(`A folha não pode ser gerada: ${v.fonte.bloqueio}`);
    return { ...v, versao: String(carga.station.version ?? "") };
  } finally {
    await db.close();
  }
}

async function preparar(pasta: string, saida: string) {
  const { station_id, imagens } = impressosDaPasta(pasta);
  const dados = new Map<string, Buffer>(imagens.map((i) => [i.imagem.sha256, i.data]));
  console.log(`[imagens] ${station_id}: ${imagens.length} impresso(s) com imagem`);

  const { fonte, hash, versao } = await fonteDaFolha(pasta, station_id);
  const { createRenderer } = await import("../../server/contentHub/render");
  const { desenharFolha } = await import("../../server/dupla/folha");
  const { FOLHA_MODELO } = await import("../../src/shared/dupla/folhaCandidato");
  const renderer = await createRenderer();
  if (!renderer) throw new Error("Chromium do Playwright indisponível (npx playwright install chromium).");
  let folhaPng: Buffer;
  try {
    folhaPng = (await desenharFolha(renderer, fonte)).png;
  } finally {
    await renderer.close().catch(() => undefined);
  }
  const folha = imagemDoArquivo(folhaPng, { tipo: "folha", impresso_id: null, nome: "Folha do candidato", origem: `gerada pelo app (${FOLHA_MODELO})` });
  dados.set(folha.sha256, folhaPng);

  const pacote: PacoteImagens = {
    station_id,
    versao_conteudo: versao || null,
    preparado_em: new Date().toISOString(),
    folha: { modelo: FOLHA_MODELO, fonte_hash: hash, fonte },
    imagens: [...imagens.map((i) => i.imagem), folha],
  };
  gravarPacote(saida, pacote, dados);
  const sqlArq = path.join(saida, `ligar-imagens-${station_id}.sql`);
  fs.writeFileSync(sqlArq, sqlLigarImagens(pacote));
  for (const im of pacote.imagens) console.log(`[imagens] ${im.tipo} ${im.impresso_id ?? ""} ${im.width}×${im.height} → ${im.storage_path}`);
  console.log(`[imagens] pacote em ${saida} (manifest.json, arquivos/, ${path.basename(sqlArq)})`);
}

function depositoSupabase(): DepositoSoNovo {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const bucket = admin.storage.from(BUCKET);
  return {
    async exists(k) {
      const dir = path.posix.dirname(k);
      const { data, error } = await bucket.list(dir, { search: path.posix.basename(k) });
      if (error) throw new Error(`depósito: ${error.message}`);
      return Boolean(data?.some((f) => f.name === path.posix.basename(k)));
    },
    async get(k) {
      const { data, error } = await bucket.download(k);
      if (error || !data) throw new Error(`depósito: ${error?.message ?? "arquivo não encontrado"}`);
      return Buffer.from(await data.arrayBuffer());
    },
    async putNovo(k, data, contentType) {
      const { error } = await bucket.upload(k, data, { contentType, upsert: false, cacheControl: "3600" });
      if (error) throw new Error(`depósito: ${error.message}`);
    },
  };
}

function depositoLocal(): DepositoSoNovo {
  const dir = process.env.CONTENT_HUB_STORAGE_DIR || path.join(process.cwd(), ".data/content-hub");
  const full = (k: string) => path.join(dir, k);
  return {
    async exists(k) {
      return fs.existsSync(full(k));
    },
    async get(k) {
      return fs.readFileSync(full(k));
    },
    async putNovo(k, data) {
      fs.mkdirSync(path.dirname(full(k)), { recursive: true });
      fs.writeFileSync(full(k), data, { flag: "wx" });
    },
  };
}

async function enviar(pasta: string) {
  const { pacote, dados } = lerPacote(pasta);
  const producao = process.argv.includes("--producao");
  const local = process.argv.includes("--local");
  if (!producao && !local) {
    console.log(`[imagens] SIMULAÇÃO (nada sobe). ${pacote.station_id}: ${pacote.imagens.length} arquivo(s) para o depósito ${BUCKET}:`);
    for (const im of pacote.imagens) console.log(`  ${im.tipo.padEnd(8)} ${String(im.impresso_id ?? "").padEnd(22)} ${im.storage_path} (${im.bytes} bytes)`);
    console.log(`[imagens] Para subir: --local (pasta .data/content-hub) ou --producao (Supabase, só com ordem do dono).`);
    return;
  }
  const deposito = producao ? depositoSupabase() : depositoLocal();
  console.log(`[imagens] enviando ${pacote.imagens.length} arquivo(s) para ${producao ? "o Supabase (PRODUÇÃO)" : "a pasta local"}…`);
  const r = await enviarPacote(deposito, pacote, dados, (m) => console.log(m));
  console.log(`[imagens] pronto: ${r.enviados.length} enviado(s), ${r.iguais.length} já estavam iguais. Agora o SQL ligar-imagens-${pacote.station_id}.sql.`);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "preparar" && a && b) return preparar(a, b);
  if (cmd === "enviar" && a) return enviar(a);
  console.error("Uso: preparar <pasta-da-estacao> <pasta-do-pacote> | enviar <pasta-do-pacote> [--local | --producao]");
  process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(`[imagens] falhou: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 300));
