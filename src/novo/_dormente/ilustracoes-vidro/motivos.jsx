// Os desenhos (motivos) das ilustrações dos temas, todos no estilo vidro translúcido (docs/temas-card.md), em uma caixa de
// 240 × 240. Etapa 1: pulmão, coração, cérebro, rim, útero com ovários, feto no útero, osso/articulação, vírus/bactéria,
// intestino com apêndice, recém-nascido com ambu, agente de saúde no território e o genérico da área (célula). Cada motivo usa só as peças de vidro.jsx; nenhuma imagem, nenhum texto.
import React from "react";
import { Brilho, Ramos, Tubo, Vidro, arvore, suave, useU } from "./vidro.jsx";

const elipse = (cx, cy, rx, ry) => `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
/** Traço de sulco/fissura: sombra azul larga e linha branca fina por cima. */
const Sulco = ({ d, o = 1, w = 1.3 }) => (
  <g fill="none" strokeLinecap="round" opacity={o}>
    <path d={d} stroke="#3F7FA8" strokeOpacity="0.28" strokeWidth={w * 2.6} />
    <path d={d} stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth={w} />
  </g>
);

/* ---------------------------------------------------------------- pulmão */
const PULMAO_D = "M98 46C84 48 66 70 56 100C46 132 40 168 44 194C46 208 58 214 74 208C90 202 106 198 110 186C114 172 108 150 108 130C108 110 110 84 108 62C107 52 104 46 98 46Z";
const PULMAO_E = "M142 46C156 48 174 70 184 100C194 132 200 168 196 194C194 208 182 214 166 208C156 204 146 202 140 196C134 190 142 178 138 168C132 158 132 142 132 126C132 106 130 84 132 62C133 52 136 46 142 46Z";
const BRONQ = {
  d: [
    arvore({ x: 103, y: 116, ang: 205, len: 24, w: 4.2, prof: 5, abertura: 24, semente: 3 }),
    arvore({ x: 104, y: 112, ang: 328, len: 19, w: 3.4, prof: 4, abertura: 26, semente: 11 }),
    arvore({ x: 102, y: 119, ang: 252, len: 18, w: 3, prof: 4, abertura: 24, semente: 5 }),
  ],
  e: [
    arvore({ x: 138, y: 116, ang: 158, len: 24, w: 4.2, prof: 5, abertura: 24, semente: 13 }),
    arvore({ x: 137, y: 112, ang: 32, len: 19, w: 3.4, prof: 4, abertura: 26, semente: 17 }),
    arvore({ x: 139, y: 120, ang: 108, len: 18, w: 3, prof: 4, abertura: 24, semente: 19 }),
  ],
};
const VASOS_PULM = {
  d: [arvore({ x: 104, y: 122, ang: 215, len: 22, w: 2.4, prof: 4, abertura: 30, semente: 23 }), arvore({ x: 104, y: 108, ang: 300, len: 18, w: 2, prof: 4, semente: 29 })],
  e: [arvore({ x: 136, y: 122, ang: 145, len: 22, w: 2.4, prof: 4, abertura: 30, semente: 31 }), arvore({ x: 136, y: 108, ang: 60, len: 18, w: 2, prof: 4, semente: 37 })],
};
function Pulmao() {
  const aneis = [];
  for (let y = 20; y <= 86; y += 6.6) aneis.push(<path key={y} d={`M113.5 ${y}Q120 ${y + 2.6} 126.5 ${y}`} />);
  return (
    <g>
      <Vidro d={PULMAO_D} k="pd" rosa={[[82, 152, 32, 42], [92, 112, 18, 16]]} brilho={[72, 82, 13, 26]}>
        {VASOS_PULM.d.map((a, i) => <Ramos key={`v${i}`} arv={a} cor="azul" opacidade={0.42} pontos={false} />)}
        {BRONQ.d.map((a, i) => <Ramos key={i} arv={a} />)}
        <Sulco d="M106 94C92 120 72 150 50 172" o={0.7} />
        <Sulco d="M80 130C92 127 100 126 108 124" o={0.6} />
      </Vidro>
      <Vidro d={PULMAO_E} k="pe" rosa={[[160, 152, 32, 42], [150, 112, 16, 16]]} brilho={[170, 84, 12, 24]}>
        {VASOS_PULM.e.map((a, i) => <Ramos key={`v${i}`} arv={a} cor="azul" opacidade={0.42} pontos={false} />)}
        {BRONQ.e.map((a, i) => <Ramos key={i} arv={a} />)}
        <Sulco d="M134 92C150 120 170 150 192 172" o={0.7} />
      </Vidro>
      <Tubo d="M120 14L120 92" w={15} />
      <g fill="none" stroke="#3F7FA8" strokeOpacity="0.38" strokeWidth="1.5" strokeLinecap="round">{aneis}</g>
      <Tubo d="M120 90Q111 102 102 117" w={10} />
      <Tubo d="M120 90Q132 101 139 117" w={10} />
    </g>
  );
}

/* --------------------------------------------------------------- coração */
const CORACAO = "M80 116C66 136 68 164 86 184C106 204 140 214 170 206C186 186 198 158 194 132C190 110 172 98 152 98C136 98 122 104 108 106C96 108 86 110 80 116Z";
const CORONARIAS = [
  arvore({ x: 140, y: 150, ang: 110, len: 15, w: 2.2, prof: 3, abertura: 32, semente: 41 }),
  arvore({ x: 134, y: 132, ang: 250, len: 15, w: 2.2, prof: 3, abertura: 32, semente: 43 }),
  arvore({ x: 152, y: 182, ang: 95, len: 13, w: 2, prof: 3, abertura: 30, semente: 47 }),
  arvore({ x: 146, y: 176, ang: 235, len: 14, w: 2, prof: 3, abertura: 30, semente: 53 }),
  arvore({ x: 92, y: 168, ang: 150, len: 12, w: 1.8, prof: 3, abertura: 30, semente: 59 }),
];
function Coracao() {
  return (
    <g>
      <Tubo d="M92 112L92 36" w={13} opacidade={0.75} />
      <Tubo d="M180 80L182 140" w={13} opacidade={0.55} />
      <Tubo d="M128 108C124 76 132 50 154 46C174 42 184 58 180 82" w={16} />
      <Tubo d="M137 54L133 24" w={6} />
      <Tubo d="M150 47L151 19" w={6} />
      <Tubo d="M164 49L171 23" w={6} />
      <Vidro d="M92 106C74 104 62 118 64 134C66 150 80 156 94 150C106 142 108 114 92 106Z" k="ad" fundo opacidade={0.95} brilho={[80, 122, 7, 10]} />
      <Vidro d={CORACAO} k="co" rosa={[[148, 160, 40, 42], [104, 150, 22, 26]]} brilho={[96, 134, 9, 20]}>
        {CORONARIAS.map((a, i) => <Ramos key={i} arv={a} />)}
        <Sulco d="M84 136C100 150 108 176 130 200" o={0.45} />
      </Vidro>
      <Vidro d="M156 104C164 94 180 98 180 110C178 120 166 120 159 115Z" k="ae" fundo />
      <Tubo d="M112 112C106 90 96 78 78 74" w={14} />
      <Tubo d="M82 76C72 72 60 76 52 84" w={8} />
      <Tubo d="M126 110C132 142 142 176 162 204" w={3.6} cor="rosa" />
      <Tubo d="M96 126C92 152 106 186 140 208" w={3.2} cor="rosa" opacidade={0.85} />
    </g>
  );
}

/* --------------------------------------------------------------- cérebro */
// Forma e giros gerados: elipse achatada embaixo, lobo temporal saliente; giros = anéis ondulados interrompidos.
const CB = { cx: 124, cy: 100 };
const raioCerebro = (t) => {
  const s = Math.sin(t);
  const temporal = 10 * Math.exp(-((t - 2.15) ** 2) / 0.09);
  const recorte = -8 * Math.exp(-((t - 1.2) ** 2) / 0.06);
  return [78 + temporal * 0.6 + recorte * 0.4, (s > 0 ? 50 : 56) + temporal + recorte];
};
const pontoCerebro = (t, k = 1, onda = 0) => {
  const [rx, ry] = raioCerebro(t);
  return [CB.cx + Math.cos(t) * (rx * k + onda), CB.cy + Math.sin(t) * (ry * k + onda)];
};
const CEREBRO = suave(Array.from({ length: 40 }, (_, i) => pontoCerebro((i / 40) * Math.PI * 2)), true);
const GIROS = (() => {
  const out = [];
  let s = 5;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  [0.86, 0.7, 0.54, 0.38].forEach((k, nivel) => {
    let t = rnd() * 0.8;
    while (t < Math.PI * 2 - 0.3) {
      const len = 0.7 + rnd() * 0.9;
      const pts = [];
      for (let a = t; a <= Math.min(t + len, Math.PI * 2 - 0.1); a += 0.07) pts.push(pontoCerebro(a, k, Math.sin(a * (17 - nivel * 3) + nivel) * (3.4 - nivel * 0.5)));
      if (pts.length > 2) out.push(suave(pts));
      t += len + 0.16 + rnd() * 0.1;
    }
  });
  return out;
})();
const CEREBELO = "M146 150C158 140 186 142 194 156C200 170 188 184 168 184C152 184 140 168 146 150Z";
const ACM = [
  arvore({ x: 92, y: 124, ang: 62, len: 18, w: 2.6, prof: 4, abertura: 30, semente: 61 }),
  arvore({ x: 118, y: 116, ang: 25, len: 16, w: 2.2, prof: 4, abertura: 30, semente: 67 }),
  arvore({ x: 146, y: 108, ang: 75, len: 14, w: 2, prof: 3, abertura: 30, semente: 71 }),
];
function Cerebro() {
  return (
    <g>
      <Vidro d={CEREBELO} k="cb" fundo brilho={[160, 152, 10, 4]}>
        {[0, 7, 14, 21].map((dy) => <Sulco key={dy} d={`M${146 + dy * 0.3} ${156 + dy}C${160} ${150 + dy} ${180} ${152 + dy} ${196 - dy * 0.4} ${160 + dy}`} o={0.6} w={1} />)}
      </Vidro>
      <Tubo d="M146 146C144 172 140 196 134 224" w={16} opacidade={0.9} />
      <Vidro d={CEREBRO} k="ce" rosa={[[122, 104, 54, 36], [96, 132, 24, 14]]} brilho={[90, 66, 28, 12]}>
        {ACM.map((a, i) => <Ramos key={i} arv={a} opacidade={0.7} />)}
        {GIROS.map((d, i) => <Sulco key={i} d={d} o={0.8} w={1.15} />)}
        <Sulco d="M70 124C92 116 114 114 132 110C146 106 156 100 166 90" w={1.8} />
        <Sulco d="M132 46C126 62 134 76 128 92C124 102 128 108 128 112" w={1.6} />
      </Vidro>
    </g>
  );
}

/* ------------------------------------------------------------------- rim */
const RIM = "M122 34C164 30 192 66 192 116C192 168 164 206 122 202C96 200 82 182 90 162C96 148 102 138 100 122C98 106 92 98 86 84C78 58 96 36 122 34Z";
const PIRAMIDES = [-72, -40, -8, 24, 56, 86].map((g) => {
  const a = (g * Math.PI) / 180;
  const [cx, cy] = [128, 118];
  const p = (r, da = 0) => [cx + Math.cos(a + da) * r, cy + Math.sin(a + da) * r].map((n) => n.toFixed(1)).join(" ");
  return { d: `M${p(54, -0.2)}Q${p(60)} ${p(54, 0.2)}L${p(24, 0.06)}Q${p(20)} ${p(24, -0.06)}Z`, apice: p(22) };
});
function Rim() {
  const u = useU();
  return (
    <g>
      <Vidro d="M108 38C116 20 138 14 150 30C142 36 126 38 108 38Z" k="sr" fundo opacidade={0.85} />
      <Tubo d="M18 106C46 104 72 110 100 115" w={8} cor="rosa" />
      <Tubo d="M18 130C46 132 72 129 100 124" w={10} />
      <Vidro d={RIM} k="ri" rosa={[[150, 118, 36, 58]]} brilho={[164, 76, 11, 24]}>
        <Sulco d="M124 50C156 48 178 80 178 116C178 156 156 188 124 188" o={0.55} />
        {PIRAMIDES.map((p, i) => (
          <path key={i} d={p.d} fill={`url(#${u}-rosa)`} stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1" />
        ))}
        {PIRAMIDES.map((p, i) => <Tubo key={`k${i}`} d={`M118 118L${p.apice}`} w={5} opacidade={0.85} />)}
      </Vidro>
      <Vidro d="M98 110C110 102 120 100 130 106C134 112 134 126 130 132C120 138 110 132 98 128Z" k="pe" fundo />
      <Tubo d="M102 126C92 150 102 182 112 234" w={8} />
    </g>
  );
}

