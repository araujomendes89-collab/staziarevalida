import React from "react";

interface StaziaMedLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  layout?: "horizontal" | "vertical" | "monogram";
  isDark?: boolean;
}

// Logo oficial (arquivos em public/brand, gerados por scripts/logos/gerar-logos.py).
// isDark = fundo escuro: usa a variante com o nome em branco.
const ALT = "StaziaMed Revalida";

// Proporção real dos arquivos (largura / altura), para o navegador reservar o espaço sem esticar.
const RATIO = { horizontal: 1664 / 517, vertical: 862 / 750, monogram: 546 / 809 };

export const StaziaMedLogo: React.FC<StaziaMedLogoProps> = ({
  className = "",
  size = "md",
  layout = "horizontal",
  isDark = false,
}) => {
  const heightMap = {
    horizontal: { sm: 44, md: 60, lg: 78, xl: 96 },
    vertical: { sm: 112, md: 144, lg: 208, xl: 256 },
    monogram: { sm: 34, md: 48, lg: 64, xl: 80 },
  };
  const file = {
    horizontal: isDark ? "horizontal-escuro-480w.png" : "horizontal-480w.png",
    vertical: isDark ? "vertical-escuro-360w.png" : "vertical-360w.png",
    monogram: isDark ? "simbolo-escuro-128w.png" : "simbolo-128w.png",
  }[layout];
  const height = heightMap[layout][size];
  const width = Math.round(height * RATIO[layout]);

  const img = (
    <img
      src={`/brand/${file}`}
      alt={ALT}
      width={width}
      height={height}
      className="shrink-0 object-contain"
      style={{ width: "auto", height }}
      draggable={false}
      loading="eager"
    />
  );

  if (layout === "vertical") {
    return <div className={`flex flex-col items-center justify-center select-none text-center ${className}`}>{img}</div>;
  }
  return <div className={`inline-flex items-center select-none ${className}`}>{img}</div>;
};
