// Ícones ilustrados das 5 grandes áreas (+ "Todas") do pacote Novas telas (15/10/2026, onda 3).
// Os SVG são os do pacote do dono (arquivos nesta pasta); o fundo do azulejo vem dos tokens --area-*-bg.
import React from "react";
import todas from "./todas.svg";
import clinica from "./clinica-medica.svg";
import cirurgia from "./cirurgia.svg";
import pediatria from "./pediatria.svg";
import go from "./gineco-obstetricia.svg";
import preventiva from "./preventiva-mfc.svg";

const ART = {
  "": { src: todas, bg: "var(--selected-bg)" },
  CLINICA_MEDICA: { src: clinica, bg: "var(--area-clinica-bg)" },
  CIRURGIA_GERAL: { src: cirurgia, bg: "var(--area-cirurgia-bg)" },
  PEDIATRIA: { src: pediatria, bg: "var(--area-pediatria-bg)" },
  GINECOLOGIA_OBSTETRICIA: { src: go, bg: "var(--area-go-bg)" },
  MEDICINA_FAMILIA_COMUNIDADE: { src: preventiva, bg: "var(--area-preventiva-bg)" },
};

/** Azulejo com o ícone ilustrado da área. `area` = id do banco ("" = todas as áreas). Decorativo (o nome da área vem ao lado). */
export function AreaArtTile({ area = "", size = 46 }) {
  const art = ART[area] ?? ART[""];
  return (
    <span className="sm-areaart" aria-hidden="true" style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: art.bg }}>
      <img src={art.src} alt="" width={Math.round(size * 0.7)} height={Math.round(size * 0.7)} />
    </span>
  );
}
