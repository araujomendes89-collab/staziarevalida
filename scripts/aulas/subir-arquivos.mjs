// Envia as imagens e o PDF de uma aula pronta ao depósito privado "content-hub" (pasta aulas-prontas/<código>/), nos caminhos que a
// importação (app_ch_import_lesson_package, migração 9950) gravou como referência nos materiais da aula.
//
//   npx tsx scripts/aulas/subir-arquivos.mjs --pacote <pacote-GR-001.json> --pasta <aulas-piloto/GR-001>
//        → SIMULA (padrão): confere cada arquivo (tamanho e sha256 do pacote) e diz o que enviaria; não lê segredo e não usa a rede
//   npx tsx scripts/aulas/subir-arquivos.mjs --pacote ... --pasta ... --enviar [--env-file CAMINHO/.env]
//        → ENVIA (só com autorização do dono). Usa a mesma ligação do sistema (server/contentHub/infra.ts, SUPABASE_URL e
//          SUPABASE_SERVICE_ROLE_KEY do .env); nunca imprime as chaves.
// Regras: arquivo que já está no depósito com o mesmo conteúdo é pulado; com conteúdo DIFERENTE o envio PARA (nunca sobrescreve).
// Depois de enviar, baixa de volta e confere o sha256. No fim grava um relatório ao lado do pacote.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pastaDaAula } from "./gerar-sql-importacao.mjs";

export const DEPOSITO = "content-hub";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const TIPOS = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

/** Confere os arquivos do pacote na pasta da aula: [{ item, local, bytes } | { item, problema }]. */
export function conferirArquivos(pacote, pastaAula) {
  const dir = pastaDaAula(pastaAula);
  const prefixo = `aulas-prontas/${pacote.codigo}/`;
  return (pacote.arquivos ?? []).map((item) => {
    if (!item.caminho?.startsWith(prefixo) || item.caminho.includes("..")) return { item, problema: `caminho fora de ${prefixo}` };
    if (!TIPOS.has(item.tipo)) return { item, problema: `tipo ${item.tipo} não aceito pelo depósito` };
    // caminho com a pasta da versão no depósito (aulas-prontas/<código>/v5/imagens/...): na pasta local o arquivo fica sem ela
    const rel = item.caminho.slice(prefixo.length);
    const local = [path.join(dir, rel), path.join(dir, rel.replace(/^v\d+\//, ""))].find((p) => fs.existsSync(p)) ?? path.join(dir, rel);
    if (!fs.existsSync(local)) return { item, problema: `arquivo não encontrado em ${dir}` };
    const bytes = fs.readFileSync(local);
    if (item.bytes != null && bytes.length !== Number(item.bytes)) return { item, problema: `tamanho ${bytes.length}, o pacote diz ${item.bytes}` };
    if (sha(bytes) !== item.sha256) return { item, problema: "sha256 diferente do pacote" };
    if (item.tipo === "application/pdf" && bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return { item, problema: "não começa como PDF" };
    if (item.tipo === "image/png" && bytes.subarray(1, 4).toString("latin1") !== "PNG") return { item, problema: "não é PNG" };
    return { item, local, bytes };
  });
}

/** Envia (ou simula). storage: { exists, get, put } — no envio real, o supabaseStorage do sistema. */
export async function enviarArquivos({ pacote, pastaAula, storage = null, enviar = false, log = () => {} }) {
  const conferidos = conferirArquivos(pacote, pastaAula);
  const problemas = conferidos.filter((c) => c.problema).map((c) => ({ arquivo: c.item.caminho, problema: c.problema }));
  const r = { modo: enviar ? "enviar" : "simular", deposito: DEPOSITO, total: conferidos.length, enviados: 0, ja_estavam: 0, problemas, itens: [] };
  if (problemas.length) return r; // nada sobe com arquivo errado na pasta
  for (const { item, bytes } of conferidos) {
    if (!enviar) {
      r.itens.push({ destino: item.caminho, situacao: "seria enviado", bytes: bytes.length });
      continue;
    }
    if (await storage.exists(item.caminho)) {
      if (sha(await storage.get(item.caminho)) !== item.sha256) {
        r.problemas.push({ arquivo: item.caminho, problema: "o depósito já tem OUTRO arquivo nesse caminho: nada foi sobrescrito" });
        break;
      }
      r.ja_estavam++;
      r.itens.push({ destino: item.caminho, situacao: "já estava no depósito (mesmo conteúdo)" });
      continue;
    }
    await storage.put(item.caminho, bytes, item.tipo);
    if (sha(await storage.get(item.caminho)) !== item.sha256) {
      r.problemas.push({ arquivo: item.caminho, problema: "o arquivo que voltou do depósito tem outro sha256" });
      break;
    }
    r.enviados++;
    r.itens.push({ destino: item.caminho, situacao: "enviado e conferido" });
    log(`enviado ${r.enviados}/${r.total}: ${item.caminho}`);
  }
  return r;
}

/** O .env do projeto: o indicado, o da pasta atual ou o da pasta principal do repositório (os ramos ficam em .claude/worktrees). */
function acharEnv(indicado) {
  if (indicado) return indicado;
  if (fs.existsSync(".env")) return path.resolve(".env");
  try {
    const comum = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
    const p = path.join(path.dirname(comum), ".env");
    if (fs.existsSync(p)) return p;
  } catch {}
  return null;
}

async function principal() {
  const args = process.argv.slice(2);
  const valor = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const enviar = args.includes("--enviar");
  if (!valor("--pacote") || !valor("--pasta")) throw new Error("Use --pacote <pacote-GR-001.json> --pasta <aulas-piloto/GR-001>.");
  const pacote = JSON.parse(fs.readFileSync(valor("--pacote"), "utf8"));
  let storage = null;
  if (enviar) {
    const env = acharEnv(valor("--env-file"));
    if (!env) throw new Error("Não achei o arquivo .env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Use --env-file.");
    const dotenv = await import("dotenv");
    dotenv.config({ path: env, quiet: true });
    if (!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("O .env não tem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
    const { supabaseStorage } = await import("../../server/contentHub/infra");
    storage = supabaseStorage(DEPOSITO);
    console.log(`ENVIO REAL ao depósito "${DEPOSITO}" (chaves lidas de ${env}; não são mostradas).`);
  } else {
    console.log("SIMULAÇÃO (padrão): nada é enviado, nenhuma chave é lida. Para enviar, só com autorização do dono: --enviar");
  }
  const r = await enviarArquivos({ pacote, pastaAula: valor("--pasta"), storage, enviar, log: console.log });
  const saida = path.join(path.dirname(valor("--pacote")), enviar ? `resultado-envio-arquivos-${pacote.codigo}.json` : `resultado-simulacao-arquivos-${pacote.codigo}.json`);
  fs.writeFileSync(saida, JSON.stringify({ quando: new Date().toISOString(), ...r }, null, 1) + "\n");
  const mb = (pacote.arquivos ?? []).reduce((s, a) => s + Number(a.bytes ?? 0), 0) / 1024 / 1024;
  console.log(`${r.total} arquivos (${mb.toFixed(1)} MB). ${enviar ? `Enviados: ${r.enviados}. Já estavam: ${r.ja_estavam}.` : `Conferidos: ${r.itens.length}.`} Problemas: ${r.problemas.length}.`);
  for (const p of r.problemas) console.log(`  PROBLEMA: ${p.arquivo}: ${p.problema}`);
  console.log(`Relatório: ${saida}`);
  if (r.problemas.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
