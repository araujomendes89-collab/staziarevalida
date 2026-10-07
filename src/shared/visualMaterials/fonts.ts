/**
 * Fontes dos materiais visuais (Barlow, Barlow Condensed e Caveat, licença SIL OFL), em
 * server/contentHub/fonts/visual. O servidor embute os arquivos no PDF; a prévia do painel os carrega
 * pela FontFace API. Pesos e estilos são os das pranchas de referência.
 */
export interface VisualFontFile {
  family: "Barlow" | "Barlow Condensed" | "Caveat";
  weight: string;
  style: "normal" | "italic";
  file: string;
}

export const VISUAL_FONT_FILES: VisualFontFile[] = [
  { family: "Barlow", weight: "400", style: "normal", file: "Barlow-Regular.ttf" },
  { family: "Barlow", weight: "500", style: "normal", file: "Barlow-Medium.ttf" },
  { family: "Barlow", weight: "600", style: "normal", file: "Barlow-SemiBold.ttf" },
  { family: "Barlow", weight: "700", style: "normal", file: "Barlow-Bold.ttf" },
  { family: "Barlow Condensed", weight: "600", style: "normal", file: "BarlowCondensed-SemiBold.ttf" },
  { family: "Barlow Condensed", weight: "700", style: "normal", file: "BarlowCondensed-Bold.ttf" },
  { family: "Barlow Condensed", weight: "800", style: "normal", file: "BarlowCondensed-ExtraBold.ttf" },
  { family: "Barlow Condensed", weight: "700", style: "italic", file: "BarlowCondensed-BoldItalic.ttf" },
  // instâncias estáticas da fonte variável oficial (a variável sai como Type3 no PDF): ver fonts/visual/LEIA-ME.txt
  { family: "Caveat", weight: "600", style: "normal", file: "Caveat-SemiBold.ttf" },
  { family: "Caveat", weight: "700", style: "normal", file: "Caveat-Bold.ttf" },
];