/* ----------------------------------------------------- útero com ovários */
const UTERO = "M84 82C84 62 156 62 156 82C158 108 146 138 132 154C130 166 130 178 130 186C130 196 110 196 110 186C110 178 110 166 108 154C94 138 82 108 84 82Z";
const UT_VASOS = [
  arvore({ x: 90, y: 138, ang: 28, len: 12, w: 2, prof: 3, abertura: 30, semente: 73 }),
  arvore({ x: 150, y: 138, ang: 332, len: 12, w: 2, prof: 3, abertura: 30, semente: 79 }),
];
function Fimbrias({ x, y, lado }) {
  const s = lado === "e" ? -1 : 1;
  return (
    <g fill="none" stroke="#E38FA0" strokeOpacity="0.75" strokeWidth="1.6" strokeLinecap="round">
      {[-50, -25, 0, 25, 50].map((g) => {
        const a = ((g + (s > 0 ? 200 : -20)) * Math.PI) / 180;
        return <path key={g} d={`M${x} ${y}q${(Math.cos(a) * 7).toFixed(1)} ${(Math.sin(a) * 7 - 2).toFixed(1)} ${(Math.cos(a) * 12).toFixed(1)} ${(Math.sin(a) * 12).toFixed(1)}`} />;
      })}
    </g>
  );
}
function Ovario({ cx, cy, k, rot }) {
  const u = useU();
  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`}>
      <Vidro d={elipse(cx, cy, 17, 11.5)} k={k} brilho={[cx - 5, cy - 5, 6, 3]}>
        <circle cx={cx - 5} cy={cy + 1} r="4.6" fill={`url(#${u}-rosa)`} stroke="#FFFFFF" strokeOpacity="0.6" />
        <circle cx={cx + 5} cy={cy + 2} r="3.2" fill={`url(#${u}-rosa)`} stroke="#FFFFFF" strokeOpacity="0.6" />
        <circle cx={cx + 2} cy={cy - 4} r="2.4" fill={`url(#${u}-rosa)`} stroke="#FFFFFF" strokeOpacity="0.5" />
      </Vidro>
    </g>
  );
}
function Utero() {
  const u = useU();
  return (
    <g>
      <Vidro d="M40 92C70 78 96 86 120 98C144 86 170 78 200 92C204 124 190 150 170 158C150 152 132 160 120 172C108 160 90 152 70 158C50 150 36 124 40 92Z" k="lg" fundo opacidade={0.38} />
      <Tubo d="M120 190L120 234" w={20} opacidade={0.5} />
      <Tubo d="M90 76C70 64 52 68 42 82C36 92 40 102 48 108" w={7} />
      <Tubo d="M150 76C170 64 188 68 198 82C204 92 200 102 192 108" w={7} />
      <Fimbrias x={48} y={108} lado="d" />
      <Fimbrias x={192} y={108} lado="e" />
      <path d="M70 120C78 108 84 98 90 90M170 120C162 108 156 98 150 90" fill="none" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
      <Ovario cx={57} cy={126} k="ov1" rot={-18} />
      <Ovario cx={183} cy={126} k="ov2" rot={18} />
      <Vidro d={UTERO} k="ut" rosa={[[120, 112, 32, 36]]} brilho={[100, 78, 15, 8]}>
        {UT_VASOS.map((a, i) => <Ramos key={i} arv={a} opacidade={0.7} />)}
        <path d="M100 86C112 92 128 92 140 86C136 108 128 128 120 146C112 128 104 108 100 86Z" fill={`url(#${u}-rosa)`} stroke="#F2A0B0" strokeOpacity="0.9" strokeWidth="1.4" />
        <path d="M120 146L120 192" stroke="#E07D93" strokeOpacity="0.7" strokeWidth="2.4" strokeLinecap="round" />
      </Vidro>
    </g>
  );
}

