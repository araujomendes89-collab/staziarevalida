// Abre a prévia (http://127.0.0.1:31991) num Chromium com microfone FALSO (a frase 01 da bateria tocando em loop), clica em
// "Iniciar conversa" e registra os estados reais que a página mostra, a transcrição e as métricas. Confere o cliente de voz do
// app (geminiPonte.js) de ponta a ponta no navegador. Uso: node scripts/voz-teste/navegador-previa.mjs [segundos=35]
import path from "node:path";
import { chromium } from "playwright";
import { PASTA } from "./bateria.mjs";

const segundos = Number(process.argv[2] ?? 35);
// 9 s de silêncio (a professora abre), frase 02, 12 s de silêncio, frase 03, 14 s de silêncio (o Chrome repete o arquivo)
const wav = path.join(PASTA, "bateria", "microfone-falso.wav");
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
const erros = [];
page.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") erros.push(m.text().slice(0, 200)); });
await page.goto("http://127.0.0.1:31991/", { timeout: 120_000 });
await page.getByRole("button", { name: "Iniciar conversa" }).waitFor({ timeout: 120_000 });
await page.getByRole("button", { name: "Iniciar conversa" }).click();
const vistos = [];
const t0 = Date.now();
while (Date.now() - t0 < segundos * 1000) {
  const e = await page.locator(".estado code").textContent().catch(() => null);
  if (e && vistos.at(-1) !== e) { vistos.push(e); console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] estado: ${e}`); }
  await page.waitForTimeout(100);
}
const conversa = await page.locator(".conversa p").allTextContents();
const metricas = await page.locator(".metricas div").allTextContents();
await page.getByRole("button", { name: "Encerrar" }).click().catch(() => {});
await page.waitForTimeout(800);
console.log("estado final:", await page.locator(".estado code").textContent());
console.log("conversa:\n " + conversa.join("\n "));
console.log("métricas:", metricas.join(" | "));
console.log("erros na página:", erros.length ? erros : "nenhum");
await page.screenshot({ path: path.join(PASTA, "previa-navegador.png"), fullPage: true });
await browser.close();
