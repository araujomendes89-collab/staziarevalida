// Ícones ilustrados que mudaram no pacote "Novas telas" (onda 2, 15/10/2026). Gerados dos arquivos do pacote (assets/*.svg), sem edição à mão:
// Plano de Hoje, Missões, Análise Inteligente, Mapas Mentais, Minha Trilha e Meu Plano. Quem não está aqui segue em prototype/RealIcons.jsx e AppIcons.jsx.
// Mesma forma de AppIcons.jsx: { an: animação ao passar o mouse, d: () => desenho 32x32 }.
import React from "react";

export const NOVAS_TELAS_ICONS = {
  // Plano de Hoje: prancheta com tarefas; as marcas de feito agora em verde-azulado do pacote
  "list-checks": {
    an: "pop",
    d: () => (
      <>
        <defs><linearGradient id="ri-hoje-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5B7FD1" /><stop offset="1" stopColor="#1E3F8A" /></linearGradient></defs><rect x="6" y="5" width="20" height="24" rx="3" fill="url(#ri-hoje-b)" /><rect x="8.5" y="8" width="15" height="18.5" rx="1.5" fill="#fff" /><rect x="12" y="3.5" width="8" height="4" rx="1.5" fill="#C9D6F5" /><g><path d="M10.5 12l1.4 1.4 2.6-2.8" stroke="#12A79B" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /><rect x="16" y="11" width="6" height="2" rx="1" fill="#DCE1E8" /></g><g><path d="M10.5 17l1.4 1.4 2.6-2.8" stroke="#12A79B" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /><rect x="16" y="16" width="6" height="2" rx="1" fill="#DCE1E8" /></g><g><path d="M10.5 22l1.4 1.4 2.6-2.8" stroke="#C3CBD5" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /><rect x="16" y="21" width="6" height="2" rx="1" fill="#DCE1E8" /></g>
      </>
    ),
  },
  // Missões: alvo com a flecha cravada; penas da flecha em verde-azulado do pacote
  "target": {
    an: "pop",
    d: () => (
      <>
        <defs><linearGradient id="ri-x-target-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF7B72" /><stop offset="1" stopColor="#D63B3B" /></linearGradient><linearGradient id="ri-x-target-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6CDDD2" /><stop offset="1" stopColor="#0B7F76" /></linearGradient></defs><circle cx="15" cy="17.5" r="11.5" fill="url(#ri-x-target-t)" /><circle cx="15" cy="17.5" r="8.4" fill="#fff" /><circle cx="15" cy="17.5" r="5.4" fill="url(#ri-x-target-t)" /><circle cx="15" cy="17.5" r="2.3" fill="#fff" /><path d="M15 17.5 26 6.5" stroke="#3A4350" strokeWidth="1.9" strokeLinecap="round" /><path d="M25 4.2 27.9 1.6l.5 3.8z" fill="url(#ri-x-target-s)" /><path d="M28.8 7.5l2.6-2.9-3.8-.5z" fill="url(#ri-x-target-s)" /><path d="M6.4 12.6a10.2 10.2 0 0 1 5-4.6" stroke="rgba(255,255,255,.55)" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  // Análise Inteligente: fatia verde-azulada no lugar da azul-clara
  "chart-pie": {
    an: "pop",
    d: () => (
      <>
        <defs><linearGradient id="ri-x-chart-pie-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7C9BE0" /><stop offset="1" stopColor="#1E3F8A" /></linearGradient><linearGradient id="ri-x-chart-pie-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6CDDD2" /><stop offset="1" stopColor="#0B7F76" /></linearGradient><linearGradient id="ri-x-chart-pie-o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB15C" /><stop offset="1" stopColor="#D9650A" /></linearGradient></defs><path d="M14.5 6.2A11.3 11.3 0 1 0 25.8 17.5H14.5z" fill="url(#ri-x-chart-pie-b)" /><path d="M14.5 17.5 6.1 25.1A11.3 11.3 0 0 0 25.8 17.5z" fill="url(#ri-x-chart-pie-t)" /><path d="M17.6 3.4a11.3 11.3 0 0 1 11 11h-11z" fill="url(#ri-x-chart-pie-o)" /><path d="M6.4 11.6a10 10 0 0 1 5-4.4" stroke="rgba(255,255,255,.55)" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  // Mapas Mentais: nó central e três ramos coloridos (desenho novo do pacote)
  "network": {
    an: "pop",
    d: () => (
      <>
        <defs><linearGradient id="ri-mm-core" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4CC3FF" /><stop offset="1" stopColor="#0A5FC4" /></linearGradient><linearGradient id="ri-mm-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#A48BFA" /><stop offset="1" stopColor="#5A37D0" /></linearGradient><linearGradient id="ri-mm-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4FD39A" /><stop offset="1" stopColor="#0E8A5F" /></linearGradient><linearGradient id="ri-mm-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB15C" /><stop offset="1" stopColor="#D9650A" /></linearGradient></defs><path d="M12 16c3 0 3.5-9 8-9M12 16h8M12 16c3 0 3.5 9 8 9" fill="none" stroke="#C3CBD5" strokeWidth="1.8" strokeLinecap="round" /><rect x="2" y="11" width="11" height="10" rx="3.2" fill="url(#ri-mm-core)" /><path d="M4.5 12.5h4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".55" /><circle cx="7.5" cy="16" r="2.2" fill="#fff" /><rect x="19" y="3.5" width="11" height="7" rx="2.4" fill="url(#ri-mm-a)" /><path d="M21.5 7h6" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /><rect x="19" y="12.5" width="11" height="7" rx="2.4" fill="url(#ri-mm-b)" /><path d="M21.5 16h4.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /><rect x="19" y="21.5" width="11" height="7" rx="2.4" fill="url(#ri-mm-c)" /><path d="M21.5 25h5.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      </>
    ),
  },
  // Minha Trilha: estrada com pino de partida e bandeira de chegada (desenho novo do pacote)
  "route": {
    an: "pop",
    d: () => (
      <>
        <defs><linearGradient id="ri-trilha-road" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#4CC3FF" /><stop offset="1" stopColor="#0A5FC4" /></linearGradient><linearGradient id="ri-trilha-flag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB15C" /><stop offset="1" stopColor="#E5580F" /></linearGradient><linearGradient id="ri-trilha-pin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4FD39A" /><stop offset="1" stopColor="#0E8A5F" /></linearGradient></defs><path d="M6 27.5c0-4 3.5-5.5 8-5.5h4c3.6 0 5.5-1.6 5.5-4.2S21.6 13.5 18 13.5h-5c-2.6 0-4-1.2-4-3.1C9 8.6 10.4 7.5 13 7.5h7" fill="none" stroke="url(#ri-trilha-road)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 27.5c0-4 3.5-5.5 8-5.5h4c3.6 0 5.5-1.6 5.5-4.2S21.6 13.5 18 13.5h-5c-2.6 0-4-1.2-4-3.1C9 8.6 10.4 7.5 13 7.5h7" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1.6 2.4" opacity=".9" /><circle cx="6" cy="27.5" r="3" fill="url(#ri-trilha-pin)" /><circle cx="6" cy="27.5" r="1.1" fill="#fff" /><path d="M22.5 9V2.8" stroke="#052A5A" strokeWidth="1.6" strokeLinecap="round" /><path d="M23.2 2.6h6.3l-1.8 2.3 1.8 2.3h-6.3z" fill="url(#ri-trilha-flag)" /><circle cx="22.5" cy="9.2" r="1.6" fill="#052A5A" />
      </>
    ),
  },
  // Meu Plano: coroa dourada ilustrada (era ícone de linha)
  "crown": {
    an: "bounce",
    d: () => (
      <>
        <defs><linearGradient id="ri-crown-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFCF6B" /><stop offset="1" stopColor="#E08E00" /></linearGradient><linearGradient id="ri-crown-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E59A0B" /><stop offset="1" stopColor="#9A5B06" /></linearGradient></defs><path d="M4 10.5 10 15l6-8 6 8 6-4.5-2.6 13H6.6z" fill="url(#ri-crown-a)" /><path d="M6.6 23.5h18.8V27a1 1 0 0 1-1 1H7.6a1 1 0 0 1-1-1z" fill="url(#ri-crown-b)" /><path d="M10 15l6-8 2.2 2.9L12 17.5z" fill="#fff" opacity=".35" /><circle cx="16" cy="18.5" r="2.2" fill="#fff" /><circle cx="4" cy="10.5" r="1.8" fill="#FFCF6B" /><circle cx="28" cy="10.5" r="1.8" fill="#FFCF6B" /><circle cx="16" cy="6.5" r="1.8" fill="#FFCF6B" />
      </>
    ),
  },
};
