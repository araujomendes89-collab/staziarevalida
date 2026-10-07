/**
 * Comando do administrador: "Novo material visual" pelo terminal (cards de feed, página A4, story e flashcards
 * frente e verso). Usa a MESMA rotina do formulário da Central de Conteúdo: a mesma validação
 * (src/shared/visualMaterials), a mesma gravação com versões (ch_worker_visual_save), a mesma fila e a mesma
 * geração com conferência (etapa visual_render). Nada de credencial nova: usa o banco configurado no servidor
 * (.env) e quem assina é uma conta da equipe, pelo e-mail.
 *
 * Uso:
 *   npx tsx scripts/content-hub/material-visual.ts --autor EMAIL --modelo flashcard_a6 --especialidade cirurgia \
 *       --campo tema="…" --campo pergunta="…" --campo resposta="…" --gerar --saida ./materiais
 *   npx tsx scripts/content-hub/material-visual.ts --autor EMAIL --arquivo conteudo.txt --gerar --saida ./materiais
 *   npx tsx scripts/content-hub/material-visual.ts --autor EMAIL --material ID --arquivo novo.txt --gerar   (versão nova)
 *   npx tsx scripts/content-hub/material-visual.ts --autor EMAIL --material ID --duplicar
 *   npx tsx scripts/content-hub/material-visual.ts --autor EMAIL --material ID --regenerar [--versao 2] --saida ./materiais
 *   npx tsx scripts/content-hub/material-visual.ts --validar --arquivo conteudo.txt [--previa ./pasta]   (sem banco)
 *
 * Opções:
 *   --modelo            feed | a4 | story | flashcard_digital | flashcard_a6
 *   --especialidade     ginecologia | pediatria | clinica_medica | cirurgia | preventiva_mfc | fallback (ou o nome por extenso)
 *   --especialidade-nome  nome por extenso (obrigatório com "fallback" ou especialidade sem cor própria)
 *   --campo chave=valor   qualquer campo do formulário (repita; em listas como pontos_chave, cada --campo é um item)
 *   --comando "texto"     o mesmo texto do campo "Colar comando" do formulário
 *   --arquivo caminho     texto de comando ou JSON; "---" numa linha sozinha separa materiais (lote, ordem 1, 2, 3…)
 *   --lote nome           nome do lote (vale para todos os materiais do comando)
 *   --gerar               gera os arquivos (com o gerador deste computador; sem ele, fica na fila do processamento)
 *   --so-fila             só põe na fila (o processamento no Cloud Run gera)
 *   --saida pasta         baixa os arquivos gerados para a pasta
 *   --validar / --previa  só valida (e, com --previa, gera numa pasta sem gravar nada no banco)
 *   --producao          confirma gravar no banco do site quando o .env aponta para o Supabase (sem isso, o comando para)
 */
import dotenv from "dotenv";
dotenv.config({ quiet: true });
import fs from "fs";
import path from "path";
import { buildContentHubDeps } from "../../server/contentHub/index";
import { createRenderer } from "../../server/contentHub/render";
import { runJob, type Job } from "../../server/contentHub/pipeline";
import { renderVisualContent } from "../../server/contentHub/visual/render";
import { duplicateVisualMaterial, regenerateVisualMaterial, saveVisualMaterial, VisualValidationError } from "../../server/contentHub/visual/service";
import { commandKey, parseVisualCommand, setField, validateVisualInput, visualFileName, VISUAL_MODELS } from "../../src/shared/visualMaterials";

type Args = Record<string, string[]>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    const key = (eq > 0 ? a.slice(2, eq) : a.slice(2)).toLowerCase();
    let value = eq > 0 ? a.slice(eq + 1) : "true";
    if (eq < 0 && i + 1 < argv.length && !argv[i + 1].startsWith("--")) value = argv[++i];
    (out[key] ??= []).push(value);
  }
  return out;
}

const LIST_FIELDS = new Set(["pontos_chave", "bloco.itens", "mnemonico.itens"]);