/* ------------------------------------------------------- feto no útero */
// Útero em pera (parede de vidro rosada), placenta no fundo, cordão, feto de cabeça para baixo (posição de parto).
const UTERO_GESTANTE = "M120 14C170 14 206 54 206 106C206 156 180 194 142 210C138 214 138 222 136 226L104 226C102 222 102 214 98 210C60 194 34 156 34 106C34 54 70 14 120 14Z";
const LIQUIDO = "M120 26C162 26 194 60 194 106C194 150 168 184 130 196L110 196C72 184 46 150 46 106C46 60 78 26 120 26Z";
// Feto encolhido desenhado de pé (cabeça em cima, rosto à direita) e girado para a posição de cabeça para baixo: tronco em
// "C", nádegas embaixo, joelhos dobrados até o peito; coxa, perna e braço marcados por contornos.
const FETO = suave([[96, 104], [84, 132], [86, 162], [100, 186], [124, 198], [150, 196], [170, 186], [180, 168], [176, 150], [164, 138], [152, 124], [138, 116], [118, 114], [104, 108]], true);
const PLAC_VASOS = [arvore({ x: 92, y: 40, ang: 230, len: 12, w: 2, prof: 3, abertura: 34, semente: 83 }), arvore({ x: 110, y: 34, ang: 150, len: 11, w: 1.8, prof: 3, abertura: 30, semente: 89 })];
function Feto() {
  return (
    <g>
      <Vidro d={UTERO_GESTANTE} k="ug" rosa={[[120, 40, 70, 22], [60, 120, 14, 50], [180, 120, 14, 50]]} fundo brilho={[78, 48, 22, 10]} />
      <Vidro d={LIQUIDO} k="li" fundo opacidade={0.75} />
      <Vidro d="M62 62C76 36 104 26 130 28C124 40 106 48 92 60C82 68 70 72 62 62Z" k="pl" rosa={[[94, 46, 30, 16]]}>
        {PLAC_VASOS.map((a, i) => <Ramos key={i} arv={a} />)}
      </Vidro>
      <Tubo d="M136 128C124 104 108 80 96 56" w={5.5} cor="rosa" />
      <path d="M136 128C124 104 108 80 96 56" fill="none" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="1.2" strokeDasharray="2.5 4.5" />
      <g transform="translate(120 118) rotate(172) scale(0.86) translate(-128 -140)">
        <Vidro d={FETO} k="fc" rosa={[[120, 160, 30, 28]]} brilho={[92, 150, 5, 18]}>
          <path d="M90 116C82 140 86 164 100 182" fill="none" stroke="#E07D93" strokeOpacity="0.75" strokeWidth="3.6" strokeLinecap="round" strokeDasharray="0.5 6" />
          <Sulco d="M106 188C130 184 156 176 174 160" o={0.9} w={1.4} />
          <Sulco d="M174 160C182 174 174 188 158 192" o={0.8} w={1.3} />
          <Sulco d="M104 124C118 140 138 148 160 140" o={0.9} w={1.4} />
        </Vidro>
        <Vidro d={elipse(128, 82, 40, 38)} k="fh" rosa={[[130, 84, 26, 24]]} brilho={[112, 62, 14, 7]}>
          <path d="M150 80C154 83 159 83 162 80" fill="none" stroke="#3F7FA8" strokeOpacity="0.6" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M120 80C112 74 110 90 119 90" fill="none" stroke="#FFFFFF" strokeOpacity="0.85" strokeWidth="1.6" strokeLinecap="round" />
        </Vidro>
      </g>
    </g>
  );
}

