// Endereços das artes (nome -> URL). Importado SÓ pela prévia scripts/previa-novas-telas-onda2 (ver index.js); o app não o
// importa, e por isso nenhum SVG desta pasta entra no build do app.
const arquivos = import.meta.glob("./*.svg", { eager: true, query: "?url", import: "default" });
export default Object.fromEntries(Object.entries(arquivos).map(([caminho, url]) => [caminho.replace(/^\.\//, "").replace(/\.svg$/, ""), url]));
