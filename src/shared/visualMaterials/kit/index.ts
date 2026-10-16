/**
 * Kit de ilustrações do modelo "criativo-1" (cards, A4, story e flashcards no estilo do modelo do dono):
 *   - spots.ts: ícones pequenos (viewBox 48), sem ids, reutilizáveis;
 *   - scenes.ts: cenas grandes do cabeçalho (viewBox 320 × 240), com gradientes e brilho.
 * Tudo é SVG vetorial desenhado à mão: nenhuma imagem gerada por IA e nenhum texto dentro do desenho.
 *
 * THEMES liga o ícone escolhido no formulário (ilustracao.icone) à cena do cabeçalho e ao ícone grande do
 * cartão principal. Temas "planejados" ainda não têm cena: caem na cena genérica (círculo de luz com o ícone).
 */
import { SPOT_DRAW, type SpotName } from "./spots";

export * from "./spots";
export * from "./scenes";

export interface KitTheme {
  /** Área do roteiro (para quem mantém o kit). */
  area: string;
  /** Cena do cabeçalho (scenes.ts); vazio = cena genérica. */
  scene: string;
  /** Ícone grande do cartão principal. */
  hero: SpotName;
  pronto: boolean;
}

export const THEMES: Record<string, KitTheme> = {
  pulmao: { area: "Pneumologia / infectologia respiratória (tuberculose, pneumonia, asma, DPOC)", scene: "pulmao", hero: "tosse", pronto: true },
  coracao: { area: "Cardiologia (dor torácica, hipertensão, insuficiência cardíaca)", scene: "coracao", hero: "coracao", pronto: true },
  bebe: { area: "Pediatria (puericultura, neonatologia, doenças da infância)", scene: "bebe", hero: "bebe", pronto: true },
  // planejados: ainda sem cena própria (usam a genérica com o ícone)
  utero: { area: "Ginecologia e obstetrícia (pré-natal, gestação, parto)", scene: "", hero: "cruz", pronto: false },
  cruz: { area: "Genérico (qualquer área)", scene: "", hero: "cruz", pronto: true },
  verificacao: { area: "Genérico", scene: "", hero: "ok", pronto: true },
  comprimido: { area: "Farmacologia / tratamento", scene: "", hero: "capsulas", pronto: true },
  cronometro: { area: "Urgência / tempo", scene: "", hero: "cronometro", pronto: true },
  prancheta: { area: "Conduta / protocolo", scene: "", hero: "prancheta", pronto: true },
};

export function themeOf(icone: string): KitTheme {
  return THEMES[icone] ?? THEMES.cruz;
}

/** Desenho (sem a tag <svg>) do ícone do tema, em branco, para a cena genérica. */
export function heroInnerWhite(name: SpotName): string {
  return (SPOT_DRAW[name] as (c: string) => string)("#FFFFFF");
}
