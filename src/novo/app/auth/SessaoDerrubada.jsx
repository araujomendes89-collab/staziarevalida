// "Sua conta foi aberta em outro aparelho" (sessão única, decisão do dono de 17/10/2026): o que este navegador mostra quando a
// mesma conta entrou em outro aparelho e este saiu sozinho. Mesmo padrão das telas de acesso no ar (RecoveryLayout: fundo
// azul-marinho, cartão branco com o selo "ACESSO SEGURO · REVALIDA", título em Barlow Condensed, botão azul).
// ENTRAR NOVAMENTE abre o login; entrar de novo aqui derruba o outro aparelho (quem decide é o banco: app_session_claim).
import React from "react";
import { RecoveryButton, RecoveryLayout, RecoveryMessage } from "./RecoveryLayout.jsx";
import { quandoEntrou } from "../sessaoUnica.js";
import "./sessao-derrubada.css";

export const SESSAO_DERRUBADA_TEXTO = {
  title: "Sua conta foi aberta em outro aparelho",
  sub: "Por segurança, cada conta do StaziaMed fica aberta em um aparelho por vez.",
  semDetalhe: "Você saiu daqui porque a mesma conta entrou em outro aparelho.",
  comDetalhe: (aparelho, quando) => `Você saiu daqui porque a mesma conta entrou em ${aparelho}${quando ? `, ${quando}` : ""}.`,
  dicas: ["Foi você? Entre de novo aqui: o outro aparelho é que sai.", "Não foi você? Entre e troque sua senha em Minha conta."],
  botao: "ENTRAR NOVAMENTE",
};

/** aviso: { aparelho?, desde? } vindos do banco (aparelho resumido, ex.: "Safari · iPhone", e quando ele entrou). */
export function SessaoDerrubadaScreen({ aviso, onEntrar }) {
  const aparelho = typeof aviso?.aparelho === "string" && aviso.aparelho.trim() ? aviso.aparelho.trim() : null;
  const quando = quandoEntrou(aviso?.desde);
  return (
    <RecoveryLayout
      label="Conta aberta em outro aparelho"
      title={SESSAO_DERRUBADA_TEXTO.title}
      sub={SESSAO_DERRUBADA_TEXTO.sub}
      aside={{ title: "Um aparelho por vez", copy: "Assim o seu plano, o seu progresso e o seu Tutor ficam só com você.", button: "Entrar", onButton: onEntrar }}
    >
      <div className="rc-fields">
        <RecoveryMessage tone="danger">{aparelho ? SESSAO_DERRUBADA_TEXTO.comDetalhe(aparelho, quando) : SESSAO_DERRUBADA_TEXTO.semDetalhe}</RecoveryMessage>
        <ul className="sd-tips">
          {SESSAO_DERRUBADA_TEXTO.dicas.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <div className="rc-actions">
          <RecoveryButton onClick={onEntrar}>{SESSAO_DERRUBADA_TEXTO.botao}</RecoveryButton>
        </div>
      </div>
    </RecoveryLayout>
  );
}
