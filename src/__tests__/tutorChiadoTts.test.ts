// @vitest-environment node
/**
 * O "chiado" do fim da voz do professor (18/10): o Gemini TTS entrega todo arquivo com fala → ~250 ms de silêncio → ~160 ms de ruído
 * branco alto (com um buraco de zeros), e um estalo de ~1 ms no começo. O acabamento tira os dois por DETECÇÃO (nunca por tempo
 * fixo) e não corta fala: nem a que termina alta, nem uma palavra curta depois de uma pausa. Mede a energia dos últimos 300 ms
 * antes e depois. As 32 frases de espera publicadas saíram da mesma limpeza (manifesto).
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { ACABAMENTO_VERSAO, LUFS_ALVO, PICO_MAX_DB, acabarVoz, floatParaPcm, igualarVolume, inicioDoRuidoFinal, loudnessLufs, planura, tirarRuidoDasPontas } from "../../server/tutor/vozAcabamento";
import { tirarRuidoDoPcm } from "../../server/tutor/ruidoTts";

const TAXA = 24_000;
let semente = 7;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
const ms = (x: number) => Math.round((TAXA * x) / 1000);
/** "Fala": vozeada (harmônicos de 180 Hz com vibrato e envelope de sílabas), RMS ~ −15 dB. */
function fala(duracaoMs: number, amp = 0.25): Float32Array {
  const n = ms(duracaoMs);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const f0 = 180 + 12 * Math.sin(2 * Math.PI * 5 * t);
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
    const silaba = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t) ** 2;
    const borda = Math.min(1, i / ms(15), (n - i) / ms(40));
    a[i] = amp * 0.6 * v * silaba * borda;
  }
  return a;
}
const silencio = (duracaoMs: number, db = -78) => Float32Array.from({ length: ms(duracaoMs) }, () => aleatorio() * Math.pow(10, db / 20) * 1.7);
const ruido = (duracaoMs: number, db: number) => Float32Array.from({ length: ms(duracaoMs) }, () => aleatorio() * Math.pow(10, db / 20) * 1.7);
const juntar = (...partes: Float32Array[]) => {
  const out = new Float32Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) (out.set(p, o), (o += p.length));
  return out;
};
/** Como o Gemini TTS entrega: estalo de 1 ms, silêncio, fala, 250 ms de silêncio, 40 ms de ruído, 30 ms de zeros, 90 ms de ruído. */
function comoOTtsEntrega(falaMs = 1500) {
  const estalo = Float32Array.from({ length: 20 }, (_, i) => (i % 2 ? -0.85 : 0.85));
  return juntar(estalo, silencio(230), fala(falaMs), silencio(250), ruido(40, -5.5), new Float32Array(ms(30)), ruido(90, -4));
}
const energiaFinal = (a: Float32Array, janelaMs = 300) => {
  const n = Math.min(a.length, ms(janelaMs));
  let s = 0;
  for (let i = a.length - n; i < a.length; i++) s += a[i] * a[i];
  return 10 * Math.log10(s / n + 1e-18);
};
const pico = (a: Float32Array, de: number, ate: number) => Math.max(...Array.from(a.subarray(de, ate), Math.abs));

