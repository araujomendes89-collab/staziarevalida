// Ícones e emblemas do Mapa Mental, desenhados em código (SVG), sem imagens externas.
import React from "react";

const P = {
  estetoscopio: <><path d="M6 3v6a4 4 0 0 0 8 0V3" /><path d="M10 13v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="10.5" r="2.2" /></>,
  virus: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v3.3M12 18.2v3.3M2.5 12h3.3M18.2 12h3.3M5.3 5.3l2.3 2.3M16.4 16.4l2.3 2.3M18.7 5.3l-2.3 2.3M7.6 16.4l-2.3 2.3" /><circle cx="12" cy="2.5" r=".9" /><circle cx="12" cy="21.5" r=".9" /><circle cx="2.5" cy="12" r=".9" /><circle cx="21.5" cy="12" r=".9" /></>,
  pulmao: <><path d="M12 3v7" /><path d="M12 10c-1.2 0-2.6-.9-4-.9C4.8 9.1 3 12.5 3 17c0 2 .9 3 2.6 3 2 0 3.3-1.2 4-3.2.6-1.6.8-3.8 1.1-6.8" /><path d="M12 10c1.2 0 2.6-.9 4-.9 3.2 0 5 3.4 5 7.9 0 2-.9 3-2.6 3-2 0-3.3-1.2-4-3.2-.6-1.6-.8-3.8-1.1-6.8" /></>,
  alerta: <><path d="M12 3.5 2.6 20h18.800L12 3.500z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.3" r=".6" /></>,
  prancheta: <><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 17.500h3.5" /></>,
  microscopio: <><path d="M6 21h12" /><path d="M8 21a6 6 0 0 1-1-9.5" /><path d="M11 3.500l3.5 1.8-3 6-3.5-1.800z" /><path d="M14 11.500a4.5 4.5 0 0 1 2.5 5" /></>,
  pilula: <><rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="M9.5 9.500l5 5" /></>,
  pessoas: <><circle cx="9" cy="8" r="3" /><path d="M3 20c.4-3.5 2.8-5.5 6-5.500s5.6 2 6 5.5" /><circle cx="17" cy="9" r="2.3" /><path d="M16.5 14.300c2.6.1 4.2 1.7 4.5 4.7" /></>,
  lampada: <><path d="M9 18h6M10 21h4" /><path d="M8.5 14.500C6.8 13.3 6 11.7 6 10a6 6 0 0 1 12 0c0 1.7-.8 3.3-2.5 4.5-.6.5-1 1.2-1 2h-5c0-.8-.4-1.5-1-2z" /></>,
  alvo: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.3" /></>,
  tubo: <><path d="M9 3h6M10 3v14a2.5 2.5 0 0 0 5 0V3" /><path d="M10 11h5" /></>,
  escudo: <><path d="M12 3 4.5 6v5.500c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.500V6L12 3z" /><path d="M9 12l2.2 2.200L15.5 10" /></>,
  relogio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  gota: <><path d="M12 3c3.5 4.2 6 7.2 6 10.500a6 6 0 0 1-12 0C6 10.2 8.5 7.2 12 3z" /></>,
  bebe: <><circle cx="12" cy="12" r="9" /><path d="M9 10.500v.5M15 10.500v.5M9.2 15a3.7 3.7 0 0 0 5.6 0" /><path d="M11 3.200c0 1.2.8 2 2 2" /></>,
  coracao: <><path d="M12 20.500S3.5 15.5 3.5 9.200A4.7 4.7 0 0 1 12 6.600a4.7 4.7 0 0 1 8.5 2.600c0 6.3-8.5 11.3-8.5 11.300z" /></>,
  balanca: <><path d="M12 4v16M7 20h10M5 7h14" /><path d="M5 7l-2.5 6a3 3 0 0 0 5 0L5 7zM19 7l-2.5 6a3 3 0 0 0 5 0L19 7z" /></>,
  cruz: <><path d="M9.5 3.500h5v6h6v5h-6v6h-5v-6h-6v-5h6z" /></>,
  lupa: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.500L21 21" /></>,
  calendario: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M13 14h3M8 17h2" /></>,
  seringa: <><path d="M18 3l3 3M16 5l3 3M14.5 6.500l3 3-8.5 8.5-4 .5.5-4z" /><path d="M7 14l3 3M4 20l2-2" /></>,
  gestante: <><circle cx="11" cy="5" r="2.3" /><path d="M9.5 9.500C8 11 8 13 9.2 14.500c.6.8.5 1.8.3 2.800L9 21M13 9.500c3 1 4.5 3.5 4 6.2-.3 1.7-1.5 2.3-3.5 2.3" /></>,
  check: <path d="M5 12.500l4.5 4.500L19 7.5" />,
  seta: <path d="M5 12h13M13 6l6 6-6 6" />,
  mais: <path d="M12 5v14M5 12h14" />,
};

