// Lista mínima de bibliotecas da imagem do processamento (Cloud Run): o que o pacote do esbuild deixou de fora
// (--packages=external), nas versões exatas do package-lock. Assim a imagem não leva Vite, React nem as ferramentas de teste,
// e não fica sem o que o processamento usa de verdade (Playwright para os PDFs finais, por exemplo, que no package.json do
// site é dependência de desenvolvimento).
//
//   node scripts/cloudrun/worker-deps.mjs dist-worker/meta.json dist-worker/package.json
import fs from "fs";
import { builtinModules } from "module";

const [metaPath, outPath] = process.argv.slice(2);
if (!metaPath || !outPath) {
  console.error("Uso: node scripts/cloudrun/worker-deps.mjs <meta.json do esbuild> <package.json de saída>");
  process.exit(2);
}
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const builtin = new Set(builtinModules);

const names = new Set();
for (const out of Object.values(meta.outputs)) {
  for (const imp of out.imports ?? []) {
    if (!imp.external) continue;
    const p = imp.path;
    if (p.startsWith("node:") || builtin.has(p) || builtin.has(p.split("/")[0])) continue;
    names.add(p.startsWith("@") ? p.split("/").slice(0, 2).join("/") : p.split("/")[0]);
  }
}

const dependencies = {};
for (const name of [...names].sort()) {
  const version = lock.packages?.[`node_modules/${name}`]?.version;
  if (!version) {
    console.error(`Sem versão no package-lock para ${name}: rode npm install no projeto.`);
    process.exit(1);
  }
  dependencies[name] = version;
}
fs.writeFileSync(outPath, `${JSON.stringify({ name: "stazia-pdf-worker", private: true, dependencies }, null, 2)}\n`);
console.log(`bibliotecas do processamento: ${Object.entries(dependencies).map(([n, v]) => `${n}@${v}`).join(", ")}`);