describe("chiado do Gemini TTS", () => {
  it("tira o ruído do fim e o estalo do começo: energia dos últimos 300 ms cai de ~−8 dB para a da fala que acaba (e os últimos 200 ms, para silêncio)", () => {
    const bruto = comoOTtsEntrega();
    const antes = energiaFinal(bruto);
    const r = tirarRuidoDasPontas(bruto, TAXA);
    const depois = energiaFinal(r.audio);
    expect(antes).toBeGreaterThan(-12);
    expect(depois).toBeLessThan(-25); // sobra só o finzinho da última sílaba descendo
    expect(energiaFinal(r.audio, 200)).toBeLessThan(-50); // e o fim é silêncio
    expect(r.cortadoNoFimMs).toBeGreaterThanOrEqual(150);
    expect(r.cortadoNoFimMs).toBeLessThanOrEqual(200);
    expect(r.cortadoNoComecoMs).toBeLessThanOrEqual(10);
    expect(pico(r.audio, 0, ms(20))).toBeLessThan(0.01); // sem estalo
    // a fala inteira ficou (o corte é no silêncio antes do ruído)
    expect(r.audio.length).toBeGreaterThan(ms(230 + 1500 + 240));
    console.log(`chiado: últimos 300 ms ${antes.toFixed(1)} dB → ${depois.toFixed(1)} dB (últimos 200 ms ${energiaFinal(r.audio, 200).toFixed(1)} dB); cortou ${r.cortadoNoComecoMs} ms no começo e ${r.cortadoNoFimMs} ms no fim`);
  });

  it("o ruído é plano no espectro e a fala não (planura ~0,4 contra < 0,1)", () => {
    expect(planura(ruido(20, -5), TAXA)).toBeGreaterThan(0.3);
    expect(planura(fala(20).subarray(0, ms(20)), TAXA)).toBeLessThan(0.1);
  });

  it("não corta fala: nem a que termina alta, nem uma palavra curta e forte depois de uma pausa, nem silêncio comum", () => {
    const terminaAlta = juntar(silencio(100), fala(1200, 0.5));
    expect(inicioDoRuidoFinal(terminaAlta, TAXA)).toBeNull();
    const palavraCurta = juntar(silencio(100), fala(1200), silencio(200), fala(300, 0.6));
    expect(inicioDoRuidoFinal(palavraCurta, TAXA)).toBeNull();
    const comSilencio = juntar(silencio(100), fala(1200), silencio(400));
    const r = tirarRuidoDasPontas(comSilencio, TAXA);
    expect(r.audio).toBe(comSilencio);
    expect([r.cortadoNoComecoMs, r.cortadoNoFimMs]).toEqual([0, 0]);
  });

  it("no acabamento inteiro (afinar, aparar, volume, MP3) o arquivo sai do tamanho da fala limpa, e a versão do acabamento mudou", async () => {
    const limpo = juntar(silencio(230), fala(1500), silencio(250));
    const [sujo, bom] = await Promise.all([
      acabarVoz(floatParaPcm(comoOTtsEntrega()), TAXA, { semitons: 3, lufs: LUFS_ALVO.stazi }),
      acabarVoz(floatParaPcm(limpo), TAXA, { semitons: 3, lufs: LUFS_ALVO.stazi }),
    ]);
    expect(Math.abs(sujo.segundos - bom.segundos)).toBeLessThan(0.03);
    expect(Math.abs(sujo.lufs - bom.lufs)).toBeLessThan(0.5);
    expect(ACABAMENTO_VERSAO).toBe("sem-chiado-2026-10-18"); // cache e aprovação da voz mudam junto
  });

  it("limitador gentil (a aspereza do Kore): fala que já chega em 0 dBFS quase não sofre redução de ganho", () => {
    // fala "cortada" em 0 dBFS, como o Gemini entrega o Kore
    const kore = fala(3000, 1.4).map((v) => Math.max(-1, Math.min(1, v)));
    const alvo = LUFS_ALVO.stazia;
    const ganho = Math.pow(10, (alvo - loudnessLufs(kore, TAXA)) / 20);
    const out = igualarVolume(kore, TAXA, alvo);
    const bloco = ms(5);
    let reducoes = 0, blocos = 0;
    for (let i = 0; i + bloco <= kore.length; i += bloco) {
      let sp = 0, sl = 0;
      for (let k = i; k < i + bloco; k++) (sp += (kore[k] * ganho) ** 2), (sl += out[k] ** 2);
      if (sp < 1e-6) continue;
      blocos++;
      if (10 * Math.log10(sp / Math.max(sl, 1e-12)) > 3) reducoes++;
    }
    expect(reducoes / blocos).toBeLessThan(0.02);
    expect(Math.max(...Array.from(out, Math.abs))).toBeLessThanOrEqual(Math.pow(10, PICO_MAX_DB / 20) + 1e-6);
    expect(Math.abs(loudnessLufs(out, TAXA) - alvo)).toBeLessThan(0.5);
  });

  it("podcasts (PCM 16 bits): o mesmo corte, sem mexer no que não tem ruído", () => {
    const pcm = floatParaPcm(comoOTtsEntrega());
    const limpo = tirarRuidoDoPcm(pcm, TAXA);
    expect(limpo.length).toBeLessThan(pcm.length - ms(150) * 2);
    const semRuido = floatParaPcm(juntar(silencio(100), fala(800), silencio(300)));
    expect(tirarRuidoDoPcm(semRuido, TAXA)).toBe(semRuido);
  });

  it("as 32 frases de espera publicadas saíram sem o ruído do fim (e as 16 da Stazia sem o estalo do começo)", () => {
    const m = JSON.parse(fs.readFileSync(path.resolve("public/novo-assets/tutor/espera/manifesto.json"), "utf8"));
    const frases = Object.values<any>(m.personas).flatMap((p) => p.frases);
    expect(frases).toHaveLength(32);
    for (const f of frases) {
      expect(f.chiado_cortado_ms, f.url).toBeGreaterThanOrEqual(150);
      expect(f.chiado_cortado_ms, f.url).toBeLessThanOrEqual(200);
      expect(f.pico_db, f.url).toBeLessThanOrEqual(0.2);
    }
    expect(frases.filter((f) => f.estalo_cortado_ms > 0).map((f) => f.url).every((u: string) => u.includes("/stazia-"))).toBe(true);
    expect(frases.filter((f) => f.estalo_cortado_ms > 0)).toHaveLength(16);
  });
});
