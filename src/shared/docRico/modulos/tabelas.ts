// Módulo tabelas do editor profissional (M4): células mescladas, largura de coluna e cor de fundo da célula.
// Os nós table/tableRow/tableCell/tableHeader já nascem no núcleo; aqui só entram os atributos das células.
// Atributos (mesmo nome da extensão TipTap): colspan, rowspan (mesclagem), fundo (cor de fundo) e largura (px, só uma dica de largura).
import { atributosDe, cssSeguro, corCss, defNo, inteiroEntre, registrarAtributo, type Css, type NoDoc } from "../registro";

const CELULAS = ["tableCell", "tableHeader"] as const;

// largura em pixels: inteiro de 40 a 800; fora disso o atributo é descartado.
const larguraPx = inteiroEntre(40, 800);

for (const alvo of CELULAS) {
  registrarAtributo({ alvo, nome: "colspan", sanear: inteiroEntre(1, 20), padrao: 1 });
  registrarAtributo({ alvo, nome: "rowspan", sanear: inteiroEntre(1, 50), padrao: 1 });
  registrarAtributo({
    alvo,
    nome: "fundo",
    sanear: (v) => {
      const c = corCss()(v);
      return c === "inherit" ? undefined : c; // "sem cor" = atributo ausente
    },
    css: (v) => ({ "background-color": String(v) }),
  });
  registrarAtributo({
    alvo,
    nome: "largura",
    sanear: larguraPx,
    css: (v) => ({ width: `${v}px`, "min-width": `${v}px` }),
  });
}

/** Estilo (css) de uma célula a partir dos atributos já saneados. */
export function cssDaCelula(no: NoDoc): Css {
  const css: Css = {};
  for (const at of atributosDe(no.type)) {
    if (at.css && no.attrs && at.nome in no.attrs) {
      const v = no.attrs[at.nome];
      if (v !== undefined) Object.assign(css, at.css(v));
    }
  }
  return css;
}

// O HTML genérico da fundação não sabe escrever colspan/rowspan; as células ganham o desenho próprio abaixo
// (PDF e visualização). A definição do núcleo é a mesma, só ganha a função "html".
for (const alvo of CELULAS) {
  const def = defNo(alvo);
  if (def && !def.html) {
    const tag = alvo === "tableHeader" ? "th" : "td";
    def.html = (no, filhos) => {
      const cs = Number(no.attrs?.colspan) > 1 ? ` colspan="${Number(no.attrs?.colspan)}"` : "";
      const rs = Number(no.attrs?.rowspan) > 1 ? ` rowspan="${Number(no.attrs?.rowspan)}"` : "";
      const st = cssSeguro(cssDaCelula(no));
      return `<${tag}${cs}${rs}${st ? ` style="${st}"` : ""}>${filhos}</${tag}>`;
    };
  }
}
