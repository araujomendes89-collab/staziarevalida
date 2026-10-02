// Copia os ícones Lucide (lucide-static, mesma versão do design system) para public/ds-icons,
// de onde o componente <Icon> os carrega. Roda automaticamente antes de `npm run dev` e `npm run build`.
import fs from "fs";
import path from "path";

const src = path.resolve("node_modules/lucide-static/icons");
const dest = path.resolve("public/ds-icons");

if (!fs.existsSync(src)) {
  console.error("[ds-icons] lucide-static não instalado. Rode `npm install`.");
  process.exit(1);
}
fs.mkdirSync(dest, { recursive: true });
let copied = 0;
for (const file of fs.readdirSync(src)) {
  if (!file.endsWith(".svg")) continue;
  const target = path.join(dest, file);
  if (!fs.existsSync(target)) {
    fs.copyFileSync(path.join(src, file), target);
    copied++;
  }
}
console.log(`[ds-icons] ${copied} ícones novos copiados (${fs.readdirSync(dest).length} no total).`);
