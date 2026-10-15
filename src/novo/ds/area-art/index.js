// Arte das 5 grandes áreas do pacote "Novas telas" (15/10/2026): SVG 32x32 próprios (não existem no Lucide). Cada arquivo é um
// <img> isolado, então os ids dos degradês de um não colidem com os de outro. Chave = id da área no banco.
import clinica from "./clinica.svg";
import cirurgia from "./cirurgia.svg";
import go from "./go.svg";
import pediatria from "./pediatria.svg";
import preventiva from "./preventiva.svg";

export const AREA_ART = {
  CLINICA_MEDICA: { src: clinica, key: "clinica" },
  CIRURGIA_GERAL: { src: cirurgia, key: "cirurgia" },
  GINECOLOGIA_OBSTETRICIA: { src: go, key: "go" },
  PEDIATRIA: { src: pediatria, key: "pediatria" },
  MEDICINA_FAMILIA_COMUNIDADE: { src: preventiva, key: "preventiva" },
};