/** Materiais do comando: arquivo (texto ou JSON, um ou vários) + opções que valem para todos. */
function inputsFromArgs(args: Args): { inputs: Record<string, any>[]; problems: string[] } {
  const problems: string[] = [];
  let inputs: Record<string, any>[] = [{}];
  const file = args.arquivo?.[0];
  const texts: string[] = [];
  if (file) {
    const raw = fs.readFileSync(path.resolve(file), "utf8");
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const arr = JSON.parse(trimmed);
        if (!Array.isArray(arr)) throw new Error("esperado um array");
        texts.push(...arr.map((x) => JSON.stringify(x)));
      } catch (error) {
        problems.push(`Arquivo JSON inválido: ${(error as Error).message}`);
      }
    } else texts.push(...trimmed.split(/^---\s*$/m).map((t) => t.trim()).filter(Boolean));
  }
  if (args.comando?.[0]) texts.push(args.comando[0]);
  if (texts.length) {
    inputs = texts.map((t, i) => {
      const p = parseVisualCommand(t);
      problems.push(...p.problems.map((x) => (texts.length > 1 ? `Material ${i + 1}: ${x.message}` : x.message)));
      return p.input;
    });
  }
  const many = inputs.length > 1;
  inputs.forEach((input, i) => {
    if (args.modelo?.[0]) input.modelo = args.modelo[0];
    if (args.especialidade?.[0]) input.especialidade = args.especialidade[0];
    if (args["especialidade-nome"]?.[0]) input.especialidade_nome = args["especialidade-nome"][0];
    if (args.lote?.[0]) input.lote = args.lote[0];
    if (many && (input.ordem == null || input.ordem === "")) input.ordem = i + 1;
    for (const kv of args.campo ?? []) {
      const eq = kv.indexOf("=");
      if (eq <= 0) {
        problems.push(`--campo sem "=": ${kv}`);
        continue;
      }
      const key = commandKey(kv.slice(0, eq));
      if (!key) {
        problems.push(`Campo desconhecido: ${kv.slice(0, eq)}`);
        continue;
      }
      const value = kv.slice(eq + 1);
      if (LIST_FIELDS.has(key)) {
        const [head, sub] = key.split(".");
        const current = sub ? (input[head]?.[sub] ?? []) : (input[head] ?? []);
        setField(input, key, [...(Array.isArray(current) ? current : []), value]);
      } else setField(input, key, key === "ordem" ? Number(value) : value);
    }
  });
  return { inputs, problems };
}

const flag = (args: Args, k: string) => Boolean(args[k]?.length);

async function writeFiles(deps: any, versionId: string, outDir: string) {
  const r = await deps.db.service("ch_worker_visual_files", { p_version_id: versionId });
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of r.files ?? []) {
    const name = visualFileName({ model: r.model, card_id: r.card_id, title: r.title }, r.version, f.side, f.format);
    fs.writeFileSync(path.join(outDir, name), await deps.storage.get(f.storage_path));
    console.log(`  arquivo: ${path.join(outDir, name)}`);
  }
  return r;
}

