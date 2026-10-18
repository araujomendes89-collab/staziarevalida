// Pergunta de marketing do ONBOARDING (Contrato 3.0, cláusulas 6.2 e 32; decisão do dono de 17/10/2026: a escolha sai do cadastro e
// passa a ser feita no onboarding). Pronta para encaixar no onboarding (ramo onboarding/pacote1, junção do Pacote 2).
//
// COMO USAR
//   import { MarketingPergunta } from "../account/MarketingPergunta.jsx";
//   <MarketingPergunta onRespondido={({ opt_in }) => irParaOProximoPasso()} />
//   - precisa de useSession() com o aluno logado (backend.rpc);
//   - "Sim, quero receber": grava app_marketing_set(true, 'onboarding') (migração …13800: data, origem e o texto mostrado vão ao
//     histórico) e chama onRespondido({ opt_in: true }). Se o banco falhar, mostra o aviso e deixa tentar de novo ou seguir com "Agora não";
//   - "Agora não": NÃO grava nada (sem linha = não recebe) e chama onRespondido({ opt_in: false });
//   - nada vem marcado: são dois botões, a pessoa escolhe;
//   - banco sem a 013800 (função não existe): "Sim" segue como "Agora não" (nada é prometido sem poder guardar).
//   Depois, a pessoa muda quando quiser em Minha Conta → Privacidade e dados (MarketingSwitch).
//
// O TEXTO MOSTRADO é guardado no histórico pelo banco (public.marketing_texto('onboarding')). Mudou aqui, mude lá (numa migração
// nova): o teste termoFuncoesBanco confere que são iguais.
import React from "react";
import { Banner, Button } from "../../ds";
import { useSession } from "../session.jsx";
import { semFuncaoNoBanco } from "../legal/vigente.js";

export const MARKETING_PERGUNTA = "Quer receber novidades e ofertas do StaziaMed por e-mail?";
export const MARKETING_EXPLICACAO =
  "Dicas de estudo, novidades do app e ofertas. É opcional: você pode mudar quando quiser em Minha Conta → Privacidade e dados.";
export const MARKETING_SIM = "Sim, quero receber";
export const MARKETING_NAO = "Agora não";
/** O que o banco guarda no histórico quando a resposta é "Sim" (igual a public.marketing_texto('onboarding')). */
export const MARKETING_TEXTO_GUARDADO = `${MARKETING_PERGUNTA} ${MARKETING_EXPLICACAO} Resposta: ${MARKETING_SIM}.`;

/** @param {{ onRespondido: (r: { opt_in: boolean }) => void }} props */
export function MarketingPergunta({ onRespondido }) {
  const { backend } = useSession();
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState(null);
  const tituloId = React.useId();

  const sim = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await backend.rpc("app_marketing_set", { p_opt_in: true, p_origin: "onboarding" });
      onRespondido({ opt_in: true });
    } catch (err) {
      if (semFuncaoNoBanco(err)) onRespondido({ opt_in: false });
      else setErro("Não foi possível salvar sua escolha agora. Tente de novo ou siga com “Agora não”.");
    }
    setSalvando(false);
  };

  return (
    <section aria-labelledby={tituloId} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 id={tituloId} style={{ margin: 0, font: "800 20px/1.3 var(--font-sans)", color: "var(--text-primary)" }}>
          {MARKETING_PERGUNTA}
        </h2>
        <p style={{ margin: 0, font: "var(--type-body)", color: "var(--text-secondary)" }}>{MARKETING_EXPLICACAO}</p>
      </div>
      {erro && <Banner tone="danger">{erro}</Banner>}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button onClick={sim} loading={salvando} style={{ flex: "1 1 200px" }}>
          {MARKETING_SIM}
        </Button>
        <Button variant="secondary" onClick={() => onRespondido({ opt_in: false })} disabled={salvando} style={{ flex: "1 1 200px" }}>
          {MARKETING_NAO}
        </Button>
      </div>
    </section>
  );
}
