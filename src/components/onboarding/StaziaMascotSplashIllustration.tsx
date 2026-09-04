import React from "react";

interface StaziaMascotSplashIllustrationProps {
  isAnimating: boolean;
  reduceMotion: boolean;
  className?: string;
}

export const StaziaMascotSplashIllustration: React.FC<StaziaMascotSplashIllustrationProps> = ({
  isAnimating,
  reduceMotion,
  className = "",
}) => {
  return (
    <div className={`relative w-full h-full flex items-center justify-center select-none ${className}`}>
      <style>{`
        :root {
          --ease-out: cubic-bezier(.16, 1, .3, 1);
          --ease-bounce: cubic-bezier(.34, 1.56, .64, 1);
          --bg-0: #08101D;
          --bg-1: #0E1B34;
          --text-0: #F5F7FA;
          --text-1: #97A3B8;
          --teal: #52C7B8;
          --teal-strong: #45E0CE;
          --blue: #2D68B8;
          --total-dur: 11000ms;
        }

        /* Ambient floating dots */
        .splash-bg-dots circle {
          opacity: .28;
          transform-box: fill-box;
          transform-origin: center;
          animation: floatDot 6s ease-in-out infinite;
        }
        .splash-bg-dots circle:nth-child(odd) { animation-duration: 7.2s; }
        .splash-bg-dots circle:nth-child(3n) { animation-duration: 5.2s; animation-direction: reverse; }
        .splash-bg-dots circle:nth-child(1) { animation-delay: 0s; }
        .splash-bg-dots circle:nth-child(2) { animation-delay: .4s; }
        .splash-bg-dots circle:nth-child(3) { animation-delay: .8s; }
        .splash-bg-dots circle:nth-child(4) { animation-delay: 1.2s; }
        .splash-bg-dots circle:nth-child(5) { animation-delay: 1.6s; }
        .splash-bg-dots circle:nth-child(6) { animation-delay: 2.0s; }
        .splash-bg-dots circle:nth-child(7) { animation-delay: 2.4s; }
        .splash-bg-dots circle:nth-child(8) { animation-delay: 2.8s; }
        .splash-bg-dots circle:nth-child(9) { animation-delay: .2s; }
        .splash-bg-dots circle:nth-child(10) { animation-delay: .6s; }
        .splash-bg-dots circle:nth-child(11) { animation-delay: 1.0s; }
        .splash-bg-dots circle:nth-child(12) { animation-delay: 1.4s; }
        .splash-bg-dots circle:nth-child(13) { animation-delay: 1.8s; }
        .splash-bg-dots circle:nth-child(14) { animation-delay: 2.2s; }
        .splash-bg-dots circle:nth-child(15) { animation-delay: 2.6s; }
        .splash-bg-dots circle:nth-child(16) { animation-delay: 3.0s; }

        @keyframes floatDot {
          0%, 100% { transform: translate(0, 0); opacity: .18; }
          50% { transform: translate(6px, -10px); opacity: .4; }
        }

        /* Impact sparks */
        .spark { opacity: 0; transform-box: fill-box; transform-origin: center; }
        .splash-go .spark { animation: sparkPoof 520ms var(--ease-out) forwards; }
        .splash-go .spark.s1 { animation-delay: 930ms; }
        .splash-go .spark.s2 { animation-delay: 950ms; }
        .splash-go .spark.s3 { animation-delay: 970ms; }
        .splash-go .spark.s4 { animation-delay: 990ms; }
        .splash-go .spark.s5 { animation-delay: 940ms; }
        .splash-go .spark.s6 { animation-delay: 960ms; }

        @keyframes sparkPoof {
          0% { opacity: 0; transform: translate(0, 0) scale(.3); }
          35% { opacity: .9; }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(1); }
        }

        /* Mascot Falling, Bouncing, Dizzy, Wave */
        #mascot { opacity: 0; transform-box: fill-box; transform-origin: 50% 96%; }
        .splash-go #mascot {
          animation:
            fallBounce 2450ms cubic-bezier(.3, 0, .7, 1) 150ms forwards,
            wobbleDizzy 500ms ease-in-out 2600ms 2,
            armWaveSeq 900ms ease-in-out 3650ms;
        }

        @keyframes fallBounce {
          0% { opacity: 0; transform: translate(-30px, -320px) rotate(-420deg) scale(1, 1); }
          8% { opacity: 1; }
          26% { transform: translate(46px, -40px) rotate(-120deg) scale(1, 1); }
          30% { transform: translate(52px, 26px) rotate(-40deg) scale(1.32, .62); }
          38% { transform: translate(24px, -92px) rotate(10deg) scale(.9, 1.14); }
          50% { transform: translate(8px, 14px) rotate(0deg) scale(1.2, .76); }
          58% { transform: translate(2px, -34px) rotate(-6deg) scale(.95, 1.06); }
          68% { transform: translate(0px, 6px) rotate(2deg) scale(1.1, .9); }
          76% { transform: translate(0px, -10px) rotate(-2deg) scale(.98, 1.03); }
          86% { transform: translate(0, 0) rotate(0deg) scale(1, 1); }
          100% { opacity: 1; transform: translate(0, 0) rotate(0deg) scale(1, 1); }
        }

        @keyframes wobbleDizzy {
          0%, 100% { transform: rotate(0deg); }
          30% { transform: rotate(-7deg); }
          70% { transform: rotate(6deg); }
        }

        @keyframes armWaveSeq { 0%, 100% {} }

        #armWave { transform-box: fill-box; transform-origin: top center; }
        .splash-go #armWave { animation: wave 900ms ease-in-out 3650ms; }
        @keyframes wave {
          0%, 100% { transform: rotate(-6deg); }
          25% { transform: rotate(-46deg); }
          50% { transform: rotate(-14deg); }
          75% { transform: rotate(-40deg); }
        }

        #tuft { transform-box: fill-box; transform-origin: bottom center; }
        .splash-go #tuft { animation: tuftFlop 900ms var(--ease-bounce) 2350ms; }
        @keyframes tuftFlop {
          0% { transform: rotate(0deg); }
          20% { transform: rotate(-26deg); }
          45% { transform: rotate(14deg); }
          70% { transform: rotate(-8deg); }
          100% { transform: rotate(0deg); }
        }

        /* Dizzy stars */
        #dizzyStars { opacity: 0; transform-box: fill-box; transform-origin: center; }
        .splash-go #dizzyStars {
          animation: dizzyShow 1200ms ease-in-out 2450ms forwards, dizzySpin 1200ms linear 2450ms;
        }
        @keyframes dizzyShow { 0% { opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes dizzySpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* Books entering */
        #books .bk { opacity: 0; transform: scale(.4); transform-box: fill-box; transform-origin: center; }
        .splash-go #books .bk1 { animation: bookIn 360ms var(--ease-bounce) 2500ms forwards; }
        .splash-go #books .bk2 { animation: bookIn 360ms var(--ease-bounce) 2640ms forwards; }
        .splash-go #books .bk3 { animation: bookIn 360ms var(--ease-bounce) 2780ms forwards; }
        @keyframes bookIn { to { opacity: 1; transform: scale(1); } }

        /* Logo reveal */
        #logoMark { opacity: 0; transform: scale(.7); transform-box: fill-box; transform-origin: center; }
        .splash-go #logoMark { animation: logoPop 520ms var(--ease-bounce) 3900ms forwards; }
        @keyframes logoPop { to { opacity: 1; transform: scale(1); } }

        /* Glow resolution */
        #resolveGlow { opacity: 0; transform-box: fill-box; transform-origin: center; }
        .splash-go #resolveGlow { animation: glowPulse 900ms ease-out 9800ms forwards; }
        @keyframes glowPulse {
          0% { opacity: 0; transform: scale(.6); }
          40% { opacity: .55; }
          100% { opacity: 0; transform: scale(1.6); }
        }

        /* Reduced Motion Fallback */
        .splash-reduced-motion .spark,
        .splash-reduced-motion #mascot,
        .splash-reduced-motion #armWave,
        .splash-reduced-motion #tuft,
        .splash-reduced-motion #dizzyStars,
        .splash-reduced-motion #logoMark,
        .splash-reduced-motion #books .bk,
        .splash-reduced-motion #resolveGlow {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
        .splash-reduced-motion .spark { opacity: 0 !important; }
        .splash-reduced-motion .splash-bg-dots circle {
          animation: none !important;
          opacity: .28 !important;
          transform: none !important;
        }
      `}</style>

      <div
        className={`w-full max-w-[420px] aspect-[9/16] max-h-[94vh] relative flex items-center justify-center ${
          reduceMotion ? "splash-reduced-motion" : isAnimating ? "splash-go" : ""
        }`}
      >
        <svg
          id="scene"
          viewBox="0 0 400 700"
          className="w-full h-full block"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Mascote da StaziaMed de jaleco e estetoscópio caindo, quicando e pousando ao lado de livros, com a logo oficial StaziaMed Revalida"
        >
          <defs>
            <linearGradient id="iconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#45E0CE" />
              <stop offset="100%" stopColor="#2D68B8" />
            </linearGradient>
            <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#45E0CE" stopOpacity=".55" />
              <stop offset="100%" stopColor="#45E0CE" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bgGlowGrad1" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#52C7B8" stopOpacity=".35" />
              <stop offset="100%" stopColor="#52C7B8" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bgGlowGrad2" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#2D68B8" stopOpacity=".3" />
              <stop offset="100%" stopColor="#2D68B8" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Fundo ambiente */}
          <g id="bgGlow" aria-hidden="true">
            <circle cx="70" cy="110" r="150" fill="url(#bgGlowGrad1)" />
            <circle cx="360" cy="560" r="170" fill="url(#bgGlowGrad2)" />
            <circle cx="340" cy="120" r="90" fill="url(#bgGlowGrad1)" />
          </g>

          <g id="bgRings" fill="none" stroke="#45E0CE" strokeWidth="1.5" opacity="0.06" aria-hidden="true">
            <circle cx="200" cy="330" r="150" />
            <circle cx="200" cy="330" r="210" />
          </g>

          <g id="bgDots" className="splash-bg-dots" aria-hidden="true">
            <circle cx="48" cy="70" r="2.4" fill="#45E0CE" />
            <circle cx="110" cy="150" r="1.8" fill="#52C7B8" />
            <circle cx="60" cy="240" r="2" fill="#45E0CE" />
            <circle cx="340" cy="90" r="2.2" fill="#52C7B8" />
            <circle cx="300" cy="200" r="1.6" fill="#45E0CE" />
            <circle cx="370" cy="270" r="2" fill="#52C7B8" />
            <circle cx="40" cy="340" r="1.8" fill="#45E0CE" />
            <circle cx="80" cy="470" r="2.2" fill="#52C7B8" />
            <circle cx="330" cy="400" r="1.8" fill="#45E0CE" />
            <circle cx="360" cy="480" r="2" fill="#52C7B8" />
            <circle cx="50" cy="560" r="1.6" fill="#45E0CE" />
            <circle cx="120" cy="620" r="2" fill="#52C7B8" />
            <circle cx="320" cy="620" r="1.8" fill="#45E0CE" />
            <circle cx="200" cy="60" r="1.6" fill="#52C7B8" />
            <circle cx="250" cy="560" r="2.2" fill="#45E0CE" />
            <circle cx="150" cy="500" r="1.6" fill="#52C7B8" />
          </g>

          <line
            id="groundLine"
            x1="90"
            y1="406"
            x2="310"
            y2="406"
            stroke="rgba(255,255,255,.08)"
            strokeWidth="2"
            opacity="0.5"
            aria-hidden="true"
          />

          {/* Poof de impacto */}
          <g id="sparks" aria-hidden="true">
            <circle className="spark s1" style={{ "--tx": "-46px", "--ty": "-14px" } as React.CSSProperties} cx="200" cy="400" r="4" fill="#45E0CE" />
            <circle className="spark s2" style={{ "--tx": "44px", "--ty": "-16px" } as React.CSSProperties} cx="200" cy="400" r="3.4" fill="#52C7B8" />
            <circle className="spark s3" style={{ "--tx": "-58px", "--ty": "10px" } as React.CSSProperties} cx="200" cy="400" r="3" fill="#45E0CE" />
            <circle className="spark s4" style={{ "--tx": "56px", "--ty": "12px" } as React.CSSProperties} cx="200" cy="400" r="3.6" fill="#52C7B8" />
            <circle className="spark s5" style={{ "--tx": "0px", "--ty": "-26px" } as React.CSSProperties} cx="200" cy="400" r="3" fill="#45E0CE" />
            <circle className="spark s6" style={{ "--tx": "0px", "--ty": "22px" } as React.CSSProperties} cx="200" cy="400" r="3.2" fill="#52C7B8" />
          </g>

          {/* Mascote */}
          <g transform="translate(200,330)">
            <g id="mascot">
              <g id="dizzyStars-anchor" transform="translate(0,-118)">
                <g id="dizzyStars">
                  <circle cx="-22" cy="0" r="3" fill="#45E0CE" />
                  <circle cx="22" cy="-6" r="2.4" fill="#52C7B8" />
                  <circle cx="4" cy="-16" r="2" fill="#45E0CE" />
                </g>
              </g>

              <g id="tuft">
                <path d="M-6 -108q-6 -22 10 -30q4 18 -2 32z" fill="#45E0CE" />
              </g>

              {/* Corpo e cabeça */}
              <ellipse cx="0" cy="0" rx="66" ry="76" fill="#52C7B8" />
              <ellipse cx="0" cy="20" rx="40" ry="46" fill="#EAF7F4" />

              {/* Jaleco médico */}
              <g id="coat">
                <path d="M -8,14 C -28,18 -44,34 -42,56 C -40,74 -28,80 -8,80 L -8,14 Z" fill="#FBFDFE" stroke="#C7D6DC" strokeWidth="2" />
                <path d="M 8,14 C 28,18 44,34 42,56 C 40,74 28,80 8,80 L 8,14 Z" fill="#FBFDFE" stroke="#C7D6DC" strokeWidth="2" />
                <circle cx="0" cy="32" r="2.6" fill="#7C8CA0" />
                <circle cx="0" cy="52" r="2.6" fill="#7C8CA0" />
                <rect x="16" y="46" width="15" height="11" rx="2" fill="none" stroke="#C7D6DC" strokeWidth="1.6" />
              </g>

              {/* Braços */}
              <g id="armWave">
                <rect x="-62" y="-30" width="18" height="64" rx="9" fill="#52C7B8" />
              </g>
              <rect x="46" y="-30" width="18" height="64" rx="9" fill="#52C7B8" />

              {/* Estetoscópio */}
              <g id="stetho" fill="none" stroke="#B9C4CC" strokeWidth="6" strokeLinecap="round">
                <path d="M -50,-40 C -60,-10 -50,22 -15,38" />
                <path d="M 50,-40 C 60,-10 50,22 15,38" />
              </g>
              <ellipse cx="-50" cy="-40" rx="5" ry="7" fill="#B9C4CC" stroke="#8B98A3" strokeWidth="1.5" transform="rotate(-20 -50 -40)" />
              <ellipse cx="50" cy="-40" rx="5" ry="7" fill="#B9C4CC" stroke="#8B98A3" strokeWidth="1.5" transform="rotate(20 50 -40)" />
              <circle cx="0" cy="42" r="10" fill="#C3CDD4" stroke="#8B98A3" strokeWidth="2" />
              <circle cx="0" cy="42" r="4.5" fill="#8B98A3" />

              {/* Pés */}
              <ellipse cx="-32" cy="86" rx="15" ry="9" fill="#2E4459" />
              <ellipse cx="32" cy="86" rx="15" ry="9" fill="#2E4459" />

              {/* Olhos e óculos */}
              <g fill="none" stroke="#173042" strokeWidth="4">
                <circle cx="-20" cy="-24" r="16" />
                <circle cx="20" cy="-24" r="16" />
                <line x1="-4" y1="-24" x2="4" y2="-24" />
              </g>
              <circle cx="-20" cy="-24" r="5.5" fill="#173042" />
              <circle cx="20" cy="-24" r="5.5" fill="#173042" />
              <path d="M-13 2q13 12 26 0" fill="none" stroke="#173042" strokeWidth="4" strokeLinecap="round" />
            </g>
          </g>

          {/* Livros */}
          <g id="books" transform="translate(272,392)">
            <rect className="bk bk1" x="-34" y="-6" width="72" height="17" rx="3" fill="#2D68B8" transform="rotate(-4)" />
            <rect className="bk bk2" x="-30" y="-21" width="62" height="17" rx="3" fill="#52C7B8" transform="rotate(3)" />
            <rect className="bk bk3" x="-24" y="-36" width="52" height="17" rx="3" fill="#173042" transform="rotate(-3)" />
            <line className="bk bk1" x1="-24" y1="2" x2="28" y2="2" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" transform="rotate(-4)" />
            <line className="bk bk2" x1="-20" y1="-13" x2="24" y2="-13" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" transform="rotate(3)" />
          </g>

          {/* Logo: reconstrução vetorial pura (sem raster/base64) do mark StaziaMed */}
          <g id="logoGroup" transform="translate(56,556)">
            <circle id="resolveGlow" cx="150" cy="46" r="140" fill="url(#glowGrad)" />
            <g id="logoMark">
              {/* Ícone: tubo em S (estetoscópio) com cruz médica embutida */}
              <g id="brandIcon" transform="translate(6,4) scale(0.188)">
                <g transform="translate(-9.797174,655.543680) scale(0.1,-0.1)" fill="url(#iconGrad)" stroke="none">
                  <path d="M3565 6554 c-151 -23 -319 -145 -380 -275 -29 -64 -49 -86 -91 -99 -54 -18 -99 2 -174 79 -51 53 -75 70 -113 81 -67 18 -968 6 -1147 -16 -791 -98 -1412 -672 -1539 -1423 -124 -734 265 -1467 933 -1755 228 -99 333 -117 713 -123 262 -5 304 -8 317 -22 10 -11 15 -50 18 -131 4 -130 16 -162 75 -207 35 -27 41 -28 172 -31 156 -3 179 5 228 79 25 37 28 52 33 160 7 162 6 161 177 169 150 6 185 21 231 98 26 45 27 54 27 172 0 133 -8 161 -57 207 -43 41 -90 53 -203 53 -101 0 -140 8 -157 34 -4 6 -8 52 -8 101 0 109 -12 155 -50 199 -46 52 -72 58 -218 54 -149 -3 -168 -11 -212 -89 -20 -37 -25 -60 -28 -146 -6 -144 12 -136 -274 -131 -247 5 -297 12 -432 63 -220 83 -408 237 -535 439 -205 328 -213 744 -21 1079 172 302 452 497 813 569 29 5 293 13 592 16 615 8 595 5 671 96 45 54 106 82 157 72 43 -8 57 -24 103 -115 64 -129 189 -229 329 -266 311 -81 636 173 635 497 -1 265 -217 495 -481 511 -41 3 -87 3 -104 1z" />
                  <path d="M1924 5361 c-62 -38 -79 -75 -82 -186 -5 -180 -9 -185 -159 -185 -128 0 -171 -10 -219 -52 -58 -51 -64 -72 -64 -215 0 -212 34 -245 258 -253 172 -6 172 -7 172 -155 0 -117 8 -146 53 -193 40 -41 80 -52 195 -52 185 0 240 53 253 244 10 150 -4 141 232 139 171 -1 203 -4 292 -27 451 -117 774 -514 827 -1019 50 -471 -235 -936 -677 -1102 -155 -59 -144 -58 -775 -64 -534 -6 -588 -8 -625 -24 -46 -21 -88 -58 -116 -104 -26 -42 -99 -77 -146 -70 -56 9 -79 31 -117 110 -112 234 -386 372 -641 323 -163 -32 -295 -118 -385 -252 -71 -107 -95 -190 -95 -329 0 -168 49 -288 165 -405 214 -215 567 -228 808 -29 59 49 162 185 162 213 0 23 50 64 85 70 63 12 108 -8 166 -76 35 -40 71 -69 104 -84 l50 -24 522 0 c538 0 649 6 819 46 649 150 1163 677 1306 1337 33 151 32 472 -1 637 -55 275 -178 552 -338 764 -129 170 -369 373 -548 464 -268 135 -454 178 -813 189 -146 4 -218 10 -230 19 -14 10 -18 34 -23 127 -5 106 -7 119 -34 157 -46 67 -83 80 -227 80 -103 0 -128 -3 -154 -19z" />
                </g>
              </g>
              {/* Wordmark: texto vetorial puro */}
              <text x="86" y="72" fontFamily="'Poppins','Segoe UI',-apple-system,sans-serif" fontSize="46" fontWeight="800">
                <tspan fill="var(--text-0)">Stazia</tspan>
                <tspan fill="url(#iconGrad)">Med</tspan>
              </text>
              <circle cx="234" cy="34" r="4.5" fill="var(--teal-strong)" />
              <line x1="86" y1="93" x2="118" y2="93" stroke="url(#iconGrad)" strokeWidth="1.6" />
              <text x="126" y="97" fontFamily="'Poppins','Segoe UI',-apple-system,sans-serif" fontSize="13" fontWeight="600" letterSpacing="4" fill="var(--text-1)">
                REVALIDA
              </text>
              <line x1="222" y1="93" x2="254" y2="93" stroke="url(#iconGrad)" strokeWidth="1.6" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
};

export default StaziaMascotSplashIllustration;
