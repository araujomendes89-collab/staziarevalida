// Prévia do catálogo de ícones (porta 31985): grade antes (app hoje) x depois (pacote) em 16/20/24 px, claro e escuro.
// Uso (da raiz): node scripts/previa-icones/server.mjs   — só leitura, sem login e sem banco.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, "../..");
const PACOTE = process.env.PACOTE_ASSETS || "/Volumes/StaziaMed/Tela para questoes/Telas/Novas telas/extraido/StaziaMed-telas/assets";
const tipos = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const rotas = [
  ["/lucide/", path.join(raiz, "node_modules/lucide-static/icons")],
  ["/pacote/", PACOTE],
  ["/stazia/", path.join(raiz, "src/novo/ds/icons-stazia")],
];
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let f = null;
  if (url === "/" || url === "/index.html") f = path.join(here, "index.html");
  else if (url === "/icones.json") f = path.join(raiz, "docs/novas-telas/icones.json");
  else if (url === "/appicons.json") f = path.join(here, "appicons.json");
  else for (const [p, d] of rotas) if (url.startsWith(p)) { f = path.join(d, path.basename(url)); break; }
  fs.readFile(f || "", (e, b) => {
    if (e) { res.writeHead(404); return res.end("não encontrado"); }
    res.writeHead(200, { "content-type": tipos[path.extname(f)] || "application/octet-stream" });
    res.end(b);
  });
}).listen(31985, "127.0.0.1", () => console.log("Prévia de ícones em http://127.0.0.1:31985/"));