/* ----------------------------------------------------- osso/articulação */
const FEMUR = "M104 14L136 14C134 54 136 80 148 98C160 112 160 128 148 134C138 138 130 132 120 132C110 132 102 138 92 134C80 128 80 112 92 98C104 80 106 54 104 14Z";
const TIBIA = "M90 152C104 146 136 146 152 152C158 162 148 170 138 176C134 196 134 214 136 236L106 236C108 214 108 196 102 176C92 170 84 162 90 152Z";
function Osso() {
  const u = useU();
  const trab = "M96 122C108 110 114 98 118 82M144 122C132 110 126 98 122 82M100 128C112 120 128 120 140 128M98 112C108 104 132 104 142 112";
  return (
    <g>
      <Vidro d="M80 100C70 124 74 160 90 176C110 184 130 184 150 176C166 160 170 124 160 100C140 94 100 94 80 100Z" k="cap" fundo opacidade={0.3} />
      <Vidro d="M156 174C160 196 160 218 156 236L146 236C148 218 148 196 146 178C148 174 152 172 156 174Z" k="fi" fundo />
      <Vidro d={FEMUR} k="fe" rosa={[[120, 118, 28, 18]]} brilho={[111, 46, 5, 26]}>
        <path d="M120 16L120 92" stroke="#F3A2B1" strokeOpacity="0.45" strokeWidth="9" strokeLinecap="round" />
        <path d={trab} fill="none" stroke="#E07D93" strokeOpacity="0.55" strokeWidth="1.2" />
      </Vidro>
      <Vidro d={TIBIA} k="ti" rosa={[[120, 164, 26, 14]]} brilho={[113, 204, 4, 22]}>
        <path d="M120 182L120 236" stroke="#F3A2B1" strokeOpacity="0.45" strokeWidth="9" strokeLinecap="round" />
        <path d="M98 158C110 166 130 166 142 158M104 166C112 172 128 172 136 166" fill="none" stroke="#E07D93" strokeOpacity="0.55" strokeWidth="1.2" />
      </Vidro>
      <path d="M88 147C96 139 110 139 117 144C108 145 98 147 88 151ZM152 147C144 139 130 139 123 144C132 145 142 147 152 151Z" fill={`url(#${u}-rosa)`} stroke="#E88A9C" strokeOpacity="0.9" strokeWidth="1.2" />
      <path d="M112 132L128 151M128 132L112 151" stroke="#E07D93" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
      <path d="M86 112C84 132 86 150 92 166M154 112C156 132 154 150 150 166" fill="none" stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="3" strokeLinecap="round" />
      <Vidro d={elipse(120, 110, 13, 16)} k="pa" opacidade={0.82} brilho={[116, 104, 4, 6]} />
    </g>
  );
}