function printCheck(check: any) {
  if (!check) return;
  if (check.ok) console.log("  conferência: aprovada (sem texto cortado, sem sobreposição, fontes do modelo, páginas e tamanhos certos)");
  else for (const p of check.problems ?? []) console.log(`  conferência: ${p.message}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (flag(args, "ajuda") || flag(args, "help")) {
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
    return;
  }
  const action = flag(args, "duplicar") ? "duplicar" : flag(args, "regenerar") ? "regenerar" : "salvar";
  const { inputs, problems } = action === "salvar" ? inputsFromArgs(args) : { inputs: [], problems: [] };
  if (problems.length) {
    for (const p of problems) console.error(`erro: ${p}`);
    process.exitCode = 1;
    return;
  }
  const validations = inputs.map((i) => validateVisualInput(i));
  validations.forEach((v, i) => {
    const tag = inputs.length > 1 ? `material ${i + 1}: ` : "";
    for (const p of v.problems) console.error(`erro: ${tag}${p.message}`);
    for (const w of v.warnings) console.log(`aviso: ${tag}${w.message}`);
  });
  if (validations.some((v) => !v.ok)) {
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------------- só validar (e gerar numa pasta, sem banco)
  if (flag(args, "validar") || flag(args, "previa")) {
    console.log(`conteúdo válido: ${validations.length} material(is).`);
    const dir = args.previa?.[0];
    if (!dir || dir === "true") return;
    const renderer = await createRenderer();
    if (!renderer) throw new Error("Gerador de PDF (Playwright/Chromium) não instalado neste computador.");
    try {
      for (const [i, v] of validations.entries()) {
        const c = { ...v.content, card_id: v.content.card_id || (VISUAL_MODELS[v.content.model].pair ? `PREVIA-${i + 1}` : "") };
        const r = await renderVisualContent(renderer, c);
        fs.mkdirSync(dir, { recursive: true });
        for (const f of r.files) {
          const name = visualFileName({ model: c.model, card_id: c.card_id, title: c.titulo || c.tema || c.pergunta }, 0, f.side, f.format).replace("_v0", "_previa");
          fs.writeFileSync(path.join(dir, name), f.data);
          console.log(`  arquivo: ${path.join(dir, name)}`);
        }
        printCheck(r.check);
        if (!r.check.ok) process.exitCode = 2;
      }
    } finally {
      await renderer.close();
    }
    return;
  }

  // ---------------------------------------------------------------- com o banco
  const email = args.autor?.[0];
  if (!email || email === "true") throw new Error("Informe --autor EMAIL (conta da equipe: administrador ou editor).");
  const { deps, pending } = await buildContentHubDeps();
  if (!deps) throw new Error(`Central de Conteúdo sem banco: ${pending}`);
  console.log(`banco: ${deps.db.mode === "supabase" ? "Supabase (o mesmo do site)" : `desenvolvimento (${process.env.DEV_DB_DIR || ".data/dev-db"})`}`);
  // o .env do servidor pode apontar para o banco do site: gravar lá exige confirmação explícita
  if (deps.db.mode === "supabase" && !flag(args, "producao")) {
    throw new Error("Este comando grava no banco do site (Supabase). Para confirmar, repita com --producao.");
  }
  const actor = await deps.db.service<string>("ch_worker_visual_actor", { p_email: email });
  const material = args.material?.[0];
  const generate = flag(args, "gerar") || action === "regenerar";
  const outDir = args.saida?.[0];

  const results: { version_id: string; material_id: string; version: number; card_id: string | null }[] = [];
  if (action === "duplicar") {
    if (!material) throw new Error("Informe --material ID.");
    const r = await duplicateVisualMaterial(deps.db, actor, material);
    console.log(`cópia criada: material ${r.material_id} (versão 1, rascunho)${r.card_id ? ` · card_id ${r.card_id}` : ""}`);
    return;
  }
  if (action === "regenerar") {
    if (!material) throw new Error("Informe --material ID.");
    const r = await regenerateVisualMaterial(deps.db, actor, material, args.versao?.[0] ? Number(args.versao[0]) : null);
    results.push({ ...r, card_id: null });
    console.log(`na fila: material ${r.material_id}, versão ${r.version}`);
  } else {
    if (material && inputs.length > 1) throw new Error("Com --material, o comando traz um material só (a versão nova dele).");
    for (const input of inputs) {
      const r = await saveVisualMaterial(deps.db, actor, input, { materialId: material ?? null, generate });
      results.push(r);
      console.log(
        `${r.created ? "material criado" : r.unchanged ? "sem mudança (versão atual mantida)" : "versão nova"}: ${r.material_id} · versão ${r.version}${r.card_id ? ` · card_id ${r.card_id}` : ""}${generate ? " · gerar" : " · rascunho"}`
      );
    }
  }

  if (generate && !flag(args, "so-fila")) {
    if (!deps.renderer) {
      console.log("sem gerador de PDF neste computador: o material fica na fila e o processamento (Cloud Run) gera em até 10 minutos.");
    } else {
      for (const r of results) {
        const job = await deps.db.service<Job | null>("ch_worker_visual_claim", { p_version_id: r.version_id });
        if (!job) {
          console.log(`versão ${r.version} de ${r.material_id}: o processamento já pegou o trabalho (veja a situação no painel).`);
          continue;
        }
        const out = await runJob(deps, job);
        const files = await deps.db.service<any>("ch_worker_visual_files", { p_version_id: r.version_id });
        console.log(`gerado: ${r.card_id ?? r.material_id} v${r.version} → ${files.render_status}${out.error ? ` (${out.error})` : ""}`);
        printCheck(files.check_result);
        if (files.render_status !== "ready") process.exitCode = 2;
        if (outDir && outDir !== "true" && files.files?.length) await writeFiles(deps, r.version_id, outDir);
      }
    }
  }
  await deps.renderer?.close();
}

main()
  .catch((error) => {
    if (error instanceof VisualValidationError) for (const p of error.problems) console.error(`erro: ${p.message}`);
    else console.error(`erro: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 300));
