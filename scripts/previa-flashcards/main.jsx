// PRÉVIA da tela de Flashcards com cartões ilustrados (porta 31944): dados simulados, sem login e sem banco.
//   /?atraso=700   tempo (ms) que o servidor de imagem simulado leva para responder (no site: login + banco + depósito + envio)
//   &tema=escuro
// As imagens são PNG 1080×1350 desenhadas aqui (gradiente + ruído, tamanho parecido com o das peças reais); não são conteúdo.
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/novo/ds/styles.css";
import { FlashcardsScreen } from "../../src/novo/app/review/FlashcardsScreen.jsx";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("tema") === "escuro" ? "dark" : "light";
const ATRASO = Number(params.get("atraso") ?? 700);

/** PNG de exemplo 1080×1350: fundo em gradiente, ruído leve e o rótulo (frente/verso n). */
async function desenhar(qual, n) {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 1080, 1350);
  grad.addColorStop(0, qual === "frente" ? "#13294B" : "#0E6E5C");
  grad.addColorStop(1, qual === "frente" ? "#2C6CB0" : "#5FC7A8");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1080, 1350);
  const img = g.getImageData(0, 0, 1080, 1350);
  let s = n * 7919 + (qual === "frente" ? 1 : 2);
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const d = (s % 40) - 20;
    img.data[i] += d;
    img.data[i + 1] += d;
    img.data[i + 2] += d;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = "#fff";
  g.font = "bold 96px sans-serif";
  g.fillText(`${qual.toUpperCase()} ${n}`, 80, 680);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

const pngs = new Map();
const pedidos = (window.__pedidosImagem = []);
const realFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  const m = String(url).match(/\/api\/content-hub\/aula-aluno\/(GR-\d{3})\/(frente|verso|revisao)\/(\d+)$/);
  if (!m) return realFetch(url, init);
  const [, , qual, n] = m;
  const t0 = performance.now();
  pedidos.push({ qual, n: Number(n), t: t0 });
  const k = `${qual}/${n}`;
  if (!pngs.has(k)) pngs.set(k, desenhar(qual, Number(n)));
  const blob = await pngs.get(k);
  await new Promise((r) => setTimeout(r, ATRASO));
  return new Response(blob, { status: 200, headers: { "Content-Type": "image/png" } });
};

// as imagens de exemplo são desenhadas antes de abrir a tela (o custo do desenho não entra na medida)
await Promise.all([1, 2, 3, 4, 5, 6].flatMap((n) => ["frente", "verso"].map((q) => (pngs.set(`${q}/${n}`, desenhar(q, n)), pngs.get(`${q}/${n}`)))));
window.__tamanhoPng = (await pngs.get("frente/1")).size;

const go = (route) => console.info("[prévia] navegação:", route);
createRoot(document.getElementById("root")).render(
  <div style={{ maxWidth: 960, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
    <FlashcardsScreen go={go} />
  </div>
);