/* ---------------------------------------------------------- vírus/bactéria */
function Espiculas({ cx, cy, r, n, bulbo }) {
  const u = useU();
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.12;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        const p = (k) => `${(cx + c * k).toFixed(1)} ${(cy + s * k).toFixed(1)}`;
        return (
          <g key={i}>
            <path d={`M${p(r - 2)}L${p(r + bulbo * 2.4)}`} stroke="#E58C9E" strokeOpacity="0.85" strokeWidth={bulbo * 0.55} strokeLinecap="round" />
            <circle cx={cx + c * (r + bulbo * 2.8)} cy={cy + s * (r + bulbo * 2.8)} r={bulbo} fill={`url(#${u}-rosa)`} stroke="#FFFFFF" strokeOpacity="0.85" strokeWidth="0.9" />
          </g>
        );
      })}
    </g>
  );
}
function Microrganismo() {
  const pontos = [[116, 82], [150, 90], [104, 120], [160, 124], [132, 140], [124, 70], [96, 98], [168, 104], [146, 72]];
  return (
    <g>
      <g transform="translate(62 184) rotate(-28)">
        <path d="M-40 4C-50 10 -54 -2 -64 4C-70 8 -74 4 -78 6M-38 -6C-48 -14 -54 -4 -62 -12" fill="none" stroke="#5B98C0" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
        <Vidro d="M-26 -15L26 -15A15 15 0 0 1 26 15L-26 15A15 15 0 0 1 -26 -15Z" k="ba" rosa={[[0, 0, 30, 12]]} brilho={[-10, -9, 18, 3.5]}>
          <path d="M-22 2C-16 -8 -10 8 -4 -2C2 -10 8 6 14 -2C18 -8 22 2 24 0" fill="none" stroke="#D24E69" strokeOpacity="0.7" strokeWidth="1.8" strokeLinecap="round" />
        </Vidro>
      </g>
      <Espiculas cx={196} cy={182} r={17} n={10} bulbo={2.6} />
      <Vidro d={elipse(196, 182, 17, 17)} k="vp" rosa={[[196, 182, 10, 10]]} brilho={[190, 175, 6, 3.5]} />
      <Espiculas cx={130} cy={106} r={52} n={18} bulbo={4.8} />
      <Vidro d={elipse(130, 106, 52, 52)} k="vi" rosa={[[130, 110, 34, 32]]} brilho={[110, 80, 20, 10]}>
        <path d="M106 98C112 84 126 88 124 98C122 108 136 114 140 102C144 90 158 94 156 106C154 118 138 120 132 130C126 138 112 132 110 120C108 112 116 108 122 112" fill="none" stroke="#D24E69" strokeOpacity="0.72" strokeWidth="2.4" strokeLinecap="round" />
        {pontos.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill="#FFFFFF" fillOpacity="0.55" />)}
      </Vidro>
      <circle cx="40" cy="70" r="5" fill="#BFE2F2" fillOpacity="0.6" stroke="#FFFFFF" />
      <circle cx="206" cy="46" r="3.5" fill="#F6A9B7" fillOpacity="0.55" stroke="#FFFFFF" />
      <Brilho cx={196} cy={140} rx={8} ry={4} o={0.4} />
    </g>
  );
}

