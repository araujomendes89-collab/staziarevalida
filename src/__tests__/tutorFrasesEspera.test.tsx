/**
 * Frases de espera do Tutor (decisão do dono de 17/10/2026; APROVADAS e gravadas — a gravação falada está em tutorFalaDeEspera.test.tsx): 8 por personalidade, no jeito de cada uma,
 * sem citar tecnologia, sem prometer conteúdo e sem palavrão; rodízio sem repetir na mesma conversa; só aparecem quando a busca passa
 * de ~600 ms (comEspera e useDemorou). A ponte de voz está em tutorConhecimentoPonte.test.ts ("frase de espera").
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  ATRASO_ESPERA_MS, comEspera, FRASES_ESPERA, nomeDaPersona, personaDeEspera, RodizioDeEspera, textoConferindo, VINHETAS, type PersonaEspera,
} from "../../server/tutor/conhecimento/frasesEspera";
import { useDemorou } from "../novo/app/tutor/useDemorou.js";

const PERSONAS: PersonaEspera[] = ["durao", "acolhedor", "durona", "tranquila"];
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

afterEach(() => vi.useRealTimers());

describe("as frases", () => {
  it("8 por personalidade, curtas, diferentes entre si e com os exemplos do dono", () => {
    expect(Object.keys(FRASES_ESPERA).sort()).toEqual([...PERSONAS].sort());
    const todas = PERSONAS.flatMap((p) => FRASES_ESPERA[p]);
    for (const p of PERSONAS) {
      expect(FRASES_ESPERA[p], p).toHaveLength(8);
      for (const f of FRASES_ESPERA[p]) {
        expect(f.length, f).toBeLessThanOrEqual(70);
        expect(f.split(/\s+/).length, f).toBeLessThanOrEqual(13);
      }
    }
    expect(new Set(todas).size).toBe(32);
    expect(FRASES_ESPERA.tranquila).toContain("Deixa eu conferir isso com calma na diretriz…");
    expect(FRASES_ESPERA.durao).toContain("Segura aí que eu vou checar a fonte, não vou chutar número.");
    // gravadas depois da aprovação do dono: uma por frase, em todas as personalidades
    for (const p of PERSONAS) expect(VINHETAS[p], p).toHaveLength(8);
  });

  it("sem tecnologia, sem palavrão, sem grito e sem prometer conteúdo", () => {
    const TECNOLOGIA = /\b(ia|inteligencia|artificial|sistema|banco|servidor|modelo|algoritmo|google|gemini|openai|gpt|chatgpt|computador|dados|base de dados|internet|rede|aplicativo|app|ferramenta|processando|carregando|pesquisa automatica|busca automatica|vetor|indice)\b/;
    const PALAVRAO = /\b(porra|caralho|merda|puta|puto|foda|fodase|cacete|bosta|desgraca|cu|viado|babaca|idiota|burro)\b/;
    const PROMESSA = /(ja te (dou|trago|passo|falo)|vou te (trazer|mostrar|dar)|a dose e|o protocolo diz|te garanto|com certeza (esta|tem))/;
    for (const f of PERSONAS.flatMap((p) => FRASES_ESPERA[p])) {
      const n = sem(f);
      expect(n, f).not.toMatch(TECNOLOGIA);
      expect(n, f).not.toMatch(PALAVRAO);
      expect(n, f).not.toMatch(PROMESSA);
      expect(f, f).not.toMatch(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}\b/); // grito (palavra toda em maiúscula)
      expect(f, f).not.toMatch(/!/);
    }
  });

  it("personalidade e nome do personagem; indicador do texto", () => {
    expect(personaDeEspera("durao")).toBe("durao");
    expect(personaDeEspera("acolhedor")).toBe("acolhedor");
    expect(personaDeEspera("direto")).toBe("acolhedor");
    expect(personaDeEspera("durona")).toBe("durona");
    expect(personaDeEspera("tranquila")).toBe("tranquila");
    expect(personaDeEspera(null)).toBe("tranquila");
    expect(nomeDaPersona("durao")).toBe("Stazi");
    expect(nomeDaPersona("acolhedor")).toBe("Stazi");
    expect(nomeDaPersona("durona")).toBe("Stazia");
    expect(nomeDaPersona("tranquila")).toBe("Stazia");
    expect(textoConferindo("Stazia")).toBe("Stazia está conferindo a fonte…");
    expect(textoConferindo("")).toBe("O Tutor está conferindo a fonte…");
  });
});

describe("rodízio sem repetir na mesma conversa", () => {
  it("as 8 saem antes de qualquer repetição; ao recomeçar, nunca repete a última; cada personalidade tem o seu", () => {
    for (const sorteio of [() => 0, () => 0.999, Math.random]) {
      const r = new RodizioDeEspera(sorteio);
      for (const p of PERSONAS) {
        const vistas = Array.from({ length: 8 }, () => r.proxima(p).frase);
        expect(new Set(vistas).size, p).toBe(8);
        const nona = r.proxima(p).frase;
        expect(nona).not.toBe(vistas[7]);
        expect(FRASES_ESPERA[p]).toContain(nona);
      }
    }
    const r = new RodizioDeEspera(() => 0);
    const x = r.proxima("durao");
    expect(x.vinheta).toBe(VINHETAS.durao![x.indice]); // a gravação da mesma frase
  });
});

describe("só quando a busca passa de ~600 ms", () => {
  it("comEspera: rápida não mostra; lenta mostra uma vez e apaga no fim; o resultado e o erro não mudam", async () => {
    vi.useFakeTimers();
    expect(ATRASO_ESPERA_MS).toBe(600);
    const mostrar = vi.fn();
    const apagar = vi.fn();
    const rapida = comEspera(new Promise((ok) => setTimeout(() => ok("r"), 300)), mostrar, apagar);
    await vi.advanceTimersByTimeAsync(300);
    expect(await rapida).toBe("r");
    expect(mostrar).not.toHaveBeenCalled();
    expect(apagar).toHaveBeenCalledTimes(1);
    const lenta = comEspera(new Promise((ok) => setTimeout(() => ok("l"), 1500)), mostrar, apagar);
    await vi.advanceTimersByTimeAsync(599);
    expect(mostrar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(mostrar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await lenta).toBe("l");
    expect(apagar).toHaveBeenCalledTimes(2);
    const falha = comEspera(Promise.reject(new Error("x")), () => { throw new Error("frase"); });
    await expect(falha).rejects.toThrow("x");
  });

  it("useDemorou (indicador 'conferindo a fonte' do texto): só depois de 600 ms e some quando a resposta chega", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ ativo }) => useDemorou(ativo), { initialProps: { ativo: false } });
    expect(result.current).toBe(false);
    rerender({ ativo: true });
    act(() => { vi.advanceTimersByTime(599); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current).toBe(true);
    rerender({ ativo: false });
    expect(result.current).toBe(false);
  });
});