export const NOMES_ICONES = Object.keys(P);

export function MapaIcon({ nome, size = 24, sw = 1.8 }) {
  const g = P[nome] ?? P.cruz;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {g}
    </svg>
  );
}

/** Emblema de vidro em cima do cartão central (desenhado em SVG). */
export function Emblema({ tipo = "cruz" }) {
  const id = React.useId().replace(/:/g, "");
  const defs = (
    <defs>
      <linearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#BBD8FF" stopOpacity=".95" />
        <stop offset=".55" stopColor="#6E9FEA" stopOpacity=".8" />
        <stop offset="1" stopColor="#5B86D6" stopOpacity=".7" />
      </linearGradient>
      <radialGradient id={`${id}r`} cx=".5" cy=".5" r=".5">
        <stop offset="0" stopColor="#FF2F48" stopOpacity="1" />
        <stop offset="1" stopColor="#FF4D5E" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}g`} cx=".5" cy=".5" r=".5">
        <stop offset="0" stopColor="#7DB7FF" stopOpacity=".55" />
        <stop offset="1" stopColor="#7DB7FF" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#E9F3FF" stopOpacity=".95" />
        <stop offset="1" stopColor="#6EA0EC" stopOpacity=".85" />
      </linearGradient>
    </defs>
  );
  let corpo;
  if (tipo === "pulmao") {
    corpo = (
      <>
        <rect x="109" y="2" width="22" height="84" rx="6" fill={`url(#${id}v)`} opacity=".9" />
        {[10, 20, 30, 40, 50, 60, 70].map((y) => <path key={y} d={`M109 ${y}h22`} stroke="#fff" strokeOpacity=".6" strokeWidth="1.4" />)}
        <path d="M120 84 L96 118 M120 84 L144 118" stroke="#8EB8F2" strokeWidth="9" strokeLinecap="round" opacity=".9" />
        <path d="M108 74C70 64 30 92 16 152 8 192 22 216 54 214 82 212 98 190 105 160 111 134 111 100 108 74Z" fill={`url(#${id}v)`} stroke="#fff" strokeOpacity=".75" strokeWidth="2" />
        <path d="M132 74C170 64 210 92 224 152 232 192 218 216 186 214 158 212 142 190 135 160 129 134 129 100 132 74Z" fill={`url(#${id}v)`} stroke="#fff" strokeOpacity=".75" strokeWidth="2" />
        <circle cx="62" cy="156" r="36" fill={`url(#${id}r)`} />
        <circle cx="178" cy="156" r="36" fill={`url(#${id}r)`} />
        <path d="M96 118c-14 6-28 16-36 34M96 118c-4 16-6 30-4 44M144 118c14 6 28 16 36 34M144 118c4 16 6 30 4 44M60 152c-8 8-12 18-12 30M180 152c8 8 12 18 12 30" stroke="#fff" strokeOpacity=".65" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M40 110c12-14 32-22 52-22" stroke="#fff" strokeOpacity=".5" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    );
  } else if (tipo === "coracao") {
    corpo = (
      <>
        <path d="M120 206S28 150 28 88a50 50 0 0 1 92-26 50 50 0 0 1 92 26c0 62-92 118-92 118z" fill={`url(#${id}v)`} stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
        <circle cx="120" cy="110" r="52" fill={`url(#${id}r)`} />
        <path d="M60 80c4-16 18-24 32-20M150 70c10-4 22 0 28 10" stroke="#fff" strokeOpacity=".7" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    );
  } else if (tipo === "gota") {
    corpo = (
      <>
        <path d="M120 16C170 80 206 118 206 158a86 86 0 0 1-172 0c0-40 36-78 86-142z" fill={`url(#${id}v)`} stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
        <circle cx="120" cy="160" r="50" fill={`url(#${id}r)`} />
        <path d="M68 150c0 20 10 36 26 44" stroke="#fff" strokeOpacity=".75" strokeWidth="4" fill="none" strokeLinecap="round" />
      </>
    );
  } else {
    corpo = (
      <>
        <path d="M96 24h48v64h64v48h-64v64H96v-64H32V88h64z" fill={`url(#${id}c)`} stroke="#fff" strokeOpacity=".8" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="120" cy="112" r="44" fill={`url(#${id}r)`} opacity=".55" />
        <path d="M104 40h32" stroke="#fff" strokeOpacity=".8" strokeWidth="4" strokeLinecap="round" />
      </>
    );
  }
  return (
    <svg className="mm-emblema" viewBox="0 0 240 220" aria-hidden="true" focusable="false">
      {defs}
      <ellipse cx="120" cy="116" rx="112" ry="96" fill={`url(#${id}g)`} />
      {corpo}
    </svg>
  );
}