/* -------------------------------------------- intestino com apêndice */
// Moldura do cólon (haustrações), alças do delgado no meio, ceco à esquerda da tela com o apêndice em destaque rosado.
const COLON = "M66 196C56 176 54 120 58 84C60 66 72 58 90 60C120 64 150 60 176 58C192 58 194 74 192 92C190 128 192 160 186 184C182 200 166 206 150 204C140 202 132 208 126 220";
function Haustras({ d, n }) {
  return d.map(([x, y, a], i) => (i < n ? <path key={i} d={`M${x} ${y}l${(Math.cos(a) * 12).toFixed(1)} ${(Math.sin(a) * 12).toFixed(1)}`} transform={`translate(${(-Math.cos(a) * 6).toFixed(1)} ${(-Math.sin(a) * 6).toFixed(1)})`} /> : null));
}
const HAUSTRAS = [[57, 170, 0], [56, 146, 0], [57, 122, 0], [58, 98, 0.2], [84, 60, 1.5], [108, 62, 1.57], [132, 61, 1.57], [156, 59, 1.57], [192, 92, 3.14], [191, 118, 3.14], [191, 144, 3.14], [188, 170, 3.2]];
function Intestino() {
  const u = useU();
  return (
    <g>
      <Tubo d="M88 102C108 92 124 104 116 116C108 128 86 122 88 138C90 152 112 150 120 142C130 132 146 136 144 150C142 164 120 168 112 176C104 186 116 194 132 190C148 186 154 172 164 164M142 92C160 88 170 102 162 114C154 126 136 118 134 106M100 160C92 168 84 170 80 164" w={12} opacidade={0.75} />
      <ellipse cx="72" cy="208" rx="22" ry="20" fill={`url(#${u}-rosa)`} />
      <Tubo d="M64 200C60 214 66 226 80 230C88 232 92 226 88 220" w={7.5} cor="rosa" />
      <Tubo d={COLON} w={26} />
      <g fill="none" stroke="#4F8DB6" strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round"><Haustras d={HAUSTRAS} n={12} /></g>
      <Vidro d="M50 182C50 170 82 168 82 184C82 200 68 206 58 202C50 198 48 190 50 182Z" k="ceco" brilho={[60, 180, 6, 4]} rosa={[[64, 196, 12, 8]]} />
      <Brilho cx={60} cy={110} rx={4} ry={22} o={0.7} />
    </g>
  );
}

