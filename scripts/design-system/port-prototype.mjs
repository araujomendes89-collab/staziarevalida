// Converte o protótipo do design system ("StaziaMed App.html" + app/*.jsx) em módulos ES,
// sem alterar marcação nem estilos. Saída: src/novo/prototype/ (referência fiel, regenerável).
//
// Uso: node scripts/design-system/port-prototype.mjs "<pasta do design system>"
//
// O protótipo carrega scripts globais na ordem do HTML; cada um pega componentes de
// window.StaziaMedDesignSystem_18d23e e publica funções com Object.assign(window, {...}).
// Quando dois arquivos publicam o mesmo nome, vale o último carregado — o conversor
// reproduz essa regra ao resolver os imports.
import fs from "fs";
import path from "path";

const dsDir = process.argv[2];
if (!dsDir || !fs.existsSync(path.join(dsDir, "StaziaMed App.html"))) {
  console.error('Informe a pasta do design system (a que contém "StaziaMed App.html").');
  process.exit(1);
}
const outDir = path.resolve("src/novo/prototype");
const NS = "window.StaziaMedDesignSystem_18d23e";

const html = fs.readFileSync(path.join(dsDir, "StaziaMed App.html"), "utf8");
const order = [...html.matchAll(/<script type="text\/babel" src="([^"]+)"/g)].map((m) => m[1]);
const inline = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)?.[1];
if (!inline) throw new Error("Script principal (inline) não encontrado no HTML.");

const files = order.map((rel) => ({
  rel,
  name: path.basename(rel),
  code: fs.readFileSync(path.join(dsDir, rel), "utf8"),
}));
files.push({ rel: "StaziaMed App.html (inline)", name: "App.jsx", code: inline, isApp: true });

const declared = (code) =>
  new Set([...code.matchAll(/(?:^|[\s;{(])(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));

// 1) Extrai exports e nomes do design system de cada arquivo
for (const f of files) {
  let code = f.code.trim();
  if (!f.isApp) {
    code = code.replace(/^\(\(\)=>\{/, "").replace(/\}\)\(\);?\s*$/, "");
  }
  f.ds = new Set();
  code = code.replace(new RegExp(`const\\s*\\{([^}]*)\\}\\s*=\\s*${NS.replace(/\./g, "\\.")};?`, "g"), (_, names) => {
    names.split(",").map((s) => s.trim()).filter(Boolean).forEach((n) => f.ds.add(n));
    return "";
  });
  f.exports = [];
  code = code.replace(/Object\.assign\(window,\{([^}]*)\}\);?/g, (_, names) => {
    const list = names.split(",").map((s) => s.trim()).filter(Boolean);
    f.exports.push(...list);
    return `export { ${list.join(", ")} };`;
  });
  if (f.isApp) {
    code = code.replace(/ReactDOM\.createRoot\([^;]*;\s*$/, "").trimEnd() + "\nexport { App };\n";
    f.exports.push("App");
  }
  // Caminhos de assets do protótipo → public/novo-assets
  code = code.replace(/(["'])assets\//g, "$1/novo-assets/");
  f.body = code;
}

// 2) Quem publica cada nome (o último na ordem vence, como no protótipo)
const owner = new Map();
for (const f of files) for (const e of f.exports) owner.set(e, f.name);

// 3) Monta imports
fs.mkdirSync(outDir, { recursive: true });
for (const f of files) {
  const local = declared(f.body);
  const fromOthers = new Map();
  for (const [name, file] of owner) {
    if (file === f.name || local.has(name) || f.ds.has(name)) continue;
    if (new RegExp(`(?<![\\w$.'"])${name.replace(/\$/g, "\\$")}(?![\\w$'"])`).test(f.body)) {
      if (!fromOthers.has(file)) fromOthers.set(file, []);
      fromOthers.get(file).push(name);
    }
  }
  const header = [
    `// Gerado por scripts/design-system/port-prototype.mjs a partir de "${f.rel}". Não editar à mão.`,
    `import React from "react";`,
    f.ds.size ? `import { ${[...f.ds].join(", ")} } from "../ds";` : null,
    ...[...fromOthers].map(([file, names]) => `import { ${names.join(", ")} } from "./${file}";`),
  ].filter(Boolean);
  fs.writeFileSync(path.join(outDir, f.name), header.join("\n") + "\n" + f.body.trim() + "\n");
  console.log(`${f.name.padEnd(20)} exports: ${f.exports.join(", ")}`);
}
