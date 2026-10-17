// Aviso no topo do app durante o prazo da cláusula 6.5-A do Contrato 3.0: o aluno com plano pago ativo que ainda não aceitou a versão
// nova continua usando o app até o fim do período pago; depois disso, a tela de aceite passa a ser obrigatória.
import React from "react";
import { Banner, Button } from "../../ds";
import { dataBR } from "./AcceptanceScreen.jsx";

export function AvisoContratoNovo({ legal, onAceitar }) {
  return (
    <Banner
      tone="info"
      title={`Atualizamos o Contrato (versão ${legal.termo_uso?.current})`}
      action={
        <Button variant="secondary" size="sm" onClick={onAceitar}>
          Ler e aceitar
        </Button>
      }
    >
      Você continua com o seu plano até {dataBR(legal.grace_until)}. Para renovar depois disso, é preciso aceitar a nova versão.
    </Banner>
  );
}
