// Ícones ilustrados dos itens novos do menu (Trilha, Missões, Classificação, Conquistas e Perfil), no mesmo padrão de
// prototype/RealIcons.jsx: caixa 32×32, gradientes, brilho branco, sombra e as mesmas animações ao passar o mouse
// (classes ri-*). O arquivo do protótipo é gerado a partir do Design System e não é editado à mão; por isso estes ficam aqui.
import React from "react";
import { RealIcon } from "../prototype/RealIcons.jsx";

const g = (id, a, b, x2 = "0", y2 = "1") => (
  <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
    <stop offset="0" stopColor={a} />
    <stop offset="1" stopColor={b} />
  </linearGradient>
);
const SH = "rgba(255,255,255,.55)";
const u = (p, k) => `url(#${p}${k})`;

const DEF = {
  // Trilha: caminho sinuoso com etapas e a bandeira de chegada
  route: {
    an: "pop",
    d: (p) => (
      <>
        <defs>
          {g(p + "r", "#6CDDD2", "#0B7F76", "1", "0")}
          {g(p + "a", "#6CDDD2", "#0B7F76")}
          {g(p + "b", "#7C9BE0", "#1E3F8A")}
          {g(p + "f", "#FF7B72", "#D63B3B")}
        </defs>
        <path d="M7.5 26.5c0-6 8.5-4.5 8.5-10.5s8.5-4.5 8.5-10" stroke={u(p, "r")} strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path d="M7.5 26.5c0-6 8.5-4.5 8.5-10.5s8.5-4.5 8.5-10" stroke="#fff" strokeWidth="1" strokeDasharray="1.6 2.4" fill="none" strokeLinecap="round" opacity=".85" />
        <circle cx="7.5" cy="26.5" r="3.4" fill={u(p, "a")} />
        <circle cx="7.5" cy="26.5" r="1.3" fill="#fff" />
        <circle cx="16" cy="16" r="3.4" fill={u(p, "b")} />
        <circle cx="16" cy="16" r="1.3" fill="#fff" />
        <path d="M24.5 3v9" stroke="#3A4350" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M25.2 3.4h5.3l-1.7 2.3 1.7 2.3h-5.3z" fill={u(p, "f")} />
        <path d="M5.6 24.8a2.4 2.4 0 0 1 2-1.2" stroke={SH} strokeWidth="1" strokeLinecap="round" />
      </>
    ),
  },
  // Missões: alvo com a flecha cravada no centro
  target: {
    an: "pop",
    d: (p) => (
      <>
        <defs>
          {g(p + "t", "#FF7B72", "#D63B3B")}
          {g(p + "s", "#6CDDD2", "#0B7F76")}
        </defs>
        <circle cx="15" cy="17.5" r="11.5" fill={u(p, "t")} />
        <circle cx="15" cy="17.5" r="8.4" fill="#fff" />
        <circle cx="15" cy="17.5" r="5.4" fill={u(p, "t")} />
        <circle cx="15" cy="17.5" r="2.3" fill="#fff" />
        <path d="M15 17.5 26 6.5" stroke="#3A4350" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M25 4.2 27.9 1.6l.5 3.8z" fill={u(p, "s")} />
        <path d="M28.8 7.5l2.6-2.9-3.8-.5z" fill={u(p, "s")} />
        <path d="M6.4 12.6a10.2 10.2 0 0 1 5-4.6" stroke={SH} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  // Classificação: troféu dourado
  trophy: {
    an: "bounce",
    d: (p) => (
      <>
        <defs>
          {g(p + "g", "#FFE08A", "#F0A30A")}
          {g(p + "n", "#3A5CA2", "#1A346E")}
        </defs>
        <path d="M9 7.5H6a3.2 3.2 0 0 0 0 6.4c1.2 0 2.3-.4 3.2-1.1M23 7.5h3a3.2 3.2 0 0 1 0 6.4c-1.2 0-2.3-.4-3.2-1.1" stroke="#F0A30A" strokeWidth="2.1" fill="none" strokeLinecap="round" />
        <path d="M8.5 4.5h15v7.5a7.5 7.5 0 0 1-15 0z" fill={u(p, "g")} />
        <rect x="14.4" y="19" width="3.2" height="4.2" rx=".8" fill="#E8920A" />
        <rect x="9.5" y="22.6" width="13" height="5.4" rx="1.6" fill={u(p, "n")} />
        <rect x="12.5" y="24.5" width="7" height="1.6" rx=".8" fill="#FFE08A" />
        <path d="m16 7.6 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="#fff" opacity=".95" />
        <path d="M10.8 6.5v5" stroke={SH} strokeWidth="1.1" strokeLinecap="round" />
      </>
    ),
  },
  // Conquistas: medalha com fitas
  award: {
    an: "wiggle",
    d: (p) => (
      <>
        <defs>
          {g(p + "b", "#7C9BE0", "#1E3F8A")}
          {g(p + "r", "#FF7B72", "#D63B3B")}
          {g(p + "m", "#FFE08A", "#F0A30A")}
        </defs>
        <path d="M9 2.5h5.6l3.6 10h-5.6z" fill={u(p, "b")} />
        <path d="M23 2.5h-5.6l-3.6 10h5.6z" fill={u(p, "r")} />
        <circle cx="16" cy="20.5" r="8.4" fill={u(p, "m")} />
        <circle cx="16" cy="20.5" r="6.2" fill="none" stroke="#FFF3C4" strokeWidth="1.1" />
        <path d="m16 16.4 1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z" fill="#fff" />
        <path d="M10.4 18a6.6 6.6 0 0 1 3.6-3.7" stroke={SH} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  // Perfil (barra do celular): uma pessoa, no padrão do ícone de usuários
  user: {
    an: "bounce",
    d: (p) => (
      <>
        <defs>
          {g(p + "s", "#FFD2B0", "#E8A77E")}
          {g(p + "a", "#3CCFC2", "#0B7F76")}
        </defs>
        <circle cx="16" cy="10.5" r="5.6" fill={u(p, "s")} />
        <path d="M5.5 28c0-6 4.7-10.5 10.5-10.5S26.5 22 26.5 28z" fill={u(p, "a")} />
        <path d="M12.3 7.4a4.6 4.6 0 0 1 3.3-1.6" stroke={SH} strokeWidth="1" strokeLinecap="round" />
      </>
    ),
  },
};

/** Ícone ilustrado: o do protótipo quando existe; senão, os desenhados aqui; senão, nada (quem chama usa o ícone de linha). */
export function AppRealIcon({ name, size = 28 }) {
  const base = RealIcon({ name, size });
  if (base) return base;
  const D = DEF[name];
  if (!D) return null;
  const p = `ri-x-${name}-`;
  return (
    <svg className={`ri ri-${D.an}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ flexShrink: 0, filter: "drop-shadow(0 2px 2px rgba(13,28,66,.18))", overflow: "visible" }}>
      {D.d(p)}
    </svg>
  );
}
