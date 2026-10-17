// "Quem fica com você na tela": o aluno escolhe UM personagem (Stazi ou Stazia) antes de começar, junto com o professor.
// Botões com aria-pressed (o mesmo padrão dos cartões de professor). A escolha é guardada no aparelho por quem usa (NexusLobby).
import React from "react";
import { PERSONAGENS, PERSONAGEM_IDS } from "./personagens.js";
import { spritePose } from "./sprites.js";
import "./escolha.css";

export function EscolhaPersonagem({ valor, onEscolher }) {
  return (
    <div className="nx-pers" role="group" aria-labelledby="nx-pers-titulo">
      <span id="nx-pers-titulo" className="nx-overline">Quem fica com você na tela</span>
      <div className="nx-pers__opcoes">
        {PERSONAGEM_IDS.map((id) => {
          const p = PERSONAGENS[id];
          const on = id === valor;
          const s = spritePose(id, "base");
          return (
            <button key={id} type="button" className={`nx-pers__op${on ? " nx-pers__op--on" : ""}`} aria-pressed={on} onClick={() => onEscolher(id)}>
              {s && <img className="nx-pers__img" src={s.url} alt="" width={Math.round((s.w / s.h) * 72)} height={72} loading="lazy" decoding="async" draggable={false} />}
              <span className="nx-pers__txt">
                <span className="nx-pers__nome">{p.nome}</span>{" "}
                <span className="nx-pers__desc">{p.descricao}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
