// Apresentação (60 a 90 s de leitura): 6 cenas com o personagem animado. Avança só quando o aluno quer (sem passar sozinho,
// para dar tempo de ler e para quem usa leitor de tela); Voltar, Continuar, Pular apresentação e as setas do teclado.
import React from "react";
import { Icon } from "../../ds";
import { AppRealIcon } from "../AppIcons.jsx";
import { AREAS } from "../practice/format.js";
import { areaStyle } from "../home/parts.jsx";
import { Personagem, temArteDaStazia } from "./Personagem.jsx";
import { CENAS } from "./textos.js";

export function Apresentacao({ contexto, cena, setCena, onFim, onPular, ocupado, mobile, tituloRef }) {
  const c = { ...contexto, temStazia: temArteDaStazia() };
  const atual = CENAS[cena];
  const ultima = cena === CENAS.length - 1;
  const itens = typeof atual.itens === "function" ? atual.itens(c) : atual.itens;

  // setas do teclado (fora de campos de texto)
  React.useEffect(() => {
    const tecla = (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === "ArrowRight" && !ocupado) {
        e.preventDefault();
        if (ultima) onFim();
        else setCena(cena + 1);
      } else if (e.key === "ArrowLeft" && cena > 0) {
        e.preventDefault();
        setCena(cena - 1);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [cena, ultima, ocupado, onFim, setCena]);

  // com a arte dos dois no app, Stazi e Stazia aparecem juntos em todas as cenas
  const segundo = c.temStazia;
  return (
    <section className="ob-cena" aria-roledescription="apresentação" aria-label={`Apresentação, parte ${cena + 1} de ${CENAS.length}`}>
      <div className="ob-palco">
        <span className="ob-palco__luz" aria-hidden="true" />
        <span className={`ob-palco__pers${segundo ? " ob-palco__pers--dupla" : ""}`}>
          <Personagem id="stazi" pose={atual.pose} altura={mobile ? 188 : 300} />
          {segundo ? <Personagem id="stazia" pose={atual.pose} altura={mobile ? 180 : 288} /> : null}
        </span>
      </div>
      <div className="ob-cena__txt">
        <span className="ob-over">
          {cena + 1} de {CENAS.length}
        </span>
        <h1 className="ob-h1" ref={tituloRef} tabIndex={-1}>
          {atual.titulo(c)}
        </h1>
        <p className="ob-texto">{atual.texto(c)}</p>
        {itens?.length ? (
          <ul className="ob-itens" aria-label="Onde fica no app">
            {itens.map(([icone, nome]) => (
              <li key={nome}>
                <span className="ob-itens__ic" aria-hidden="true">{AppRealIcon({ name: icone, size: 24 }) || <Icon name={icone} size={18} />}</span>
                {nome}
              </li>
            ))}
          </ul>
        ) : null}
        {atual.areas ? (
          <ul className="ob-itens ob-itens--areas" aria-label="As 5 grandes áreas">
            {AREAS.map((a) => (
              <li key={a.id} style={areaStyle(a.id)}>
                {a.label}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="ob-pontos" aria-hidden="true">
          {CENAS.map((x, i) => (
            <i key={x.id} className={i === cena ? "on" : i < cena ? "feito" : ""} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Botões da apresentação (vão no rodapé da moldura). */
export function BotoesApresentacao({ cena, setCena, onFim, onPular, ocupado }) {
  const ultima = cena === CENAS.length - 1;
  return (
    <>
      <span className="ob-rodape__esq">
        {cena > 0 ? (
          <button type="button" className="ob-btn ob-btn--sec" onClick={() => setCena(cena - 1)} disabled={ocupado}>
            <Icon name="arrow-left" size={18} /> Voltar
          </button>
        ) : (
          <button type="button" className="ob-btn ob-btn--link" onClick={onPular} disabled={ocupado}>
            Pular apresentação
          </button>
        )}
      </span>
      {cena > 0 && !ultima ? (
        <button type="button" className="ob-btn ob-btn--link ob-so-largo" onClick={onPular} disabled={ocupado}>
          Pular apresentação
        </button>
      ) : null}
      <button type="button" className="ob-btn ob-btn--pri" onClick={ultima ? onFim : () => setCena(cena + 1)} disabled={ocupado} aria-busy={ocupado || undefined}>
        {ultima ? "Montar meu estudo" : "Continuar"} <Icon name="arrow-right" size={18} />
      </button>
    </>
  );
}
