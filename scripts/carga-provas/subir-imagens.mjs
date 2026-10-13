// Envia as imagens da carga das provas (tabelas, figuras que faltavam e as da 2026/2) ao depósito privado "question-figures".
//
//   npx tsx scripts/carga-provas/subir-imagens.mjs                 → SIMULA (padrão): confere cada arquivo e diz o que enviaria; não lê
//                                                                    segredo nenhum e não usa a rede
//   npx tsx scripts/carga-provas/subir-imagens.mjs --enviar [--env-file CAMINHO/.env] [--pasta PASTA_DAS_IMAGENS]
//                                                                  → ENVIA (só com autorização do dono). Usa a mesma ligação do sistema
//                                                                    (server/contentHub/infra.ts, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
//                                                                    do .env); nunca imprime as chaves.
// Regras: cada arquivo é conferido como o servidor confere uma figura (PNG completo, até 5 MB) e pelo sha256 do manifesto; arquivo
// que já está no depósito com o mesmo conteúdo é pulado; com conteúdo DIFERENTE o envio PARA (nunca sobrescreve). Depois de enviar,
// baixa de volta e confere o sha256. No fim grava um relatório (resultado-envio-imagens.json) ao lado do manifesto.
// Depois do envio, cole a parte 4 do pacote (4-ligar-imagens-DEPOIS-do-envio.sql).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { imageProblem } from "../../server/questions/imageFiles";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const MAX = 5 * 1024 * 1024;

/** Confere os arquivos do manifesto numa pasta: [{ item, bytes } | { item, problema }]. */
export function conferirArquivos(manifesto, pasta) {
  return manifesto.imagens.map((item) => {
    const p = path.join(pasta, item.arquivo);
    if (!fs.existsSync(p)) return { item, problema: "arquivo não encontrado na pasta" };
    const bytes = fs.readFileSync(p);
    if (bytes.length !== item.tamanho) return { item, problema: `tamanho ${bytes.length}, o manifesto diz ${item.tamanho}` };
    if (sha(bytes) !== item.sha256) return { item, problema: "sha256 diferente do manifesto" };
    if (bytes.length > MAX) return { item, problema: "maior que 5 MB" };
    if (item.content_type !== "image/png" || !/^questoes\/[0-9a-f]{32}\.png$/.test(item.destino)) return { item, problema: "tipo ou destino inválido" };
    const defeito = imageProblem(bytes, "image/png");
    if (defeito) return { item, problema: `não é um PNG completo (${defeito})` };
    return { item, bytes };
  });
}

/**
 * Envia (ou simula). storage: { exists(key), get(key), put(key, bytes, type) } — no envio real, o supabaseStorage do sistema.
 * Devolve { modo, total, enviadas, ja_estavam, problemas: [...], itens: [...] }.
 */
export async function enviarImagens({ manifesto, pasta, storage = null, enviar = false, log = () => {} }) {
  const conferidos = conferirArquivos(manifesto, pasta);
  const problemas = conferidos.filter((c) => c.problema).map((c) => ({ arquivo: c.item.arquivo, problema: c.problema }));
  const resultado = { modo: enviar ? "enviar" : "simular", total: manifesto.imagens.length, enviadas: 0, ja_estavam: 0, problemas, itens: [] };
  if (problemas.length) return resultado; // nenhum envio com arquivo errado na pasta
  for (const { item, bytes } of conferidos) {
    if (!enviar) {
      resultado.itens.push({ arquivo: item.arquivo, destino: item.destino, situacao: "seria enviada", tamanho: item.tamanho });
      continue;
    }
    if (await storage.exists(item.destino)) {
      const ja = await storage.get(item.destino);
      if (sha(ja) !== item.sha256) {
        resultado.problemas.push({ arquivo: item.arquivo, problema: `o depósito já tem OUTRO arquivo em ${item.destino}: nada foi sobrescrito` });
        break;
      }
      resultado.ja_estavam++;
      resultado.itens.push({ arquivo: item.arquivo, destino: item.destino, situacao: "já estava no depósito (mesmo conteúdo)" });
      continue;
    }
    await storage.put(item.destino, bytes, "image/png");
    const volta = await storage.get(item.destino);
    if (sha(volta) !== item.sha256) {
      resultado.problemas.push({ arquivo: item.arquivo, problema: "o arquivo que voltou do depósito tem outro sha256" });
      break;
    }
    resultado.enviadas++;
    resultado.itens.push({ arquivo: item.arquivo, destino: item.destino, situacao: "enviada e conferida" });
    log(`enviada ${resultado.enviadas}/${resultado.total}: ${item.arquivo}`);
  }
  return resultado;
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
  const valor = (nome) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : null);
  const enviar = args.includes("--enviar");
  const manifesto = JSON.parse(fs.readFileSync(valor("--manifesto") ?? path.join(AQUI, "manifesto-imagens.json"), "utf8"));
  const pasta = valor("--pasta") ?? path.join(AQUI, "imagens");
  let storage = null;
  if (enviar) {
    const env = acharEnv(valor("--env-file"));
    if (!env) throw new Error("Não achei o arquivo .env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Use --env-file.");
    const dotenv = await import("dotenv");
    dotenv.config({ path: env, quiet: true });
    if (!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("O .env não tem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
    const { supabaseStorage } = await import("../../server/contentHub/infra");
    storage = supabaseStorage(manifesto.bucket);
    console.log(`ENVIO REAL ao depósito "${manifesto.bucket}" (chaves lidas de ${env}; não são mostradas).`);
  } else {
    console.log("SIMULAÇÃO (padrão): nada é enviado, nenhuma chave é lida. Para enviar, só com autorização do dono: --enviar");
  }
  const r = await enviarImagens({ manifesto, pasta, storage, enviar, log: console.log });
  const saida = path.join(path.dirname(valor("--manifesto") ?? path.join(AQUI, "manifesto-imagens.json")), enviar ? "resultado-envio-imagens.json" : "resultado-simulacao-imagens.json");
  fs.writeFileSync(saida, JSON.stringify({ quando: new Date().toISOString(), ...r }, null, 1) + "\n");
  const bytes = manifesto.imagens.reduce((s, i) => s + i.tamanho, 0);
  console.log(`${r.total} imagens (${(bytes / 1024 / 1024).toFixed(1)} MB). ${enviar ? `Enviadas: ${r.enviadas}. Já estavam: ${r.ja_estavam}.` : `Conferidas: ${r.itens.length}.`} Problemas: ${r.problemas.length}.`);
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