/* --------------------------------------------- recém-nascido com ambu */
// Bebê deitado de costas (perfil), máscara do ambu no rosto e a bolsa acima; colchão de vidro.
function RecemNascido() {
  return (
    <g>
      <Vidro d="M24 196C24 186 32 182 44 182L200 182C212 182 218 188 218 196C218 206 210 210 200 210L42 210C30 210 24 204 24 196Z" k="co" fundo opacidade={0.6} />
      <Vidro d="M164 142C170 122 188 112 202 120C212 126 210 140 200 146C192 142 182 144 176 154Z" k="pe" brilho={[186, 120, 8, 3]} />
      <Vidro d="M96 128C120 118 160 122 178 136C190 146 188 166 172 174C150 182 116 180 98 170C86 160 86 136 96 128Z" k="tr" rosa={[[136, 150, 26, 18]]} brilho={[128, 130, 18, 5]}>
        <circle cx="146" cy="160" r="3" fill="#E07D93" fillOpacity="0.6" />
      </Vidro>
      <Vidro d="M112 136C110 120 120 106 136 104C144 104 146 112 140 116C130 118 124 126 124 138Z" k="br" brilho={[124, 110, 6, 3]} />
      <Vidro d={elipse(72, 150, 32, 30)} k="cb" rosa={[[74, 146, 20, 18]]} brilho={[60, 134, 10, 6]}>
        <path d="M84 150C88 146 92 152 88 156" fill="none" stroke="#FFFFFF" strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M60 140C63 142 67 142 70 140" fill="none" stroke="#3F7FA8" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
      </Vidro>
      <Vidro d="M40 128C40 116 52 108 62 110L78 118C84 122 82 132 74 134L50 140C44 140 40 136 40 128Z" k="ma" brilho={[52, 118, 8, 3]} rosa={[[60, 126, 10, 6]]} />
      <Tubo d="M56 112L50 96" w={7} />
      <Tubo d="M48 94L44 86" w={10} />
      <g transform="rotate(-24 70 54)">
        <Vidro d={elipse(70, 54, 44, 24)} k="bo" brilho={[56, 42, 18, 5]} rosa={[[76, 58, 26, 12]]}>
          <path d="M34 54C46 46 60 62 72 54C84 46 96 62 106 54" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1.2" />
        </Vidro>
      </g>
      <Tubo d="M110 30C122 26 134 30 140 40" w={5} opacidade={0.8} />
      <Brilho cx={120} cy={188} rx={50} ry={3} o={0.6} />
    </g>
  );
}

