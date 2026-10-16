// Prévia da Fila do Radar com dados SIMULADOS e sem login: troca só a sessão (session.jsx) por uma sessão falsa.
//   npx vite --config scripts/radar/previa/vite.config.mjs --port 31938 --host 127.0.0.1
// Abrir http://127.0.0.1:31938/scripts/radar/previa/index.html?cenario=cheio&tema=claro&rota=admin
//   cenario: cheio | vazio | sem-graves   tema: claro | escuro   rota: admin | home   papel: admin | aluno | editor
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const raiz = path.resolve(import.meta.dirname, "../../..");
export default defineConfig({
  root: raiz,
  plugins: [
    react(),
    // qualquer import de .../session.jsx vira a sessão falsa
    { name: "sessao-falsa", enforce: "pre", resolveId: (id) => (/(^|\/)session\.jsx$/.test(id) ? path.resolve(import.meta.dirname, "sessaoFalsa.jsx") : null) },
  ],
  server: { fs: { allow: [raiz] } },
});
