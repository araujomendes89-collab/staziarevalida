// Teste de ponta a ponta da prévia com personagem (http://127.0.0.1:31991, já rodando: bash scripts/previa-voz/rodar.sh).
// Para cada personagem: Chromium com microfone FALSO (frases da bateria), escolhe personagem e personalidade, inicia a conversa e
// confere: a sessão abre, o personagem certo aparece, chega áudio, a voz passa pelo afinador com os semitons do personagem, a boca
// do desenho mexe com a voz e não há erro no console. Grava o áudio que o professor falou (antes e depois do afinador) em WAV.
// Uso: node scripts/previa-voz/testar-navegador.mjs [segundos=40] [stazi:durao,stazia:durona]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const segundos = Number(process.argv[2] ?? 40);
const casos = (process.argv[3] ?? "stazi:durao,stazia:durona").split(",").map((c) => c.split(":"));
const MIC = "/Volumes/StaziaMed/.tmp-aulas/voice-tutor/linha-de-base/bateria/microfone-falso.wav";
const SAIDA = "/Volumes/StaziaMed/.tmp-aulas/voice-tutor/previa-personagens-teste";
fs.mkdirSync(SAIDA, { recursive: true });
const NOME = { durao: "Durão", acolhedor: "Tranquilo", durona: "Durona", tranquila: "Tranquila" };

function wav(amostras, taxa) {
  const b = Buffer.alloc(44 + amostras.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + amostras.length * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(taxa, 24); b.writeUInt32LE(taxa * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(amostras.length * 2, 40);
  amostras.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  return b;
}

const resumo = [];
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${MIC}`, "--autoplay-policy=no-user-gesture-required"] });
for (const [personagem, personalidade] of casos) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text().slice(0, 200)); });
  await page.goto("http://127.0.0.1:31991/", { timeout: 120_000 });
  await page.getByRole("button", { name: "Iniciar conversa" }).waitFor({ timeout: 120_000 });
  // espiona o tocador do app (o mesmo módulo que o geminiPonte usa): semitons de cada pedaço, se passou pelo afinador, e o PCM
  await page.evaluate(() => {
    const P = window.__AudioPlayer.prototype;
    const play = P.play, agendar = P._agendar;
    const a = (window.__afinacao = { pedacos: 0, semitons: {}, comAfinador: 0, antes: [], depois: [], taxa: 24000 });
    P.play = function (b64, rate = 24000) {
      a.pedacos++; a.semitons[this.semitons] = (a.semitons[this.semitons] ?? 0) + 1; a.taxa = rate;
      const bin = atob(b64); const n = bin.length >> 1;
      for (let i = 0; i < n; i++) { const v = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)); a.antes.push((v >= 0x8000 ? v - 0x10000 : v) / 32768); }
      const r = play.call(this, b64, rate);
      if (this.afinador) a.comAfinador++;
      return r;
    };
    P._agendar = function (data, rate, extra) { for (const v of data) a.depois.push(v); return agendar.call(this, data, rate, extra); };
  });
  await page.getByRole("radio", { name: new RegExp(`^${personagem === "stazi" ? "Stazi" : "Stazia"}\\b`) }).first().click();
  await page.getByRole("radio", { name: new RegExp(`^${NOME[personalidade]}`) }).click();
  const titulo = await page.locator("h1").textContent();
  await page.getByRole("button", { name: "Iniciar conversa" }).click();
  const estados = [], poses = new Set(), estadosDesenho = new Set();
  let bocaMax = 0, bocaMin = 1, fotografou = false;
  const t0 = Date.now();
  while (Date.now() - t0 < segundos * 1000) {
    const e = await page.locator(".estado code").textContent().catch(() => null);
    if (e && estados.at(-1) !== e) { estados.push(e); console.log(`[${personagem}/${personalidade} ${((Date.now() - t0) / 1000).toFixed(1)} s] ${e}`); }
    const d = await page.locator(".palco .tp").evaluate((el) => ({
      id: el.dataset.personagem, estado: el.dataset.state, pose: el.dataset.pose,
      boca: [...el.querySelectorAll(".tp__pose--atual .tp__extra")].map((x) => Number(x.style.opacity || 0)),
    })).catch(() => null);
    if (d) {
      poses.add(d.pose); estadosDesenho.add(d.estado);
      if (d.estado === "speaking" && d.boca.length) { const m = Math.max(...d.boca); bocaMax = Math.max(bocaMax, m); bocaMin = Math.min(bocaMin, m); }
      if (d.estado === "speaking" && !fotografou && Date.now() - t0 > 4000) { fotografou = true; await page.screenshot({ path: path.join(SAIDA, `${personagem}-${personalidade}-falando.png`) }); }
    }
    await page.waitForTimeout(120);
  }
  const conversa = await page.locator(".conversa p").allTextContents();
  const idDesenho = await page.locator(".palco .tp").getAttribute("data-personagem").catch(() => null);
  await page.getByRole("button", { name: "Encerrar" }).click().catch(() => {});
  await page.waitForTimeout(800);
  const a = await page.evaluate(() => ({ ...window.__afinacao, antes: window.__afinacao.antes, depois: window.__afinacao.depois }));
  const base = path.join(SAIDA, `${personagem}-${personalidade}`);
  if (a.antes.length) fs.writeFileSync(`${base}-voz-original.wav`, wav(a.antes, a.taxa));
  if (a.depois.length) fs.writeFileSync(`${base}-voz-tocada.wav`, wav(a.depois, a.taxa));
  const r = {
    caso: `${personagem}/${personalidade}`, titulo, desenho: idDesenho, estados_pagina: estados.join(" → "), estados_desenho: [...estadosDesenho].join(", "),
    poses: [...poses].join(", "), boca_falando: `${bocaMin.toFixed(2)}–${bocaMax.toFixed(2)}`,
    audio_pedacos: a.pedacos, semitons_no_tocador: a.semitons, pedacos_pelo_afinador: a.comAfinador,
    segundos_de_voz: (a.depois.length / a.taxa).toFixed(1), erros: erros.length ? erros : "nenhum", conversa,
  };
  resumo.push(r);
  console.log(JSON.stringify(r, null, 1));
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(SAIDA, "resumo.json"), JSON.stringify(resumo, null, 1));
console.log(`arquivos em ${SAIDA}`);