/* ---------------------------------------- agente de saúde no território */
// Colina com casas de vidro, caminho, ponto de localização e a agente com prancheta e bolsa.
function Casa({ x, y, s = 1, k, alfinete }) {
  const p = (dx, dy) => `${(x + dx * s).toFixed(1)} ${(y + dy * s).toFixed(1)}`;
  return (
    <g>
      <Vidro d={`M${p(-22, 0)}L${p(-22, -26)}L${p(0, -46)}L${p(22, -26)}L${p(22, 0)}Z`} k={k} brilho={[x - 10 * s, y - 30 * s, 6 * s, 3 * s]} />
      <path d={`M${p(-26, -24)}L${p(0, -50)}L${p(26, -24)}`} fill="none" stroke="#E07D93" strokeOpacity="0.85" strokeWidth={4 * s} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={x - 6 * s} y={y - 16 * s} width={12 * s} height={16 * s} rx={2 * s} fill="#FFFFFF" fillOpacity="0.7" stroke="#4E8FB8" strokeOpacity="0.4" />
      {alfinete && (
        <g>
          <path d={`M${p(0, -58)}c${-9 * s} ${-12 * s} ${-12 * s} ${-18 * s} ${-12 * s} ${-24 * s}a${12 * s} ${12 * s} 0 1 1 ${24 * s} 0c0 ${6 * s} ${-3 * s} ${12 * s} ${-12 * s} ${24 * s}Z`} fill="#F08A9D" fillOpacity="0.85" stroke="#FFFFFF" strokeWidth="1.4" />
          <circle cx={x} cy={y - 82 * s} r={4.5 * s} fill="#FFFFFF" />
        </g>
      )}
    </g>
  );
}
function Territorio() {
  return (
    <g>
      <Vidro d="M6 238C14 192 66 156 126 154C186 154 230 190 236 238Z" k="ch" fundo opacidade={0.7} brilho={[96, 162, 40, 4]} />
      <path d="M120 236C116 214 136 200 156 192C176 184 196 180 214 172" fill="none" stroke="#FFFFFF" strokeOpacity="0.85" strokeWidth="9" strokeLinecap="round" />
      <path d="M120 236C116 214 136 200 156 192C176 184 196 180 214 172" fill="none" stroke="#E9A3B0" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round" />
      <Casa x={58} y={170} s={0.9} k="c1" />
      <Casa x={190} y={170} s={0.75} k="c2" />
      <Casa x={136} y={150} s={0.62} k="c3" alfinete />
      <circle cx="96" cy="146" r="12" fill="#BFE7D8" fillOpacity="0.7" stroke="#FFFFFF" />
      <path d="M96 158L96 172" stroke="#7DB5D3" strokeWidth="3" strokeLinecap="round" />
      <Vidro d="M84 236C84 206 92 192 108 192C124 192 132 206 132 236Z" k="ag" rosa={[[108, 214, 16, 14]]} brilho={[98, 202, 5, 8]} />
      <Vidro d={elipse(108, 176, 13, 13)} k="ca" brilho={[103, 170, 4, 3]} />
      <path d="M94 170C96 160 120 160 122 170C112 166 104 166 94 170Z" fill="#F08A9D" fillOpacity="0.85" stroke="#FFFFFF" strokeWidth="1" />
      <Vidro d="M124 206L144 202L148 226L128 230Z" k="pr" brilho={[132, 210, 4, 2]} />
      <path d="M130 212L142 210M131 218L143 216M132 224L140 222" stroke="#4E8FB8" strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M90 196C80 206 76 218 78 230" fill="none" stroke="#E07D93" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

/* --------------------------------------------- genérico da área (célula) */
const GIRO = { cm: 0, cir: 50, ped: 100, go: 150, mfc: 200, sc: 250, sm: 300 };
function Generico({ area }) {
  const u = useU();
  const g = GIRO[area] ?? 0;
  return (
    <g>
      <Vidro d="M120 34C162 32 198 64 202 108C206 156 172 198 124 202C76 206 38 172 36 126C34 80 76 36 120 34Z" k="ce" brilho={[86, 64, 26, 12]}>
        <g transform={`rotate(${g} 120 118)`}>
          <path d="M70 120C74 92 96 74 120 72M178 116C176 150 150 168 122 170M86 150C96 162 106 166 116 166" fill="none" stroke="#5B98C0" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />
          <path d="M66 96C74 86 72 78 82 72C92 66 96 74 104 68" fill="none" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="1.4" strokeLinecap="round" />
          <g transform="rotate(-24 76 150)">
            <Vidro d="M60 150C60 142 92 142 92 150C92 158 60 158 60 150Z" k="m1" rosa={[[76, 150, 14, 5]]}>
              <path d="M64 150C68 146 70 154 74 150C78 146 80 154 84 150C86 148 88 152 90 150" fill="none" stroke="#D24E69" strokeOpacity="0.6" strokeWidth="1.1" />
            </Vidro>
          </g>
          <g transform="rotate(30 170 82)">
            <Vidro d="M156 82C156 75 184 75 184 82C184 89 156 89 156 82Z" k="m2" rosa={[[170, 82, 12, 4]]} />
          </g>
          {[[168, 150, 5], [182, 132, 3.5], [60, 116, 4], [100, 182, 3.5], [150, 56, 3]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={`url(#${u}-rosa)`} stroke="#FFFFFF" strokeOpacity="0.8" />
          ))}
        </g>
      </Vidro>
      <Vidro d={elipse(124, 116, 36, 32)} k="nu" brilho={[112, 102, 12, 6]}>
        <path d={elipse(124, 116, 36, 32)} fill="var(--il-halo)" opacity="0.5" />
        <circle cx="130" cy="120" r="10" fill={`url(#${u}-rosa)`} />
        <path d="M104 116C112 108 120 124 128 112C134 104 142 118 148 110" fill="none" stroke="#D24E69" strokeOpacity="0.45" strokeWidth="1.4" />
      </Vidro>
    </g>
  );
}

/** Desenhos prontos por motivo (os que faltam caem no genérico; ver mapa.js). */
export const DESENHOS = {
  pulmao: Pulmao,
  coracao: Coracao,
  cerebro: Cerebro,
  rim: Rim,
  utero: Utero,
  feto: Feto,
  osso: Osso,
  microrganismo: Microrganismo,
  intestino: Intestino,
  "recem-nascido": RecemNascido,
  casa: Territorio,
  generico: Generico,
};
