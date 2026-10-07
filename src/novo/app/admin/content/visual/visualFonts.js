// Fontes dos materiais visuais para a prévia do painel (os mesmos arquivos que o servidor embute no PDF).
// Carregadas uma vez, só quando a prévia abre, e entregues à moldura isolada pela FontFace API.
import { VISUAL_FONT_FILES } from "../../../../../shared/visualMaterials/fonts";
import barlow400 from "../../../../../../server/contentHub/fonts/visual/Barlow-Regular.ttf?url";
import barlow500 from "../../../../../../server/contentHub/fonts/visual/Barlow-Medium.ttf?url";
import barlow600 from "../../../../../../server/contentHub/fonts/visual/Barlow-SemiBold.ttf?url";
import barlow700 from "../../../../../../server/contentHub/fonts/visual/Barlow-Bold.ttf?url";
import cond600 from "../../../../../../server/contentHub/fonts/visual/BarlowCondensed-SemiBold.ttf?url";
import cond700 from "../../../../../../server/contentHub/fonts/visual/BarlowCondensed-Bold.ttf?url";
import cond800 from "../../../../../../server/contentHub/fonts/visual/BarlowCondensed-ExtraBold.ttf?url";
import cond700i from "../../../../../../server/contentHub/fonts/visual/BarlowCondensed-BoldItalic.ttf?url";
import caveat600 from "../../../../../../server/contentHub/fonts/visual/Caveat-SemiBold.ttf?url";
import caveat700 from "../../../../../../server/contentHub/fonts/visual/Caveat-Bold.ttf?url";

const URLS = {
  "Barlow-Regular.ttf": barlow400,
  "Barlow-Medium.ttf": barlow500,
  "Barlow-SemiBold.ttf": barlow600,
  "Barlow-Bold.ttf": barlow700,
  "BarlowCondensed-SemiBold.ttf": cond600,
  "BarlowCondensed-Bold.ttf": cond700,
  "BarlowCondensed-ExtraBold.ttf": cond800,
  "BarlowCondensed-BoldItalic.ttf": cond700i,
  "Caveat-SemiBold.ttf": caveat600,
  "Caveat-Bold.ttf": caveat700,
};

let cache = null;

/** [{ family, weight, style, data: ArrayBuffer }] — baixado uma vez por sessão. */
export function loadVisualFonts() {
  cache ??= Promise.all(
    VISUAL_FONT_FILES.map(async (f) => {
      const res = await fetch(URLS[f.file]);
      if (!res.ok) throw new Error(`Fonte ${f.file} indisponível.`);
      return { family: f.family, weight: f.weight, style: f.style, data: await res.arrayBuffer() };
    })
  ).catch((error) => {
    cache = null;
    throw error;
  });
  return cache;
}
